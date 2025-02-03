# @argent/tma-wallet (alpha)

This package provides an integration to an Argent wallet for [Telegram mini apps](https://core.telegram.org/bots/webapps).

### 🚨 The Argent wallet in Telegram is already available in the [Telegram Test Environment](https://core.telegram.org/bots/webapps#testing-mini-apps) and is connected to [Starknet Sepolia Network](https://sepolia.voyager.online/). Accessing the Telegram Prod Environment and Starknet Mainnet requires whitelisting. If you want to start using it in the Telegram Prod Environment, please contact us at antoinemecker@argent.xyz or @Flexouille on Telegram.


## Prerequisites

In order to start integrating the SDK in your Telegram mini (d)app, you first need to create an Argent wallet in the Telegram Test Environment. Here are the steps to follow:

1. Setup a Telegram Test account following [this documentation](https://core.telegram.org/bots/webapps#testing-mini-apps).

2. Setup a username for your Telegram test account, otherwise it won't work with the wallet. Click on your profile then `Username`.

3. Open the Argent Wallet by starting a conversation with @ArgentTestBot, then press **Start** and click on the **Open wallet** button.

   :warning: First time registration may take a few seconds (up to 10 seconds).

4. Now you should have an account, copy your account address and fund it with STRK using the [Starknet Sepolia Faucet](https://starknet-faucet.vercel.app/)

5. Once your account is funded, it's safer to activate it (i.e. deploy the account). The easiest way to trigger this activation is to send yourself 1 STRK, this will deploy the account automatically. You can do this in the Wallet or using the `/send` command in your conversation with the @ArgentTestBot.

6. Now you have a deployed account funded with STRK ready to be integrated with your mini (d)app!

## Integration

To install the package, use the following command:

```sh
npm install @argent/tma-wallet
```

Below is an integration example in a simple React application (read the comments!). You'll find more documentation at the end of this file.

```typescript
import { useEffect, useState } from "react";
import { ArgentTMA, SessionAccountInterface } from "@argent/tma-wallet";
import { Account } from "starknet";

const argentTMA = ArgentTMA.init({
  environment: "sepolia", // "sepolia" | "mainnet" (not supperted yet)
  appName: "My TG Mini Test Dapp", // Your Telegram app name
  appTelegramUrl: "https://t.me/my_telegram_bot/app_name", // Your Telegram app URL
  sessionParams: {
    allowedMethods: [
      // List of contracts/methods allowed to be called by the session key
      {
        contract:
          "0x036133c88c1954413150db74c26243e2af77170a4032934b275708d84ec5452f",
        selector: "increment",
      }
    ],
    validityDays: 90 // session validity (in days) - default: 90
  },
});

function App() {
  const [account, setAccount] = useState<SessionAccountInterface | undefined>();
  const [isConnected, setIsConnected] = useState<boolean>(false);

  useEffect(() => {
    // Call connect() as soon as the app is loaded
    argentTMA
      .connect()
      .then((res) => {
        if (!res) {
          // Not connected
          setIsConnected(false);
          return;
        }

        if (account.getSessionStatus() !== "VALID") {
          // Session has expired or scope (allowed methods) has changed
          // A new connection request should be triggered

          // The account object is still available to get access to user's address
          // but transactions can't be executed
          const { account } = res;

          setAccount(account);
          setIsConnected(false);
          return;
        }

        // Connected
        const { account, callbackData } = res;
        // The session account is returned and can be used to submit transactions
        setAccount(account);
        setIsConnected(true);
        // Custom data passed to the requestConnection() method is available here
        console.log("callback data:", callbackData);
      })
      .catch((err) => {
        console.error("Failed to connect", err);
      });
  }, []);

  const handleConnectButton = async () => {
    // If not connected, trigger a connection request
    // It will open the wallet and ask the user to approve the connection
    // The wallet will redirect back to the app and the account will be available
    // from the connect() method -- see above
    await argentTMA.requestConnection("custom_callback_data", [
      {
        token: {
          // Token address that you need approved
          address: "0x049D36570D4e46f48e99674bd3fcc84644DdD6b96F7C741B1562B82f9e004dC7",
          name: "Ethereum",
          symbol: "ETH",
          decimals: 18,
        },
        amount: BigInt(100000).toString(),
        // Your dapp contract
        spender: "0x7e00d496e324876bbc8531f2d9a82bf154d1a04a50218ee74cdd372f75a551a",
      },
    ]);
  };

  // useful for debugging
  const handleClearSessionButton = async () => {
    await argentTMA.clearSession();
    setAccount(undefined);
  };

  return (
    <>
      <div>
        {!isConnected && <button onClick={handleConnectButton}>Connect</button>}

        {isConnected && (
          <>
            <p>
              Account address: <code>{account.address}</code>
            </p>
            <button onClick={handleClearSessionButton}>Clear Session</button>
          </>
        )}
      </div>
    </>
  );
}

export default App;
```

Below is the complete description of the `ArgentTMAInterface`:

```typescript
interface ArgentTMAInterface {
  provider: ProviderInterface
  sessionAccount?: SessionAccountInterface

  connect(): Promise<ConnectResponse | undefined>
  requestConnection(
    callbackData: string,
    approvalRequests?: ApprovalRequest[]
  ): Promise<never>
  isConnected(): boolean
  requestApprovals(approvalRequests: ApprovalRequest[]): Promise<void>

  hasWallet(userId: number): Promise<boolean>

  // advanced methods
  exportSignedSession(): Promise<ArgentTMASession | undefined>
  clearSession(): Promise<void>
}
```

where `SessionAccountInterface` is extending the `AccountInterface` from [starknet.js](https://starknetjs.com/docs/API/classes/AccountInterface) and is defined by:

```typescript
interface SessionAccountInterface extends AccountInterface {
  isDeployed(): Promise<boolean>
  getDeploymentPayload(): Promise<DeployAccountContractPayload>
  getOutsideExecutionPayload({
    calls
  }: {
    calls: Call[]
  }): Promise<Call>
  getSessionStatus(): SessionStatus // "VALID" | "EXPIRED" | "INVALID_SCOPE"
}
```

and `ConnectResponse` by:

```typescript
type ConnectResponse = {
  account: SessionAccountInterface
  callbackData?: string
}
```

### Other helpful links

- [Telegram Wallet documentation](https://docs.argent.xyz/argent-wallets/telegram-wallet)
- [Telegram wallet Tamagotchi tutorial](https://www.argent.xyz/blog/argent-telegram-tamagotchi)
- [Building a Telegram Game on Starknet with Argent's Wallet SDK: A Step-by-Step Guide by Mano](https://hackmd.io/@manoah22/Sk_eRyi1Jx#Building-a-Telegram-Game-on-Starknet-with-Argents-Wallet-SDK-A-Step-by-Step-Guide)
- [How to use Argent Telegram wallet](https://www.argent.xyz/blog/how-to-use-argent-telegram-wallet)