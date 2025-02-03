import {
  Account,
  Call,
  CallData,
  Calldata,
  Invocations,
  InvokeFunctionResponse,
  ProviderInterface,
  RPC,
  SimulateTransactionResponse,
  TransactionType,
  UniversalDetails,
  ec,
  encode,
  hash,
  num,
  uint256,
} from "starknet"

import { calculateEscrowAddress } from "."

export const ethAddress =
  "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7"
export const strkAddress =
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d"

// const typesRev1 = {
//   StarknetDomain: [
//     { name: "name", type: "shortstring" },
//     { name: "version", type: "shortstring" },
//     { name: "chainId", type: "shortstring" },
//     { name: "revision", type: "shortstring" },
//   ],
//   ClaimExternal: [
//     { name: "receiver", type: "ContractAddress" },
//     { name: "dust receiver", type: "ContractAddress" },
//   ],
// };

// export interface ClaimExternal {
//   receiver: string;
//   dustReceiver?: string;
// }

// export async function getClaimExternalData(claimExternal: ClaimExternal) {
//   const chainId = await manager.getChainId();
//   return {
//     types: typesRev1,
//     primaryType: "ClaimExternal",
//     domain: getDomain(chainId),
//     message: { receiver: claimExternal.receiver, "dust receiver": claimExternal.dustReceiver || "0x0" },
//   };
// }

export interface AccountConstructorArguments {
  sender: string
  gift_token: string
  gift_amount: string
  fee_token: string
  fee_amount: string
  gift_pubkey: string
}

export interface Gift extends AccountConstructorArguments {
  factory: string
  escrow_class_hash: string
}

export function buildGiftCallData(gift: Gift) {
  return { ...gift, gift_amount: uint256.bnToUint256(gift.gift_amount) }
}

// export async function signExternalClaim(signParams: {
//   gift: Gift;
//   receiver: string;
//   giftPrivateKey: string;
//   dustReceiver?: string;
//   forceEscrowAddress?: string;
// }): Promise<StarknetSignature> {
//   const giftSigner = new LegacyStarknetKeyPair(signParams.giftPrivateKey);
//   const claimExternalData = await getClaimExternalData({
//     receiver: signParams.receiver,
//     dustReceiver: signParams.dustReceiver,
//   });
//   const stringArray = (await giftSigner.signMessage(
//     claimExternalData,
//     signParams.forceEscrowAddress || calculateEscrowAddress(signParams.gift),
//   )) as string[];
//   if (stringArray.length !== 2) {
//     throw new Error("Invalid signature");
//   }
//   return { r: BigInt(stringArray[0]), s: BigInt(stringArray[1]) };
// }

// export async function claimExternal(args: {
//   gift: Gift;
//   receiver: string;
//   giftPrivateKey: string;
//   account: Account;
//   useTxV3?: boolean;
//   dustReceiver?: string;
// }): Promise<GetTransactionReceiptResponse> {
//   const account = args.useTxV3 ? setDefaultTransactionVersionV3(args.account) : args.account;
//   const signature = await signExternalClaim({
//     gift: args.gift,
//     receiver: args.receiver,
//     giftPrivateKey: args.giftPrivateKey,
//     dustReceiver: args.dustReceiver,
//   });

//   const claimExternalCallData = CallData.compile([
//     buildGiftCallData(args.gift),
//     args.receiver,
//     args.dustReceiver || "0x0",
//     signature,
//   ]);
//   const response = await account.execute(
//     executeActionOnAccount("claim_external", calculateEscrowAddress(args.gift), claimExternalCallData),
//   );
//   return manager.waitForTransaction(response.transaction_hash);
// }

export async function simulateClaimInternal(args: {
  gift: Gift
  receiver: string
  giftPrivateKey: string
  provider: ProviderInterface
  overrides?: { escrowAccountAddress?: string; callToAddress?: string }
}): Promise<SimulateTransactionResponse> {
  const escrowAddress =
    args.overrides?.escrowAccountAddress || calculateEscrowAddress(args.gift)
  const escrowAccount = getEscrowAccount(
    args.provider,
    args.gift,
    args.giftPrivateKey,
    escrowAddress,
  )

  const invocations: Invocations = [
    {
      type: TransactionType.INVOKE,
      contractAddress: args.overrides?.callToAddress ?? escrowAddress,
      entrypoint: "claim_internal",
      calldata: [buildGiftCallData(args.gift), args.receiver],
    },
  ]

  return await escrowAccount.simulateTransaction(invocations)
}

export async function claimInternal(args: {
  gift: Gift
  receiver: string
  giftPrivateKey: string
  provider: ProviderInterface
  overrides?: { escrowAccountAddress?: string; callToAddress?: string }
  details?: UniversalDetails
}): Promise<InvokeFunctionResponse> {
  const escrowAddress =
    args.overrides?.escrowAccountAddress || calculateEscrowAddress(args.gift)
  const escrowAccount = getEscrowAccount(
    args.provider,
    args.gift,
    args.giftPrivateKey,
    escrowAddress,
  )
  const call = {
    contractAddress: args.overrides?.callToAddress ?? escrowAddress,
    entrypoint: "claim_internal",
    calldata: [buildGiftCallData(args.gift), args.receiver],
  }
  return await escrowAccount.execute(call, undefined, args.details)
}

export function executeActionOnAccount(
  functionName: string,
  accountAddress: string,
  args: Calldata,
): Call {
  return {
    contractAddress: accountAddress,
    entrypoint: "execute_action",
    calldata: {
      selector: hash.getSelectorFromName(functionName),
      calldata: args,
    },
  }
}

export async function cancelGift(args: {
  gift: Gift
  senderAccount: Account
}): Promise<InvokeFunctionResponse> {
  const cancelCallData = CallData.compile([buildGiftCallData(args.gift)])
  const call = executeActionOnAccount(
    "cancel",
    calculateEscrowAddress(args.gift),
    cancelCallData,
  )
  return await args.senderAccount.execute(call)
}

function useTxv3(tokenAddress: string): boolean {
  if (tokenAddress === ethAddress) {
    return false
  } else if (tokenAddress === strkAddress) {
    return true
  }
  throw new Error(`Unsupported token: ${tokenAddress}`)
}

export function randomPrivateKey(format: "buffer"): Uint8Array
export function randomPrivateKey(format: "bigint"): BigInt
export function randomPrivateKey(format: "hex"): string
export function randomPrivateKey(): string
export function randomPrivateKey(
  format: "buffer" | "bigint" | "hex" = "hex",
): Uint8Array | BigInt | string {
  const buffer = ec.starkCurve.utils.randomPrivateKey()
  if (format === "buffer") {
    return buffer
  }
  const hex = `0x${encode.buf2hex(buffer)}`
  if (format === "hex") {
    return hex
  }
  return BigInt(hex)
}

export function getEscrowAccount(
  provider: ProviderInterface,
  gift: Gift,
  giftPrivateKey: string,
  forceEscrowAddress?: string,
): Account {
  const address = forceEscrowAddress || num.toHex(calculateEscrowAddress(gift))
  const cairoVersion = useTxv3(gift.fee_token)
    ? RPC.ETransactionVersion.V3
    : RPC.ETransactionVersion.V2
  return new Account(provider, address, giftPrivateKey, undefined, cairoVersion)
}
