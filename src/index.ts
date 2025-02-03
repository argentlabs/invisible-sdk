import {
  // bytesToHexString,
  createSession,
  // createSessionRequest,
  Session,
  // SessionKey,
  SessionRequest,
} from "@argent/x-sessions"
import { HTTPService } from "@argent/x-shared"
import { ContactArgentBackendService } from "./lib/services/contact/backend"
import type { ApprovalRequest } from "./lib/shared/stores/approval"
import { ApprovalRequestStore } from "./lib/shared/stores/approval"
import {
  // SessionRequestStore,
  SessionResponse,
  // SessionResponseStore,
} from "./lib/shared/stores/session"
// import { openTelegramLinkAndClose } from "./lib/shared/telegram"
// import { retrieveLaunchParams } from "@telegram-apps/sdk-react"
import {
  // ec,
  ProviderInterface, RpcProvider,
} from "starknet"
// import { ethAddress, strkAddress } from "./lib"
import { createSessionAccount } from "./sessionAccount"
import {
  Environment,
  SessionAccountInterface,
  SessionParameters,
  SignedSession,
  StarknetChainId,
} from "./types"
import { WebWalletConnector } from "starknetkit/webwallet";
import { storageService } from "./storage";
import {Address} from "./lib/primitives/address";

export * from "./lib"
export * from "./paymaster"
export { createSessionAccount } from "./sessionAccount"
export { storageService, type IStorageService } from "./storage"
export type * from "./types"

// const SESSION_DEFAULT_VALIDITY_DAYS = 90

const StorageKeys = {
  User: "User",
  Session: "session",
  SessionRequest: "session_request"
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
    webWalletUrl: "https://web-v2.hydrogen.argent47.net",
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
}

interface ArgentWebWalletInterface {
  provider: ProviderInterface
  sessionAccount?: SessionAccountInterface

  connect(): Promise<ConnectResponse | undefined>
  requestConnection({
    // callbackData,
    // approvalRequests,
  }): Promise<undefined>
  isConnected(): Promise<boolean> // DONE
  requestApprovals(approvalRequests: ApprovalRequest[]): Promise<void>
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
}

export class ArgentWebWallet implements ArgentWebWalletInterface {
  private webWalletConnector: WebWalletConnector

  private appName: string
  private appTelegramUrl: string
  private environment: Environment
  private sessionParams: SessionParameters

  provider: ProviderInterface

  // private requestStore: SessionRequestStore
  // private responseStore: SessionResponseStore
  private approvalStore: ApprovalRequestStore

  sessionAccount?: SessionAccountInterface

  contactService: ContactArgentBackendService

  constructor(params: InitParams) {
    this.appName = params.appName
    this.sessionParams = params.sessionParams
    this.environment = ENVIRONMENTS[params.environment ?? "sepolia"]
    this.appTelegramUrl = params.appTelegramUrl || "" // TODO
    this.provider =
      params.provider ??
      new RpcProvider({ nodeUrl: this.environment.providerDefaultUrl })
    this.webWalletConnector = new WebWalletConnector({
      url: this.environment.webWalletUrl,
      theme: "light",
      // authorizedPartyId: string; TODO ??
    })

    // this.requestStore = new SessionRequestStore(
    //   `${this.environment.storeUrl}/api/json`,
    // )
    // this.responseStore = new SessionResponseStore(
    //   `${this.environment.storeUrl}/api/json`,
    // )
    this.approvalStore = new ApprovalRequestStore(
      `${this.environment.storeUrl}/api/json`,
    )

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

      return
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
  }): Promise<never> {
    if (await this.isConnected()) {
      console.log("requestConnection - Already connected")
      return undefined as never
    } else {
      console.log("requestConnection - Connecting")
      // Clear any existing invalid session
      await this.clearSession()
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

    // redirect to the wallet to get the session signed
    const uuid = await this.requestStore.put({
      appName: this.appName,
      sessionTypedData: sessionRequest.sessionTypedData,
      callbackUrl: this.appTelegramUrl,
      callbackData,
      approvalRequests,
    })

    // TODO session
    return undefined as never
  }

  async requestApprovals(approvalRequests: ApprovalRequest[]): Promise<void> {
    if (!(await this.isConnected())) {
      throw new Error("User must be connected to request approval requests")
    }
    // const uuid = await this.approvalStore.put({
    //   callbackUrl: this.appTelegramUrl,
    //   requests: approvalRequests,
    //   appName: this.appName,
    // })
    const uuid = "3123-123-3123-312321"
    return console.log(`${uuid}`, approvalRequests);
    // return openTelegramLinkAndClose(
    //   `${this.environment.walletAppUrl}?startapp=${uuid}&mode=compact`,
    // )
  }

  // check if the user is connected
  async isConnected(): Promise<boolean> {
    return this.webWalletConnector.ready()
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

  private saveSessionRequestToStorage(
    sessionRequest: SessionRequest,
  ) {
    storageService.set(
      StorageKeys.SessionRequest,
      JSON.stringify(sessionRequest),
    )
  }

  // private buildSessionRequest(sessionKey: SessionKey): SessionRequest {
  //   const allowedMethods = this.sessionParams.allowedMethods.map((method) => ({
  //     "Contract Address": method.contract,
  //     selector: method.selector,
  //   }))
  //   const days =
  //     this.sessionParams.validityDays ?? SESSION_DEFAULT_VALIDITY_DAYS
  //   const expiry = BigInt(Date.now() + days * 1000 * 60 * 60 * 24) / 1000n
  //   const metaData = {
  //     projectID: this.appName,
  //     txFees: [
  //       {
  //         tokenAddress: strkAddress,
  //         maxAmount: "10000000000000000000", // 10
  //       },
  //       {
  //         tokenAddress: ethAddress,
  //         maxAmount: "100000000000000000", // 0.1
  //       },
  //     ],
  //   }
  //
  //   return createSessionRequest({
  //     chainId: this.environment.chainId,
  //     sessionParams: { allowedMethods, expiry, metaData, sessionKey },
  //   })
  // }

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
