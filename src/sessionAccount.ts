import {
  buildSessionAccount,
  createOutsideExecutionCall,
  Session,
  signOutsideExecution,
  verifySession,
} from "@argent/x-sessions"
import {
  getAccountDeploymentPayload,
  getLatestArgentAccountClassHash,
  Hex,
  ITokenServiceWeb,
} from "@argent/x-shared"
import assert from "assert"
import { Address } from "./lib/primitives/address"
import { AccountDeploymentPayload } from "./lib/shared/types/account"
import {
  Abi,
  Call,
  num,
  ProviderInterface,
  SignerInterface,
  TypedData,
  UniversalDetails,
} from "starknet"
import { SelfDeployingAccount } from "./selfDeployingAccount"
import {
  PaymasterParameters,
  SessionAccountInterface,
  SessionParameters,
  SessionStatus,
  SignedSession,
  StarknetChainId,
} from "./types"
import {
  executeWithPaymaster,
  isOutOfGasError,
  prependPaymasterTransfer,
} from "./paymaster.ts"

const mapStarknetChainIdToNetwork = (
  chainId: StarknetChainId,
): "sepolia" | "mainnet" => {
  switch (chainId) {
    case StarknetChainId.SN_MAIN:
      return "mainnet"
    case StarknetChainId.SN_SEPOLIA:
      return "sepolia"
    default:
      throw new Error(`Unknown chain id ${chainId}`)
  }
}
export class SessionAccount
  extends SelfDeployingAccount
  implements SessionAccountInterface
{
  protected deploymentPayload: AccountDeploymentPayload
  protected session: SignedSession
  protected sessionParams: SessionParameters
  protected paymasterParams: PaymasterParameters
  argentBaseUrl: string
  chainId: StarknetChainId
  tokenService: ITokenServiceWeb
  public constructor(
    provider: ProviderInterface,
    public address: Address,
    signer: SignerInterface,
    deploymentPayload: AccountDeploymentPayload,
    session: Session,
    sessionParams: SessionParameters,
    argentBaseUrl: string,
    chainId: StarknetChainId,
    tokenService: ITokenServiceWeb,
    paymasterParams: PaymasterParameters,
  ) {
    super(provider, signer, deploymentPayload)
    this.deploymentPayload = deploymentPayload
    this.session = session
    this.sessionParams = sessionParams
    this.argentBaseUrl = argentBaseUrl
    this.chainId = chainId
    this.tokenService = tokenService
    this.paymasterParams = paymasterParams
  }

  public async getOutsideExecutionPayload({
    calls,
  }: {
    calls: Call[]
  }): Promise<Call> {
    return await createOutsideExecutionCall({
      session: this.session,
      sessionKey: this.session.sessionKey,
      calls,
      argentSessionServiceUrl: this.argentBaseUrl,
      network: mapStarknetChainIdToNetwork(this.chainId),
    })
  }

  protected async onExecute(
    calls: Call[],
    abis?: Abi[],
    universalDetails?: UniversalDetails,
  ) {
    const handleWithPaymaster = async () => {
      // sign message is overriden here to allow the session account to sign the message (called outside our codebase)
      this.signMessage = (typedData: TypedData) =>
        this.signMessageFromOutside(typedData, calls)
      const response = await executeWithPaymaster(
        this.tokenService,
        this,
        calls,
        this.paymasterParams,
        universalDetails,
      )
      this.isDeployedPromise = Promise.resolve(true)
      return response
    }
    try {
      if (this.paymasterParams.apiKey) {
        return await handleWithPaymaster()
      } else {
        assert(
          await this.isDeployed(),
          "validation failed gas bounds exceed balance",
        )
        return await this.executeWithDeploy(calls, abis, universalDetails)
      }
    } catch (error) {
      if (isOutOfGasError(error)) {
        await handleWithPaymaster()
      }
      throw error
    }
  }

  public async signMessageFromOutside(typedData: TypedData, calls: Call[]) {
    assert(
      typedData.primaryType === "OutsideExecution",
      "signMessage only for outside execution",
    )
    assert(
      typedData.domain.name === "Account.execute_from_outside",
      "signMessage only for outside execution",
    )

    return signOutsideExecution({
      session: this.session,
      sessionKey: this.session.sessionKey,
      outsideExecutionTypedData: typedData,
      calls: prependPaymasterTransfer(typedData, calls),
      network: mapStarknetChainIdToNetwork(this.chainId),
      argentSessionServiceUrl: this.argentBaseUrl,
    })
  }

  public getSessionStatus(): SessionStatus {
    if (num.toBigInt(this.session.expiresAt) * 1000n <= Date.now()) {
      console.log("getSessionStatus - EXPIRED")
      return "EXPIRED"
    } else if (!this.isSessionScopeValid()) {
      console.log("getSessionStatus - INVALID_SCOPE")
      return "INVALID_SCOPE"
    } else if (!this.session.signature) {
      console.log("getSessionStatus - INVALID_SIGNATURE")
      return "INVALID_SIGNATURE"
    } else if (
      !verifySession({
        session: {
          allowedMethods: this.session.allowedMethods,
          sessionKey: this.session.sessionKey,
          expiresAt: this.session.expiresAt,
          address: this.session.address,
          chainId: this.session.chainId,
          authorisationSignature: this.session.authorisationSignature,
          hash: this.session.hash,
          version: this.session.version,
          sessionKeyGuid: this.session.sessionKeyGuid,
          metadata: this.session.metadata,
        },
        sessionKey: this.session.sessionKey,
      })
    ) {
      console.log("getSessionStatus - INVALID_SESSION")
      return "INVALID_SESSION"
    }

    return "VALID"
  }

  // check if all allowed_methods defined in the sessions params (defined in the SDK constructor)
  // are still valid in the session parameters
  protected isSessionScopeValid(): boolean {
    for (const allowedMethod of this.sessionParams.allowedMethods) {
      const found = this.session.allowedMethods.find((allowed_method) => {
        return (
          allowed_method["Contract Address"] === allowedMethod.contract &&
          allowed_method.selector === allowedMethod.selector
        )
      })
      if (found === undefined) return false
    }
    return true
  }
}

export async function createSessionAccount({
  session,
  sessionParams,
  provider,
  chainId,
  argentBaseUrl,
  tokenService,
  paymasterParams,
}: {
  session: SignedSession
  sessionParams: SessionParameters
  provider: ProviderInterface
  chainId: StarknetChainId
  argentBaseUrl: string
  transactionVersion?: "0x2" | "0x3"
  tokenService: ITokenServiceWeb
  paymasterParams: PaymasterParameters
}): Promise<SessionAccount> {
  const account = await buildSessionAccount({
    session,
    sessionKey: session.sessionKey,
    provider,
    argentSessionServiceBaseUrl: argentBaseUrl,
  })
  // can safely use 1 as cairoVersion as we created all the accounts
  const deploymentPayload = getAccountDeploymentPayload(
    "1",
    getLatestArgentAccountClassHash(),
    await account.signer.getPubKey(),
  )

  return new SessionAccount(
    provider,
    account.address as Address,
    account.signer,
    {
      ...deploymentPayload,
      contractAddress: account.address as Address,
      classHash: deploymentPayload.classHash as Address,
      constructorCalldata: deploymentPayload.constructorCalldata as Hex[],
    },
    session,
    sessionParams,
    argentBaseUrl,
    chainId,
    tokenService,
    paymasterParams,
  )
}
