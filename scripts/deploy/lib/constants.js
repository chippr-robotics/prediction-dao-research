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
  },
  localhost: {
    USC: null,   // Deploy mock in test
    WETC: null,  // Deploy mock in test
  },
  hardhat: {
    USC: null,
    WETC: null,
  }
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
 * Friend Market tier configurations
 */
const FRIEND_MARKET_TIERS = [
  {
    tier: MembershipTier.BRONZE,
    name: "Friend Market Bronze",
    description: "Basic friend market creation - 15 markets/month",
    price: ethers.parseEther("50"),
    limits: {
      dailyBetLimit: 5,
      weeklyBetLimit: 20,
      monthlyMarketCreation: 15,
      maxPositionSize: ethers.parseEther("5"),
      maxConcurrentMarkets: 5,
      withdrawalLimit: ethers.parseEther("25"),
      canCreatePrivateMarkets: true,
      canUseAdvancedFeatures: false,
      feeDiscount: 10000  // 100% discount (no fees for friend markets)
    }
  },
  {
    tier: MembershipTier.SILVER,
    name: "Friend Market Silver",
    description: "Enhanced friend market creation - 30 markets/month",
    price: ethers.parseEther("100"),
    limits: {
      dailyBetLimit: 10,
      weeklyBetLimit: 50,
      monthlyMarketCreation: 30,
      maxPositionSize: ethers.parseEther("15"),
      maxConcurrentMarkets: 10,
      withdrawalLimit: ethers.parseEther("100"),
      canCreatePrivateMarkets: true,
      canUseAdvancedFeatures: true,
      feeDiscount: 10000
    }
  },
  {
    tier: MembershipTier.GOLD,
    name: "Friend Market Gold",
    description: "Advanced friend market creation - 100 markets/month",
    price: ethers.parseEther("200"),
    limits: {
      dailyBetLimit: 35,
      weeklyBetLimit: 200,
      monthlyMarketCreation: 100,
      maxPositionSize: ethers.parseEther("50"),
      maxConcurrentMarkets: 30,
      withdrawalLimit: ethers.parseEther("500"),
      canCreatePrivateMarkets: true,
      canUseAdvancedFeatures: true,
      feeDiscount: 10000
    }
  },
  {
    tier: MembershipTier.PLATINUM,
    name: "Friend Market Platinum",
    description: "Unlimited friend market creation",
    price: ethers.parseEther("400"),
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

const MAINNET_CHAIN_IDS = [1, 61]; // Ethereum Mainnet, Ethereum Classic Mainnet

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  // Factory
  SINGLETON_FACTORY_ADDRESS,

  // Tokens
  TOKENS,

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
