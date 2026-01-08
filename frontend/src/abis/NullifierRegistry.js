/**
 * NullifierRegistry ABI
 * Contract for managing nullified markets and addresses using RSA accumulator
 */

export const NULLIFIER_REGISTRY_ABI = [
  // ========== Admin Functions ==========
  {
    "inputs": [
      { "internalType": "bytes", "name": "n", "type": "bytes" },
      { "internalType": "bytes", "name": "g", "type": "bytes" },
      { "internalType": "bytes", "name": "initialAccumulator", "type": "bytes" }
    ],
    "name": "initializeParams",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },

  // ========== Market Nullification ==========
  {
    "inputs": [
      { "internalType": "bytes32", "name": "marketHash", "type": "bytes32" },
      { "internalType": "uint256", "name": "marketId", "type": "uint256" },
      { "internalType": "string", "name": "reason", "type": "string" }
    ],
    "name": "nullifyMarket",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "bytes32", "name": "marketHash", "type": "bytes32" },
      { "internalType": "uint256", "name": "marketId", "type": "uint256" },
      { "internalType": "string", "name": "reason", "type": "string" }
    ],
    "name": "reinstateMarket",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "bytes32[]", "name": "marketHashes", "type": "bytes32[]" },
      { "internalType": "uint256[]", "name": "marketIds", "type": "uint256[]" },
      { "internalType": "string", "name": "reason", "type": "string" }
    ],
    "name": "batchNullifyMarkets",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },

  // ========== Address Nullification ==========
  {
    "inputs": [
      { "internalType": "address", "name": "addr", "type": "address" },
      { "internalType": "string", "name": "reason", "type": "string" }
    ],
    "name": "nullifyAddress",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "addr", "type": "address" },
      { "internalType": "string", "name": "reason", "type": "string" }
    ],
    "name": "reinstateAddress",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address[]", "name": "addrs", "type": "address[]" },
      { "internalType": "string", "name": "reason", "type": "string" }
    ],
    "name": "batchNullifyAddresses",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },

  // ========== Accumulator Management ==========
  {
    "inputs": [
      { "internalType": "bytes", "name": "newAccumulator", "type": "bytes" }
    ],
    "name": "updateAccumulator",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },

  // ========== View Functions ==========
  {
    "inputs": [{ "internalType": "bytes32", "name": "marketHash", "type": "bytes32" }],
    "name": "isMarketNullified",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "addr", "type": "address" }],
    "name": "isAddressNullified",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "bytes32", "name": "marketHash", "type": "bytes32" }],
    "name": "getMarketNullificationDetails",
    "outputs": [
      { "internalType": "bool", "name": "nullified", "type": "bool" },
      { "internalType": "uint256", "name": "timestamp", "type": "uint256" },
      { "internalType": "address", "name": "admin", "type": "address" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "addr", "type": "address" }],
    "name": "getAddressNullificationDetails",
    "outputs": [
      { "internalType": "bool", "name": "nullified", "type": "bool" },
      { "internalType": "uint256", "name": "timestamp", "type": "uint256" },
      { "internalType": "address", "name": "admin", "type": "address" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "offset", "type": "uint256" },
      { "internalType": "uint256", "name": "limit", "type": "uint256" }
    ],
    "name": "getNullifiedMarkets",
    "outputs": [
      { "internalType": "bytes32[]", "name": "hashes", "type": "bytes32[]" },
      { "internalType": "bool", "name": "hasMore", "type": "bool" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "offset", "type": "uint256" },
      { "internalType": "uint256", "name": "limit", "type": "uint256" }
    ],
    "name": "getNullifiedAddresses",
    "outputs": [
      { "internalType": "address[]", "name": "addrs", "type": "address[]" },
      { "internalType": "bool", "name": "hasMore", "type": "bool" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getAccumulator",
    "outputs": [{ "internalType": "bytes", "name": "", "type": "bytes" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getRSAParams",
    "outputs": [
      { "internalType": "bytes", "name": "n", "type": "bytes" },
      { "internalType": "bytes", "name": "g", "type": "bytes" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getStats",
    "outputs": [
      { "internalType": "uint256", "name": "markets", "type": "uint256" },
      { "internalType": "uint256", "name": "addresses", "type": "uint256" },
      { "internalType": "uint256", "name": "nullifications", "type": "uint256" },
      { "internalType": "uint256", "name": "reinstatements", "type": "uint256" },
      { "internalType": "uint256", "name": "lastUpdate", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  },

  // ========== Prime Computation ==========
  {
    "inputs": [{ "internalType": "bytes32", "name": "marketHash", "type": "bytes32" }],
    "name": "computeMarketPrime",
    "outputs": [{ "internalType": "uint256", "name": "prime", "type": "uint256" }],
    "stateMutability": "pure",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "addr", "type": "address" }],
    "name": "computeAddressPrime",
    "outputs": [{ "internalType": "uint256", "name": "prime", "type": "uint256" }],
    "stateMutability": "pure",
    "type": "function"
  },

  // ========== Non-Membership Verification ==========
  {
    "inputs": [
      { "internalType": "bytes32", "name": "elementHash", "type": "bytes32" },
      { "internalType": "bytes", "name": "witnessD", "type": "bytes" },
      { "internalType": "bytes", "name": "witnessB", "type": "bytes" },
      { "internalType": "bool", "name": "dNegative", "type": "bool" }
    ],
    "name": "verifyNonMembership",
    "outputs": [{ "internalType": "bool", "name": "valid", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },

  // ========== State Variables (Public Getters) ==========
  {
    "inputs": [],
    "name": "nullifiedMarketCount",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "nullifiedAddressCount",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalNullifications",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalReinstatements",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "lastAccumulatorUpdate",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "paramsInitialized",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "NULLIFIER_ADMIN_ROLE",
    "outputs": [{ "internalType": "bytes32", "name": "", "type": "bytes32" }],
    "stateMutability": "view",
    "type": "function"
  },

  // ========== Pausable ==========
  {
    "inputs": [],
    "name": "pause",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "unpause",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "paused",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },

  // ========== Access Control ==========
  {
    "inputs": [
      { "internalType": "bytes32", "name": "role", "type": "bytes32" },
      { "internalType": "address", "name": "account", "type": "address" }
    ],
    "name": "grantRole",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "bytes32", "name": "role", "type": "bytes32" },
      { "internalType": "address", "name": "account", "type": "address" }
    ],
    "name": "revokeRole",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "bytes32", "name": "role", "type": "bytes32" },
      { "internalType": "address", "name": "account", "type": "address" }
    ],
    "name": "hasRole",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "DEFAULT_ADMIN_ROLE",
    "outputs": [{ "internalType": "bytes32", "name": "", "type": "bytes32" }],
    "stateMutability": "view",
    "type": "function"
  },

  // ========== Events ==========
  {
    "anonymous": false,
    "inputs": [{ "indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256" }],
    "name": "RSAParamsInitialized",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "bytes32", "name": "marketHash", "type": "bytes32" },
      { "indexed": true, "internalType": "uint256", "name": "marketId", "type": "uint256" },
      { "indexed": true, "internalType": "address", "name": "admin", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256" },
      { "indexed": false, "internalType": "string", "name": "reason", "type": "string" }
    ],
    "name": "MarketNullified",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "bytes32", "name": "marketHash", "type": "bytes32" },
      { "indexed": true, "internalType": "uint256", "name": "marketId", "type": "uint256" },
      { "indexed": true, "internalType": "address", "name": "admin", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256" },
      { "indexed": false, "internalType": "string", "name": "reason", "type": "string" }
    ],
    "name": "MarketReinstated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "nullifiedAddr", "type": "address" },
      { "indexed": true, "internalType": "address", "name": "admin", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256" },
      { "indexed": false, "internalType": "string", "name": "reason", "type": "string" }
    ],
    "name": "AddressNullified",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "reinstatedAddr", "type": "address" },
      { "indexed": true, "internalType": "address", "name": "admin", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256" },
      { "indexed": false, "internalType": "string", "name": "reason", "type": "string" }
    ],
    "name": "AddressReinstated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "bytes", "name": "newAccumulator", "type": "bytes" },
      { "indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256" },
      { "indexed": true, "internalType": "address", "name": "updater", "type": "address" }
    ],
    "name": "AccumulatorUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "bytes32[]", "name": "marketHashes", "type": "bytes32[]" },
      { "indexed": true, "internalType": "address", "name": "admin", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256" }
    ],
    "name": "BatchMarketsNullified",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "address[]", "name": "addresses", "type": "address[]" },
      { "indexed": true, "internalType": "address", "name": "admin", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256" }
    ],
    "name": "BatchAddressesNullified",
    "type": "event"
  }
]

export default NULLIFIER_REGISTRY_ABI
