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
 * Token addresses by network. Polygon Amoy is the only supported testnet;
 * Hardhat / localhost mock tokens are deployed at test time. Deploy scripts
 * should look up the stablecoin via TOKENS[networkName]?.USDC.
 */
const TOKENS = {
  amoy: {
    // Polymarket testnet USDC on Polygon Amoy. The exact address must be verified
    // from Polymarket's docs at deploy time; provided via env var so it can be
    // overridden without a code change.
    USDC: process.env.AMOY_USDC || null,
    WMATIC: process.env.AMOY_WMATIC || null,
  },
  localhost: {
    USDC: null,    // Deploy mock in test
    WMATIC: null,  // Deploy mock in test
  },
  hardhat: {
    USDC: null,
    WMATIC: null,
  }
};

/**
 * Stablecoin decimals by network. Polygon Amoy USDC is 6-decimal; local mocks
 * default to 18.
 */
const STABLECOIN_DECIMALS = {
  amoy: 6,
  localhost: 18,
  hardhat: 18,
};

/**
 * Polymarket CTF (Conditional Token Framework) addresses per network. Only set
 * on networks where Polymarket-pegged settlement is supported.
 */
const POLYMARKET_CTF = {
  amoy: process.env.AMOY_POLYMARKET_CTF || null,
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
 * Build tier configurations for a given stablecoin decimal count. Tier prices
 * and limits are token amounts that must be encoded with the same decimals as
 * the stablecoin used to pay them. Polygon Amoy USDC is 6-decimal; the helper
 * keeps the encoding correct if a future chain ships with a different decimal
 * stablecoin (e.g. 18-dec DAI).
 *
 * Historical note: previous versions of this file used ethers.parseEther for
 * these amounts, which encoded them with 18 decimals. Combined with a 6-dec
 * stablecoin, the on-chain price ended up 1e12x too large. Always call this
 * factory with the resolved stablecoin decimals for the deploy network.
 */
const _amount = (decimals) => (s) => ethers.parseUnits(s, decimals);

function buildFriendMarketTiers(stableDecimals) {
  const u = _amount(stableDecimals);
  return [
    {
      tier: MembershipTier.BRONZE,
      name: "Friend Market Bronze",
      description: "Basic friend market creation - 15 markets/month",
      price: u("50"),
      limits: {
        dailyBetLimit: 5,
        weeklyBetLimit: 20,
        monthlyMarketCreation: 15,
        maxPositionSize: u("5"),
        maxConcurrentMarkets: 5,
        withdrawalLimit: u("25"),
        canCreatePrivateMarkets: true,
        canUseAdvancedFeatures: false,
        feeDiscount: 10000  // 100% discount (no fees for friend markets)
      }
    },
    {
      tier: MembershipTier.SILVER,
      name: "Friend Market Silver",
      description: "Enhanced friend market creation - 30 markets/month",
      price: u("100"),
      limits: {
        dailyBetLimit: 10,
        weeklyBetLimit: 50,
        monthlyMarketCreation: 30,
        maxPositionSize: u("15"),
        maxConcurrentMarkets: 10,
        withdrawalLimit: u("100"),
        canCreatePrivateMarkets: true,
        canUseAdvancedFeatures: true,
        feeDiscount: 10000
      }
    },
    {
      tier: MembershipTier.GOLD,
      name: "Friend Market Gold",
      description: "Advanced friend market creation - 100 markets/month",
      price: u("200"),
      limits: {
        dailyBetLimit: 35,
        weeklyBetLimit: 200,
        monthlyMarketCreation: 100,
        maxPositionSize: u("50"),
        maxConcurrentMarkets: 30,
        withdrawalLimit: u("500"),
        canCreatePrivateMarkets: true,
        canUseAdvancedFeatures: true,
        feeDiscount: 10000
      }
    },
    {
      tier: MembershipTier.PLATINUM,
      name: "Friend Market Platinum",
      description: "Unlimited friend market creation",
      price: u("400"),
      limits: {
        dailyBetLimit: ethers.MaxUint256,
        weeklyBetLimit: ethers.MaxUint256,
        monthlyMarketCreation: ethers.MaxUint256,
        maxPositionSize: ethers.MaxUint256,
        maxConcurrentMarkets: ethers.MaxUint256,
        withdrawalLimit: ethers.MaxUint256,
        canCreatePrivateMarkets: true,
        canUseAdvancedFeatures: true,
        feeDiscount: 10000
      }
    }
  ];
}

function buildMarketMakerTiers(stableDecimals) {
  const u = _amount(stableDecimals);
  return [
    {
      tier: MembershipTier.BRONZE,
      name: "Market Maker Bronze",
      description: "Basic market creation capabilities",
      price: u("100"),
      limits: {
        dailyBetLimit: 10,
        weeklyBetLimit: 50,
        monthlyMarketCreation: 5,
        maxPositionSize: u("10"),
        maxConcurrentMarkets: 3,
        withdrawalLimit: u("50"),
        canCreatePrivateMarkets: false,
        canUseAdvancedFeatures: false,
        feeDiscount: 0
      }
    },
    {
      tier: MembershipTier.SILVER,
      name: "Market Maker Silver",
      description: "Enhanced market creation with more limits",
      price: u("150"),
      limits: {
        dailyBetLimit: 25,
        weeklyBetLimit: 150,
        monthlyMarketCreation: 15,
        maxPositionSize: u("50"),
        maxConcurrentMarkets: 10,
        withdrawalLimit: u("200"),
        canCreatePrivateMarkets: false,
        canUseAdvancedFeatures: true,
        feeDiscount: 500  // 5% discount
      }
    },
    {
      tier: MembershipTier.GOLD,
      name: "Market Maker Gold",
      description: "Professional market creation capabilities",
      price: u("250"),
      limits: {
        dailyBetLimit: 100,
        weeklyBetLimit: 500,
        monthlyMarketCreation: 50,
        maxPositionSize: u("200"),
        maxConcurrentMarkets: 30,
        withdrawalLimit: u("1000"),
        canCreatePrivateMarkets: true,
        canUseAdvancedFeatures: true,
        feeDiscount: 1000  // 10% discount
      }
    },
    {
      tier: MembershipTier.PLATINUM,
      name: "Market Maker Platinum",
      description: "Unlimited market creation for institutions",
      price: u("500"),
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
}

/**
 * Default tiers (legacy export). Deploy scripts that have not been updated to
 * resolve the network's stablecoin decimals fall back to 6-dec encoding, which
 * matches Polygon Amoy USDC. NOTE: this is a behavior change from a previous
 * version of this file, which encoded with 18 decimals — see
 * buildFriendMarketTiers for the rationale.
 */
const FRIEND_MARKET_TIERS = buildFriendMarketTiers(6);
const MARKET_MAKER_TIERS = buildMarketMakerTiers(6);

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
};

// =============================================================================
// NETWORK CONFIGURATIONS
// =============================================================================

/**
 * Network-specific configurations
 */
const NETWORK_CONFIG = {
  amoy: {
    chainId: 80002,
    name: "Polygon Amoy",
    rpcUrl: process.env.AMOY_RPC_URL || "https://rpc-amoy.polygon.technology",
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

// Polygon mainnet (137) included to block accidental deploys when targeting the
// Amoy testnet — Amoy is 80002 and is intentionally not in this list.
const MAINNET_CHAIN_IDS = [1, 137]; // Ethereum Mainnet, Polygon Mainnet

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  // Factory
  SINGLETON_FACTORY_ADDRESS,

  // Tokens
  TOKENS,
  STABLECOIN_DECIMALS,

  // Oracle adapters
  POLYMARKET_CTF,

  // Roles
  ROLE_HASHES,

  // Tiers
  MembershipTier,
  FRIEND_MARKET_TIERS,
  MARKET_MAKER_TIERS,
  buildFriendMarketTiers,
  buildMarketMakerTiers,

  // Salts
  SALT_PREFIXES,

  // Networks
  NETWORK_CONFIG,

  // Limits
  DEFAULT_MAX_INITCODE_BYTES,
  DEFAULT_MAX_RUNTIME_BYTES,
  MAINNET_CHAIN_IDS,
};
