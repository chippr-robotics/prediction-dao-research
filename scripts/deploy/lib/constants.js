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
    // ⚠️ VERIFY ON-CHAIN BEFORE DEPLOY (Spec 015, T001): confirm this is the
    // canonical Classic USD (USC) on Mordor (chain 63) — not the ETC-mainnet
    // token — and confirm decimals. The deploy reads decimals() on-chain, but a
    // wrong address would mis-stake funds. requireRealStablecoin aborts if unset.
    USC: "0xDE093684c796204224BC081f937aa059D903c52a",   // Classic USD (USC) — VERIFY
    WETC: "0x1953cab0E5bFa6D4a9BaD6E05fD46C1CC6527a5a",  // Wrapped ETC — VERIFY (used as 2nd real stake token)
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
// CHAINLINK INTEGRATION ADDRESSES
// =============================================================================

/**
 * Chainlink Functions Router addresses.
 * Used by ChainlinkFunctionsOracleAdapter to send DON requests.
 * The adapter must be added as a consumer on a LINK-funded subscription.
 */
const CHAINLINK_FUNCTIONS_ROUTER = {
  polygon: process.env.CHAINLINK_FUNCTIONS_ROUTER_POLYGON || "0xdc2AAF042Aeff2E68B3e8E33F19e4B9fA7C73F10",
  amoy: process.env.CHAINLINK_FUNCTIONS_ROUTER_AMOY || "0xC22a79eBA640940ABB6dF0f7982cc119578E11De",
  mordor: null,
  localhost: null,
  hardhat: null,
};

/**
 * Chainlink Functions DON identifiers (bytes32) per network.
 * Passed to ChainlinkFunctionsOracleAdapter.registerCondition().
 */
const CHAINLINK_FUNCTIONS_DON_ID = {
  polygon: "0x66756e2d706f6c79676f6e2d6d61696e6e65742d310000000000000000000000", // "fun-polygon-mainnet-1"
  amoy:    "0x66756e2d706f6c79676f6e2d616d6f792d310000000000000000000000000000", // "fun-polygon-amoy-1"
  mordor: null,
  localhost: null,
  hardhat: null,
};

/**
 * Chainlink Data Feed (AggregatorV3) addresses by network.
 * Each entry is the contract address for a specific price pair. Only the feeds
 * we want exposed as wager-resolution sources need to be listed here; the
 * adapter's allowlist gates which are usable on-chain.
 *
 * Re-verify additional pair addresses against the official Chainlink docs at
 * deploy time. ETH/USD on Amoy is confirmed; others should be added cautiously.
 */
const CHAINLINK_DATA_FEEDS = {
  polygon: {
    "ETH/USD":   "0xF9680D99D6C9589e2a93a78A04A279e509205945",
    "MATIC/USD": "0xAB594600376Ec9fD91F8e885dADF0CE036862dE0",
  },
  amoy: {
    "ETH/USD": process.env.CHAINLINK_FEED_AMOY_ETH_USD || "0xF0d50568e3A7e8259E16663972b11910F89BD8e7",
  },
  mordor: {},
  localhost: {},
  hardhat: {},
};

// =============================================================================
// UMA OPTIMISTIC ORACLE V3 ADDRESSES
// =============================================================================

/**
 * UMA OptimisticOracleV3 addresses by network.
 * Used by UMAOptimisticOracleV3Adapter to escrow bonds and receive callbacks.
 *
 * The Polygon mainnet address must be re-verified against UMA's official
 * docs at deploy time (the deploy script tolerates null and skips the adapter).
 */
const UMA_OOV3 = {
  polygon: process.env.UMA_OOV3_POLYGON || "0x5953f2538F613E05bAED8A5AeFa8e6622467AD3D",
  amoy:    process.env.UMA_OOV3_AMOY    || "0xd8866E76441df243fc98B892362Fc6264dC3ca80",
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
// PER-NETWORK DEPLOY FLAGS
// =============================================================================

/**
 * Deploy-time behaviour flags for chains where the standard (Polygon-centric)
 * integrations do not exist. Ethereum Classic (Mordor) has no Polymarket /
 * Chainlink / UMA infrastructure and uses Classic USD (USC) + WETC as REAL
 * tokens, so its core-only deploy must not inject mock stake tokens or a mock
 * Polymarket adapter (Spec 015 / Constitution III). The MockSanctionsOracle is
 * intentionally NOT suppressed here — like Amoy, a testnet without a real
 * Chainalysis oracle still needs an on-chain oracle to keep the Sanctions Guard
 * enforced (Spec 015 FR-016, clarified "enforce, same as others").
 */
const NETWORK_DEPLOY_FLAGS = {
  mordor: {
    noPolymarket: true,          // skip PolymarketOracleAdapter + Mock CTF; WagerRegistry gets address(0)
    requireRealStablecoin: true, // never deploy a MockERC20 stablecoin; abort if USC is unset/invalid
    noMockWrappedNative: true,   // use real WETC (or single-token allowlist); never a mock wrapped-native
  },
};

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  // Factory
  SINGLETON_FACTORY_ADDRESS,

  // Tokens
  TOKENS,
  POLYMARKET_CTF,

  // Chainlink + UMA oracle integration
  CHAINLINK_FUNCTIONS_ROUTER,
  CHAINLINK_FUNCTIONS_DON_ID,
  CHAINLINK_DATA_FEEDS,
  UMA_OOV3,

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
  NETWORK_DEPLOY_FLAGS,
};
