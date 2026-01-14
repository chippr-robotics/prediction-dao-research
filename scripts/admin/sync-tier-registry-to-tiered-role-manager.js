const hre = require("hardhat");
const { ethers } = require("hardhat");

/**
 * Sync user roles from TierRegistry (modular RBAC) to TieredRoleManager
 *
 * The modular RBAC system (TierRegistry + PaymentProcessor) and the standalone
 * TieredRoleManager are separate systems. FriendGroupMarketFactory checks
 * TieredRoleManager, but purchases go through TierRegistry.
 *
 * This script syncs a user's role/tier from TierRegistry to TieredRoleManager.
 *
 * Usage:
 *   USER_ADDRESS=0x... npx hardhat run scripts/sync-tier-registry-to-tiered-role-manager.js --network mordor
 *
 * Or to sync a specific role:
 *   USER_ADDRESS=0x... ROLE=FRIEND_MARKET_ROLE npx hardhat run scripts/sync-tier-registry-to-tiered-role-manager.js --network mordor
 */

const CONTRACTS = {
  tierRegistry: '0x4eb93BaF14f668F8f67922121A3b9FC3FB5b8A0d',
  tieredRoleManager: '0xA6F794292488C628f91A0475dDF8dE6cEF2706EF',
};

// Role hashes
const ROLES = {
  MARKET_MAKER_ROLE: ethers.keccak256(ethers.toUtf8Bytes("MARKET_MAKER_ROLE")),
  CLEARPATH_USER: ethers.keccak256(ethers.toUtf8Bytes("CLEARPATH_USER")),
  TOKENMINT: ethers.keccak256(ethers.toUtf8Bytes("TOKENMINT")),
  FRIEND_MARKET_ROLE: ethers.keccak256(ethers.toUtf8Bytes("FRIEND_MARKET_ROLE")),
};

// Tier names for display
const TIER_NAMES = ['NONE', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM'];

// Default membership duration in days
const DEFAULT_DURATION_DAYS = 30;

async function main() {
  console.log("=".repeat(60));
  console.log("Sync TierRegistry -> TieredRoleManager");
  console.log("=".repeat(60));

  // Get user address from environment
  const userAddress = process.env.USER_ADDRESS;
  if (!userAddress) {
    console.error("ERROR: USER_ADDRESS environment variable not set");
    console.log("Usage: USER_ADDRESS=0x... npx hardhat run scripts/sync-tier-registry-to-tiered-role-manager.js --network mordor");
    process.exit(1);
  }

  // Get role from environment (default to FRIEND_MARKET_ROLE)
  const roleName = process.env.ROLE || 'FRIEND_MARKET_ROLE';
  const roleHash = ROLES[roleName];
  if (!roleHash) {
    console.error(`ERROR: Unknown role: ${roleName}`);
    console.log("Valid roles:", Object.keys(ROLES).join(", "));
    process.exit(1);
  }

  // Get duration from environment (default 30 days)
  const durationDays = parseInt(process.env.DURATION_DAYS || DEFAULT_DURATION_DAYS);

  console.log("\nConfiguration:");
  console.log("  User Address:", userAddress);
  console.log("  Role:", roleName);
  console.log("  Role Hash:", roleHash);
  console.log("  Duration:", durationDays, "days");

  const signers = await ethers.getSigners();
  const deployer = signers[0];
  console.log("  Executing as:", deployer.address);

  // Connect to contracts
  const tierRegistry = await ethers.getContractAt("TierRegistry", CONTRACTS.tierRegistry);
  const tieredRoleManager = await ethers.getContractAt("TieredRoleManager", CONTRACTS.tieredRoleManager);

  // Read user's tier from TierRegistry
  console.log("\n--- Reading from TierRegistry ---");
  const tierRegistryTier = await tierRegistry.getUserTier(userAddress, roleHash);
  const tierRegistryTierNum = Number(tierRegistryTier);
  console.log("  User tier in TierRegistry:", tierRegistryTierNum, `(${TIER_NAMES[tierRegistryTierNum]})`);

  if (tierRegistryTierNum === 0) {
    console.log("\nUser has no tier in TierRegistry for this role. Nothing to sync.");
    process.exit(0);
  }

  // Check user's current state in TieredRoleManager
  console.log("\n--- Reading from TieredRoleManager ---");
  const hasRoleInTRM = await tieredRoleManager.hasRole(roleHash, userAddress);
  const trmTier = await tieredRoleManager.getUserTier(userAddress, roleHash);
  const trmTierNum = Number(trmTier);
  const membershipActive = await tieredRoleManager.isMembershipActive(userAddress, roleHash);

  console.log("  Has role in TieredRoleManager:", hasRoleInTRM);
  console.log("  Current tier in TieredRoleManager:", trmTierNum, `(${TIER_NAMES[trmTierNum]})`);
  console.log("  Membership active:", membershipActive);

  if (hasRoleInTRM && trmTierNum === tierRegistryTierNum && membershipActive) {
    console.log("\nUser already has the same tier in TieredRoleManager. No sync needed.");
    process.exit(0);
  }

  // Grant tier in TieredRoleManager
  console.log("\n--- Syncing to TieredRoleManager ---");
  console.log(`  Granting ${TIER_NAMES[tierRegistryTierNum]} tier for ${roleName}...`);

  // Check if deployer has admin role
  const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
  const hasAdmin = await tieredRoleManager.hasRole(DEFAULT_ADMIN_ROLE, deployer.address);
  if (!hasAdmin) {
    console.error("\nERROR: Deployer does not have DEFAULT_ADMIN_ROLE on TieredRoleManager");
    console.log("Admin address needed to grant tiers");
    process.exit(1);
  }

  try {
    const tx = await tieredRoleManager.grantTier(
      userAddress,
      roleHash,
      tierRegistryTierNum,  // MembershipTier enum value
      durationDays
    );
    console.log("  Transaction sent:", tx.hash);

    const receipt = await tx.wait();
    console.log("  Transaction confirmed in block:", receipt.blockNumber);

    // Verify the sync
    console.log("\n--- Verification ---");
    const newHasRole = await tieredRoleManager.hasRole(roleHash, userAddress);
    const newTier = await tieredRoleManager.getUserTier(userAddress, roleHash);
    const newMembershipActive = await tieredRoleManager.isMembershipActive(userAddress, roleHash);

    console.log("  Has role in TieredRoleManager:", newHasRole);
    console.log("  Tier in TieredRoleManager:", Number(newTier), `(${TIER_NAMES[Number(newTier)]})`);
    console.log("  Membership active:", newMembershipActive);

    if (newHasRole && Number(newTier) === tierRegistryTierNum && newMembershipActive) {
      console.log("\n✅ Sync successful! User can now create friend markets.");
    } else {
      console.log("\n⚠️ Sync completed but verification shows unexpected state.");
    }

  } catch (error) {
    console.error("\nERROR during sync:", error.message);
    if (error.data) {
      console.error("Error data:", error.data);
    }
    process.exit(1);
  }

  console.log("\n" + "=".repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
