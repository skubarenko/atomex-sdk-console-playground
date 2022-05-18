export interface User {
  name: string;
  secretKeys: {
    eth: string;
    tez: string;
  }
}
