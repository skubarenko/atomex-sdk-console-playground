import readline, { Interface as ReadlineInterface } from 'node:readline';

import { Atomex } from 'atomex-sdk';

import { AtomexClient, AuthenticationMethod } from './atomexClient.js';
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
      [['fetchOrderBook'], this.fetchOrderBookCommandHandler, 'Fetch order book and print it. Arguments: symbol'],
      [['printUsers'], this.printUsersCommandHandler, 'Print a list of the current users'],
      [['auth', 'authenticate'], this.authenticateUserCommandHandler, 'Authenticate a user. Arguments: userId, authenticationMethod (Tez | Eth | All)']
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
    this.createAtomexClients();

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
      const atomexClient = new AtomexClient(user, this.network);
      this._atomexClients.set(user.id, atomexClient);
      initializationPromises.push(atomexClient.initialize());
    }

    await Promise.all(initializationPromises);
  }

  private authenticateUserCommandHandler = async (userId: User['id'], rawAuthMethod: keyof typeof AuthenticationMethod) => {
    const authMethod = AuthenticationMethod[rawAuthMethod];
    const client = this.atomexClients.get(userId);
    if (!client)
      return Playground.printCommandError('Client not found');

    await client.authenticate(authMethod);
    console.log(`The ${client.user.name} [${client.user.id}] user is authenticated`);
    console.log('AuthData', client.atomexAuthentication);
  };

  private fetchOrderBookCommandHandler = async (symbol: string) => {
    const orderBook = await this.anonymousAtomex.getOrderBook(symbol);

    printOrderBook(orderBook);
  };

  private printUsersCommandHandler = () => {
    console.log(this.users);
  };

  private helpCommandHandler = () => {
    console.log('\nAvailable commands:');
    this.commands.forEach(([commandAliases, _, commandDescription]) => {
      console.log(' -', commandAliases.join(', '), commandDescription ? `    ${commandDescription}` : '');
    });
    console.log('');
  };

  private exitCommandHandler = () => {
    this.exit();
  };

  private static printCommandError(message: string) {
    console.error(message);
  }

  private static getPlaygroundIsNotLaunchedError() {
    return new Error('Playground is not launched.');
  }
}