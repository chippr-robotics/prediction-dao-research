/**
 * 04-deploy-registries.js - Additional Registries Deployment
 *
 * Deploys supplementary registry contracts:
 * - MarketCorrelationRegistry
 * - NullifierRegistry
 *
 * Prerequisites:
 *   - Run 01-deploy-core.js first
 *
 * Usage:
 *   npx hardhat run scripts/deploy/04-deploy-registries.js --network localhost
 *   npx hardhat run scripts/deploy/04-deploy-registries.js --network mordor
 */

const hre = require("hardhat");
const { ethers } = require("hardhat");

const {
  SALT_PREFIXES,
} = require("./lib/constants");

const {
  generateSalt,
  deployDeterministic,
  ensureSingletonFactory,
  saveDeployment,
  getDeploymentFilename,
  loadDeployment,
  verifyOnBlockscout,
  tryInitialize,
} = require("./lib/helpers");

async function main() {
  console.log("=".repeat(60));
  console.log("04 - Additional Registries Deployment");
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

  // Load previous deployments for context
  const coreDeployment = loadDeployment(getDeploymentFilename(network, "core-deployment"));
  if (coreDeployment?.contracts) {
    console.log("\nCore deployment found:");
    console.log("  MarketFactory:", coreDeployment.contracts.marketFactory);
  }

  const saltPrefix = SALT_PREFIXES.CORRELATION;
  const deployments = {};

  // =========================================================================
  // Deploy MarketCorrelationRegistry
  // =========================================================================
  console.log("\n\n--- Deploying MarketCorrelationRegistry ---");

  const correlationRegistry = await deployDeterministic(
    "MarketCorrelationRegistry",
    [],
    generateSalt(saltPrefix + "MarketCorrelationRegistry"),
    deployer
  );
  deployments.marketCorrelationRegistry = correlationRegistry.address;
  await tryInitialize("MarketCorrelationRegistry", correlationRegistry.contract, deployer);

  // =========================================================================
  // Deploy NullifierRegistry
  // =========================================================================
  console.log("\n\n--- Deploying NullifierRegistry ---");

  const nullifierRegistry = await deployDeterministic(
    "NullifierRegistry",
    [],
    generateSalt(saltPrefix + "NullifierRegistry"),
    deployer
  );
  deployments.nullifierRegistry = nullifierRegistry.address;
  await tryInitialize("NullifierRegistry", nullifierRegistry.contract, deployer);

  // =========================================================================
  // Verify contracts
  // =========================================================================
  console.log("\n\n--- Verifying Contracts ---");

  const verificationTargets = [
    { name: "MarketCorrelationRegistry", address: correlationRegistry.address, constructorArguments: [] },
    { name: "NullifierRegistry", address: nullifierRegistry.address, constructorArguments: [] },
  ];

  for (const target of verificationTargets) {
    console.log(`Verifying ${target.name}...`);
    await verifyOnBlockscout(target);
  }

  // =========================================================================
  // Summary
  // =========================================================================
  console.log("\n\n" + "=".repeat(60));
  console.log("Registries Deployment Summary");
  console.log("=".repeat(60));
  console.log(`\nNetwork: ${hre.network.name} (Chain ID: ${network.chainId})`);
  console.log("\nDeployed Contracts:");
  console.log("─".repeat(50));
  Object.entries(deployments).forEach(([name, address]) => {
    console.log(`  ${name.padEnd(30)} ${address}`);
  });

  // Save deployment
  const deploymentInfo = {
    network: hre.network.name,
    chainId: Number(network.chainId),
    deployer: deployer.address,
    contracts: deployments,
    timestamp: new Date().toISOString()
  };

  saveDeployment(getDeploymentFilename(network, "registries-deployment"), deploymentInfo);

  console.log("\n✓ Registries deployment completed!");
  console.log("\nNext steps:");
  console.log("  1. Run 05-configure.js for final authorization setup");
  console.log("  2. Run 06-verify.js to verify all contracts are properly wired");

  return deploymentInfo;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
