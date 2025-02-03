import { JsonStoreService } from "../../services/json-store"
import type { Jsonify } from "type-fest"

export interface SendIntent {
  _tag: "SendIntent"
  from: string
  recipientId?: number
  amount: number
  currency: string
  chat: number
  message: number
  senderId: number
  botChat?: number
  botMessage?: number
  recipientUsername: string
}

export class SendIntentStore extends JsonStoreService<Jsonify<SendIntent>> {
  constructor(jsonStoreServiceEndpoint: string) {
    super(jsonStoreServiceEndpoint, "SendIntent")
  }
}
