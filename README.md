# @argent/invisible-sdk

This package provides an integration for Argent's Web Wallet

## Integration

To install the package, use the following command:

```sh
npm install @argent/invisible-sdk
```

### Initiate `ArgentWebWallet`

```typescript
import { ArgentWebWallet } from "@argent/webwallet-sdk"

const argentWebWallet = ArgentWebWallet.init({
  appName: "Test dapp",
  environment: "mainnet", // Or sepolia
  sessionParams: {
    allowedMethods: [
      {
        contract: "0x0", // Your contract here - It needs to be whitelisted by Argent
        selector: "method_name" // Method selector here
      }
    ],
    validityDays: 15 || undefined // Session validity period - you choose or it will fallback to maximum set by WebWallet (usually 30 days)
  }
})
```

### Connect to the wallet

Now you can connect silently using `argentWebWallet.connect` or user can request connection by using `argentWebWallet.requestConnection`

### For detailed integration example, you can check [Invisible SDK demo dapp](https://github.com/argentlabs/invisible-sdk-demo)

## Types

Below is the complete description of the `ArgentWebWalletInterface`:

```typescript
interface ArgentWebWalletInterface {
  provider: ProviderInterface
  sessionAccount?: SessionAccount
  isConnected(): Promise<boolean>
  connect(): Promise<ConnectResponse | undefined>
  requestConnection({
    callbackData,
    approvalRequests
  }: {
    callbackData?: string
    approvalRequests?: ApprovalRequest[]
  }): Promise<ConnectResponse | undefined>
  requestApprovals(
    approvalRequests: ApprovalRequest[]
  ): Promise<string>

  // expert methods
  exportSignedSession(): SignedSession | undefined
  clearSession(): Promise<void>
}
```

where `SessionAccountInterface` is extending the `AccountInterface` from [starknet.js](https://starknetjs.com/docs/API/classes/AccountInterface) and is defined by:

```typescript
export interface StrongAccountInterface
  extends Omit<AccountInterface, "address" | "channel"> {
  address: Address
}

export interface SelfDeployingAccountInterface
  extends StrongAccountInterface {
  getDeploymentPayload(): Promise<AccountDeploymentPayload>
  isDeployed(): Promise<boolean>
  deployFrom(
    account: AccountInterface
  ): Promise<DeployContractResponse>
}

export declare interface SessionAccountInterface
  extends SelfDeployingAccountInterface {
  getOutsideExecutionPayload({
    calls
  }: {
    calls: Call[]
  }): Promise<Call>
  isDeployed(): Promise<boolean>
  deployFrom(
    account: AccountInterface
  ): Promise<DeployContractResponse>
  getSessionStatus(): SessionStatus
  signMessageFromOutside(
    typedData: TypedData,
    calls: Call[]
  ): Promise<ArraySignatureType>
}
```

and `ConnectResponse` by:

```typescript
type ConnectResponse = {
  account: SessionAccount
  user?: User
  callbackData?: string
  approvalTransactionHash?: string
  approvalRequestsCalls?: Call[]
  deploymentPayload?: AccountDeploymentPayload
}
```
