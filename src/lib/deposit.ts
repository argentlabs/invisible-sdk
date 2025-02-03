import { bigDecimal } from "@argent/x-shared"
import assert from "assert"
import {
  Account,
  Call,
  CallData,
  Contract,
  InvokeFunctionResponse,
  hash,
  uint256,
} from "starknet"
import { AccountConstructorArguments, Gift } from "."

export const STRK_GIFT_MAX_FEE = 200000000000000000n // 0.2 STRK
export const ETH_GIFT_MAX_FEE = 200000000000000n // 0.0002 ETH

const depositAbi = [
  {
    type: "function",
    name: "deposit",
    inputs: [
      {
        name: "escrow_class_hash",
        type: "core::starknet::class_hash::ClassHash",
      },
      {
        name: "gift_token",
        type: "core::starknet::contract_address::ContractAddress",
      },
      { name: "gift_amount", type: "core::integer::u256" },
      {
        name: "fee_token",
        type: "core::starknet::contract_address::ContractAddress",
      },
      { name: "fee_amount", type: "core::integer::u128" },
      { name: "gift_pubkey", type: "core::felt252" },
    ],
    outputs: [],
    state_mutability: "external",
  },
]

const approveAbi = [
  {
    type: "function",
    name: "approve",
    inputs: [
      {
        name: "spender",
        type: "core::starknet::contract_address::ContractAddress",
      },
      { name: "amount", type: "core::integer::u256" },
    ],
    outputs: [{ type: "core::bool" }],
    state_mutability: "external",
  },
]

export function getMaxFee(useTxV3: boolean): bigint {
  return useTxV3 ? STRK_GIFT_MAX_FEE : ETH_GIFT_MAX_FEE
}

export interface DepositParams {
  giftAmount: bigint
  feeAmount: bigint
  factoryAddress: string
  feeTokenAddress: string
  giftTokenAddress: string
  giftSignerPubKey: bigint
  escrowAccountClassHash: string
}

export function createDeposit(
  sender: string,
  {
    giftAmount,
    feeAmount,
    factoryAddress,
    feeTokenAddress,
    giftTokenAddress,
    giftSignerPubKey,
    escrowAccountClassHash,
  }: DepositParams,
) {
  const factory = new Contract(depositAbi, factoryAddress)
  const feeToken = new Contract(approveAbi, feeTokenAddress)
  const giftToken = new Contract(approveAbi, giftTokenAddress)
  const calls: Call[] = []
  if (feeTokenAddress === giftTokenAddress) {
    assert(
      giftAmount > feeAmount,
      `Amount must be greater than ${bigDecimal.formatUnits({ value: 2n * feeAmount, decimals: 18 })} for this token when sending as a gift`,
    )
    calls.push(
      feeToken.populateTransaction.approve!(
        factoryAddress,
        giftAmount + feeAmount,
      ),
    )
  } else {
    calls.push(feeToken.populateTransaction.approve!(factoryAddress, feeAmount))
    calls.push(
      giftToken.populateTransaction.approve!(factoryAddress, giftAmount),
    )
  }
  calls.push(
    factory.populateTransaction.deposit!(
      escrowAccountClassHash,
      giftTokenAddress,
      giftAmount,
      feeTokenAddress,
      feeAmount,
      giftSignerPubKey,
    ),
  )
  const gift: Gift = {
    factory: factoryAddress,
    escrow_class_hash: escrowAccountClassHash,
    sender,
    gift_token: giftTokenAddress,
    gift_amount: giftAmount.toString(),
    fee_token: feeTokenAddress,
    fee_amount: feeAmount.toString(),
    gift_pubkey: giftSignerPubKey.toString(),
  }
  return { calls, gift }
}

export async function deposit(
  sender: Account,
  depositParams: DepositParams,
): Promise<{ response: InvokeFunctionResponse; gift: Gift }> {
  const { calls, gift } = createDeposit(sender.address, depositParams)
  const response = await sender.execute(calls)
  return { response, gift }
}

export function calculateEscrowAddress(gift: Gift): string {
  const constructorArgs: AccountConstructorArguments = {
    sender: gift.sender,
    gift_token: gift.gift_token,
    gift_amount: gift.gift_amount,
    fee_token: gift.fee_token,
    fee_amount: gift.fee_amount,
    gift_pubkey: gift.gift_pubkey,
  }

  const calldata = CallData.compile({
    ...constructorArgs,
    gift_amount: uint256.bnToUint256(gift.gift_amount),
  })
  const escrowAddress = hash.calculateContractAddressFromHash(
    0,
    gift.escrow_class_hash,
    calldata,
    gift.factory,
  )
  return escrowAddress
}
