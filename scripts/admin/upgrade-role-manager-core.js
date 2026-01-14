const hre = require("hardhat");
const { ethers } = require("hardhat");

/**
 * Deploy NEW RoleManagerCore with checkMarketCreationLimitFor function
 *
 * The old RoleManagerCore (0x888332df7621EC341131d85e2228f00407777dD7) doesn't have
 * the checkMarketCreationLimitFor function that ConditionalMarketFactory requires.
 *
 * This script:
 * 1. Deploys new RoleManagerCore with updated code
 * 2. Grants MARKET_MAKER_ROLE to the user who purchased it
 * 3. Updates the factory to use the new RoleManagerCore
 *
 * Run with: npx hardhat run scripts/upgrade-role-manager-core.js --network mordor
 */

// Existing addresses
const NEW_FACTORY = '0x08E5a4B716c06e92525E17495d0995A6F7102414';
const USER_WITH_ROLE = '0xB8594B2d60261C89E49B9D64C7165B2f33fFB90E';

const FACTORY_ABI = [
  "function setRoleManager(address _roleManager) external",
  "function roleManager() view returns (address)",
  "function owner() view returns (address)"
];

async function main() {
  console.log("=".repeat(60));
  console.log("Deploy NEW RoleManagerCore with checkMarketCreationLimitFor");
  console.log("=".repeat(60));
  console.log();

  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    console.error("No deployer signer available. Make sure PRIVATE_KEY is set.");
    process.exit(1);
  }
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETC");
  console.log();

  // Step 1: Deploy new RoleManagerCore
  console.log("Step 1: Deploying NEW RoleManagerCore...");
  const RoleManagerCore = await ethers.getContractFactory("RoleManagerCore");
  const newRoleManagerCore = await RoleManagerCore.deploy();
  await newRoleManagerCore.waitForDeployment();
  const newRoleManagerAddress = await newRoleManagerCore.getAddress();
  console.log("New RoleManagerCore deployed to:", newRoleManagerAddress);
  console.log();

  // Step 2: Initialize (if deployed via constructor, this might already be done)
  console.log("Step 2: Checking initialization...");
  try {
    // Try to call initialize - will fail if already initialized
    const initTx = await newRoleManagerCore.initialize(deployer.address);
    await initTx.wait();
    console.log("RoleManagerCore initialized with admin:", deployer.address);
  } catch (error) {
    if (error.message.includes("Already initialized")) {
      console.log("Already initialized, continuing...");
    } else {
      console.log("Initialize skipped (constructor likely already set admin)");
    }
  }
  console.log();

  // Step 3: Grant MARKET_MAKER_ROLE to the user
  console.log("Step 3: Granting MARKET_MAKER_ROLE to user...");
  const MARKET_MAKER_ROLE = await newRoleManagerCore.MARKET_MAKER_ROLE();
  console.log("MARKET_MAKER_ROLE hash:", MARKET_MAKER_ROLE);

  const grantTx = await newRoleManagerCore.grantRoleByAdmin(MARKET_MAKER_ROLE, USER_WITH_ROLE);
  await grantTx.wait();
  console.log("Granted MARKET_MAKER_ROLE to:", USER_WITH_ROLE);

  // Verify
  const hasRole = await newRoleManagerCore.hasRole(MARKET_MAKER_ROLE, USER_WITH_ROLE);
  console.log("User hasRole verified:", hasRole);
  console.log();

  // Step 4: Verify checkMarketCreationLimitFor works
  console.log("Step 4: Verifying checkMarketCreationLimitFor...");
  try {
    const canCreate = await newRoleManagerCore.checkMarketCreationLimitFor.staticCall(USER_WITH_ROLE, MARKET_MAKER_ROLE);
    console.log("checkMarketCreationLimitFor result:", canCreate);
  } catch (error) {
    console.error("ERROR: checkMarketCreationLimitFor failed:", error.message);
    process.exit(1);
  }
  console.log();

  // Step 5: Update factory to use new RoleManagerCore
  console.log("Step 5: Updating factory's roleManager...");
  const factory = new ethers.Contract(NEW_FACTORY, FACTORY_ABI, deployer);

  const factoryOwner = await factory.owner();
  console.log("Factory owner:", factoryOwner);

  if (factoryOwner.toLowerCase() !== deployer.address.toLowerCase()) {
    console.error("ERROR: Deployer is not factory owner. Cannot update.");
    console.log("Factory owner needs to run this step manually:");
    console.log(`  factory.setRoleManager('${newRoleManagerAddress}')`);
    console.log();
  } else {
    const updateTx = await factory.setRoleManager(newRoleManagerAddress);
    await updateTx.wait();
    console.log("Factory roleManager updated!");

    // Verify
    const newRM = await factory.roleManager();
    console.log("Factory roleManager is now:", newRM);
  }
  console.log();

  // Summary
  console.log("=".repeat(60));
  console.log("Deployment Summary");
  console.log("=".repeat(60));
  console.log();
  console.log("NEW RoleManagerCore:", newRoleManagerAddress);
  console.log("Factory:", NEW_FACTORY);
  console.log("User with MARKET_MAKER_ROLE:", USER_WITH_ROLE);
  console.log();
  console.log("The factory should now be able to create markets!");
  console.log();

  // Save deployment info
  const fs = require("fs");
  const path = require("path");
  const deploymentsDir = path.join(process.cwd(), "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentInfo = {
    network: hre.network.name,
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployer.address,
    newRoleManagerCore: newRoleManagerAddress,
    factory: NEW_FACTORY,
    userWithRole: USER_WITH_ROLE,
    timestamp: new Date().toISOString()
  };

  const outPath = path.join(deploymentsDir, `${hre.network.name}-new-role-manager-core.json`);
  fs.writeFileSync(outPath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`Deployment info saved to: ${outPath}`);

  return deploymentInfo;
}

main()
  .then(() => {
    console.log("\nDeployment completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nDeployment failed!");
    console.error(error);
    process.exit(1);
  });
