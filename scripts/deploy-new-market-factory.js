const hre = require("hardhat");
const { ethers } = require("hardhat");

/**
 * Deploy NEW ConditionalMarketFactory with updated code
 *
 * The old factory (0x37b9086Cc0d03C8a1030cC50256593B8D0d369Ac) has a restriction
 * that prevents updating the roleManager once set. The new contract allows
 * roleManager updates, enabling migration to the modular RoleManagerCore.
 *
 * Run with: npx hardhat run scripts/deploy-new-market-factory.js --network mordor
 */

// Existing deployed contracts
const DEPLOYED_CONTRACTS = {
  ctf1155: '0xE56d9034591C6A6A5C023883354FAeB435E3b441',
  // Use the NEWER RoleManagerCore that has checkMarketCreationLimitFor function
  // Old: '0x888332df7621EC341131d85e2228f00407777dD7' - does NOT have checkMarketCreationLimitFor
  roleManagerCore: '0x4BBEB3695d513Be15881977E89104315Ee85b5e5',
  // Old factory (for reference): '0x37b9086Cc0d03C8a1030cC50256593B8D0d369Ac'
};

async function main() {
  console.log("=".repeat(60));
  console.log("Deploy NEW ConditionalMarketFactory");
  console.log("=".repeat(60));
  console.log();

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    console.error("No deployer signer available. Make sure PRIVATE_KEY is set.");
    process.exit(1);
  }
  console.log("Deployer account:", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETC");
  console.log();

  // Step 1: Deploy new ConditionalMarketFactory
  console.log("Step 1: Deploying NEW ConditionalMarketFactory...");
  const ConditionalMarketFactory = await ethers.getContractFactory("ConditionalMarketFactory");
  const newFactory = await ConditionalMarketFactory.deploy();
  await newFactory.waitForDeployment();
  const newFactoryAddress = await newFactory.getAddress();
  console.log("New ConditionalMarketFactory deployed to:", newFactoryAddress);
  console.log();

  // Step 2: Initialize the factory
  console.log("Step 2: Initializing factory...");
  try {
    const initTx = await newFactory.initialize(deployer.address);
    await initTx.wait();
    console.log("Factory initialized with owner:", deployer.address);
  } catch (error) {
    if (error.message.includes("Already initialized")) {
      console.log("Factory already initialized, continuing...");
    } else {
      throw error;
    }
  }
  console.log();

  // Step 3: Set CTF1155
  console.log("Step 3: Setting CTF1155...");
  const setCTFTx = await newFactory.setCTF1155(DEPLOYED_CONTRACTS.ctf1155);
  await setCTFTx.wait();
  console.log("CTF1155 set to:", DEPLOYED_CONTRACTS.ctf1155);
  console.log();

  // Step 4: Set RoleManagerCore
  console.log("Step 4: Setting RoleManagerCore...");
  const setRoleTx = await newFactory.setRoleManager(DEPLOYED_CONTRACTS.roleManagerCore);
  await setRoleTx.wait();
  console.log("RoleManagerCore set to:", DEPLOYED_CONTRACTS.roleManagerCore);
  console.log();

  // Verify configuration
  console.log("Step 5: Verifying configuration...");
  const owner = await newFactory.owner();
  const ctf1155 = await newFactory.ctf1155();
  const roleManager = await newFactory.roleManager();

  console.log("  Owner:", owner);
  console.log("  CTF1155:", ctf1155);
  console.log("  RoleManager:", roleManager);
  console.log();

  // Summary
  console.log("=".repeat(60));
  console.log("Deployment Summary");
  console.log("=".repeat(60));
  console.log();
  console.log("NEW ConditionalMarketFactory:", newFactoryAddress);
  console.log("  - CTF1155:", DEPLOYED_CONTRACTS.ctf1155);
  console.log("  - RoleManagerCore:", DEPLOYED_CONTRACTS.roleManagerCore);
  console.log("  - Owner:", deployer.address);
  console.log();
  console.log("OLD Factory (deprecated):", "0x37b9086Cc0d03C8a1030cC50256593B8D0d369Ac");
  console.log();
  console.log("=".repeat(60));
  console.log("NEXT STEPS");
  console.log("=".repeat(60));
  console.log();
  console.log("1. Update frontend/src/config/contracts.js:");
  console.log(`   marketFactory: '${newFactoryAddress}'`);
  console.log();
  console.log("2. Users with MARKET_MAKER_ROLE on RoleManagerCore can now create markets!");
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
    newMarketFactory: newFactoryAddress,
    ctf1155: DEPLOYED_CONTRACTS.ctf1155,
    roleManagerCore: DEPLOYED_CONTRACTS.roleManagerCore,
    oldMarketFactory: "0x37b9086Cc0d03C8a1030cC50256593B8D0d369Ac",
    timestamp: new Date().toISOString()
  };

  const outPath = path.join(deploymentsDir, `${hre.network.name}-new-market-factory.json`);
  fs.writeFileSync(outPath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`Deployment info saved to: ${outPath}`);

  return {
    newMarketFactory: newFactoryAddress,
    ctf1155: DEPLOYED_CONTRACTS.ctf1155,
    roleManagerCore: DEPLOYED_CONTRACTS.roleManagerCore
  };
}

main()
  .then((addresses) => {
    console.log("\nDeployment completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nDeployment failed!");
    console.error(error);
    process.exit(1);
  });
