import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from 'dotenv';

import { Playground } from './playground.js';
import type { User } from './user.js';

const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env');
config({ path: envPath });

const network = 'testnet';
const userIds = ['mm0', 'client0'] as const;
const users = new Map<User['id'], User>(userIds.map(userId => {
  const userIdEnvKey = userId.toUpperCase();
  return [userId, {
    id: userId,
    name: process.env[`USER_${userIdEnvKey}_NAME`],
    secretKeys: {
      eth: process.env[`USER_${userIdEnvKey}_SECRET_KEYS_ETH`],
      tez: process.env[`USER_${userIdEnvKey}_SECRET_KEYS_TEZ`],
    }
  } as User];
}));

const playground = new Playground(network, users);
playground.launch();
