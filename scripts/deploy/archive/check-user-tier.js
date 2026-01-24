const { ethers } = require('hardhat');

/**
 * Check a user's tier in both TierRegistry and TieredRoleManager
 */

const TIER_REGISTRY = '0x4eb93BaF14f668F8f67922121A3b9FC3FB5b8A0d';
const TIERED_ROLE_MANAGER = '0xA6F794292488C628f91A0475dDF8dE6cEF2706EF';

const TOKENMINT_ROLE = ethers.keccak256(ethers.toUtf8Bytes("TOKENMINT_ROLE"));

// Set this to the tester's address
const USER_ADDRESS = process.argv[2] || process.env.USER_ADDRESS || '';

async function main() {
  if (!USER_ADDRESS) {
    console.log("Usage: npx hardhat run scripts/deploy/check-user-tier.js --network mordor -- <user_address>");
    console.log("Or set USER_ADDRESS env var");
    return;
  }

  console.log("=".repeat(70));
  console.log("Checking User Tier for:", USER_ADDRESS);
  console.log("=".repeat(70));

  // 1. Check TierRegistry
  console.log("\n1. TierRegistry (0x4eb93...):");
  const tierRegistry = await ethers.getContractAt(
    ['function getUserTier(address, bytes32) view returns (uint8)'],
    TIER_REGISTRY
  );

  try {
    const tier = await tierRegistry.getUserTier(USER_ADDRESS, TOKENMINT_ROLE);
    console.log("   TOKENMINT tier:", tier, tierName(tier));
  } catch (e) {
    console.log("   Error:", e.message);
  }

  // 2. Check TieredRoleManager
  console.log("\n2. TieredRoleManager (0xA6F79...):");
  const tieredRoleManager = await ethers.getContractAt(
    [
      'function userTiers(address, bytes32) view returns (uint8)',
      'function hasRole(bytes32, address) view returns (bool)',
      'function getUserTier(address, bytes32) view returns (uint8)',
    ],
    TIERED_ROLE_MANAGER
  );

  try {
    const tier = await tieredRoleManager.getUserTier(USER_ADDRESS, TOKENMINT_ROLE);
    console.log("   TOKENMINT tier (getUserTier):", tier, tierName(tier));
  } catch (e) {
    console.log("   Error (getUserTier):", e.message);
  }

  try {
    const tier = await tieredRoleManager.userTiers(USER_ADDRESS, TOKENMINT_ROLE);
    console.log("   TOKENMINT tier (userTiers mapping):", tier, tierName(tier));
  } catch (e) {
    console.log("   Error (userTiers):", e.message);
  }

  try {
    const hasRole = await tieredRoleManager.hasRole(TOKENMINT_ROLE, USER_ADDRESS);
    console.log("   Has TOKENMINT_ROLE:", hasRole);
  } catch (e) {
    console.log("   Error (hasRole):", e.message);
  }

  console.log("\n" + "=".repeat(70));
}

function tierName(tier) {
  const names = ['NONE', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM'];
  return `(${names[tier] || 'UNKNOWN'})`;
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
