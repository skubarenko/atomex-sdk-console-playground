import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from 'dotenv';

import { AuthenticationMethod, User } from './user.js';

const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env');
config({ path: envPath });

const network = 'testnet';
/* eslint-disable @typescript-eslint/no-non-null-assertion */
const users = {
  mm0: new User(
    process.env.USER_MM0_NAME!,
    {
      eth: process.env.USER_MM0_SECRET_KEYS_ETH!,
      tez: process.env.USER_MM0_SECRET_KEYS_TEZ!,
    },
    network
  ),
  client0: new User(
    process.env.USER_CLIENT0_NAME!,
    {
      eth: process.env.USER_CLIENT0_SECRET_KEYS_ETH!,
      tez: process.env.USER_CLIENT0_SECRET_KEYS_TEZ!,
    },
    network
  ),
} as const;
/* eslint-enable @typescript-eslint/no-non-null-assertion */

console.log('User initialization...');
await Promise.all(Object.entries(users).map(async ([userVarName, user]) => {
  console.log(`Start to initialize the ${user.name} [${userVarName}] user`);
  await user.initialize();
  console.log(`The ${user.name} [${userVarName}] user is initialized`);
}));
console.log('All user are initialized');

await users.mm0.authenticate(AuthenticationMethod.Tez);

console.log(users.mm0.atomexAuthentication);
debugger;
