import {
  isEqualAddress,
  ITokenServiceWeb,
  normalizeAddress,
} from "@argent/x-shared"
import {
  BASE_URL,
  DeploymentData,
  executeCalls,
  fetchAccountCompatibility,
  fetchGasTokenPrices,
  GaslessCompatibility,
  GaslessOptions,
  GasTokenPrice,
  getGasFeesInGasToken,
  SEPOLIA_BASE_URL,
} from "@avnu/gasless-sdk"
import { AccountDeploymentPayload } from "./lib/shared/types/account"
import assert from "assert"
import {
  Call,
  EstimateFeeResponse,
  hash,
  Invocations,
  TransactionType,
  TypedData,
  UniversalDetails,
} from "starknet"
import {
  PaymasterParameters,
  SelfDeployingAccountInterface,
  StarknetChainId,
  StrongAccountInterface,
} from "./types"
import { SessionAccount } from "./sessionAccount.ts"

export const gasTokenAddress =
  "0x53b40a647cedfca6ca84f542a0fe36736031905a9639a7f19a3c1e66bfd5080"
const strk = "0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d"

export const gaslessBaseUrls = {
  [StarknetChainId.SN_MAIN]: BASE_URL,
  [StarknetChainId.SN_SEPOLIA]: SEPOLIA_BASE_URL,
}

export const getNativeFees = async ({
  deploymentPayload,
  isDeployed,
  calls,
  account,
  universalDetails,
}: {
  account: StrongAccountInterface
  universalDetails?: UniversalDetails
  calls: Call[]
  isDeployed?: boolean
  deploymentPayload?: AccountDeploymentPayload
}) => {
  const invocations: Invocations = [
    { type: TransactionType.INVOKE, payload: calls },
  ]
  if (!isDeployed && deploymentPayload) {
    invocations.unshift({
      type: TransactionType.DEPLOY_ACCOUNT,
      payload: deploymentPayload,
    })
  }
  const bulkFees = await account.estimateFeeBulk(invocations, universalDetails)
  const fee = isDeployed ? bulkFees[0] : bulkFees[1]
  return fee
}

export const getEstimatedFeesInGasToken = async ({
  account,
  fee,
}: {
  fee: EstimateFeeResponse
  account: StrongAccountInterface
}) => {
  const gaslessBaseUrl = gaslessBaseUrls[await account.getChainId()]
  assert(gaslessBaseUrl, "Unsupported chain id for gasless")
  const gaslessOptions = { baseUrl: gaslessBaseUrl }
  const compatibility = await getCompatibility(account, gaslessOptions)
  const gasTokenPrices = await fetchGasTokenPrices(gaslessOptions)
  const gasTokenFees = Object.fromEntries(
    gasTokenPrices.map((price) => feeInGasToken(fee, price, compatibility)),
  )
  return { gasTokenFees, gaslessOptions }
}

export async function deployAndExecuteWithPaymaster(
  account: SessionAccount,
  paymasterParams: PaymasterParameters,
  deploymentPayload: AccountDeploymentPayload,
  calls: Call[],
) {
  // sign message is overriden here to allow the session account to sign the message (called outside our codebase)
  account.signMessage = (typedData: TypedData) => {
    return account.signMessageFromOutside(typedData, calls)
  }

  const deploymentData: DeploymentData = {
    class_hash: deploymentPayload.classHash,
    salt: deploymentPayload.addressSalt,
    unique: "0x0",
    calldata: convertToHex(deploymentPayload.constructorCalldata),
  }

  if (paymasterParams.apiKey) {
    try {
      const { transactionHash } = await executeCalls(
        account,
        calls,
        {
          deploymentData,
        },
        {
          apiKey: paymasterParams.apiKey,
          baseUrl:
            paymasterParams.baseUrl ??
            gaslessBaseUrls[await account.getChainId()],
        },
      )
      return { transaction_hash: transactionHash }
    } catch (e) {
      console.error(e)
      throw e
    }
  }
}

export async function executeWithPaymaster(
  tokenService: ITokenServiceWeb,
  account: SelfDeployingAccountInterface,
  calls: Call[],
  paymasterParams: PaymasterParameters,
  universalDetails?: UniversalDetails,
) {
  const isDeployed = await account.isDeployed()
  const deploymentPayload = await account.getDeploymentPayload()
  if (!isDeployed) {
    universalDetails = { ...universalDetails, nonce: 0n }
  }
  // execution with optional account deployment via paymaster
  let deploymentData: DeploymentData | undefined
  if (!isDeployed) {
    deploymentData = {
      class_hash: deploymentPayload.classHash,
      salt: deploymentPayload.addressSalt,
      unique: "0x0",
      calldata: convertToHex(deploymentPayload.constructorCalldata),
    }
  }
  if (paymasterParams.apiKey) {
    try {
      const { transactionHash } = await executeCalls(
        account,
        calls,
        {
          deploymentData,
        },
        {
          apiKey: paymasterParams.apiKey,
          baseUrl:
            paymasterParams.baseUrl ??
            gaslessBaseUrls[await account.getChainId()],
        },
      )
      return { transaction_hash: transactionHash }
    } catch (e) {
      throw e
    }
  }

  const fee = await getNativeFees({
    deploymentPayload,
    isDeployed,
    calls,
    account,
    universalDetails,
  })

  const { gasTokenFees, gaslessOptions } = await getEstimatedFeesInGasToken({
    fee,
    account,
  })

  const network = (tokenService as any).httpService.requestInit.headers[
    "Argent-Network"
  ]
  const tokens = await tokenService.fetchAddressTokenBalancesFromBackend(
    account.address,
    network,
  )

  let gasTokenAddress: string | undefined
  let maxGasTokenAmount: bigint | undefined
  tokens.find((token) => {
    const balance = BigInt(token.balance)
    const gasTokenFee = gasTokenFees[normalizeAddress(token.address)]
    if (gasTokenFee && balance > gasTokenFee) {
      gasTokenAddress = token.address
      maxGasTokenAmount = gasTokenFee
    }
  })
  assert(
    gasTokenAddress,
    "Not enough balance in any gas token - please fund your wallet with a valid gas token",
  )

  try {
    const { transactionHash } = await executeCalls(
      account,
      calls,
      {
        gasTokenAddress: paymasterParams.apiKey
          ? undefined
          : (paymasterParams.tokenAddress ?? gasTokenAddress),
        maxGasTokenAmount: paymasterParams.apiKey
          ? undefined
          : maxGasTokenAmount,
        deploymentData,
      },
      {
        apiKey: paymasterParams.apiKey,
        baseUrl: paymasterParams.baseUrl ?? gaslessOptions.baseUrl,
      },
    )
    return { transaction_hash: transactionHash }
  } catch (e) {
    console.log(e)
    throw e
  }
}

async function getCompatibility(
  account: SelfDeployingAccountInterface | StrongAccountInterface,
  gaslessOptions: GaslessOptions,
) {
  if ("isDeployed" in account && (await account.isDeployed())) {
    return await fetchAccountCompatibility(account.address, gaslessOptions)
  }
  return {
    isCompatible: true,
    gasConsumedOverhead: 0n,
    dataGasConsumedOverhead: 0n,
  }
}

export function isOutOfGasError(error: unknown) {
  // TODO: fix this test which is too wide, see below
  if (/Sign session error/gi.test(`${error}`)) {
    return true
  }
  // correct implementation, for some reason the error.status/cause isn't bubbled up from here: https://github.com/argentlabs/x-sessions/blob/1e7714c644c5ca738fdb8755f039d0f8eb4431bd/src/argentSessionService.ts#L203
  // if ((error as any)?.cause === "gasExceedsLimit") {
  //   return true;
  // }
  return /validation failed.*gas bounds.*exceed balance/gi.test(`${error}`)
}

export function prependPaymasterTransfer(typedData: TypedData, calls: Call[]) {
  const messageCalls = (typedData.message as any).Calls as Array<{
    To: string
    Selector: string
  }>

  if (calls.length === messageCalls.length - 1) {
    const transferSelector = hash.getSelectorFromName("transfer")

    // Instead of unshifting, create a new call array in the exact same order
    let newCalls: Call[] = []

    // Process each messageCall in order
    for (let i = 0; i < messageCalls.length; i++) {
      const messageCall = messageCalls[i]
      if (
        isEqualAddress(messageCall.To, strk) &&
        messageCall.Selector === transferSelector
      ) {
        // Add the gas token transfer call in the same position
        newCalls.push({
          contractAddress: strk,
          entrypoint: "transfer",
        })
      } else {
        // Add the corresponding call from our original calls array
        newCalls.push(calls[newCalls.length > i ? i - 1 : i])
      }
    }
    calls = newCalls
  }
  console.log("Final calls:", calls)

  // Verify alignment of all calls
  assert(messageCalls.length === calls.length, "unaligned proofs")
  for (let i = 0; i < messageCalls.length; i++) {
    assert(
      BigInt(messageCalls[i].To) === BigInt(calls[i].contractAddress),
      "mismatched contract address",
    )
    assert(
      messageCalls[i].Selector ===
        hash.getSelectorFromName(calls[i].entrypoint),
      "mismatched selector",
    )
  }

  return calls
}

function feeInGasToken(
  fee: EstimateFeeResponse,
  gasTokenPrice: GasTokenPrice,
  gaslessCompatibility: GaslessCompatibility,
) {
  const feeInGasToken = getGasFeesInGasToken(
    fee.overall_fee,
    gasTokenPrice,
    fee.gas_price,
    fee.data_gas_price ?? 1n,
    gaslessCompatibility.gasConsumedOverhead,
    gaslessCompatibility.dataGasConsumedOverhead,
  )
  return [normalizeAddress(gasTokenPrice.tokenAddress), feeInGasToken] as const
}

function convertToHex(values: string[]): string[] {
  return values.map((value: string, index: number): string => {
    try {
      // Handle large numbers (more than 15 digits) using BigInt
      if (value.length > 15) {
        const bigIntValue = BigInt(value)
        const hexString = bigIntValue.toString(16)
        return `0x${hexString}`
      } else {
        // Handle smaller numbers using standard conversion
        const num = parseInt(value, 10)
        if (isNaN(num)) {
          throw new Error(`Invalid number at index ${index}`)
        }
        return `0x${num.toString(16)}`
      }
    } catch (error) {
      throw new Error(
        `Failed to convert value "${value}" at index ${index}: ${error}`,
      )
    }
  })
}
