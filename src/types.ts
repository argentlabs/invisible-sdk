import { Session } from "@argent/x-sessions"
import { Address } from "./lib/primitives/address"
import { AccountDeploymentPayload } from "./lib/shared/types/account"
import {
  AccountInterface,
  Call,
  DeployContractResponse,
  Signature,
} from "starknet"

export enum StarknetChainId {
  SN_MAIN = "0x534e5f4d41494e", // encodeShortString('SN_MAIN'),
  SN_SEPOLIA = "0x534e5f5345504f4c4941", // encodeShortString('SN_SEPOLIA')
}

export type SessionParameters = {
  allowedMethods: Array<{
    contract: string
    selector: string
  }>
  validityDays?: number
}

export interface StrongAccountInterface
  extends Omit<AccountInterface, "address"> {
  address: Address
}

export interface SelfDeployingAccountInterface extends StrongAccountInterface {
  getDeploymentPayload(): Promise<AccountDeploymentPayload>
  isDeployed(): Promise<boolean>
  deployFrom(account: AccountInterface): Promise<DeployContractResponse>
}

export interface SessionAccountInterface extends SelfDeployingAccountInterface {
  getOutsideExecutionPayload({ calls }: { calls: Call[] }): Promise<Call>
  isDeployed(): Promise<boolean>
  deployFrom(account: AccountInterface): Promise<DeployContractResponse>
  getSessionStatus(): SessionStatus
}

export type SessionStatus =
  | "VALID"
  | "EXPIRED"
  | "INVALID_SCOPE"
  | "INVALID_SIGNATURE"
  | "INVALID_SESSION"

export interface Environment {
  chainId: StarknetChainId
  storeUrl: string
  argentBaseUrl: string
  providerDefaultUrl: string
  webWalletUrl: string
}

export interface StrongAccountInterface
  extends Omit<AccountInterface, "address" | "channel"> {
  address: Address
}

export interface SelfDeployingAccountInterface extends StrongAccountInterface {
  getDeploymentPayload(): Promise<AccountDeploymentPayload>
}

export interface SessionAccountInterface extends SelfDeployingAccountInterface {
  getOutsideExecutionPayload({ calls }: { calls: Call[] }): Promise<Call>
  isDeployed(): Promise<boolean>
  deployFrom(account: AccountInterface): Promise<DeployContractResponse>
  getSessionStatus(): SessionStatus
}

export interface SignedSession extends Session {
  deploymentPayload?: AccountDeploymentPayload
  signature?: Signature
}
