import {
  bytesToHexString,
  createSession,
  createSessionRequest,
  Session,
  SessionKey,
  SessionRequest,
} from "@argent/x-sessions"
import {
  Call,
  CallData,
  ec,
  ProviderInterface,
  RpcProvider,
  uint256,
} from "starknet"
import {
  HTTPService,
  ITokenServiceWeb,
  TokenServiceWeb,
} from "@argent/x-shared"
import { ApprovalRequest, WebWalletConnector } from "starknetkit/webwallet"
import { ethAddress, strkAddress } from "./lib"
import { Address } from "./lib/primitives/address"
import { createSessionAccount, SessionAccount } from "./sessionAccount"
import { storageService } from "./storage"
import {
  Environment,
  PaymasterParameters,
  SessionParameters,
  SignedSession,
  StarknetChainId,
} from "./types"
import { AccountDeploymentPayload } from "./lib/shared/types/account.ts"

export * from "./lib"
export * from "./paymaster"
export { createSessionAccount } from "./sessionAccount"
export { storageService, type IStorageService } from "./storage"
export type * from "./types"
export type { ApprovalRequest, WebWalletConnector }

const SESSION_DEFAULT_VALIDITY_DAYS = 30

const StorageKeys = {
  User: "User",
  Session: "session",
} as const

const ENVIRONMENTS: Record<"sepolia" | "mainnet" | "dev", Environment> = {
  sepolia: {
    chainId: StarknetChainId.SN_SEPOLIA,
    webWalletUrl: "https://sepolia-web.argent.xyz",
    argentBaseUrl: "https://cloud.argent-api.com/v1",
    providerDefaultUrl: "https://free-rpc.nethermind.io/sepolia-juno/v0_7",
  },
  mainnet: {
    chainId: StarknetChainId.SN_MAIN,
    webWalletUrl: "https://web.argent.xyz",
    argentBaseUrl: "https://cloud.argent-api.com/v1",
    providerDefaultUrl: "https://free-rpc.nethermind.io/mainnet-juno",
  },
  dev: {
    chainId: StarknetChainId.SN_SEPOLIA,
    webWalletUrl: "http://localhost:3005",
    argentBaseUrl: "https://api.hydrogen.argent47.net/v1",
    providerDefaultUrl: "https://free-rpc.nethermind.io/sepolia-juno/v0_7",
  },
}

interface User {
  address: Address
}

type InitParams = {
  appName: string
  sessionParams: SessionParameters
  paymasterParams?: PaymasterParameters
  webwalletUrl?: string
  environment?: keyof typeof ENVIRONMENTS
  provider?: ProviderInterface
}

interface ArgentWebWalletInterface {
  provider: ProviderInterface
  sessionAccount?: SessionAccount
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

  // expert methods
  exportSignedSession(): SignedSession | undefined
  clearSession(): Promise<void>
}

type ConnectResponse = {
  account: SessionAccount
  user?: User
  callbackData?: string
  approvalTransactionHash?: string
  approvalRequestsCalls?: Call[]
  deploymentPayload?: AccountDeploymentPayload
}

export class ArgentWebWallet implements ArgentWebWalletInterface {
  private appName: string
  private environment: Environment

  private sessionParams: SessionParameters
  private paymasterParams?: PaymasterParameters

  private tokenService: ITokenServiceWeb
  private webWalletConnector: WebWalletConnector

  provider: ProviderInterface
  sessionAccount?: SessionAccount

  constructor(params: InitParams) {
    this.appName = params.appName
    this.sessionParams = params.sessionParams
    this.environment = ENVIRONMENTS[params.environment ?? "sepolia"]
    this.paymasterParams = params.paymasterParams ?? {}
    this.provider =
      params.provider ??
      new RpcProvider({ nodeUrl: this.environment.providerDefaultUrl })
    this.webWalletConnector = new WebWalletConnector({
      url: this.environment.webWalletUrl,
      theme: "dark",
    })
    this.tokenService = new TokenServiceWeb(
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

    return undefined
  }

  // call this method when the user clicks a button to connect
  async requestConnection({
    callbackData,
    approvalRequests,
  }: {
    callbackData?: string
    approvalRequests?: ApprovalRequest[]
  }): Promise<ConnectResponse | undefined> {
    await this.clearSession()

    // generate a new session key pair
    const privateKey = ec.starkCurve.utils.randomPrivateKey()
    const publicSessionKey = ec.starkCurve.getStarkKey(privateKey)

    const sessionKey: SessionKey = {
      publicKey: publicSessionKey,
      privateKey: bytesToHexString(privateKey),
    }

    // build the off chain session info
    const sessionRequest = this.buildSessionRequest(sessionKey)

    try {
      const result = await this.webWalletConnector.connectAndSignSession({
        callbackData,
        approvalRequests: approvalRequests ?? [],
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
        deploymentPayload: result.deploymentPayload,
        callbackData: callbackData,
      }
    } catch (error) {
      this.clearSession()
      throw error
    }
  }

  async requestApprovals(approvalRequests: ApprovalRequest[]): Promise<string> {
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
          calldata: CallData.compile([
            request.spender,
            uint256.bnToUint256(BigInt(request.amount)),
          ]),
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
    console.log("isConnected")
    return (
      (await this.webWalletConnector.ready()) &&
      this.sessionAccount !== undefined &&
      this.sessionAccount?.getSessionStatus() === "VALID"
    )
  }

  // export the session, to use it somewhere else in the application
  exportSignedSession(): SignedSession | undefined {
    const session = this.getSessionFromStorage()
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
    this.sessionAccount = undefined
  }

  private getSessionFromStorage(): SignedSession | undefined {
    const session = storageService.get(StorageKeys.Session)

    if (!session) {
      return
    }

    return JSON.parse(session) as Session
  }

  private saveSessionToStorage(session: SignedSession) {
    storageService.set(StorageKeys.Session, JSON.stringify(session))
  }

  private buildSessionRequest(sessionKey: SessionKey): SessionRequest {
    const allowedMethods = this.sessionParams.allowedMethods.map((method) => ({
      "Contract Address": method.contract,
      selector: method.selector,
    }))

    const days =
      this.sessionParams.validityDays ?? SESSION_DEFAULT_VALIDITY_DAYS
    const expiry = BigInt(Date.now() + days * 1000 * 60 * 60 * 24) / 1000n

    if (days > SESSION_DEFAULT_VALIDITY_DAYS) {
      console.warn(
        `The 'validityDays' param is larger than the limit of ${SESSION_DEFAULT_VALIDITY_DAYS} days. Please set your 'validityDays' inside the boundary.`,
      )
    }

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
  ): Promise<SessionAccount> {
    return createSessionAccount({
      session,
      sessionParams: this.sessionParams,
      provider: this.provider,
      chainId: this.environment.chainId,
      argentBaseUrl: this.environment.argentBaseUrl,
      paymasterParams: this.paymasterParams ?? {},
      tokenService: this.tokenService,
    })
  }

  public static init(params: InitParams): ArgentWebWallet {
    return new ArgentWebWallet(params)
  }
}
