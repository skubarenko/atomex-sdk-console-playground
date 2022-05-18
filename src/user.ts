export interface UserSecretKeys {
  readonly tez: string;
  readonly eth: string;
}

export interface User {
  readonly id: string;
  readonly name: string;
  readonly secretKeys: UserSecretKeys;
}
