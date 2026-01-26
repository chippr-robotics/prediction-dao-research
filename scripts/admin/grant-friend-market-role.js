const { ethers } = require("hardhat");
const { requireAddress, MembershipTier, getRoleHash } = require("./lib/addresses");

/**
 * Grant FRIEND_MARKET_ROLE to a user on TieredRoleManager
 *
 * Usage:
 *   USER=0x123... npx hardhat run scripts/admin/grant-friend-market-role.js --network mordor
 *   USER=0x123... TIER=SILVER npx hardhat run scripts/admin/grant-friend-market-role.js --network mordor
 */

async function main() {
  // Get user address from environment
  const userAddress = process.env.USER;
  if (!userAddress || !ethers.isAddress(userAddress)) {
    console.error("Error: Valid USER address required");
    console.log("\nUsage:");
    console.log("  USER=0x123... npx hardhat run scripts/admin/grant-friend-market-role.js --network mordor");
    process.exit(1);
  }

  // Get tier from environment or default to BRONZE
  const tierName = (process.env.TIER || "BRONZE").toUpperCase();
  const tier = MembershipTier[tierName];
  if (tier === undefined) {
    console.error(`Error: Invalid tier '${tierName}'`);
    console.log("Valid tiers: NONE, BRONZE, SILVER, GOLD, PLATINUM");
    process.exit(1);
  }

  console.log("=".repeat(60));
  console.log("Grant FRIEND_MARKET_ROLE to User");
  console.log("=".repeat(60));

  const network = await ethers.provider.getNetwork();
  console.log(`\nNetwork: ${network.name || "unknown"} (Chain ID: ${network.chainId})`);

  const [signer] = await ethers.getSigners();
  console.log("Signer address:", signer.address);
  console.log("User address:", userAddress);
  console.log("Tier:", tierName);

  // Get contract address from shared config
  const tieredRoleManagerAddress = requireAddress("tieredRoleManager");
  console.log("\nTieredRoleManager:", tieredRoleManagerAddress);

  // Connect to TieredRoleManager
  const tieredRoleManager = await ethers.getContractAt(
    "TieredRoleManager",
    tieredRoleManagerAddress
  );

  // Get role hash
  const friendMarketRole = getRoleHash("FRIEND_MARKET");
  console.log("\nFRIEND_MARKET_ROLE hash:", friendMarketRole);

  // Check current role status
  const hasRole = await tieredRoleManager.hasRole(friendMarketRole, userAddress);
  console.log("Current hasRole:", hasRole);

  if (hasRole) {
    // Check tier
    try {
      const currentTier = await tieredRoleManager.getUserTier(userAddress, friendMarketRole);
      console.log("Current tier:", currentTier);

      // Check if membership is active
      const isActive = await tieredRoleManager.isMembershipActive(userAddress, friendMarketRole);
      console.log("Membership active:", isActive);

      if (isActive) {
        console.log("\nUser already has active FRIEND_MARKET_ROLE!");
        console.log("No action needed.");
        return;
      }
      console.log("Membership expired, will re-grant...");
    } catch (e) {
      // Some contracts may not have these functions
    }
  }

  // Check if signer has admin role
  const adminRole = ethers.ZeroHash;
  const isAdmin = await tieredRoleManager.hasRole(adminRole, signer.address);
  console.log("\nSigner is admin:", isAdmin);

  if (!isAdmin) {
    console.error("\nERROR: Signer does not have admin role on TieredRoleManager");
    console.log("Please use an admin account to run this script.");
    process.exit(1);
  }

  // Grant role using grantTier
  console.log("\n--- Granting FRIEND_MARKET_ROLE ---");
  console.log(`Using tier: ${tierName} (${tier})`);
  console.log("Duration: 1 year");

  try {
    // Use 1 year duration
    const oneYearDuration = 365 * 24 * 60 * 60;

    const tx = await tieredRoleManager.grantTier(
      userAddress,
      friendMarketRole,
      tier,
      oneYearDuration
    );
    console.log("Transaction hash:", tx.hash);

    const receipt = await tx.wait();
    console.log("Transaction confirmed in block:", receipt.blockNumber);

    // Verify the role was granted
    const hasRoleNow = await tieredRoleManager.hasRole(friendMarketRole, userAddress);
    console.log("\nVerification - hasRole after grant:", hasRoleNow);

    if (hasRoleNow) {
      console.log("\nSUCCESS: FRIEND_MARKET_ROLE granted!");
      console.log("User can now create friend markets.");
    } else {
      console.log("\nFAILED: Role was not granted. Please check contract state.");
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
