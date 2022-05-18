import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Atomex, EthereumHelpers, TezosHelpers } from 'atomex-sdk';
import { config } from 'dotenv';

import { User } from './types';

const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env');
config({ path: envPath });

const users = {
  mm0: {
    name: process.env.USER_MM0_NAME,
    secretKeys: {
      eth: process.env.USER_MM0_SECRET_KEYS_ETH,
      tez: process.env.USER_MM0_SECRET_KEYS_TEZ,
    }
  } as User,
  client0: {
    name: process.env.USER_CLIENT0_NAME,
    secretKeys: {
      eth: process.env.USER_CLIENT0_SECRET_KEYS_ETH,
      tez: process.env.USER_CLIENT0_SECRET_KEYS_TEZ,
    }
  } as User
} as const;

const atomex = Atomex.create('testnet');
const ethereumHelpers = await EthereumHelpers.create('testnet');
const tezosHelpers = await TezosHelpers.create('testnet');

tezosHelpers.getAuthMessage('Signing in ');
