import {
  bytesToHexString,
  createSession,
  createSessionRequest,
  Session,
  SessionKey,
  SessionRequest,
} from "@argent/x-sessions"
import { HTTPService } from "@argent/x-shared"
import { Call, ec, ProviderInterface, RpcProvider, uint256 } from "starknet"
import { ApprovalRequest, WebWalletConnector } from "starknetkit/webwallet"
import { ethAddress, strkAddress } from "./lib"
import { Address } from "./lib/primitives/address"
import { ContactArgentBackendService } from "./lib/services/contact/backend"
import { SessionResponse } from "./lib/shared/stores/session"
import { createSessionAccount } from "./sessionAccount"
import { storageService } from "./storage"
import {
  Environment,
  SessionAccountInterface,
  SessionParameters,
  SignedSession,
  StarknetChainId,
} from "./types"

export * from "./lib"
export * from "./paymaster"
export { createSessionAccount } from "./sessionAccount"
export { storageService, type IStorageService } from "./storage"
export type * from "./types"
export type { ApprovalRequest }

const SESSION_DEFAULT_VALIDITY_DAYS = 90

const StorageKeys = {
  User: "User",
  Session: "session",
  SessionRequest: "session_request",
} as const

const ENVIRONMENTS: Record<"sepolia" | "mainnet" | "dev", Environment> = {
  sepolia: {
    chainId: StarknetChainId.SN_SEPOLIA,
    webWalletUrl: "https://web-v2.hydrogen.argent47.net",
    storeUrl: "", // TODO
    argentBaseUrl: "https://api.hydrogen.argent47.net/v1",
    providerDefaultUrl: "https://free-rpc.nethermind.io/sepolia-juno",
  },
  mainnet: {
    chainId: StarknetChainId.SN_MAIN,
    webWalletUrl: "https://web.argent.xyz",
    storeUrl: "", // TODO
    argentBaseUrl: "https://cloud.argent-api.com/v1",
    providerDefaultUrl: "https://free-rpc.nethermind.io/mainnet-juno",
  },
  dev: {
    chainId: StarknetChainId.SN_SEPOLIA,
    webWalletUrl: "http://localhost:3005",
    storeUrl: "", // TODO
    argentBaseUrl: "https://api.hydrogen.argent47.net/v1",
    providerDefaultUrl: "https://free-rpc.nethermind.io/sepolia-juno",
  },
}

interface User {
  address: Address
}

type InitParams = {
  appName: string
  appTelegramUrl?: string
  environment?: keyof typeof ENVIRONMENTS
  provider?: ProviderInterface
  sessionParams: SessionParameters
  webwalletUrl?: string
}

interface ArgentWebWalletInterface {
  provider: ProviderInterface
  sessionAccount?: SessionAccountInterface
  isConnected(): Promise<boolean>
  connect(): Promise<ConnectResponse | undefined>
  requestConnection({
    callbackData,
    approvalRequests,
  }: {
    callbackData?: string
    approvalRequests?: ApprovalRequest[]
  }): Promise<ConnectResponse | undefined>
  requestApprovals(approvalRequests: ApprovalRequest[]): Promise<string>
  // disconnect(approvalRequests: ApprovalRequest[]): Promise<void>

  // expert methods
  exportSignedSession(): Promise<SignedSession | undefined>
  clearSession(): Promise<void>
}

type ConnectResponse = {
  account: SessionAccountInterface
  user?: User
  callbackData?: string
  approvalTransactionHash?: string
  approvalRequestsCalls?: Call[]
}

export class ArgentWebWallet implements ArgentWebWalletInterface {
  private webWalletConnector: WebWalletConnector
  private appName: string
  private environment: Environment
  private sessionParams: SessionParameters

  provider: ProviderInterface
  sessionAccount?: SessionAccountInterface
  contactService: ContactArgentBackendService

  constructor(params: InitParams) {
    this.appName = params.appName
    this.sessionParams = params.sessionParams
    this.environment = ENVIRONMENTS[params.environment ?? "sepolia"]
    this.provider =
      params.provider ??
      new RpcProvider({ nodeUrl: this.environment.providerDefaultUrl })
    this.webWalletConnector = new WebWalletConnector({
      url: this.environment.webWalletUrl,
      theme: "dark",
      // authorizedPartyId: string; TODO ?? only for SSO token
    })

    // TODO: do we need this?
    this.contactService = new ContactArgentBackendService(
      this.environment.argentBaseUrl,
      new HTTPService(
        {
          headers: {
            "Content-Type": "application/json",
            "Argent-Client": "webwallet-sdk",
            "Argent-Version": "1.0.0",
            "Argent-Network":
              this.environment.chainId === StarknetChainId.SN_MAIN
                ? "mainnet"
                : "sepolia",
          },
        },
        "json",
      ),
    )
  }

  // call this method as soon as the application starts
  async connect(): Promise<ConnectResponse | undefined> {
    const session = this.getSessionFromStorage()

    if (session && session.signature && session.address) {
      console.log("connect - Found a signed session")
      this.sessionAccount =
        await this.buildSessionAccountFromStoredSession(session)

      return { account: this.sessionAccount }
    }

    const sessionRequest = this.getSessionRequestFromStorage()

    if (!sessionRequest) {
      console.log("connect - No session request found")
      return // TODO: should we throw an error?
    }

    // if the session is not signed, that means it was written in the cloud storage after
    // calling requestConnection(), so waiting for a callback from the wallet
    const response = await this.getSessionFromInitData()
    if (response) {
      console.log("connect - Found a session response, creation the session")

      // open session and sign message
      const session = await createSession({
        sessionRequest,
        address: response.sessionResponse.address,
        chainId: this.environment.chainId,
        authorisationSignature: response.sessionResponse.signature,
      })
      const signedSession: SignedSession = {
        ...session,
        signature: response.sessionResponse.signature,
        deploymentPayload: response.sessionResponse.deploymentData,
        address: response.sessionResponse.address,
      }

      this.sessionAccount =
        await this.buildSessionAccountFromStoredSession(signedSession)

      if (!(await this.isConnected())) {
        return
      }

      this.saveSessionToStorage(signedSession)

      return {
        account: this.sessionAccount,
        user: response.user,
        callbackData: response.sessionResponse.callbackData,
        approvalTransactionHash:
          response.sessionResponse.approvalTransactionHash,
      }
    }
  }

  // call this method when the user clicks a button to connect
  async requestConnection({
    callbackData,
    approvalRequests,
  }: {
    callbackData?: string
    approvalRequests?: ApprovalRequest[]
  }): Promise<ConnectResponse | undefined> {
    if (await this.isConnected()) {
      console.log("requestConnection - Already connected")
      return await this.connect()
    } else {
      console.log("requestConnection - Connecting")
      // Clear any existing invalid session
      await this.clearSession()
    }

    if (!approvalRequests) {
      // TODO: or just call webwallet connector.connect()
      throw new Error("Approval requests are required")
    }

    // generate a new session key pair
    const privateKey = ec.starkCurve.utils.randomPrivateKey()
    const publicSessionKey = ec.starkCurve.getStarkKey(privateKey)

    const sessionKey: SessionKey = {
      publicKey: publicSessionKey,
      privateKey: bytesToHexString(privateKey),
    }

    // build the off chain session info
    const sessionRequest = this.buildSessionRequest(sessionKey)

    // store the session request in the cloud storage to be able to create the session account later
    // note that the session is saved without the signature and the address
    this.saveSessionRequestToStorage(sessionRequest)

    try {
      const result = await this.webWalletConnector.connectAndSignSession({
        callbackData,
        approvalRequests,
        sessionTypedData: sessionRequest.sessionTypedData,
      })

      if (!result.account?.[0]) {
        throw new Error("No account address found")
      }

      if (!result.signature) {
        throw new Error("No signature found")
      }

      const session = await createSession({
        sessionRequest,
        address: result.account[0],
        chainId: this.environment.chainId,
        authorisationSignature: result.signature,
      })

      const signedSession: SignedSession = {
        ...session,
        signature: result.signature,
        deploymentPayload: result.deploymentPayload,
        address: result.account[0],
      }

      this.saveSessionToStorage(signedSession)

      this.sessionAccount =
        await this.buildSessionAccountFromStoredSession(signedSession)

      return {
        account: this.sessionAccount,
        approvalRequestsCalls: result.approvalRequestsCalls,
        approvalTransactionHash: result.approvalTransactionHash,
        callbackData: callbackData,
      }
    } catch (error) {
      this.clearSession()
      throw error
    }
  }

  async requestApprovals(approvalRequests: ApprovalRequest[]): Promise<string> {
    if (!(await this.isConnected())) {
      throw new Error("User must be connected to request approval requests")
    }

    const calls =
      approvalRequests.map((request: any) => {
        if (!request.tokenAddress || !request.spender || !request.amount) {
          throw new Error(
            `Invalid approval request: ${JSON.stringify(request)}`,
          )
        }

        return {
          entry_point: "approve",
          contract_address: request.tokenAddress,
          calldata: [
            request.spender,
            uint256.bnToUint256(BigInt(request.amount)),
          ],
        }
      }) || []

    const { transaction_hash } = await this.webWalletConnector.request({
      type: "wallet_addInvokeTransaction",
      params: {
        calls,
      },
    })
    return transaction_hash
  }

  // check if the user is connected
  async isConnected(): Promise<boolean> {
    return (
      (await this.webWalletConnector.ready()) &&
      this.sessionAccount !== undefined &&
      this.sessionAccount?.getSessionStatus() === "VALID"
    )
  }

  // check if the user has already created a wallet
  async hasWallet(userId: number): Promise<boolean> {
    const contact = await this.contactService.getContactById(userId)
    return contact !== null
  }

  // export the session, to use it somewhere else in the application
  async exportSignedSession(): Promise<SignedSession | undefined> {
    const session = await this.getSessionFromStorage()
    if (
      session &&
      session.signature &&
      session.address &&
      session.deploymentPayload
    ) {
      return session as SignedSession
    }
    return undefined
  }

  async clearSession(): Promise<void> {
    storageService.remove(StorageKeys.Session)
    storageService.remove(StorageKeys.SessionRequest)
    this.sessionAccount = undefined
  }

  private async getSessionFromInitData(): Promise<
    | {
        user: User
        sessionResponse: SessionResponse
      }
    | undefined
  > {
    const userStored = storageService.get(StorageKeys.User)

    if (!userStored) {
      return
    }

    const user = JSON.parse(userStored) as User

    const sessionResponseStored = storageService.get(user.address)

    if (!sessionResponseStored) {
      return
    }

    const sessionResponse = JSON.parse(sessionResponseStored) as SessionResponse

    return { user, sessionResponse }
  }

  private getSessionFromStorage(): SignedSession | undefined {
    const session = storageService.get(StorageKeys.Session)

    if (!session) {
      return
    }

    return JSON.parse(session) as Session
  }

  private getSessionRequestFromStorage(): SessionRequest | undefined {
    const sessionRequest = storageService.get(StorageKeys.SessionRequest)

    if (!sessionRequest) {
      return
    }

    return JSON.parse(sessionRequest) as SessionRequest
  }

  private saveSessionToStorage(session: SignedSession) {
    storageService.set(StorageKeys.Session, JSON.stringify(session))
  }

  private saveSessionRequestToStorage(sessionRequest: SessionRequest) {
    storageService.set(
      StorageKeys.SessionRequest,
      JSON.stringify(sessionRequest),
    )
  }

  private buildSessionRequest(sessionKey: SessionKey): SessionRequest {
    const allowedMethods = this.sessionParams.allowedMethods.map((method) => ({
      "Contract Address": method.contract,
      selector: method.selector,
    }))
    const days =
      this.sessionParams.validityDays ?? SESSION_DEFAULT_VALIDITY_DAYS
    const expiry = BigInt(Date.now() + days * 1000 * 60 * 60 * 24) / 1000n
    const metaData = {
      projectID: this.appName,
      txFees: [
        {
          tokenAddress: strkAddress,
          maxAmount: "10000000000000000000", // 10
        },
        {
          tokenAddress: ethAddress,
          maxAmount: "100000000000000000", // 0.1
        },
      ],
    }

    return createSessionRequest({
      chainId: this.environment.chainId,
      sessionParams: { allowedMethods, expiry, metaData, sessionKey },
    })
  }

  private async buildSessionAccountFromStoredSession(
    session: SignedSession,
  ): Promise<SessionAccountInterface> {
    return createSessionAccount({
      session,
      sessionParams: this.sessionParams,
      provider: this.provider,
      chainId: this.environment.chainId,
      argentBaseUrl: this.environment.argentBaseUrl,
    })
  }

  public static init(params: InitParams): ArgentWebWallet {
    return new ArgentWebWallet(params)
  }
}
