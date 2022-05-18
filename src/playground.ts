import readline, { Interface as ReadlineInterface } from 'node:readline';

import { Atomex } from 'atomex-sdk';

import { AtomexBlockchainName, AtomexClient } from './atomexClient.js';
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
      [['cancelOrder'], this.cancelOrderCommandHandler, 'Cancel a user order. Arguments: userId, blockchainName (tez | eth), orderId'],
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

  private authenticateUserCommandHandler = async (userId: User['id'], blockchainName: AtomexBlockchainName) => {
    const client = this.getClient(userId, blockchainName);
    if (!client)
      return Playground.printClientNotFoundError(userId);

    await client.authenticate();
    console.log(`The ${client.user.name} [${client.user.id}] user is authenticated`);
    console.log('AuthData', client.atomexAuthentication);
  };

  private getOrderBookCommandHandler = async (symbol: string) => {
    const orderBook = await this.anonymousAtomex.getOrderBook(symbol);

    printOrderBook(orderBook);
  };

  private getOrdersCommandHandler = async (userId: User['id'], blockchainName: AtomexBlockchainName) => {
    const client = this.getClient(userId, blockchainName);
    if (!client)
      return Playground.printClientNotFoundError(userId);

    const orders = await client.atomex.getOrders();
    console.table(orders);
  };

  private getOrderCommandHandler = async (userId: User['id'], blockchainName: AtomexBlockchainName, orderId: string) => {
    const client = this.getClient(userId, blockchainName);
    if (!client)
      return Playground.printClientNotFoundError(userId);

    const order = await client.atomex.getOrder(orderId);
    console.log(order);
  };

  private cancelOrderCommandHandler = async (userId: User['id'], blockchainName: AtomexBlockchainName, orderId: string) => {
    const client = this.getClient(userId, blockchainName);
    if (!client)
      return Playground.printClientNotFoundError(userId);

    const order = await client.atomex.getOrder(orderId);
    const result = await client.atomex.cancelOrder(orderId, order.symbol, order.side);
    console.log(`Result: Is the ${orderId} order canceled? ${result}`);
  };

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
