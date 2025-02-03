import { Address, isEqualAddress } from "./lib/primitives/address";
import { AccountDeploymentPayload } from "./lib/shared/types/account";
import {
  Abi,
  Account,
  AccountInterface,
  AllowArray,
  Call,
  DeployContractResponse,
  InvokeFunctionResponse,
  ProviderInterface,
  RPC,
  SignerInterface,
  UniversalDetails,
} from "starknet";
import { SelfDeployingAccountInterface } from "./types";
import assert from "assert";

/**
 * Self deploying account that can be used just as the vanilla SNjs account
 * It also enforces some extra properties to make it more type safe
 */
export abstract class SelfDeployingAccount extends Account implements SelfDeployingAccountInterface {
  public address: Address;
  protected isDeployedPromise: Promise<boolean>;

  constructor(
    provider: ProviderInterface,
    signer: SignerInterface,
    protected deploymentPayload: AccountDeploymentPayload,
  ) {
    const address = deploymentPayload.contractAddress as Address;
    super(provider, address, signer, "1", RPC.ETransactionVersion.V3);
    this.isDeployedPromise = super.getClassHashAt(address).then(Boolean, () => false);
    this.address = address;
  }

  public async getDeploymentPayload(): Promise<AccountDeploymentPayload> {
    return this.deploymentPayload;
  }

  public async isDeployed(): Promise<boolean> {
    return this.isDeployedPromise;
  }

  public async deployFrom(account: AccountInterface): Promise<DeployContractResponse> {
    // check if already deployed
    const isDeployed = await this.isDeployed();
    assert(!isDeployed, "Account is already deployed");

    const response = await account.deployContract({
      unique: false,
      classHash: this.deploymentPayload.classHash,
      constructorCalldata: this.deploymentPayload.constructorCalldata,
      salt: this.deploymentPayload.addressSalt,
    });

    const deployedAddress = response.contract_address as Address;
    assert(isEqualAddress(deployedAddress, this.address), "The deployed address does not match the expected address");

    return { contract_address: response.contract_address, transaction_hash: response.transaction_hash };
  }

  protected async executeWithDeploy(calls: Call[], abis: Abi[] | undefined, universalDetails?: UniversalDetails) {
    const isDeployed = await this.isDeployed();
    if (!isDeployed) {
      const { transaction_hash } = await this.deploySelf(this.deploymentPayload);
      console.log(`Account not deployed, deploy tx: ${transaction_hash}`);
      await this.waitForTransaction(transaction_hash, { retryInterval: 2000 });
      this.isDeployedPromise = Promise.resolve(true);
    }
    return this.executeDefault(calls, abis, universalDetails);
  }

  execute(calls: AllowArray<Call>, universalDetails?: UniversalDetails): Promise<InvokeFunctionResponse>;
  execute(calls: AllowArray<Call>, abis?: Abi[], universalDetails?: UniversalDetails): Promise<InvokeFunctionResponse>;
  async execute(
    calls: AllowArray<Call>,
    abisOrUniversalDetails?: Abi[] | UniversalDetails,
    universalDetails?: UniversalDetails,
  ): Promise<InvokeFunctionResponse> {
    calls = Array.isArray(calls) ? calls : [calls];
    const abis = Array.isArray(abisOrUniversalDetails) ? abisOrUniversalDetails : undefined;
    universalDetails = Array.isArray(abisOrUniversalDetails) ? universalDetails : abisOrUniversalDetails;
    return this.onExecute(calls, abis, universalDetails);
  }

  protected abstract onExecute(
    calls: Call[],
    abis?: Abi[],
    universalDetails?: UniversalDetails,
  ): Promise<InvokeFunctionResponse>;

  protected async executeDefault(
    calls: Call[],
    abis?: Abi[],
    universalDetails?: UniversalDetails,
  ): Promise<InvokeFunctionResponse> {
    return super.execute(calls, abis, universalDetails);
  }
}
