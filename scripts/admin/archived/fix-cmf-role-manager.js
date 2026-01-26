const { ethers } = require("hardhat");

/**
 * Fix ConditionalMarketFactory roleManager configuration
 *
 * The ConditionalMarketFactory is currently pointing to TieredRoleManager,
 * but purchases go through PaymentProcessor → TierRegistry.
 *
 * This script updates the factory to use TierRegistryAdapter which bridges
 * TierRegistry to the IRoleManager interface.
 *
 * Run with admin floppy disk:
 *   export FLOPPY_KEYSTORE_PASSWORD="password"
 *   npx hardhat run scripts/admin/fix-cmf-role-manager.js --network mordor
 */

const CONTRACTS = {
  conditionalMarketFactory: "0xd6F4a7059Ed5E1dc7fC8123768C5BC0fbc54A93a",
  tierRegistryAdapter: "0x8e3A4C65a6C22d88515FD356cB00732adac4f4d7",
  tieredRoleManager: "0xA6F794292488C628f91A0475dDF8dE6cEF2706EF",
};

async function main() {
  console.log("=".repeat(60));
  console.log("Fix ConditionalMarketFactory RoleManager Configuration");
  console.log("=".repeat(60));

  const [signer] = await ethers.getSigners();
  console.log("\nAdmin address:", signer.address);

  const cmf = await ethers.getContractAt(
    "ConditionalMarketFactory",
    CONTRACTS.conditionalMarketFactory
  );

  // Check current state
  const owner = await cmf.owner();
  const currentRM = await cmf.roleManager();

  console.log("\nConditionalMarketFactory:", CONTRACTS.conditionalMarketFactory);
  console.log("  Owner:", owner);
  console.log("  Current roleManager:", currentRM);

  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    console.error("\nError: Signer is not the factory owner");
    console.log("Expected:", owner);
    console.log("Use the admin floppy disk");
    process.exit(1);
  }

  if (currentRM.toLowerCase() === CONTRACTS.tierRegistryAdapter.toLowerCase()) {
    console.log("\nRoleManager already set to TierRegistryAdapter!");
    console.log("No action needed.");
    return;
  }

  // Update roleManager
  console.log("\n--- Updating roleManager ---");
  console.log("From:", currentRM);
  console.log("To:", CONTRACTS.tierRegistryAdapter);

  const tx = await cmf.setRoleManager(CONTRACTS.tierRegistryAdapter);
  console.log("Tx:", tx.hash);
  await tx.wait();
  console.log("Confirmed!");

  // Verify
  const newRM = await cmf.roleManager();
  console.log("\nNew roleManager:", newRM);

  if (newRM.toLowerCase() === CONTRACTS.tierRegistryAdapter.toLowerCase()) {
    console.log("\nSUCCESS: RoleManager updated to TierRegistryAdapter!");
    console.log("\nUsers who purchased MARKET_MAKER_ROLE can now create public markets.");
  } else {
    console.log("\nERROR: RoleManager not updated correctly");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
