import { Address } from "../../primitives/address"
import { Hex } from "../../primitives/hex"
import { JsonStoreService } from "../../services/json-store"
import { TypedData } from "starknet"
import type { Jsonify } from "type-fest"
import { AccountDeploymentPayload } from "../types/account"
import { ApprovalRequest } from "starknetkit/webwallet"

type JsonTypedData = Jsonify<TypedData> & {
  message: Record<string, unknown>
}

export interface SessionRequest {
  _tag: "SessionRequest"
  appName: string
  appLogoUrl?: string
  sessionTypedData: JsonTypedData
  callbackUrl: string
  callbackData?: string
  approvalRequests?: ApprovalRequest[]
}

export class SessionRequestStore extends JsonStoreService<
  Jsonify<SessionRequest>
> {
  constructor(jsonStoreServiceEndpoint: string) {
    super(jsonStoreServiceEndpoint, "SessionRequest")
  }
}

export interface SessionResponse {
  _tag: "SessionResponse"
  address: Address
  signature: Hex[]
  deploymentData: Jsonify<AccountDeploymentPayload>
  callbackData?: string
  approvalRequests?: ApprovalRequest[]
  approvalTransactionHash?: string
}

export class SessionResponseStore extends JsonStoreService<
  Jsonify<SessionResponse>
> {
  constructor(jsonStoreServiceEndpoint: string) {
    super(jsonStoreServiceEndpoint, "SessionResponse")
  }
}
