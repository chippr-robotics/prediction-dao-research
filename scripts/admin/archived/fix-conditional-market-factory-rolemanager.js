const hre = require("hardhat");
const { ethers } = require("hardhat");

/**
 * Fix ConditionalMarketFactory RoleManager Address
 *
 * This script updates the roleManager address in the ConditionalMarketFactory
 * to point to the correct TieredRoleManager contract.
 *
 * Problem: The factory's roleManager() was returning 0x3759B1F153193471Dd48401eE198F664f2d7FeB8
 * which is an old/incorrect address. It should be 0xA6F794292488C628f91A0475dDF8dE6cEF2706EF.
 *
 * Run with: npx hardhat run scripts/fix-conditional-market-factory-rolemanager.js --network mordor
 */

const CONTRACTS = {
  conditionalMarketFactory: "0x37b9086Cc0d03C8a1030cC50256593B8D0d369Ac",
  tieredRoleManager: "0xA6F794292488C628f91A0475dDF8dE6cEF2706EF"
};

async function main() {
  console.log("=".repeat(60));
  console.log("Fix ConditionalMarketFactory RoleManager Address");
  console.log("=".repeat(60));

  const network = await ethers.provider.getNetwork();
  console.log(`\nNetwork: ${hre.network.name} (Chain ID: ${network.chainId})`);

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETC");

  // Load ConditionalMarketFactory
  console.log("\nLoading ConditionalMarketFactory...");
  const factory = await ethers.getContractAt(
    "ConditionalMarketFactory",
    CONTRACTS.conditionalMarketFactory
  );

  // Check current roleManager
  const currentRoleManager = await factory.roleManager();
  console.log("Current roleManager:", currentRoleManager);
  console.log("Target roleManager:", CONTRACTS.tieredRoleManager);

  if (currentRoleManager.toLowerCase() === CONTRACTS.tieredRoleManager.toLowerCase()) {
    console.log("\n✓ RoleManager already set to correct address. No action needed.");
    return;
  }

  // Check ownership
  const owner = await factory.owner();
  console.log("\nFactory owner:", owner);
  console.log("Deployer:", deployer.address);

  if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
    throw new Error(`Not authorized. Factory owner is ${owner}, but deployer is ${deployer.address}`);
  }

  // Update roleManager
  console.log("\nUpdating roleManager...");
  const tx = await factory.setRoleManager(CONTRACTS.tieredRoleManager);
  console.log("Transaction hash:", tx.hash);

  const receipt = await tx.wait();
  console.log("Transaction confirmed in block:", receipt.blockNumber);
  console.log("Gas used:", receipt.gasUsed.toString());

  // Verify the update
  const newRoleManager = await factory.roleManager();
  console.log("\nNew roleManager:", newRoleManager);

  if (newRoleManager.toLowerCase() === CONTRACTS.tieredRoleManager.toLowerCase()) {
    console.log("✓ RoleManager successfully updated!");
  } else {
    throw new Error("RoleManager update failed - address mismatch");
  }

  console.log("\n" + "=".repeat(60));
  console.log("Summary");
  console.log("=".repeat(60));
  console.log("ConditionalMarketFactory:", CONTRACTS.conditionalMarketFactory);
  console.log("Old RoleManager:", currentRoleManager);
  console.log("New RoleManager:", newRoleManager);
  console.log("Transaction:", tx.hash);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
