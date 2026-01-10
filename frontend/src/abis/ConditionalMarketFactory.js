/**
 * ConditionalMarketFactory ABI
 *
 * Essential functions for interacting with the market factory contract.
 * Uses CTF1155 (ERC-1155) for gas-efficient conditional position tokens.
 */
export const MARKET_FACTORY_ABI = [
  // Read functions
  {
    "inputs": [],
    "name": "marketCount",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"name": "marketId", "type": "uint256"}],
    "name": "markets",
    "outputs": [
      {"name": "proposalId", "type": "uint256"},
      {"name": "passToken", "type": "address"},
      {"name": "failToken", "type": "address"},
      {"name": "collateralToken", "type": "address"},
      {"name": "tradingEndTime", "type": "uint256"},
      {"name": "liquidityParameter", "type": "uint256"},
      {"name": "totalLiquidity", "type": "uint256"},
      {"name": "resolved", "type": "bool"},
      {"name": "passValue", "type": "uint256"},
      {"name": "failValue", "type": "uint256"},
      {"name": "status", "type": "uint8"},
      {"name": "betType", "type": "uint8"},
      {"name": "useCTF", "type": "bool"},
      {"name": "conditionId", "type": "bytes32"},
      {"name": "questionId", "type": "bytes32"},
      {"name": "passPositionId", "type": "uint256"},
      {"name": "failPositionId", "type": "uint256"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "ctf1155",
    "outputs": [{"name": "", "type": "address"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "roleManager",
    "outputs": [{"name": "", "type": "address"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [{"name": "", "type": "address"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"name": "betType", "type": "uint8"}],
    "name": "getOutcomeLabels",
    "outputs": [
      {"name": "positiveOutcome", "type": "string"},
      {"name": "negativeOutcome", "type": "string"}
    ],
    "stateMutability": "pure",
    "type": "function"
  },
  // Write functions
  {
    "inputs": [
      {"name": "proposalId", "type": "uint256"},
      {"name": "collateralToken", "type": "address"},
      {"name": "liquidityAmount", "type": "uint256"},
      {"name": "liquidityParameter", "type": "uint256"},
      {"name": "tradingPeriod", "type": "uint256"},
      {"name": "betType", "type": "uint8"}
    ],
    "name": "deployMarketPair",
    "outputs": [{"name": "marketId", "type": "uint256"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // Events
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "name": "marketId", "type": "uint256"},
      {"indexed": true, "name": "proposalId", "type": "uint256"},
      {"indexed": true, "name": "collateralToken", "type": "address"},
      {"indexed": false, "name": "passToken", "type": "address"},
      {"indexed": false, "name": "failToken", "type": "address"},
      {"indexed": false, "name": "tradingEndTime", "type": "uint256"},
      {"indexed": false, "name": "liquidityParameter", "type": "uint256"},
      {"indexed": false, "name": "createdAt", "type": "uint256"},
      {"indexed": false, "name": "creator", "type": "address"},
      {"indexed": false, "name": "betType", "type": "uint8"}
    ],
    "name": "MarketCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "name": "marketId", "type": "uint256"},
      {"indexed": true, "name": "conditionId", "type": "bytes32"},
      {"indexed": false, "name": "passPositionId", "type": "uint256"},
      {"indexed": false, "name": "failPositionId", "type": "uint256"}
    ],
    "name": "CTFMarketCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "name": "marketId", "type": "uint256"},
      {"indexed": true, "name": "buyer", "type": "address"},
      {"indexed": true, "name": "buyPass", "type": "bool"},
      {"indexed": false, "name": "collateralAmount", "type": "uint256"},
      {"indexed": false, "name": "tokenAmount", "type": "uint256"}
    ],
    "name": "TokensPurchased",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "name": "marketId", "type": "uint256"},
      {"indexed": true, "name": "proposalId", "type": "uint256"},
      {"indexed": false, "name": "passValue", "type": "uint256"},
      {"indexed": false, "name": "failValue", "type": "uint256"},
      {"indexed": true, "name": "approved", "type": "bool"},
      {"indexed": false, "name": "resolvedAt", "type": "uint256"}
    ],
    "name": "MarketResolved",
    "type": "event"
  }
]

/**
 * BetType enum values matching the contract
 */
export const BetType = {
  YesNo: 0,
  PassFail: 1,
  AboveBelow: 2,
  HigherLower: 3,
  InOut: 4,
  OverUnder: 5,
  ForAgainst: 6,
  TrueFalse: 7,
  WinLose: 8,
  UpDown: 9
}

/**
 * MarketStatus enum values matching the contract
 */
export const MarketStatus = {
  Active: 0,
  TradingEnded: 1,
  Resolved: 2,
  Cancelled: 3
}

/**
 * Trading period constants (in seconds)
 */
export const TradingPeriod = {
  MIN: 7 * 24 * 60 * 60,  // 7 days
  DEFAULT: 10 * 24 * 60 * 60,  // 10 days
  MAX: 21 * 24 * 60 * 60  // 21 days
}

/**
 * Standard ERC20 ABI for token approval
 */
export const ERC20_ABI = [
  {
    "inputs": [
      {"name": "spender", "type": "address"},
      {"name": "amount", "type": "uint256"}
    ],
    "name": "approve",
    "outputs": [{"name": "", "type": "bool"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {"name": "owner", "type": "address"},
      {"name": "spender", "type": "address"}
    ],
    "name": "allowance",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"name": "account", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  }
]
