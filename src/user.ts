import { InMemorySigner } from '@taquito/signer';
import { TezosToolkit } from '@taquito/taquito';
import { Atomex, EthereumHelpers, TezosHelpers } from 'atomex-sdk';

type AtomexAuthTokenRequest = Parameters<Atomex['getAuthToken']>[0];
type AtomexAuthTokenResponse = Awaited<ReturnType<Atomex['getAuthToken']>>;

export interface UserSecretKeys {
  readonly tez: string;
  readonly eth: string;
}

export interface UserRpcUrls {
  readonly tez: string
}

export enum AuthenticationMethod {
  Tez = 1 << 0,
  Eth = 1 << 1,

  All = Tez | Eth
}

interface AtomexHelpers {
  readonly tez: TezosHelpers;
  readonly eth: EthereumHelpers;
}

interface AtomexAuthentication {
  tez?: AtomexAuthTokenResponse,
  eth?: AtomexAuthTokenResponse
}

const authenticationMessage = 'Signing in ';

export class User {
  static readonly DefaultRpcUrls: UserRpcUrls = {
    tez: 'https://rpc.tzkt.io/hangzhounet'
  };

  private readonly atomex: Atomex;
  private readonly tezosToolkit: TezosToolkit;
  private readonly tezosInMemorySigner: InMemorySigner;

  private _tezosPublicKey: string | undefined;
  private _tezosAddress: string | undefined;
  private _atomexHelpers: AtomexHelpers | undefined;
  private _atomexAuthentication: AtomexAuthentication = {};

  constructor(
    readonly name: string,
    readonly secretKeys: UserSecretKeys,
    readonly network: 'mainnet' | 'testnet',
    rpcUrls = User.DefaultRpcUrls
  ) {
    this.atomex = Atomex.create(network);
    this.tezosToolkit = new TezosToolkit(rpcUrls.tez);
    this.tezosInMemorySigner = new InMemorySigner(secretKeys.tez);
    this.tezosToolkit.setSignerProvider(this.tezosInMemorySigner);
  }

  get tezosPublicKey() {
    if (!this._tezosPublicKey)
      throw User.getUserIsNotInitializedError();

    return this._tezosPublicKey;
  }

  get tezosAddress() {
    if (!this._tezosAddress)
      throw User.getUserIsNotInitializedError();

    return this._tezosAddress;
  }

  get atomexHelpers() {
    if (!this._atomexHelpers)
      throw User.getUserIsNotInitializedError();

    return this._atomexHelpers;
  }

  get atomexAuthentication(): Readonly<AtomexAuthentication> {
    return this._atomexAuthentication;
  }

  async initialize() {
    const results = await Promise.all([
      this.tezosInMemorySigner.publicKey(),
      this.tezosInMemorySigner.publicKeyHash(),
      TezosHelpers.create(this.network),
      EthereumHelpers.create(this.network)
    ]);

    this._tezosPublicKey = results[0];
    this._tezosAddress = results[1];
    this._atomexHelpers = {
      tez: results[2],
      eth: results[3]
    };
  }

  async authenticate(authMethod: AuthenticationMethod) {
    const requests = authMethod & AuthenticationMethod.Tez ? [this.authenticateTez()] : [];

    if (authMethod & AuthenticationMethod.Eth)
      requests.push(this.authenticateEth());

    if (!requests.length)
      throw new Error('Authentication methods is not specified');

    await Promise.all(requests);
  }

  private async authenticateTez() {
    const message = this.atomexHelpers.tez.getAuthMessage(authenticationMessage, this.tezosAddress);
    const bytes = Buffer.from(message.msgToSign, 'utf8').toString('hex');
    const signature = await this.tezosInMemorySigner.sign(bytes);

    const encodedSignature = this.atomexHelpers.tez.encodeSignature(signature.prefixSig);
    const encodedPublicKey = this.atomexHelpers.tez.encodePublicKey(this.tezosPublicKey);

    const authRequest: AtomexAuthTokenRequest = {
      timeStamp: message.timestamp,
      message: message.message,
      algorithm: message.algorithm,

      publicKey: encodedPublicKey,
      signature: encodedSignature
    };

    this._atomexAuthentication.tez = await this.atomex.getAuthToken(authRequest);
  }

  private async authenticateEth() {
    throw new Error('Not implemented');
  }

  private static getUserIsNotInitializedError() {
    return new Error('User is not initialized.');
  }
}
