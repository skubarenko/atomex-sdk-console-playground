# Atomex SDK Console Playground
It's a playground for [atomex-sdk](https://github.com/atomex-protocol/atomex-sdk)

## Launching

### Prerequisites
* [Node.js](https://nodejs.org) version 16.7.0 or later  
* [npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm) version 7.20.3 or later  

### Before the first launch
1. Install dependencies
    ```
    npm install
    ```

2. Build the app
    ```
    npm run build
    ```

3. Specify user credentials for the predefined users.
    ```
    cp .env.template .env
    ```
    Fill the `.env` file with your test user credentials

4. Ready to run

### Run the playground
1. Start the playground
    ```
    npm start
    ```

2. Interact with the playground using its commands via terminal. Execute the help (`h` or `help`) command to display available commands.
    ```
    Launching...
    cmd > help
    
    Available commands:
     * h, help              Help
     * exit                 Exiting the program
     * getOrderBook         Get order book and print it. Arguments: symbol
     * getOrders            Get user orders. Arguments: userId, blockchainName (tez | eth)
     * getOrder             Get a user order. Arguments: userId, blockchainName (tez | eth), orderId
     * createOrder          Create order. Arguments: userId, blockchainName (tez | eth), symbol, price, qty, side (Buy, Sell), orderType (Return | FillOrKill | SolidFillOrKill | ImmediateOrCancel)
     * cancelOrder          Cancel a user order. Arguments: userId, blockchainName (tez | eth), orderId
     * printUsers           Print a list of the current users
     * printAtomexClients   Print a list of the atomex clients
     * auth, authenticate   Authenticate a user. Arguments: userId, blockchainName (tez | eth)
    
    ```
