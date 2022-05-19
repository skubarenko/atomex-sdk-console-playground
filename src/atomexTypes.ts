import type { Atomex, Helpers } from 'atomex-sdk';

export type AtomexAuthTokenRequest = Parameters<Atomex['getAuthToken']>[0];
export type AtomexAuthTokenResponse = Awaited<ReturnType<Atomex['getAuthToken']>>;
export type AtomexAuthMessage = Awaited<ReturnType<Helpers['getAuthMessage']>>;

export type AtomexOrderBook = Awaited<ReturnType<Atomex['getOrderBook']>>;
export type AtomexAddOrderRequest = Parameters<Atomex['addOrder']>[0];
export type AtomexOrder = Awaited<ReturnType<Atomex['getOrders']>>[0];
