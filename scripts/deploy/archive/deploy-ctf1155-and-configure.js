/**
 * Deploy CTF1155 and Configure ConditionalMarketFactory
 *
 * This script:
 * 1. Deploys the CTF1155 (ERC-1155 Conditional Token Framework) contract
 * 2. Configures the ConditionalMarketFactory with:
 *    - setRoleManager(roleManagerAddress)
 *    - setCTF1155(ctf1155Address)
 *
 * Run with: npx hardhat run scripts/deploy-ctf1155-and-configure.js --network mordor
 */

const hre = require("hardhat");

// Deployed contract addresses from mordor-chain63-deterministic-deployment.json
const DEPLOYED_CONTRACTS = {
  tieredRoleManager: '0x3759B1F153193471Dd48401eE198F664f2d7FeB8',
  marketFactory: '0x37b9086Cc0d03C8a1030cC50256593B8D0d369Ac'
};

async function main() {
  console.log("=".repeat(60));
  console.log("CTF1155 Deployment and ConditionalMarketFactory Configuration");
  console.log("=".repeat(60));
  console.log();

  // Get deployer account
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer account:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETC");
  console.log();

  // Step 1: Deploy CTF1155
  console.log("Step 1: Deploying CTF1155...");
  const CTF1155 = await hre.ethers.getContractFactory("CTF1155");
  const ctf1155 = await CTF1155.deploy();
  await ctf1155.waitForDeployment();
  const ctf1155Address = await ctf1155.getAddress();
  console.log("CTF1155 deployed to:", ctf1155Address);
  console.log();

  // Step 2: Get ConditionalMarketFactory contract
  console.log("Step 2: Connecting to ConditionalMarketFactory...");
  const marketFactoryAddress = DEPLOYED_CONTRACTS.marketFactory;
  const marketFactory = await hre.ethers.getContractAt(
    "ConditionalMarketFactory",
    marketFactoryAddress
  );

  // Check current owner
  const owner = await marketFactory.owner();
  console.log("MarketFactory owner:", owner);
  console.log("Deployer is owner:", owner.toLowerCase() === deployer.address.toLowerCase());

  if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
    console.error("\nERROR: Deployer is not the owner of ConditionalMarketFactory!");
    console.error("The owner address", owner, "must run this script.");
    process.exit(1);
  }
  console.log();

  // Step 3: Configure RoleManager on MarketFactory (if not already set)
  console.log("Step 3: Configuring RoleManager on MarketFactory...");
  const currentRoleManager = await marketFactory.roleManager();
  console.log("Current roleManager:", currentRoleManager);

  if (currentRoleManager === hre.ethers.ZeroAddress) {
    console.log("Setting roleManager to:", DEPLOYED_CONTRACTS.tieredRoleManager);
    const setRoleManagerTx = await marketFactory.setRoleManager(DEPLOYED_CONTRACTS.tieredRoleManager);
    await setRoleManagerTx.wait();
    console.log("RoleManager configured successfully!");
  } else {
    console.log("RoleManager already set, skipping...");
  }
  console.log();

  // Step 4: Configure CTF1155 on MarketFactory (if not already set)
  console.log("Step 4: Configuring CTF1155 on MarketFactory...");
  const currentCTF1155 = await marketFactory.ctf1155();
  console.log("Current ctf1155:", currentCTF1155);

  if (currentCTF1155 === hre.ethers.ZeroAddress) {
    console.log("Setting ctf1155 to:", ctf1155Address);
    const setCTF1155Tx = await marketFactory.setCTF1155(ctf1155Address);
    await setCTF1155Tx.wait();
    console.log("CTF1155 configured successfully!");
  } else {
    console.log("CTF1155 already set, skipping...");
  }
  console.log();

  // Summary
  console.log("=".repeat(60));
  console.log("Deployment Summary");
  console.log("=".repeat(60));
  console.log("CTF1155 Address:", ctf1155Address);
  console.log("MarketFactory Address:", marketFactoryAddress);
  console.log("RoleManager Address:", DEPLOYED_CONTRACTS.tieredRoleManager);
  console.log();
  console.log("ConditionalMarketFactory is now configured for market creation!");
  console.log();
  console.log("Next steps:");
  console.log("1. Update frontend/src/config/contracts.js with CTF1155 address");
  console.log("2. Grant MARKET_MAKER_ROLE to users who should be able to create markets");
  console.log("   Example: roleManager.grantRole(MARKET_MAKER_ROLE, userAddress)");
  console.log();

  // Return addresses for programmatic use
  return {
    ctf1155: ctf1155Address,
    marketFactory: marketFactoryAddress,
    roleManager: DEPLOYED_CONTRACTS.tieredRoleManager
  };
}

main()
  .then((addresses) => {
    console.log("Script completed successfully!");
    console.log("Deployed addresses:", JSON.stringify(addresses, null, 2));
    process.exit(0);
  })
  .catch((error) => {
    console.error("Script failed!");
    console.error(error);
    process.exit(1);
  });
