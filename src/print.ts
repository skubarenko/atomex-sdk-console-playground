import type { AtomexOrderBook } from './atomexTypes';

export const printOrderBook = (orderBook: AtomexOrderBook) => {
  console.table(orderBook.entries);
};
