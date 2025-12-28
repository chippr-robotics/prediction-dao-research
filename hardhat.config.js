require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    hardhat: {
      chainId: 1337,
      allowUnlimitedContractSize: true,
      accounts: {
        count: 20, // More accounts for integration tests
        accountsBalance: "100000000000000000000000", // 100,000 ETH each - increased to handle bond-heavy tests
      },
      mining: {
        auto: true,
        interval: 0,
      },
    },
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    mordor: {
      url: "https://rpc.mordor.etccooperative.org",
      chainId: 63,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  mocha: {
    timeout: 120000, // 2 minutes for integration tests
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS ? true : false,
    currency: "USD",
    outputFile: process.env.REPORT_GAS ? "gas-report.txt" : undefined,
    noColors: process.env.REPORT_GAS ? true : false,
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
  },
};
