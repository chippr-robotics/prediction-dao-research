#!/usr/bin/env node
/**
 * fix-market-factory-rolemanager.js
 *
 * Sets the roleManager on ConditionalMarketFactory through FutarchyGovernor.
 *
 * Usage:
 *   npx hardhat run scripts/admin/fix-market-factory-rolemanager.js --network mordor
 */

const hre = require("hardhat");
const { ethers } = require("hardhat");

async function main() {
  console.log("=".repeat(60));
  console.log("Fix ConditionalMarketFactory roleManager");
  console.log("=".repeat(60));

  const network = await ethers.provider.getNetwork();
  console.log(`\nNetwork: ${hre.network.name} (Chain ID: ${network.chainId})`);

  const [signer] = await ethers.getSigners();
  console.log("Signer:", signer.address);

  // Contract addresses
  const ADDRESSES = {
    futarchyGovernor: "0x0292a5bdf60E851c043bDceE378D505801A6aEef",
    marketFactory: "0x75e81ba01f3aBC160381f3b2b3c59acB2E1800F7",
    tieredRoleManager: "0x55e6346Be542B13462De504FCC379a2477D227f0",
  };

  console.log("\n--- Checking ownership chain ---");

  // Load contracts
  const FutarchyGovernor = await ethers.getContractFactory("FutarchyGovernor");
  const futarchyGovernor = FutarchyGovernor.attach(ADDRESSES.futarchyGovernor);

  const ConditionalMarketFactory = await ethers.getContractFactory("ConditionalMarketFactory");
  const marketFactory = ConditionalMarketFactory.attach(ADDRESSES.marketFactory);

  // Check owners
  const govOwner = await futarchyGovernor.owner();
  console.log("FutarchyGovernor.owner():", govOwner);
  console.log("  Is signer the owner?", govOwner.toLowerCase() === signer.address.toLowerCase() ? "YES" : "NO");

  const factoryOwner = await marketFactory.owner();
  console.log("ConditionalMarketFactory.owner():", factoryOwner);
  console.log("  Is FutarchyGovernor the owner?", factoryOwner.toLowerCase() === ADDRESSES.futarchyGovernor.toLowerCase() ? "YES" : "NO");

  // Check current roleManager
  const currentRoleManager = await marketFactory.roleManager();
  console.log("\nConditionalMarketFactory.roleManager():", currentRoleManager);

  if (currentRoleManager !== ethers.ZeroAddress) {
    console.log("✓ roleManager is already set. No action needed.");
    return;
  }

  console.log("\n⚠️  roleManager is ZeroAddress - needs to be set!");

  // Check if we can set it
  if (govOwner.toLowerCase() !== signer.address.toLowerCase()) {
    console.log("\n❌ Signer is NOT the owner of FutarchyGovernor.");
    console.log("   Cannot directly set roleManager on ConditionalMarketFactory.");
    console.log("\n   Options:");
    console.log("   1. Have the FutarchyGovernor owner call setRoleManager on marketFactory");
    console.log("   2. Transfer ownership of ConditionalMarketFactory to the deployer");
    console.log("   3. Use a governance proposal to set the roleManager");
    return;
  }

  // If we are the FutarchyGovernor owner, we need to check if FutarchyGovernor
  // has a function to call setRoleManager on the marketFactory.
  // Looking at the contract, FutarchyGovernor doesn't have a direct admin function
  // for this. But since we own FutarchyGovernor and FutarchyGovernor owns marketFactory,
  // we might be able to transfer ownership.

  console.log("\n--- Attempting to fix roleManager ---");

  // Check if FutarchyGovernor.marketFactory matches our target
  const govMarketFactory = await futarchyGovernor.marketFactory();
  console.log("FutarchyGovernor.marketFactory():", govMarketFactory);

  if (govMarketFactory.toLowerCase() !== ADDRESSES.marketFactory.toLowerCase()) {
    console.log("⚠️  FutarchyGovernor has a different marketFactory configured!");
  }

  // Since ConditionalMarketFactory is owned by FutarchyGovernor,
  // and FutarchyGovernor doesn't expose setRoleManager for its child contracts,
  // we need to either:
  // 1. Add such a function to FutarchyGovernor (requires redeployment)
  // 2. Transfer ownership of ConditionalMarketFactory back to deployer (if possible)

  // Let's check if ConditionalMarketFactory has transferOwnership
  console.log("\nAttempting to transfer ConditionalMarketFactory ownership...");

  // This will only work if we can call through FutarchyGovernor
  // or if there's some admin bypass. Let's try calling directly first.

  try {
    // Try calling setRoleManager directly - this will fail if we're not the owner
    console.log("Trying direct setRoleManager call (will fail if not owner)...");
    const tx = await marketFactory.setRoleManager(ADDRESSES.tieredRoleManager);
    await tx.wait();
    console.log("✓ setRoleManager succeeded!");
  } catch (directError) {
    console.log("Direct call failed (expected):", directError.message?.split('\n')[0]);

    // Try to find if there's an admin call mechanism
    console.log("\nChecking for alternative approaches...");

    // The real solution would be to have an admin function in FutarchyGovernor
    // that can configure its child contracts. Since that doesn't exist,
    // the safest approach is to redeploy with proper ownership.

    console.log("\n" + "=".repeat(60));
    console.log("SOLUTION REQUIRED");
    console.log("=".repeat(60));
    console.log(`
The ConditionalMarketFactory's roleManager is not set, and the deployer
cannot set it because ownership was transferred to FutarchyGovernor.

To fix this, you have two options:

1. RECOMMENDED: Redeploy ConditionalMarketFactory with proper configuration
   - Update 01-deploy-core.js to set roleManager during initialization
   - Or keep ownership with deployer until configuration is complete

2. ALTERNATIVE: Add an admin function to FutarchyGovernor
   - Add a function like configureMarketFactory(address roleManager)
   - Redeploy FutarchyGovernor with this function

For now, as a workaround, you can check if ConditionalMarketFactory
has any initialization that accepts deployer calls, or if it has
a guardian/admin role that can be used.
`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
