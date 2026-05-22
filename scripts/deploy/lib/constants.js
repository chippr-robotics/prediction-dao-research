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
 * Pre-computed role hashes for access control.
 * `DEFAULT_ADMIN_ROLE` is bytes32(0) per OpenZeppelin AccessControl convention.
 */
const ROLE_HASHES = {
  DEFAULT_ADMIN_ROLE: ethers.ZeroHash,
  WAGER_PARTICIPANT_ROLE: ethers.keccak256(ethers.toUtf8Bytes("WAGER_PARTICIPANT_ROLE")),
  GUARDIAN_ROLE: ethers.keccak256(ethers.toUtf8Bytes("GUARDIAN_ROLE")),
  ACCOUNT_MODERATOR_ROLE: ethers.keccak256(ethers.toUtf8Bytes("ACCOUNT_MODERATOR_ROLE")),
  ROLE_MANAGER_ROLE: ethers.keccak256(ethers.toUtf8Bytes("ROLE_MANAGER_ROLE")),
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
 * Wager Participant tier configurations.
 *
 * Anchored at $2 Bronze with a $2 / $8 / $25 / $100 ladder. Only the two
 * MembershipManager `Limits` fields (`monthlyMarketCreation`,
 * `maxConcurrentMarkets`) are enforced on-chain; the rest is presentation.
 *
 * Prices are stored as 18-decimal ethers for legacy script compatibility and
 * converted to 6-decimal USDC by `deploy.js` via `toUSDC()`.
 */
const WAGER_PARTICIPANT_TIERS = [
  {
    tier: MembershipTier.BRONZE,
    name: "Wager Participant Bronze",
    description: "Entry tier — 15 wagers/month, 5 concurrent open wagers",
    price: ethers.parseEther("2"),
    limits: {
      monthlyMarketCreation: 15,
      maxConcurrentMarkets: 5,
    }
  },
  {
    tier: MembershipTier.SILVER,
    name: "Wager Participant Silver",
    description: "Casual usage — 30 wagers/month, 10 concurrent",
    price: ethers.parseEther("8"),
    limits: {
      monthlyMarketCreation: 30,
      maxConcurrentMarkets: 10,
    }
  },
  {
    tier: MembershipTier.GOLD,
    name: "Wager Participant Gold",
    description: "Active wagering — 100 wagers/month, 30 concurrent",
    price: ethers.parseEther("25"),
    limits: {
      monthlyMarketCreation: 100,
      maxConcurrentMarkets: 30,
    }
  },
  {
    tier: MembershipTier.PLATINUM,
    name: "Wager Participant Platinum",
    description: "Unlimited wager creation",
    price: ethers.parseEther("100"),
    limits: {
      monthlyMarketCreation: 0,    // 0 = unlimited
      maxConcurrentMarkets: 0,
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
  WAGER_PARTICIPANT_TIERS,

  // Salts
  SALT_PREFIXES,

  // Networks
  NETWORK_CONFIG,

  // Limits
  DEFAULT_MAX_INITCODE_BYTES,
  DEFAULT_MAX_RUNTIME_BYTES,
  MAINNET_CHAIN_IDS,
};
