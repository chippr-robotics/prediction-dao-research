const { ethers } = require("hardhat");

/**
 * Grant MARKET_MAKER_ROLE to user wallet
 *
 * Run this from the admin floppy disk to grant MARKET_MAKER_ROLE
 * to the user wallet, allowing it to create public prediction markets.
 *
 * Usage:
 *   # Mount admin floppy disk
 *   export FLOPPY_KEYSTORE_PASSWORD="password"
 *   npx hardhat run scripts/admin/grant-market-maker-to-user.js --network mordor
 */

const CONTRACTS = {
  tieredRoleManager: "0xA6F794292488C628f91A0475dDF8dE6cEF2706EF",
  conditionalMarketFactory: "0xd6F4a7059Ed5E1dc7fC8123768C5BC0fbc54A93a",
};

// User wallet to grant role to
const USER_WALLET = "0x0e3542b4C6963d408F1CB02F3AD3A680E06cc0B2";

// Tier values
const MembershipTier = {
  NONE: 0,
  BRONZE: 1,
  SILVER: 2,
  GOLD: 3,
  PLATINUM: 4,
};

async function main() {
  console.log("=".repeat(60));
  console.log("Grant MARKET_MAKER_ROLE to User Wallet");
  console.log("=".repeat(60));

  const [signer] = await ethers.getSigners();
  console.log("\nAdmin address:", signer.address);
  console.log("Target user:", USER_WALLET);

  // Connect to TieredRoleManager
  const tieredRoleManager = await ethers.getContractAt(
    "TieredRoleManager",
    CONTRACTS.tieredRoleManager
  );

  // Verify signer is admin
  const adminRole = await tieredRoleManager.DEFAULT_ADMIN_ROLE();
  const isAdmin = await tieredRoleManager.hasRole(adminRole, signer.address);
  console.log("\nSigner is admin:", isAdmin);

  if (!isAdmin) {
    console.error("\nError: Signer is not admin on TieredRoleManager");
    console.log("Expected admin:", "0x52502d049571C7893447b86c4d8B38e6184bF6e1");
    console.log("Make sure you're using the admin floppy disk");
    process.exit(1);
  }

  // Get MARKET_MAKER_ROLE
  const marketMakerRole = await tieredRoleManager.MARKET_MAKER_ROLE();
  console.log("MARKET_MAKER_ROLE:", marketMakerRole);

  // Check current status
  const hasRole = await tieredRoleManager.hasRole(marketMakerRole, USER_WALLET);
  console.log("User already has role:", hasRole);

  if (hasRole) {
    console.log("\nUser already has MARKET_MAKER_ROLE!");
    console.log("No action needed.");
    return;
  }

  // Grant PLATINUM tier for 100 years
  console.log("\n--- Granting MARKET_MAKER_ROLE ---");
  console.log("Tier: PLATINUM (unlimited markets)");
  console.log("Duration: 100 years");

  const duration = 100 * 365 * 24 * 60 * 60; // 100 years

  try {
    const tx = await tieredRoleManager.grantTier(
      USER_WALLET,
      marketMakerRole,
      MembershipTier.PLATINUM,
      duration
    );
    console.log("Tx:", tx.hash);
    await tx.wait();
    console.log("Confirmed!");

    // Verify
    const hasRoleNow = await tieredRoleManager.hasRole(marketMakerRole, USER_WALLET);
    console.log("\nVerification - hasRole:", hasRoleNow);

    if (hasRoleNow) {
      console.log("\nSUCCESS: MARKET_MAKER_ROLE granted to", USER_WALLET);
      console.log("\nUser can now create public prediction markets!");
      console.log("Next steps:");
      console.log("  1. Switch back to user floppy disk");
      console.log("  2. Run: npx hardhat run scripts/operations/create-divisional-public-markets.js --network mordor");
    } else {
      console.log("\nFAILED: Role was not granted");
    }
  } catch (err) {
    console.error("\nError:", err.message);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
