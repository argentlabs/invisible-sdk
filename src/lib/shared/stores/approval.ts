import { Address } from "../../primitives/address"
import { JsonStoreService } from "../../services/json-store"
import type { Jsonify } from "type-fest"

export type ApprovalRequest = {
  tokenAddress: Address
  amount: string
  spender: Address
}

export type ApprovalRequests = {
  requests: ApprovalRequest[]
  callbackUrl: string
  appName: string
}

export class ApprovalRequestStore extends JsonStoreService<
  Jsonify<ApprovalRequests>
> {
  constructor(jsonStoreServiceEndpoint: string) {
    super(jsonStoreServiceEndpoint, "ApprovalRequest")
  }
}
