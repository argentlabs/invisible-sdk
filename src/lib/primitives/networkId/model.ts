import { InferInput, literal, union } from "valibot"

export const networkIdSchema = union([
  literal("mainnet"),
  literal("testnet"),
  literal("devnet"),
])

export type NetworkId = InferInput<typeof networkIdSchema>
