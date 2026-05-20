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
  const chainId = hre.network.config.chainId || 80002;
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
// MERGED ADDRESSES
// =============================================================================

/**
 * Build the contract address map for the active network by stitching together
 * the per-stage deployment files (core, rbac, markets, registries, perpetual
 * futures, tokens). All values come from the on-disk deployment artifacts —
 * there are no committed network-specific fallbacks.
 */
function getMergedAddresses() {
  const addresses = {};

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
    "Tokens": ["USDC", "WMATIC"],
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

};
