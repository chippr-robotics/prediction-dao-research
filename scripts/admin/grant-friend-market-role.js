const { ethers } = require("hardhat");

/**
 * Grant FRIEND_MARKET_ROLE to a user on TieredRoleManager
 *
 * Usage:
 *   FLOPPY_KEYSTORE_PASSWORD=password npx hardhat run scripts/admin/grant-friend-market-role.js --network mordor
 */

const CONTRACTS = {
  tieredRoleManager: '0xA6F794292488C628f91A0475dDF8dE6cEF2706EF',
};

// User to grant role to
const USER_ADDRESS = '0x52502d049571C7893447b86c4d8B38e6184bF6e1';

// Tier values
const MembershipTier = {
  NONE: 0,
  BRONZE: 1,
  SILVER: 2,
  GOLD: 3,
  PLATINUM: 4
};

async function main() {
  console.log("=".repeat(60));
  console.log("Grant FRIEND_MARKET_ROLE to User");
  console.log("=".repeat(60));

  const [signer] = await ethers.getSigners();
  console.log("Signer address:", signer.address);
  console.log("User address:", USER_ADDRESS);

  // Connect to TieredRoleManager
  const tieredRoleManager = await ethers.getContractAt(
    "TieredRoleManager",
    CONTRACTS.tieredRoleManager
  );

  // Get role hash
  const friendMarketRole = await tieredRoleManager.FRIEND_MARKET_ROLE();
  console.log("\nFRIEND_MARKET_ROLE hash:", friendMarketRole);

  // Check current role status
  const hasRole = await tieredRoleManager.hasRole(friendMarketRole, USER_ADDRESS);
  console.log("Current hasRole:", hasRole);

  if (hasRole) {
    // Check tier
    const tier = await tieredRoleManager.getUserTier(USER_ADDRESS, friendMarketRole);
    console.log("Current tier:", tier);
    console.log("\nUser already has FRIEND_MARKET_ROLE!");

    // Check if membership is active
    const isActive = await tieredRoleManager.isMembershipActive(USER_ADDRESS, friendMarketRole);
    console.log("Membership active:", isActive);

    if (!isActive) {
      console.log("Membership expired, will re-grant...");
    } else {
      console.log("No action needed.");
      return;
    }
  }

  // Check if signer has admin role
  const adminRole = await tieredRoleManager.DEFAULT_ADMIN_ROLE();
  const isAdmin = await tieredRoleManager.hasRole(adminRole, signer.address);
  console.log("\nSigner is admin:", isAdmin);

  if (!isAdmin) {
    console.error("\nERROR: Signer does not have admin role on TieredRoleManager");
    console.log("Please use an admin account to run this script.");
    process.exit(1);
  }

  // Grant role using grantTier with BRONZE tier (matching TierRegistry)
  console.log("\n--- Granting FRIEND_MARKET_ROLE ---");
  console.log("Using tier: BRONZE (1)");
  console.log("Duration: 1 year");

  try {
    // Use 1 year duration
    const oneYearDuration = 365 * 24 * 60 * 60;

    const tx = await tieredRoleManager.grantTier(
      USER_ADDRESS,
      friendMarketRole,
      MembershipTier.BRONZE,
      oneYearDuration
    );
    console.log("Transaction hash:", tx.hash);

    const receipt = await tx.wait();
    console.log("Transaction confirmed in block:", receipt.blockNumber);

    // Verify the role was granted
    const hasRoleNow = await tieredRoleManager.hasRole(friendMarketRole, USER_ADDRESS);
    console.log("\nVerification - hasRole after grant:", hasRoleNow);

    if (hasRoleNow) {
      console.log("\n SUCCESS: FRIEND_MARKET_ROLE granted!");
      console.log("User can now create friend markets.");
    } else {
      console.log("\n FAILED: Role was not granted. Please check contract state.");
    }

  } catch (error) {
    console.error("\nError granting role:", error.message);
    if (error.reason) {
      console.error("Revert reason:", error.reason);
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
