/**
 * deploy-zk-key-manager.js - ZKKeyManager Deployment
 *
 * Deploys the ZKKeyManager contract for on-chain encryption key management.
 * This enables P2P wager encryption without shared secrets — users register
 * their public keys on-chain so opponents can encrypt wager details for them.
 *
 * Prerequisites:
 *   - Deployer account with ETH for gas
 *
 * Usage:
 *   npx hardhat run scripts/deploy/deploy-zk-key-manager.js --network localhost
 *   npx hardhat run scripts/deploy/deploy-zk-key-manager.js --network mordor
 */

const hre = require("hardhat");
const { ethers } = require("hardhat");

const {
  deployDeterministic,
  ensureSingletonFactory,
  saveDeployment,
  getDeploymentFilename,
  generateSalt,
  verifyOnBlockscout,
} = require("./lib/helpers");

const SALT_PREFIX = "ClearPathDAO-ZKKeyMgr-v1.1-";

async function main() {
  console.log("=".repeat(60));
  console.log("ZKKeyManager Deployment");
  console.log("=".repeat(60));

  const network = await ethers.provider.getNetwork();
  console.log(`\nNetwork: ${hre.network.name} (Chain ID: ${network.chainId})`);

  await ensureSingletonFactory();

  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer signer available");
  }
  console.log("\nDeployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  const deployments = {};

  // =========================================================================
  // Deploy ZKKeyManager
  // =========================================================================
  console.log("\n\n--- Deploying ZKKeyManager ---");

  const zkKeyManager = await deployDeterministic(
    "ZKKeyManager",
    [deployer.address],
    generateSalt(SALT_PREFIX + "ZKKeyManager"),
    deployer
  );
  deployments.zkKeyManager = zkKeyManager.address;

  // Grant ADMIN_ROLE to deployer (constructor already grants DEFAULT_ADMIN_ROLE)
  const ADMIN_ROLE = await zkKeyManager.contract.ADMIN_ROLE();
  const hasAdmin = await zkKeyManager.contract.hasRole(ADMIN_ROLE, deployer.address);
  if (!hasAdmin) {
    console.log("  Granting ADMIN_ROLE to deployer...");
    const tx = await zkKeyManager.contract.grantRole(ADMIN_ROLE, deployer.address);
    await tx.wait();
    console.log("  ADMIN_ROLE granted.");
  } else {
    console.log("  Deployer already has ADMIN_ROLE.");
  }

  // =========================================================================
  // Summary
  // =========================================================================
  console.log("\n" + "=".repeat(60));
  console.log("DEPLOYMENT SUMMARY");
  console.log("=".repeat(60));
  console.log(`\n  ZKKeyManager: ${deployments.zkKeyManager}`);

  // Save deployment
  const filename = getDeploymentFilename(network, "zk-key-manager-deployment");
  saveDeployment(filename, {
    network: hre.network.name,
    chainId: Number(network.chainId),
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: deployments,
  });

  console.log(`\nDeployment saved to: ${filename}`);

  // Verify on Blockscout if on Mordor
  if (hre.network.name === "mordor") {
    console.log("\n--- Verifying on Blockscout ---");
    await verifyOnBlockscout({
      name: "ZKKeyManager",
      address: deployments.zkKeyManager,
      constructorArguments: [deployer.address]
    });
  }

  console.log("\n" + "=".repeat(60));
  console.log("IMPORTANT: Update frontend/src/config/contracts.js with:");
  console.log(`  zkKeyManager: '${deployments.zkKeyManager}'`);
  console.log("=".repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
