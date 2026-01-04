/**
 * ConditionalMarketFactory ABI
 * 
 * Essential functions for interacting with the market factory contract
 */
export const MARKET_FACTORY_ABI = [
  // Read functions
  {
    "inputs": [],
    "name": "getMarketCount",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"name": "marketId", "type": "uint256"}],
    "name": "getMarket",
    "outputs": [
      {
        "components": [
          {"name": "id", "type": "uint256"},
          {"name": "creator", "type": "address"},
          {"name": "question", "type": "string"},
          {"name": "description", "type": "string"},
          {"name": "category", "type": "string"},
          {"name": "endTime", "type": "uint256"},
          {"name": "resolvedTime", "type": "uint256"},
          {"name": "outcome", "type": "uint8"},
          {"name": "totalLiquidity", "type": "uint256"},
          {"name": "yesPrice", "type": "uint256"},
          {"name": "noPrice", "type": "uint256"},
          {"name": "status", "type": "uint8"}
        ],
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getAllMarkets",
    "outputs": [
      {
        "components": [
          {"name": "id", "type": "uint256"},
          {"name": "creator", "type": "address"},
          {"name": "question", "type": "string"},
          {"name": "description", "type": "string"},
          {"name": "category", "type": "string"},
          {"name": "endTime", "type": "uint256"},
          {"name": "resolvedTime", "type": "uint256"},
          {"name": "outcome", "type": "uint8"},
          {"name": "totalLiquidity", "type": "uint256"},
          {"name": "yesPrice", "type": "uint256"},
          {"name": "noPrice", "type": "uint256"},
          {"name": "status", "type": "uint8"}
        ],
        "name": "",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"name": "category", "type": "string"}],
    "name": "getMarketsByCategory",
    "outputs": [{"name": "", "type": "uint256[]"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"name": "user", "type": "address"}],
    "name": "getUserPositions",
    "outputs": [
      {
        "components": [
          {"name": "marketId", "type": "uint256"},
          {"name": "yesShares", "type": "uint256"},
          {"name": "noShares", "type": "uint256"},
          {"name": "invested", "type": "uint256"}
        ],
        "name": "",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  // Write functions
  {
    "inputs": [
      {"name": "question", "type": "string"},
      {"name": "description", "type": "string"},
      {"name": "category", "type": "string"},
      {"name": "endTime", "type": "uint256"},
      {"name": "initialLiquidity", "type": "uint256"}
    ],
    "name": "createMarket",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      {"name": "marketId", "type": "uint256"},
      {"name": "outcome", "type": "bool"},
      {"name": "amount", "type": "uint256"}
    ],
    "name": "buy",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  // Events
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "name": "marketId", "type": "uint256"},
      {"indexed": true, "name": "creator", "type": "address"},
      {"indexed": false, "name": "question", "type": "string"},
      {"indexed": false, "name": "endTime", "type": "uint256"}
    ],
    "name": "MarketCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "name": "marketId", "type": "uint256"},
      {"indexed": true, "name": "buyer", "type": "address"},
      {"indexed": false, "name": "outcome", "type": "bool"},
      {"indexed": false, "name": "amount", "type": "uint256"},
      {"indexed": false, "name": "shares", "type": "uint256"}
    ],
    "name": "Trade",
    "type": "event"
  }
]
