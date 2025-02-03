import { ETH_TOKEN_ADDRESS, STRK_TOKEN_ADDRESS } from "@argent/x-shared"

export const StarknetChainId = {
  SN_MAIN: "0x534e5f4d41494e",
  SN_SEPOLIA: "0x534e5f5345504f4c4941",
} as const

export const giftFactoryAddress: Record<string, string> = {
  [StarknetChainId.SN_MAIN]:
    "0x03667b42afbb0c8539aa411a6b181ab30b9da64725bdf61e997820dd630f39fa",
  [StarknetChainId.SN_SEPOLIA]:
    "0x42a18d85a621332f749947a96342ba682f08e499b9f1364325903a37c5def60",
}

export const maxFees: Record<string, Record<string, bigint>> = {
  [StarknetChainId.SN_MAIN]: {
    ETH: 200000000000000n, // 0.0002 ETH
    STRK: 200000000000000000n, // 0.2 STRK
  },
  [StarknetChainId.SN_SEPOLIA]: {
    ETH: 1000000000000000n, // 0.001 ETH
    STRK: 3n * 10n ** 18n, // 3 STRK
  },
}

export const ALLOWED_GIFT_TOKEN_ADDRESSES = [
  STRK_TOKEN_ADDRESS,
  ETH_TOKEN_ADDRESS,
]
