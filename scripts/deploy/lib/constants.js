/**
 * Centralized Constants for Deployment Scripts
 *
 * This file contains all shared constants used across deployment scripts.
 * Update this file when addresses or configurations change.
 */

const { ethers } = require("hardhat");

// =============================================================================
// FACTORY ADDRESSES
// =============================================================================

/**
 * Safe Singleton Factory address - same on all EVM networks
 * Used for deterministic CREATE2 deployments
 */
const SINGLETON_FACTORY_ADDRESS = "0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7";

// =============================================================================
// TOKEN ADDRESSES
// =============================================================================

/**
 * Token addresses by network
 */
const TOKENS = {
  mordor: {
    USC: "0xDE093684c796204224BC081f937aa059D903c52a",   // USC Stablecoin (6 decimals)
    WETC: "0x1953cab0E5bFa6D4a9BaD6E05fD46C1CC6527a5a",  // Wrapped ETC
    WMATIC: null,
  },
  amoy: {
    // Circle USDC on Polygon Amoy (6 decimals)
    USC: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",
    WETC: null,
    // Wrapped MATIC on Amoy (used as alternative wager stake token)
    WMATIC: "0x0ae690AAD8663aaB12a671A6A0d74242332de85f",
  },
  polygon: {
    USC: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",   // Circle USDC on Polygon mainnet
    WETC: null,
    WMATIC: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
  },
  localhost: {
    USC: null,   // Deploy mock in test
    WETC: null,
    WMATIC: null,
  },
  hardhat: {
    USC: null,
    WETC: null,
    WMATIC: null,
  }
};

// =============================================================================
// POLYMARKET INTEGRATION ADDRESSES
// =============================================================================

/**
 * Polymarket CTF (Conditional Tokens Framework) contract addresses
 * Used by PolymarketOracleAdapter to query market resolutions
 *
 * Polymarket uses Gnosis CTF on Polygon. The same CTF contract is used on
 * Polygon mainnet. On Amoy testnet, a test deployment of CTF is used.
 *
 * If null, deploy a Mock CTF for testing or use a custom address via
 * the POLYMARKET_CTF env var when running deployment.
 */
const POLYMARKET_CTF = {
  polygon: "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045",  // Polymarket CTF on Polygon mainnet
  amoy: null,    // No canonical Polymarket CTF on Amoy - set via POLYMARKET_CTF env var
  mordor: null,
  localhost: null,
  hardhat: null,
};

// =============================================================================
// ROLE HASHES
// =============================================================================

/**
 * Pre-computed role hashes for access control
 * These match the keccak256 hashes used in the smart contracts
 */
const ROLE_HASHES = {
  ADMIN_ROLE: ethers.keccak256(ethers.toUtf8Bytes("ADMIN_ROLE")),
  MARKET_MAKER_ROLE: ethers.keccak256(ethers.toUtf8Bytes("MARKET_MAKER_ROLE")),
  FRIEND_MARKET_ROLE: ethers.keccak256(ethers.toUtf8Bytes("FRIEND_MARKET_ROLE")),
  TOKENMINT_ROLE: ethers.keccak256(ethers.toUtf8Bytes("TOKENMINT_ROLE")),
  CLEARPATH_USER_ROLE: ethers.keccak256(ethers.toUtf8Bytes("CLEARPATH_USER_ROLE")),
  OPERATIONS_ADMIN_ROLE: ethers.keccak256(ethers.toUtf8Bytes("OPERATIONS_ADMIN_ROLE")),
};

// =============================================================================
// TIER CONFIGURATIONS
// =============================================================================

/**
 * Membership tier enum values
 */
const MembershipTier = {
  NONE: 0,
  BRONZE: 1,
  SILVER: 2,
  GOLD: 3,
  PLATINUM: 4
};

/**
 * Friend Market tier configurations.
 *
 * NOTE: only `monthlyMarketCreation` and `maxConcurrentMarkets` are enforced
 * on-chain by MembershipManager. The other fields are unused but left in the
 * shape so v1 reporting/scripts don't break. `deploy.js` only reads the two
 * enforced limits.
 */
const FRIEND_MARKET_TIERS = [
  {
    tier: MembershipTier.BRONZE,
    name: "Friend Market Bronze",
    description: "Entry-tier friend wagers — 15 markets/month, 5 concurrent",
    price: ethers.parseEther("1"),
    limits: {
      monthlyMarketCreation: 15,
      maxConcurrentMarkets: 5,
    }
  },
  {
    tier: MembershipTier.SILVER,
    name: "Friend Market Silver",
    description: "Casual usage — 30 markets/month, 10 concurrent",
    price: ethers.parseEther("5"),
    limits: {
      monthlyMarketCreation: 30,
      maxConcurrentMarkets: 10,
    }
  },
  {
    tier: MembershipTier.GOLD,
    name: "Friend Market Gold",
    description: "Active wagering — 100 markets/month, 30 concurrent",
    price: ethers.parseEther("25"),
    limits: {
      monthlyMarketCreation: 100,
      maxConcurrentMarkets: 30,
    }
  },
  {
    tier: MembershipTier.PLATINUM,
    name: "Friend Market Platinum",
    description: "Unlimited friend wager creation",
    price: ethers.parseEther("100"),
    limits: {
      monthlyMarketCreation: 0,    // 0 = unlimited
      maxConcurrentMarkets: 0,
    }
  }
];

/**
 * Market Maker tier configurations
 */
const MARKET_MAKER_TIERS = [
  {
    tier: MembershipTier.BRONZE,
    name: "Market Maker Bronze",
    description: "Basic market creation capabilities",
    price: ethers.parseEther("100"),
    limits: {
      dailyBetLimit: 10,
      weeklyBetLimit: 50,
      monthlyMarketCreation: 5,
      maxPositionSize: ethers.parseEther("10"),
      maxConcurrentMarkets: 3,
      withdrawalLimit: ethers.parseEther("50"),
      canCreatePrivateMarkets: false,
      canUseAdvancedFeatures: false,
      feeDiscount: 0
    }
  },
  {
    tier: MembershipTier.SILVER,
    name: "Market Maker Silver",
    description: "Enhanced market creation with more limits",
    price: ethers.parseEther("150"),
    limits: {
      dailyBetLimit: 25,
      weeklyBetLimit: 150,
      monthlyMarketCreation: 15,
      maxPositionSize: ethers.parseEther("50"),
      maxConcurrentMarkets: 10,
      withdrawalLimit: ethers.parseEther("200"),
      canCreatePrivateMarkets: false,
      canUseAdvancedFeatures: true,
      feeDiscount: 500  // 5% discount
    }
  },
  {
    tier: MembershipTier.GOLD,
    name: "Market Maker Gold",
    description: "Professional market creation capabilities",
    price: ethers.parseEther("250"),
    limits: {
      dailyBetLimit: 100,
      weeklyBetLimit: 500,
      monthlyMarketCreation: 50,
      maxPositionSize: ethers.parseEther("200"),
      maxConcurrentMarkets: 30,
      withdrawalLimit: ethers.parseEther("1000"),
      canCreatePrivateMarkets: true,
      canUseAdvancedFeatures: true,
      feeDiscount: 1000  // 10% discount
    }
  },
  {
    tier: MembershipTier.PLATINUM,
    name: "Market Maker Platinum",
    description: "Unlimited market creation for institutions",
    price: ethers.parseEther("500"),
    limits: {
      dailyBetLimit: ethers.MaxUint256,
      weeklyBetLimit: ethers.MaxUint256,
      monthlyMarketCreation: ethers.MaxUint256,
      maxPositionSize: ethers.MaxUint256,
      maxConcurrentMarkets: ethers.MaxUint256,
      withdrawalLimit: ethers.MaxUint256,
      canCreatePrivateMarkets: true,
      canUseAdvancedFeatures: true,
      feeDiscount: 2000  // 20% discount
    }
  }
];

// =============================================================================
// SALT PREFIXES
// =============================================================================

/**
 * Salt prefixes for deterministic deployment
 * Each prefix should be unique per deployment version
 */
const SALT_PREFIXES = {
  CORE: "FairWinsDAO-v1.0-",
  RBAC: "ClearPathDAO-Modular-v1.0-",
  TIERED_ROLE_MANAGER: "ClearPathDAO-TRM-v1.1-",
  FRIEND_MARKETS: "ClearPathDAO-FGMF-v1.1-",
  PERPETUALS: "ClearPathDAO-Perp-v1.0-",
  CORRELATION: "ClearPathDAO-MCR-v1.0-",
  V2: "FairWins-P2P-v2.0-",
};

// =============================================================================
// NETWORK CONFIGURATIONS
// =============================================================================

/**
 * Network-specific configurations
 */
const NETWORK_CONFIG = {
  mordor: {
    chainId: 63,
    name: "Mordor Testnet",
    rpcUrl: "https://rpc.mordor.etccooperative.org",
    blockExplorer: "https://etc-mordor.blockscout.com",
  },
  amoy: {
    chainId: 80002,
    name: "Polygon Amoy Testnet",
    rpcUrl: "https://rpc-amoy.polygon.technology",
    blockExplorer: "https://amoy.polygonscan.com",
  },
  localhost: {
    chainId: 1337,
    name: "Localhost",
    rpcUrl: "http://127.0.0.1:8545",
    blockExplorer: null,
  },
  hardhat: {
    chainId: 1337,
    name: "Hardhat",
    rpcUrl: "http://127.0.0.1:8545",
    blockExplorer: null,
  }
};

// =============================================================================
// EIP LIMITS
// =============================================================================

/**
 * EIP-3860 (Shanghai) limits initcode size to 49152 bytes
 */
const DEFAULT_MAX_INITCODE_BYTES = 49_152;

/**
 * EIP-170 limits deployed/runtime code size to 24,576 bytes
 */
const DEFAULT_MAX_RUNTIME_BYTES = 24_576;

// =============================================================================
// MAINNET CHAIN IDS (for safety checks)
// =============================================================================

const MAINNET_CHAIN_IDS = [1, 61, 137]; // Ethereum, Ethereum Classic, Polygon mainnets

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  // Factory
  SINGLETON_FACTORY_ADDRESS,

  // Tokens
  TOKENS,
  POLYMARKET_CTF,

  // Roles
  ROLE_HASHES,

  // Tiers
  MembershipTier,
  FRIEND_MARKET_TIERS,
  MARKET_MAKER_TIERS,

  // Salts
  SALT_PREFIXES,

  // Networks
  NETWORK_CONFIG,

  // Limits
  DEFAULT_MAX_INITCODE_BYTES,
  DEFAULT_MAX_RUNTIME_BYTES,
  MAINNET_CHAIN_IDS,
};
