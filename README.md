# @argent/webwallet-sdk (alpha)

This package provides an integration for Argent's Web Wallet

## Integration

To install the package, use the following command:

```sh
npm install @argent/webwallet-sdk
```

Below is an integration example in a simple React application (read the comments!). You'll find more documentation at the end of this file.

```typescript
"use client";

import { useCallback, useEffect, useState } from "react";
import { LibraryError, RpcProvider, constants } from "starknet";
import { ArgentWebWallet, SessionAccountInterface } from "webwallet-sdk";
import { toast } from "sonner";

const ARGENT_DUMMY_CONTRACT_ADDRESS = "0x07557a2fbe051e6327ab603c6d1713a91d2cfba5382ac6ca7de884d3278636d7";
const ARGENT_DUMMY_CONTRACT_ENTRYPOINT = "increase_number";

const provider = new RpcProvider({});

const argentWebWallet = ArgentWebWallet.init({
   appName: "Test",
   environment: "dev",
   sessionParams: {
      allowedMethods: [
         {
            contract: ARGENT_DUMMY_CONTRACT_ADDRESS,
            selector: ARGENT_DUMMY_CONTRACT_ENTRYPOINT,
         },
      ],
   },
   // paymasterParams: {
   //    apiKey: "" // avnu paymasters API Key
   // },
});

export default function Home() {
   const [account, setAccount] = useState<SessionAccountInterface | undefined>(undefined);
   const [isLoading, setIsLoading] = useState(false);
   const [txHash, setTxHash] = useState<string | undefined>();
   const [counter, setCounter] = useState<bigint | undefined>();

   useEffect(() => {
      argentWebWallet
              .connect()
              .then((res) => {
								
                 if (!res) {
                    console.log("Not connected");
                    return;
                 }

                 console.log("Connected to Argent Web Wallet", res);
                 const { account, callbackData, approvalTransactionHash } = res;

                 if (account.getSessionStatus() !== "VALID") {
                    console.log("Session is not valid");
                    return;
                 }

                 setAccount(account);
                 console.log("Callback data", callbackData); // -- custom_callback_string
                 console.log("Approval transaction hash", approvalTransactionHash); // -- custom_callback_string
              })
              .catch((err) => {
                 console.error("Failed to connect to Argent Web Wallet", err);
              });
   }, []);

   const fetchCounter = useCallback(async (account?: SessionAccountInterface) => {
      if (!account) {
         return BigInt(0);
      }

      const [counter] = await provider.callContract({
         contractAddress: ARGENT_DUMMY_CONTRACT_ADDRESS,
         entrypoint: "get_number",
         calldata: [account?.address],
      });
      return BigInt(counter);
   }, []);

   const handleConnect = async () => {
      try {
         const response =  await argentWebWallet.requestConnection({
            callbackData: "custom_callback_data",
            approvalRequests: [
               {
                  tokenAddress: "0x049D36570D4e46f48e99674bd3fcc84644DdD6b96F7C741B1562B82f9e004dC7",
                  amount: BigInt("100000000000000000").toString(),
                  // Your dapp contract
                  spender: "0x7e00d496e324876bbc8531f2d9a82bf154d1a04a50218ee74cdd372f75a551a",
               },
            ],
         });
				 
         const { account: sessionAccount } = response
         console.log(sessionAccount);
         setAccount(sessionAccount);
      } catch (err) {
         console.error(err);
      }
   };

   const handleSubmitTransactionButton = async () => {
      try {
         if (!account) {
            throw new Error("Account not connected");
         }
         setIsLoading(true);

         try {
            const call = {
               contractAddress: ARGENT_DUMMY_CONTRACT_ADDRESS,
               entrypoint: ARGENT_DUMMY_CONTRACT_ENTRYPOINT,
               calldata: ["0x1"],
            };

            const { resourceBounds: estimatedResourceBounds } = await account.estimateInvokeFee(call, {
               version: "0x3",
            });

            const resourceBounds = {
               ...estimatedResourceBounds,
               l1_gas: {
                  ...estimatedResourceBounds.l1_gas,
                  max_amount: "0x28",
               },
            };

            const { transaction_hash } = await account.execute(call, {
               version: "0x3",
               resourceBounds,
            });
            setTxHash(transaction_hash);

            // Wait for transaction to be mined
            await account.waitForTransaction(transaction_hash);
            setIsLoading(false);

            // refetch counter
            const newCounter = await fetchCounter(account);
            setCounter(newCounter);
            setTxHash(undefined);
         } catch (error) {
            if (error instanceof LibraryError) {
               const messageArray = error.message.split("\n");
               const lastMessage = messageArray[messageArray.length - 1];
               const displayMessage = lastMessage.replace('\\"', "").replace('"', "").trim();
               toast.error(displayMessage);
            } else {
               toast.error(`${error}`);
            }
            setIsLoading(false);
         }
      } catch (err) {
         console.error(err);
         setIsLoading(false);
      }
   };

   useEffect(() => {
      fetchCounter(account).then(setCounter);
   }, [account, fetchCounter]);

   const truncateHex = (hex: string) => `${hex.slice(0, 6)}...${hex.slice(-4)}`;

   return (
           <div className="flex flex-col min-h-screen p-8 pb-20 gap-8 sm:p-20 font-[family-name:var(--font-geist-sans)]">
                   {!account && (
           <button className="bg-white text-black p-2 rounded-md" onClick={handleConnect} disabled={isLoading}>
           Connect
           </button>
)}

   {account && (
           <>
                   <div className="flex gap-4 items-center">
                   <div>{account.address}</div>
                   <button
      className="bg-blue-300 text-black p-2 rounded-md w-full"
      onClick={handleSubmitTransactionButton}
      disabled={isLoading}
              >
              Send tx
   </button>
   </div>
   <div className="flex flex-col gap-4">
           {txHash && (
                   <p>
                           Transaction hash:{" "}
      <a href={`https://sepolia.starkscan.co/tx/${txHash}`} target="_blank">
           <code>{truncateHex(txHash)}</code>
           </a>
           </p>
   )}
      {counter !== undefined && (
              <p>
                      Counter value: <code>{counter.toString()}</code>
      </p>
      )}
      </div>
      </>
   )}
   </div>
);
}
```

Below is the complete description of the `ArgentWebWalletInterface`:

```typescript
interface ArgentWebWalletInterface {
	provider: ProviderInterface
	sessionAccount?: SessionAccountInterface
	isConnected(): Promise<boolean>
	connect(): Promise<ConnectResponse | undefined>
	requestConnection({
											callbackData,
											approvalRequests,
										}: {
		callbackData?: string
		approvalRequests?: ApprovalRequest[]
	}): Promise<ConnectResponse | undefined>
	requestApprovals(approvalRequests: ApprovalRequest[]): Promise<string>

	// expert methods
	exportSignedSession(): Promise<SignedSession | undefined>
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
	user?: User
	callbackData?: string
	approvalTransactionHash?: string
	approvalRequestsCalls?: Call[]
	deploymentPayload?: any
}
```