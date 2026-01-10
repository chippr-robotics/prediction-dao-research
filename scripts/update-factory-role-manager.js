const { ethers } = require("hardhat");

/**
 * Update ConditionalMarketFactory to use new RoleManagerCore
 *
 * This script updates the factory's roleManager from the old TieredRoleManager
 * to the new modular RoleManagerCore.
 *
 * Run with: npx hardhat run scripts/update-factory-role-manager.js --network mordor
 */

const MARKET_FACTORY = '0x37b9086Cc0d03C8a1030cC50256593B8D0d369Ac';
const NEW_ROLE_MANAGER_CORE = '0x888332df7621EC341131d85e2228f00407777dD7';

const FACTORY_ABI = [
  "function setRoleManager(address _roleManager) external",
  "function roleManager() view returns (address)",
  "function owner() view returns (address)"
];

async function main() {
  console.log("=".repeat(60));
  console.log("Update ConditionalMarketFactory Role Manager");
  console.log("=".repeat(60));

  const signers = await ethers.getSigners();
  const deployer = signers[0];
  if (!deployer) {
    console.error("No deployer signer available. Make sure PRIVATE_KEY is set.");
    process.exit(1);
  }
  console.log("\nDeployer:", deployer.address);

  const factory = new ethers.Contract(MARKET_FACTORY, FACTORY_ABI, deployer);

  // Check current state
  const owner = await factory.owner();
  const currentRoleManager = await factory.roleManager();

  console.log("\nCurrent state:");
  console.log("  Factory owner:", owner);
  console.log("  Current roleManager:", currentRoleManager);
  console.log("  New RoleManagerCore:", NEW_ROLE_MANAGER_CORE);

  if (owner !== deployer.address) {
    console.error("\n❌ Deployer is not the factory owner. Cannot update.");
    process.exit(1);
  }

  if (currentRoleManager === NEW_ROLE_MANAGER_CORE) {
    console.log("\n✅ Factory already using new RoleManagerCore!");
    return;
  }

  // Update role manager
  console.log("\nUpdating roleManager...");
  const tx = await factory.setRoleManager(NEW_ROLE_MANAGER_CORE);
  console.log("  Transaction:", tx.hash);
  await tx.wait();
  console.log("  ✅ Transaction confirmed");

  // Verify
  const newRoleManager = await factory.roleManager();
  console.log("\nVerification:");
  console.log("  New roleManager:", newRoleManager);

  if (newRoleManager === NEW_ROLE_MANAGER_CORE) {
    console.log("\n✅ Successfully updated! Factory now uses RoleManagerCore.");
    console.log("\nUsers with MARKET_MAKER_ROLE on RoleManagerCore can now create markets.");
  } else {
    console.error("\n❌ Update failed - roleManager doesn't match expected value");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
