import { Gift } from "../../claim"
import { JsonStoreService } from "../../services/json-store"
import type { Jsonify } from "type-fest"
import * as v from "valibot"

export const GiftContextSchema = v.object({
  amount: v.number(),
  currency: v.string(),
  createdAt: v.optional(v.number()),
  receiver: v.optional(v.string()),
  senderId: v.optional(v.number()),
})

export type GiftContext = v.InferOutput<typeof GiftContextSchema>

export interface GiftIntent {
  _tag: "GiftIntent"
  gift: Gift
  context: GiftContext
  depositTransactionHash: string
}

export class GiftIntentStore extends JsonStoreService<Jsonify<GiftIntent>> {
  constructor(jsonStoreServiceEndpoint: string) {
    super(jsonStoreServiceEndpoint, "GiftIntent")
  }
}
