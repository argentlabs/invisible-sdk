import {
  Call,
  CallData,
  DeclareSignerDetails,
  DeployAccountSignerDetails,
  InvocationsSignerDetails,
  RPC,
  Signature,
  SignerInterface,
  TypedData,
  V2DeclareSignerDetails,
  V2DeployAccountSignerDetails,
  V2InvocationsSignerDetails,
  V3DeclareSignerDetails,
  V3DeployAccountSignerDetails,
  V3InvocationsSignerDetails,
  ec,
  encode,
  hash,
  num,
  stark,
  transaction,
  typedData,
} from "starknet"

/**
 * This class allows to easily implement custom signers by overriding the `signRaw` method.
 * This is based on Starknet.js implementation of Signer, but it delegates the actual signing to an abstract function
 */
export abstract class RawSigner implements SignerInterface {
  abstract signRaw(messageHash: string): Promise<string[]>

  public async getPubKey(): Promise<string> {
    throw new Error("This signer allows multiple public keys")
  }

  public async signMessage(
    typedDataArgument: TypedData,
    accountAddress: string,
  ): Promise<Signature> {
    const messageHash = typedData.getMessageHash(
      typedDataArgument,
      accountAddress,
    )
    return this.signRaw(messageHash)
  }

  public async signTransaction(
    transactions: Call[],
    details: InvocationsSignerDetails,
  ): Promise<Signature> {
    const compiledCalldata = transaction.getExecuteCalldata(
      transactions,
      details.cairoVersion,
    )
    let msgHash

    // TODO: How to do generic union discriminator for all like this
    if (
      Object.values(RPC.ETransactionVersion2).includes(details.version as any)
    ) {
      const det = details as V2InvocationsSignerDetails
      msgHash = hash.calculateInvokeTransactionHash({
        ...det,
        senderAddress: det.walletAddress,
        compiledCalldata,
        version: det.version,
      })
    } else if (
      Object.values(RPC.ETransactionVersion3).includes(details.version as any)
    ) {
      const det = details as V3InvocationsSignerDetails
      msgHash = hash.calculateInvokeTransactionHash({
        ...det,
        senderAddress: det.walletAddress,
        compiledCalldata,
        version: det.version,
        nonceDataAvailabilityMode: stark.intDAM(det.nonceDataAvailabilityMode),
        feeDataAvailabilityMode: stark.intDAM(det.feeDataAvailabilityMode),
      })
    } else {
      throw new Error("unsupported signTransaction version")
    }
    return await this.signRaw(msgHash)
  }

  public async signDeployAccountTransaction(
    details: DeployAccountSignerDetails,
  ): Promise<Signature> {
    const compiledConstructorCalldata = CallData.compile(
      details.constructorCalldata,
    )
    /*     const version = BigInt(details.version).toString(); */
    let msgHash

    if (
      Object.values(RPC.ETransactionVersion2).includes(details.version as any)
    ) {
      const det = details as V2DeployAccountSignerDetails
      msgHash = hash.calculateDeployAccountTransactionHash({
        ...det,
        salt: det.addressSalt,
        constructorCalldata: compiledConstructorCalldata,
        version: det.version,
      })
    } else if (
      Object.values(RPC.ETransactionVersion3).includes(details.version as any)
    ) {
      const det = details as V3DeployAccountSignerDetails
      msgHash = hash.calculateDeployAccountTransactionHash({
        ...det,
        salt: det.addressSalt,
        compiledConstructorCalldata,
        version: det.version,
        nonceDataAvailabilityMode: stark.intDAM(det.nonceDataAvailabilityMode),
        feeDataAvailabilityMode: stark.intDAM(det.feeDataAvailabilityMode),
      })
    } else {
      throw new Error(
        `unsupported signDeployAccountTransaction version: ${details.version}}`,
      )
    }

    return await this.signRaw(msgHash)
  }

  public async signDeclareTransaction(
    // contractClass: ContractClass,  // Should be used once class hash is present in ContractClass
    details: DeclareSignerDetails,
  ): Promise<Signature> {
    let msgHash

    if (
      Object.values(RPC.ETransactionVersion2).includes(details.version as any)
    ) {
      const det = details as V2DeclareSignerDetails
      msgHash = hash.calculateDeclareTransactionHash({
        ...det,
        version: det.version,
      })
    } else if (
      Object.values(RPC.ETransactionVersion3).includes(details.version as any)
    ) {
      const det = details as V3DeclareSignerDetails
      msgHash = hash.calculateDeclareTransactionHash({
        ...det,
        version: det.version,
        nonceDataAvailabilityMode: stark.intDAM(det.nonceDataAvailabilityMode),
        feeDataAvailabilityMode: stark.intDAM(det.feeDataAvailabilityMode),
      })
    } else {
      throw new Error("unsupported signDeclareTransaction version")
    }

    return await this.signRaw(msgHash)
  }
}

export class LegacyStarknetKeyPair extends RawSigner {
  pk: string

  constructor(pk?: string | bigint) {
    super()
    this.pk = pk
      ? `${num.toHex(pk)}`
      : `0x${encode.buf2hex(ec.starkCurve.utils.randomPrivateKey())}`
  }

  public get privateKey(): string {
    return this.pk
  }

  public get publicKey() {
    return BigInt(ec.starkCurve.getStarkKey(this.pk))
  }

  public async signRaw(messageHash: string): Promise<string[]> {
    const { r, s } = ec.starkCurve.sign(messageHash, this.pk)
    return [r.toString(), s.toString()]
  }
}
