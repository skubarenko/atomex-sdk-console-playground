import { InMemorySigner } from '@taquito/signer';
import { TezosToolkit } from '@taquito/taquito';
import { Atomex, EthereumHelpers, TezosHelpers, type Helpers as AtomexHelpers } from 'atomex-sdk';
import { nanoid } from 'nanoid';
import Web3 from 'web3';
import type { Account as Web3Account } from 'web3-core';

import type { AtomexAddOrderRequest, AtomexAuthMessage, AtomexAuthTokenRequest, AtomexAuthTokenResponse } from './atomexTypes';
import type { User } from './user';
import { sha256 } from './utils/index.js';

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
    tez: 'https://rpc.tzkt.io/hangzhou2net',
    eth: 'https://ropsten.infura.io/v3/7cd728d2d3384719a630d836f1693c5c'
  };

  readonly id: string;
  readonly atomex: Atomex;

  private _tezosToolkit: TezosToolkit | undefined;
  private _tezosInMemorySigner: InMemorySigner | undefined;
  private _ethereumToolkit: Web3 | undefined;
  private _ethereumAccount: Web3Account | undefined;
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

  private get ethereumToolkit() {
    if (!this._ethereumToolkit)
      throw AtomexClient.getAnotherBlockchainError(this.blockchainName, 'eth');

    return this._ethereumToolkit;
  }

  private get ethereumAccount() {
    if (!this._ethereumAccount)
      throw AtomexClient.getAnotherBlockchainError(this.blockchainName, 'eth');

    return this._ethereumAccount;
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

  async createOrder(orderData: Omit<AtomexAddOrderRequest, 'proofsOfFunds'>) {
    const currencies = orderData.symbol.split('/') as unknown as readonly [string, string];
    const targetCurrency = orderData.side === 'Sell' ? currencies[0] : currencies[1];

    const addOrderRequest: AtomexAddOrderRequest = {
      ...orderData,
      proofsOfFunds: this.atomexAuthentication
        ? [{
          ...this.atomexAuthentication.request,
          address: this.userAddress,
          currency: targetCurrency,
        }]
        : []
    };

    return this.atomex.addOrder(addOrderRequest);
  }

  async initiateSwap(swapId: string, rawRewardForRedeem?: string, rawExpirationMinutes?: string, secret: string = nanoid(27)) {
    const swap = await this.atomex.getSwap(swapId);
    const rewardForRedeem = !rawRewardForRedeem ? 0 : (Number.parseFloat(rawRewardForRedeem) || 0);
    const refundTimestamp = Date.parse(swap.timeStamp) + Math.floor(((rawExpirationMinutes && Number.parseFloat(rawExpirationMinutes)) || 60) * 60000);
    const secretHash = sha256(sha256(secret));
    const receivingAddress = swap.counterParty.requisites.receivingAddress;

    const initiateTransactionParameters = this.atomexHelpers.buildInitiateTransaction({
      netAmount: swap.qty,
      receivingAddress,
      rewardForRedeem,
      refundTimestamp,
      secretHash
    });

    const vaultContract = await this.tezosToolkit.contract.at(initiateTransactionParameters.contractAddr);
    const initiateContractMethod = vaultContract.methodsObject[initiateTransactionParameters.data.entrypoint];
    if (!initiateContractMethod)
      throw new Error(`Tne ${initiateTransactionParameters.data.entrypoint} entrypoint does not exist`);

    const initiateTransaction = await initiateContractMethod({
      participant: receivingAddress,
      settings: {
        hashed_secret: secretHash,
        refund_time: refundTimestamp.toString(),
        payoff: rewardForRedeem
      }
    }).send({ amount: initiateTransactionParameters.amount });

    return initiateTransaction;
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
    this._ethereumToolkit = new Web3(this.rpcUrl);
    this._ethereumAccount = this._ethereumToolkit.eth.accounts.privateKeyToAccount(this.user.secretKeys.eth);

    this._userAddress = this.ethereumAccount.address;
    this._atomexHelpers = await EthereumHelpers.create(this.network);

    const dummyMessage = 'dummy';
    const dummySignature = this._ethereumAccount.sign(dummyMessage);
    this._userPublicKey = (this._atomexHelpers as EthereumHelpers).recoverPublicKey(dummyMessage, dummySignature.signature);
  }

  private async authenticateTezos() {
    const message = this.atomexHelpers.getAuthMessage(authenticationMessage, this.userAddress);
    const bytes = Buffer.from(message.msgToSign, 'utf8').toString('hex');
    const signature = await this.tezosInMemorySigner.sign(bytes);

    return this.authenticateInternal(message, signature.prefixSig);
  }

  private async authenticateEthereum() {
    const message = this.atomexHelpers.getAuthMessage(authenticationMessage);
    const signature = this.ethereumAccount.sign(message.msgToSign);

    return this.authenticateInternal(message, signature.signature);
  }

  private async authenticateInternal(authMessage: AtomexAuthMessage, signature: string) {
    const encodedSignature = this.atomexHelpers.encodeSignature(signature);
    const encodedPublicKey = this.atomexHelpers.encodePublicKey(this.userPublicKey);

    const authRequest: AtomexAuthTokenRequest = {
      timeStamp: authMessage.timestamp,
      message: authMessage.message,
      algorithm: authMessage.algorithm,

      publicKey: encodedPublicKey,
      signature: encodedSignature
    };

    this._atomexAuthentication = {
      request: authRequest,
      response: await this.atomex.getAuthToken(authRequest)
    };
    this.atomex.setAuthToken(this._atomexAuthentication.response.token);
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
