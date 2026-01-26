#!/usr/bin/env node
/**
 * fix-deploy-new-market-factory.js
 *
 * Deploys a new ConditionalMarketFactory with proper roleManager configuration,
 * then updates FriendGroupMarketFactory to use it.
 *
 * This fixes the issue where the old ConditionalMarketFactory's roleManager was
 * never set (ownership was transferred to FutarchyGovernor before configuration).
 *
 * Usage:
 *   npx hardhat run scripts/admin/fix-deploy-new-market-factory.js --network mordor
 */

const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("=".repeat(60));
  console.log("Deploy New ConditionalMarketFactory with Proper Configuration");
  console.log("=".repeat(60));

  const network = await ethers.provider.getNetwork();
  console.log(`\nNetwork: ${hre.network.name} (Chain ID: ${network.chainId})`);

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "ETC");

  // Current contract addresses
  const ADDRESSES = {
    // RBAC
    tieredRoleManager: "0x55e6346Be542B13462De504FCC379a2477D227f0",
    // Markets
    friendGroupMarketFactory: "0x0E118DEf0946f0e7F1BEAAA385c6c37CAc6acfa7",
    ctf1155: "0xc7b69289c70f4b2f8FA860eEdE976E1501207DD9",
    // Old (broken) market factory
    oldMarketFactory: "0x75e81ba01f3aBC160381f3b2b3c59acB2E1800F7",
    // Governance (will be new owner after configuration)
    futarchyGovernor: "0x0292a5bdf60E851c043bDceE378D505801A6aEef",
  };

  // Role hashes
  const MARKET_MAKER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MARKET_MAKER"));

  console.log("\n--- Current State ---");
  console.log("TieredRoleManager:", ADDRESSES.tieredRoleManager);
  console.log("FriendGroupMarketFactory:", ADDRESSES.friendGroupMarketFactory);
  console.log("CTF1155:", ADDRESSES.ctf1155);
  console.log("Old MarketFactory:", ADDRESSES.oldMarketFactory);

  // Step 1: Deploy new ConditionalMarketFactory
  console.log("\n\n--- Step 1: Deploy New ConditionalMarketFactory ---");

  const ConditionalMarketFactory = await ethers.getContractFactory("ConditionalMarketFactory");
  const newMarketFactory = await ConditionalMarketFactory.deploy();
  await newMarketFactory.waitForDeployment();
  const newMarketFactoryAddress = await newMarketFactory.getAddress();
  console.log("New ConditionalMarketFactory deployed at:", newMarketFactoryAddress);

  // Step 2: Initialize the new market factory
  console.log("\n\n--- Step 2: Initialize New MarketFactory ---");

  try {
    const initTx = await newMarketFactory.initializeCTF1155(ADDRESSES.ctf1155);
    await initTx.wait();
    console.log("✓ CTF1155 initialized");
  } catch (e) {
    console.log("CTF1155 initialization skipped:", e.message?.split('\n')[0]);
  }

  // Step 3: Set roleManager BEFORE transferring ownership
  console.log("\n\n--- Step 3: Set roleManager on New MarketFactory ---");

  const setRMTx = await newMarketFactory.setRoleManager(ADDRESSES.tieredRoleManager);
  await setRMTx.wait();
  console.log("✓ roleManager set to:", ADDRESSES.tieredRoleManager);

  // Verify
  const verifyRM = await newMarketFactory.roleManager();
  console.log("Verification - roleManager():", verifyRM);

  // Step 4: Grant MARKET_MAKER_ROLE to FriendGroupMarketFactory on TieredRoleManager
  console.log("\n\n--- Step 4: Verify/Grant MARKET_MAKER_ROLE to FriendGroupMarketFactory ---");

  const TieredRoleManager = await ethers.getContractFactory("TieredRoleManager");
  const tieredRoleManager = TieredRoleManager.attach(ADDRESSES.tieredRoleManager);

  const hasRole = await tieredRoleManager.hasRole(MARKET_MAKER_ROLE, ADDRESSES.friendGroupMarketFactory);
  if (hasRole) {
    console.log("✓ FriendGroupMarketFactory already has MARKET_MAKER_ROLE");
  } else {
    console.log("Granting MARKET_MAKER_ROLE to FriendGroupMarketFactory...");
    const PLATINUM = 4;
    const DURATION_DAYS = 36500; // 100 years
    const grantTx = await tieredRoleManager.grantTier(
      ADDRESSES.friendGroupMarketFactory,
      MARKET_MAKER_ROLE,
      PLATINUM,
      DURATION_DAYS
    );
    await grantTx.wait();
    console.log("✓ MARKET_MAKER_ROLE granted");
  }

  // Step 5: Update FriendGroupMarketFactory to use new marketFactory
  console.log("\n\n--- Step 5: Update FriendGroupMarketFactory ---");

  const FriendGroupMarketFactory = await ethers.getContractFactory("FriendGroupMarketFactory");
  const friendGroupMarketFactory = FriendGroupMarketFactory.attach(ADDRESSES.friendGroupMarketFactory);

  const currentMF = await friendGroupMarketFactory.marketFactory();
  console.log("Current marketFactory:", currentMF);

  const updateTx = await friendGroupMarketFactory.updateMarketFactory(newMarketFactoryAddress);
  await updateTx.wait();
  console.log("✓ FriendGroupMarketFactory updated to use new marketFactory");

  const newMF = await friendGroupMarketFactory.marketFactory();
  console.log("New marketFactory reference:", newMF);

  // Step 6: Transfer ownership to FutarchyGovernor (optional - keeping with deployer for now)
  console.log("\n\n--- Step 6: Ownership Transfer (Optional) ---");
  console.log("Keeping ownership with deployer for now.");
  console.log("To transfer to FutarchyGovernor later, call:");
  console.log(`  newMarketFactory.transferOwnership("${ADDRESSES.futarchyGovernor}")`);

  // Step 7: Update deployment files
  console.log("\n\n--- Step 7: Update Deployment Files ---");

  const deploymentsDir = path.join(__dirname, "..", "..", "deployments");

  // Update mordor-chain63-deterministic-deployment.json
  const deterministicPath = path.join(deploymentsDir, "mordor-chain63-deterministic-deployment.json");
  if (fs.existsSync(deterministicPath)) {
    const deployment = JSON.parse(fs.readFileSync(deterministicPath, "utf8"));
    deployment.contracts.marketFactory = newMarketFactoryAddress;
    deployment.contracts.oldMarketFactory = ADDRESSES.oldMarketFactory;
    deployment.timestamp = new Date().toISOString();
    fs.writeFileSync(deterministicPath, JSON.stringify(deployment, null, 2));
    console.log("✓ Updated mordor-chain63-deterministic-deployment.json");
  }

  // Update mordor-chain63-core-deployment.json
  const corePath = path.join(deploymentsDir, "mordor-chain63-core-deployment.json");
  if (fs.existsSync(corePath)) {
    const deployment = JSON.parse(fs.readFileSync(corePath, "utf8"));
    deployment.contracts.marketFactory = newMarketFactoryAddress;
    deployment.contracts.oldMarketFactory = ADDRESSES.oldMarketFactory;
    deployment.timestamp = new Date().toISOString();
    fs.writeFileSync(corePath, JSON.stringify(deployment, null, 2));
    console.log("✓ Updated mordor-chain63-core-deployment.json");
  }

  // Summary
  console.log("\n\n" + "=".repeat(60));
  console.log("Summary");
  console.log("=".repeat(60));
  console.log(`
New ConditionalMarketFactory: ${newMarketFactoryAddress}
Old ConditionalMarketFactory: ${ADDRESSES.oldMarketFactory} (deprecated)

Configuration:
  - roleManager: ${ADDRESSES.tieredRoleManager}
  - CTF1155: ${ADDRESSES.ctf1155}
  - Owner: ${deployer.address} (deployer)

FriendGroupMarketFactory updated to use new marketFactory.

Next steps:
  1. Run 'npm run sync:frontend-contracts' to update frontend
  2. Test friend market acceptance
  3. Optionally transfer new marketFactory ownership to FutarchyGovernor
`);

  return {
    newMarketFactory: newMarketFactoryAddress,
    oldMarketFactory: ADDRESSES.oldMarketFactory,
  };
}

main()
  .then((result) => {
    console.log("\nDeployment successful!");
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
