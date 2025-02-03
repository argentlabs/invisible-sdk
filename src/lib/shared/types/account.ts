import { Address } from "../../primitives/address"
import { Hex } from "../../primitives/hex"

export interface AccountDeploymentPayload {
  classHash: Hex
  constructorCalldata: Hex[]
  addressSalt: string
  contractAddress: Address
}
