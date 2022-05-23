import readline, { Interface as ReadlineInterface } from 'node:readline';

import { Atomex } from 'atomex-sdk';
import { nanoid } from 'nanoid';

import { AtomexBlockchainName, AtomexClient } from './atomexClient.js';
import { AtomexOrder } from './atomexTypes.js';
import { printOrderBook } from './print.js';
import type { User } from './user.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Command = [readonly string[], (...args: any) => (void | Promise<void>), string?];

export class Playground {
  private readonly rl: ReadlineInterface;
  private readonly commands: readonly Command[];

  private _anonymousAtomex: Atomex | undefined;
  private _atomexClients: Map<User['id'], AtomexClient> | undefined;

  constructor(
    readonly network: 'mainnet' | 'testnet',
    private readonly users: ReadonlyMap<User['id'], User>
  ) {
    this.commands = [
      [['h', 'help'], this.helpCommandHandler, 'Help'],
      [['exit'], this.exitCommandHandler, 'Exiting the program'],
      [['getOrderBook'], this.getOrderBookCommandHandler, 'Get order book and print it. Arguments: symbol'],
      [['getOrders'], this.getOrdersCommandHandler, 'Get user orders. Arguments: userId, blockchainName (tez | eth)'],
      [['getOrder'], this.getOrderCommandHandler, 'Get a user order. Arguments: userId, blockchainName (tez | eth), orderId'],
      [['createOrder'], this.createOrderCommandHandler, 'Create order. ' +
        'Arguments: userId, blockchainName (tez | eth), symbol, price, qty, side (Buy, Sell), orderType (Return | FillOrKill | SolidFillOrKill | ImmediateOrCancel)'],
      [['cancelOrder'], this.cancelOrderCommandHandler, 'Cancel a user order. Arguments: userId, blockchainName (tez | eth), orderId'],
      [['getSwaps'], this.getSwapsCommandHandler, 'Get user available swaps. Arguments: userId, blockchainName (tez | eth)'],
      [['getSwap'], this.getSwapCommandHandler, 'Get a user swap. Arguments: userId, blockchainName (tez | eth), swapId'],
      [['initiateSwap'], this.initiateSwapCommandHandler, 'Initiate a swap. Arguments: userId, blockchainName (tez | eth), swapId, [rewardForRedeem], [expirationMinutes], [secret]'],
      [['printUsers'], this.printUsersCommandHandler, 'Print a list of the current users'],
      [['printAtomexClients'], this.printAtomexClientsCommandHandler, 'Print a list of the atomex clients'],
      [['auth', 'authenticate'], this.authenticateUserCommandHandler, 'Authenticate a user. Arguments: userId, blockchainName (tez | eth)']
    ];

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true
    });
  }

  get anonymousAtomex() {
    if (!this._anonymousAtomex)
      throw Playground.getPlaygroundIsNotLaunchedError();

    return this._anonymousAtomex;
  }

  get atomexClients(): ReadonlyMap<User['id'], AtomexClient> {
    if (!this._atomexClients)
      throw Playground.getPlaygroundIsNotLaunchedError();

    return this._atomexClients;

  }

  async launch() {
    console.log('Launching...');

    this.attachEvents();
    this._anonymousAtomex = Atomex.create(this.network);
    await this.createAtomexClients();

    this.waitForNewCommand();
  }

  exit() {
    process.exit(1);
  }

  private attachEvents() {
    this.rl.on('close', () => {
      console.log('\nExiting...');
    });
  }

  private waitForNewCommand() {
    this.rl.question('cmd > ', input => this.readCommand(input));
  }

  private async readCommand(input: string) {
    const [inputCommand, ...args] = input.trim().split(' ') as [string, ...string[]];
    const command = this.commands.find(([commandAliases]) => commandAliases.includes(inputCommand));

    if (command) {
      try {
        await command[1](...args);
      } catch (error) {
        console.error(error);
      }
    }
    else
      console.log('Unknown command');

    this.waitForNewCommand();
  }

  private async createAtomexClients() {
    this._atomexClients = new Map();
    const initializationPromises: Array<Promise<void>> = [];

    for (const [_, user] of this.users) {
      for (const blockchainName of Object.keys(user.secretKeys) as AtomexBlockchainName[]) {
        const atomexClient = new AtomexClient(user, blockchainName, this.network);
        this._atomexClients.set(atomexClient.id, atomexClient);
        initializationPromises.push(atomexClient.initialize());
      }
    }

    await Promise.all(initializationPromises);
  }

  private getClient(userId: User['id'], blockchainName: AtomexBlockchainName) {
    return this.atomexClients.get(`${userId}_${blockchainName}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private withClient(command: (client: AtomexClient, ...args: any[]) => (void | Promise<void>)) {
    return (userId: User['id'], blockchainName: AtomexBlockchainName, ...args: unknown[]) => {
      const client = this.getClient(userId, blockchainName);
      if (!client)
        return Playground.printClientNotFoundError(userId);

      return command.call(this, client, ...args);
    };
  }

  private authenticateUserCommandHandler = this.withClient(async (client: AtomexClient) => {
    await client.authenticate();
    console.log(`The ${client.user.name} [${client.user.id}] user is authenticated`);
    console.log('AuthData', client.atomexAuthentication);
  });

  private getOrderBookCommandHandler = async (symbol: string) => {
    const orderBook = await this.anonymousAtomex.getOrderBook(symbol);

    printOrderBook(orderBook);
  };

  private getOrdersCommandHandler = this.withClient(async (client: AtomexClient) => {
    const orders = await client.atomex.getOrders();
    console.table(orders);
  });

  private getOrderCommandHandler = this.withClient(async (client: AtomexClient, orderId: string) => {
    const order = await client.atomex.getOrder(orderId);
    console.dir(order, { depth: null });
  });

  private createOrderCommandHandler = this.withClient(async (
    client: AtomexClient,
    symbol: string,
    price: string,
    qty: string,
    side: AtomexOrder['side'],
    type: AtomexOrder['type'],
    receivingAddress: string,
    rewardForRedeem?: string,
    lockTime?: string,
  ) => {
    const orderId = await client.createOrder({
      clientOrderId: `${client.id}_${nanoid(7)}`,
      symbol,
      price: Number.parseFloat(price),
      qty: Number.parseFloat(qty),
      side,
      type,
      requisites: {
        receivingAddress,
        rewardForRedeem: rewardForRedeem && Number.parseFloat(rewardForRedeem) || 0,
        lockTime: lockTime && Number.parseInt(lockTime) || 17000
      }
    });

    console.log(`Order ID = ${orderId}`);
  });

  private cancelOrderCommandHandler = this.withClient(async (client: AtomexClient, orderId: string) => {
    const order = await client.atomex.getOrder(orderId);
    const result = await client.atomex.cancelOrder(orderId, order.symbol, order.side);
    console.log(`Result: Is the ${orderId} order canceled? ${result}`);
  });

  private getSwapsCommandHandler = this.withClient(async (client: AtomexClient) => {
    const swaps = await client.atomex.getSwaps();
    console.table(swaps, ['id', 'symbol', 'side', 'timeStamp', 'isInitiator', 'price', 'qty', 'secret', 'secretHash']);
  });

  private getSwapCommandHandler = this.withClient(async (client: AtomexClient, swapId: string) => {
    const swap = await client.atomex.getSwap(swapId);
    console.dir(swap, { depth: null });
  });

  private initiateSwapCommandHandler = this.withClient(async (
    client: AtomexClient,
    swapId: string,
    rewardForRedeem?: string,
    expirationMinutes?: string,
    secret?: string
  ) => {
    const initiateTransaction = await client.initiateSwap(swapId, rewardForRedeem, expirationMinutes, secret);

    console.log(`Initiate Transaction Hash = ${initiateTransaction.hash}`);
  });

  private printUsersCommandHandler = () => {
    console.log(this.users);
  };

  private printAtomexClientsCommandHandler = () => {
    console.table([...this.atomexClients.values()].map(client => ({
      'id': client.id,
      'userId': client.user.id,
      'blockchainName': client.blockchainName,
      'user.address': client.userAddress
    })));
  };

  private helpCommandHandler = () => {
    console.log('\nAvailable commands:');
    this.commands.forEach(([commandAliases, _, commandDescription]) => {
      console.log(' *', commandAliases.join(', ').padEnd(20), commandDescription ? commandDescription : '');
    });
    console.log('');
  };

  private exitCommandHandler = () => {
    this.exit();
  };

  private static printClientNotFoundError(id: string) {
    Playground.printCommandError(`Client not found by the ${id} id`);
  }

  private static printCommandError(message: string) {
    console.error(message);
  }

  private static getPlaygroundIsNotLaunchedError() {
    return new Error('Playground is not launched.');
  }
}
