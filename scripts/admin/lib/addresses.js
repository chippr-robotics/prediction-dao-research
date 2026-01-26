/**
 * Shared Contract Address Configuration for Admin Scripts
 *
 * This file provides centralized contract addresses loaded from deployment files.
 * All admin scripts should import addresses from here instead of hardcoding.
 *
 * Usage:
 *   const { getAddress, ROLE_HASHES } = require('./lib/addresses');
 *   const tieredRoleManager = getAddress('tieredRoleManager');
 */

const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// =============================================================================
// DEPLOYMENT FILE LOADING
// =============================================================================

/**
 * Load deployment JSON file if it exists
 */
function loadDeploymentFile(filename) {
  const deploymentPath = path.join(__dirname, "../../../deployments", filename);
  if (fs.existsSync(deploymentPath)) {
    try {
      return JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    } catch (e) {
      console.warn(`Warning: Failed to parse ${filename}: ${e.message}`);
    }
  }
  return null;
}

/**
 * Get network-specific deployment filename
 */
function getDeploymentFilename(prefix) {
  const network = hre.network.name;
  const chainId = hre.network.config.chainId || 63;
  return `${network}-chain${chainId}-${prefix}.json`;
}

// =============================================================================
// LOAD DEPLOYMENTS
// =============================================================================

// Core contracts
const coreDeployment = loadDeploymentFile(getDeploymentFilename("core-deployment")) || {};

// RBAC contracts
const rbacDeployment = loadDeploymentFile(getDeploymentFilename("rbac-deployment")) || {};

// Market contracts
const marketsDeployment = loadDeploymentFile(getDeploymentFilename("markets-deployment")) || {};

// Registry contracts
const registriesDeployment = loadDeploymentFile(getDeploymentFilename("registries-deployment")) || {};

// Perpetual Futures v2.1 (latest)
const perpDeployment = loadDeploymentFile(`${hre.network.name}-perpetual-futures-v2.1-deployment.json`) || {};

// =============================================================================
// FALLBACK ADDRESSES (MORDOR TESTNET)
// =============================================================================

/**
 * Known-good addresses for Mordor testnet
 * These are used as fallbacks if deployment files are not found
 */
const MORDOR_ADDRESSES = {
  // Deployer / Treasury
  deployer: "0x52502d049571C7893447b86c4d8B38e6184bF6e1",
  treasury: "0x52502d049571C7893447b86c4d8B38e6184bF6e1",

  // Core Contracts
  roleManagerCore: "0x6a6422Ed3198332AC8DA2852BBff4749B66a3D8D",
  welfareRegistry: "0x034494F9eA0821FB6167EcA41A6850fd2D11b8b1",
  proposalRegistry: "0x095146344Ab39a0cbF37494Cb50fb293E55AF76E",
  marketFactory: "0xc56631DB29c44bb553a511DD3d4b90d64C95Cd9C",
  privacyCoordinator: "0x9897CBb96b1931A3c019A9d2126dab59630D4414",
  oracleResolver: "0x2AaCC0D91AF255667683ece0A363649Cc9Ed8776",
  ragequitModule: "0xD6b6eDE9EacDC90e20Fe95Db1875EaBB07004A1c",
  futarchyGovernor: "0x0292a5bdf60E851c043bDceE378D505801A6aEef",
  tokenMintFactory: "0x5bBa4c4985c36525D14D7d7627Ab479B8b2E2205",
  daoFactory: "0x9B1692272D54CA7b4dEAa7622aBddb6059eb8202",

  // RBAC Contracts
  tieredRoleManager: "0x55e6346Be542B13462De504FCC379a2477D227f0",
  tierRegistry: "0x476cf3dEA109D6FC95aD19d246FD4e95693c47a3",
  usageTracker: "0x10f1b557a53C05A92DF820CCfDC77EaB0c732Bde",
  membershipManager: "0xCD172d9888a6F47203dD6f0684f250f6Ac56f6Ed",
  paymentProcessor: "0x6e063138809263820F61146c34a74EB3B2629A59",
  membershipPaymentManager: "0x9CDc3D0Aff85F89C04d03b6b9E9Ba99fDf033E34",

  // Market Contracts
  ctf1155: "0xc7b69289c70f4b2f8FA860eEdE976E1501207DD9",
  friendGroupMarketFactory: "0x0E118DEf0946f0e7F1BEAAA385c6c37CAc6acfa7",

  // Registry Contracts
  marketCorrelationRegistry: "0x2a820A38997743fC3303cDcA56b996598963B909",
  nullifierRegistry: "0x5569FEe7f8Bab39EEd08bf448Dd6824640C7d272",

  // Perpetual Futures v2.1
  fundingRateEngine: "0x32AD4F7a1e05138fc0F485c786aeDB90dBE100e8",
  perpFactory: "0xE3B84aecc9Ee0D2a35530BfAcb3D184c372cdc71",

  // Tokens
  USC: "0xDE093684c796204224BC081f937aa059D903c52a",
  WETC: "0x1953cab0E5bFa6D4a9BaD6E05fD46C1CC6527a5a",
};

// =============================================================================
// MERGED ADDRESSES
// =============================================================================

/**
 * Merge addresses from deployment files with fallbacks
 */
function getMergedAddresses() {
  const network = hre.network.name;

  // Start with fallbacks for mordor, empty for others
  const addresses = network === "mordor" ? { ...MORDOR_ADDRESSES } : {};

  // Override with deployment file values
  if (coreDeployment.contracts) {
    Object.assign(addresses, coreDeployment.contracts);
  }
  if (rbacDeployment.contracts) {
    Object.assign(addresses, rbacDeployment.contracts);
  }
  if (marketsDeployment.contracts) {
    Object.assign(addresses, marketsDeployment.contracts);
  }
  if (registriesDeployment.contracts) {
    Object.assign(addresses, registriesDeployment.contracts);
  }
  if (perpDeployment.contracts) {
    Object.assign(addresses, perpDeployment.contracts);
  }
  if (perpDeployment.tokens) {
    Object.assign(addresses, perpDeployment.tokens);
  }

  return addresses;
}

const ADDRESSES = getMergedAddresses();

// =============================================================================
// ADDRESS GETTER
// =============================================================================

/**
 * Get a contract address by name
 * @param {string} name - Contract name (camelCase)
 * @returns {string|null} Contract address or null if not found
 */
function getAddress(name) {
  const address = ADDRESSES[name];
  if (!address) {
    console.warn(`Warning: Address not found for '${name}' on network '${hre.network.name}'`);
    return null;
  }
  return address;
}

/**
 * Get multiple addresses at once
 * @param  {...string} names - Contract names
 * @returns {Object} Object with name:address pairs
 */
function getAddresses(...names) {
  const result = {};
  for (const name of names) {
    result[name] = getAddress(name);
  }
  return result;
}

/**
 * Require an address (throws if not found)
 * @param {string} name - Contract name
 * @returns {string} Contract address
 */
function requireAddress(name) {
  const address = getAddress(name);
  if (!address) {
    throw new Error(`Required address '${name}' not found for network '${hre.network.name}'`);
  }
  return address;
}

// =============================================================================
// ROLE HASHES
// =============================================================================

/**
 * Pre-computed role hashes for access control
 */
const ROLE_HASHES = {
  DEFAULT_ADMIN_ROLE: ethers.ZeroHash,
  ADMIN_ROLE: ethers.keccak256(ethers.toUtf8Bytes("ADMIN_ROLE")),
  MARKET_MAKER_ROLE: ethers.keccak256(ethers.toUtf8Bytes("MARKET_MAKER_ROLE")),
  FRIEND_MARKET_ROLE: ethers.keccak256(ethers.toUtf8Bytes("FRIEND_MARKET_ROLE")),
  TOKENMINT_ROLE: ethers.keccak256(ethers.toUtf8Bytes("TOKENMINT_ROLE")),
  CLEARPATH_USER_ROLE: ethers.keccak256(ethers.toUtf8Bytes("CLEARPATH_USER_ROLE")),
  OPERATIONS_ADMIN_ROLE: ethers.keccak256(ethers.toUtf8Bytes("OPERATIONS_ADMIN_ROLE")),
  NULLIFIER_ADMIN_ROLE: ethers.keccak256(ethers.toUtf8Bytes("NULLIFIER_ADMIN_ROLE")),
};

/**
 * Get role hash by name
 * @param {string} roleName - Role name (e.g., "MARKET_MAKER" or "MARKET_MAKER_ROLE")
 * @returns {string} Role hash
 */
function getRoleHash(roleName) {
  // Normalize role name
  let normalized = roleName.toUpperCase();
  if (!normalized.endsWith("_ROLE")) {
    normalized += "_ROLE";
  }

  const hash = ROLE_HASHES[normalized];
  if (!hash) {
    throw new Error(`Unknown role: ${roleName}`);
  }
  return hash;
}

// =============================================================================
// MEMBERSHIP TIERS
// =============================================================================

const MembershipTier = {
  NONE: 0,
  BRONZE: 1,
  SILVER: 2,
  GOLD: 3,
  PLATINUM: 4,
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Print all loaded addresses (for debugging)
 */
function printAddresses() {
  console.log("\n=== Loaded Contract Addresses ===");
  console.log(`Network: ${hre.network.name}\n`);

  const categories = {
    "Core Contracts": ["roleManagerCore", "welfareRegistry", "proposalRegistry", "marketFactory", "oracleResolver"],
    "RBAC Contracts": ["tieredRoleManager", "tierRegistry", "usageTracker", "membershipManager", "paymentProcessor"],
    "Market Contracts": ["ctf1155", "friendGroupMarketFactory"],
    "Perpetual Futures": ["fundingRateEngine", "perpFactory"],
    "Registry Contracts": ["marketCorrelationRegistry", "nullifierRegistry"],
    "Tokens": ["USC", "WETC"],
  };

  for (const [category, names] of Object.entries(categories)) {
    console.log(`${category}:`);
    for (const name of names) {
      const addr = ADDRESSES[name];
      if (addr) {
        console.log(`  ${name.padEnd(28)} ${addr}`);
      }
    }
    console.log();
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  // Address getters
  getAddress,
  getAddresses,
  requireAddress,
  printAddresses,

  // Raw addresses object
  ADDRESSES,

  // Role utilities
  ROLE_HASHES,
  getRoleHash,

  // Tier enum
  MembershipTier,

  // For compatibility
  MORDOR_ADDRESSES,
};
