import { InMemorySigner } from '@taquito/signer';
import { TezosToolkit } from '@taquito/taquito';
import { Atomex, TezosHelpers, type Helpers as AtomexHelpers } from 'atomex-sdk';

import type { AtomexAuthTokenRequest, AtomexAuthTokenResponse, AtomexOrder } from './atomexTypes';
import type { User } from './user';

export type AtomexBlockchainName = 'tez' | 'eth';

export interface AtomexClientRpcUrls {
  readonly tez: string;
  readonly eth: string;
}

interface AtomexAuthentication {
  readonly request: AtomexAuthTokenRequest,
  readonly response: AtomexAuthTokenResponse
}
const authenticationMessage = 'Signing in ';

export class AtomexClient {
  static readonly DefaultRpcUrls: AtomexClientRpcUrls = {
    tez: 'https://rpc.tzkt.io/hangzhounet',
    // TODO
    eth: ''
  };

  readonly id: string;
  readonly atomex: Atomex;

  private _tezosToolkit: TezosToolkit | undefined;
  private _tezosInMemorySigner: InMemorySigner | undefined;
  private _userPublicKey: string | undefined;
  private _userAddress: string | undefined;
  private _atomexHelpers: AtomexHelpers | undefined;
  private _atomexAuthentication: AtomexAuthentication | undefined;

  constructor(
    readonly user: User,
    readonly blockchainName: AtomexBlockchainName,
    readonly network: 'mainnet' | 'testnet',
    private readonly rpcUrl = AtomexClient.DefaultRpcUrls[blockchainName]
  ) {
    this.id = `${user.id}_${blockchainName}`;
    this.atomex = Atomex.create(network);

    this.ensureUserHasRequiredSecretKey(user, blockchainName);
  }

  get userPublicKey() {
    if (!this._userPublicKey)
      throw AtomexClient.getClientIsNotInitializedError();

    return this._userPublicKey;
  }

  get userAddress() {
    if (!this._userAddress)
      throw AtomexClient.getClientIsNotInitializedError();

    return this._userAddress;
  }

  get atomexHelpers() {
    if (!this._atomexHelpers)
      throw AtomexClient.getClientIsNotInitializedError();

    return this._atomexHelpers;
  }

  get atomexAuthentication(): AtomexAuthentication | undefined {
    return this._atomexAuthentication;
  }

  private get tezosToolkit() {
    if (!this._tezosToolkit)
      throw AtomexClient.getAnotherBlockchainError(this.blockchainName, 'tez');

    return this._tezosToolkit;
  }

  private get tezosInMemorySigner() {
    if (!this._tezosInMemorySigner)
      throw AtomexClient.getAnotherBlockchainError(this.blockchainName, 'tez');

    return this._tezosInMemorySigner;
  }

  async initialize() {
    switch (this.blockchainName) {
      case 'tez':
        return this.initializeTezosToolkit();
      case 'eth':
        return this.initializeEthereumToolkit();
      default:
        throw new Error(`Unknown blockchain: ${this.blockchainName}`);
    }
  }

  async authenticate() {
    switch (this.blockchainName) {
      case 'tez':
        return this.authenticateTezos();
      case 'eth':
        return this.authenticateEthereum();
      default:
        throw new Error(`Unknown blockchain: ${this.blockchainName}`);
    }
  }

  private async initializeTezosToolkit() {
    this._tezosToolkit = new TezosToolkit(this.rpcUrl);
    this._tezosInMemorySigner = new InMemorySigner(this.user.secretKeys.tez);
    this._tezosToolkit.setSignerProvider(this.tezosInMemorySigner);

    const results = await Promise.all([
      this.tezosInMemorySigner.publicKey(),
      this.tezosInMemorySigner.publicKeyHash(),
      TezosHelpers.create(this.network),
    ]);

    this._userPublicKey = results[0];
    this._userAddress = results[1];
    this._atomexHelpers = results[2];
  }

  private async initializeEthereumToolkit() {
    // TODO
    this._userPublicKey = 'dummy';
    this._userAddress = 'dummy';
    this._atomexHelpers = undefined;
  }

  private async authenticateTezos() {
    const message = this.atomexHelpers.getAuthMessage(authenticationMessage, this.userAddress);
    const bytes = Buffer.from(message.msgToSign, 'utf8').toString('hex');
    const signature = await this.tezosInMemorySigner.sign(bytes);

    const encodedSignature = this.atomexHelpers.encodeSignature(signature.prefixSig);
    const encodedPublicKey = this.atomexHelpers.encodePublicKey(this.userPublicKey);

    const authRequest: AtomexAuthTokenRequest = {
      timeStamp: message.timestamp,
      message: message.message,
      algorithm: message.algorithm,

      publicKey: encodedPublicKey,
      signature: encodedSignature
    };

    this._atomexAuthentication = {
      request: authRequest,
      response: await this.atomex.getAuthToken(authRequest)
    };
    this.atomex.setAuthToken(this._atomexAuthentication.response.token);
  }

  private async authenticateEthereum() {
    throw new Error('Not implemented');
  }

  private ensureUserHasRequiredSecretKey(user: User, blockchainName: AtomexBlockchainName) {
    if (!user.secretKeys[blockchainName])
      throw new Error(`The "${user.name} [${user.id}]" user has no required secret key for the "${blockchainName}" blockchain`);
  }

  private static getAnotherBlockchainError(currentBlockchainName: AtomexBlockchainName, expectedBlockchainName: AtomexBlockchainName) {
    return new Error(`The current blockchain is ${currentBlockchainName}. Expected is ${expectedBlockchainName}`);
  }

  private static getClientIsNotInitializedError() {
    return new Error('Atomex client is not initialized.');
  }
}
