const hre = require("hardhat");
const { ethers } = require("hardhat");

/**
 * Grant MARKET_MAKER_ROLE to FriendGroupMarketFactory on TieredRoleManager
 *
 * When a friend market activates (enough participants accept), FriendGroupMarketFactory
 * calls ConditionalMarketFactory.deployMarketPair(). The ConditionalMarketFactory checks
 * if msg.sender has MARKET_MAKER_ROLE on its roleManager.
 *
 * This script grants MARKET_MAKER_ROLE to the FriendGroupMarketFactory contract
 * so it can deploy markets when friend markets activate.
 *
 * Usage:
 *   npx hardhat run scripts/grant-factory-market-maker-role.js --network mordor
 */

const CONTRACTS = {
  tieredRoleManager: '0xA6F794292488C628f91A0475dDF8dE6cEF2706EF',
  friendGroupMarketFactory: '0xD9A26537947d99c6961C1013490f0B80d1DFE283',
};

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
  console.log("Grant MARKET_MAKER_ROLE to FriendGroupMarketFactory");
  console.log("=".repeat(60));

  const [signer] = await ethers.getSigners();
  console.log("Signer address:", signer.address);

  // Connect to TieredRoleManager
  const tieredRoleManager = await ethers.getContractAt(
    "TieredRoleManager",
    CONTRACTS.tieredRoleManager
  );
  console.log("TieredRoleManager:", CONTRACTS.tieredRoleManager);
  console.log("FriendGroupMarketFactory:", CONTRACTS.friendGroupMarketFactory);

  // Get role hash
  const marketMakerRole = await tieredRoleManager.MARKET_MAKER_ROLE();
  console.log("\nMARKET_MAKER_ROLE hash:", marketMakerRole);

  // Check current role status
  const hasRole = await tieredRoleManager.hasRole(marketMakerRole, CONTRACTS.friendGroupMarketFactory);
  console.log("Current hasRole:", hasRole);

  if (hasRole) {
    console.log("\nFriendGroupMarketFactory already has MARKET_MAKER_ROLE!");
    console.log("No action needed.");
    return;
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

  // Grant role using grantTier (contracts get PLATINUM tier for unlimited access)
  console.log("\n--- Granting MARKET_MAKER_ROLE to FriendGroupMarketFactory ---");
  console.log("Using tier: PLATINUM (4)");
  console.log("Duration: Indefinite (max uint256)");

  try {
    // Use a very long duration (100 years in seconds)
    const indefiniteDuration = 100 * 365 * 24 * 60 * 60;

    const tx = await tieredRoleManager.grantTier(
      CONTRACTS.friendGroupMarketFactory,
      marketMakerRole,
      MembershipTier.PLATINUM,
      indefiniteDuration
    );
    console.log("Transaction hash:", tx.hash);

    const receipt = await tx.wait();
    console.log("Transaction confirmed in block:", receipt.blockNumber);

    // Verify the role was granted
    const hasRoleNow = await tieredRoleManager.hasRole(marketMakerRole, CONTRACTS.friendGroupMarketFactory);
    console.log("\nVerification - hasRole after grant:", hasRoleNow);

    if (hasRoleNow) {
      console.log("\n✅ SUCCESS: MARKET_MAKER_ROLE granted to FriendGroupMarketFactory!");
      console.log("Friend markets can now activate and deploy underlying markets.");
    } else {
      console.log("\n❌ FAILED: Role was not granted. Please check contract state.");
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
