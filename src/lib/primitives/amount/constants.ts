import { Address } from "../address"

export const knownCurrency = ["STRK", "ETH", "WBTC", "USDC"]

export type KnownCurrency = (typeof knownCurrency)[number]

export const knownCurrencyToAddress: Record<KnownCurrency, Address> = {
  STRK: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
  ETH: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
  WBTC: "0x00452bd5c0512a61df7c7be8cfea5e4f893cb40e126bdc40aee6054db955129e",
  USDC: "0x053b40a647cedfca6ca84f542a0fe36736031905a9639a7f19a3c1e66bfd5080",
}
