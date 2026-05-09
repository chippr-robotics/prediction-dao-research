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
  POLYMARKET_CTF,
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
  // Deploy OracleRegistry + PolymarketOracleAdapter (only on chains where
  // Polymarket has a CTF deployment we can read from)
  // =========================================================================
  const networkName = hre.network.name;
  const polymarketCTF = POLYMARKET_CTF[networkName];

  if (polymarketCTF) {
    console.log("\n\n--- Deploying OracleRegistry ---");
    const oracleRegistry = await deployDeterministic(
      "OracleRegistry",
      [deployer.address],
      generateSalt(saltPrefix + "OracleRegistry-v1"),
      deployer
    );
    deployments.oracleRegistry = oracleRegistry.address;

    console.log("\n\n--- Deploying PolymarketOracleAdapter ---");
    console.log(`  Polymarket CTF (${networkName}): ${polymarketCTF}`);
    const polymarketAdapter = await deployDeterministic(
      "PolymarketOracleAdapter",
      [polymarketCTF],
      generateSalt(saltPrefix + "PolymarketAdapter-v1"),
      deployer
    );
    deployments.polymarketOracleAdapter = polymarketAdapter.address;

    // Register the adapter under keccak256("POLYMARKET") so FriendGroupMarketFactory
    // and any oracle-routed code can resolve it through the registry.
    const POLYMARKET_ID = ethers.keccak256(ethers.toUtf8Bytes("POLYMARKET"));
    try {
      const tx = await oracleRegistry.contract.registerAdapter(POLYMARKET_ID, polymarketAdapter.address);
      await tx.wait();
      console.log(`  ✓ PolymarketOracleAdapter registered under keccak256("POLYMARKET")`);
    } catch (error) {
      console.warn(`  ⚠️  Polymarket adapter registration skipped: ${error.message?.split("\n")[0]}`);
    }
  } else {
    console.log(`\n\n--- Skipping Polymarket oracle deploy (no POLYMARKET_CTF for ${networkName}) ---`);
    console.log(`    Set AMOY_POLYMARKET_CTF in your environment to enable Polymarket-pegged settlement.`);
  }

  // =========================================================================
  // Verify contracts
  // =========================================================================
  console.log("\n\n--- Verifying Contracts ---");

  const verificationTargets = [
    { name: "MarketCorrelationRegistry", address: correlationRegistry.address, constructorArguments: [] },
    { name: "NullifierRegistry", address: nullifierRegistry.address, constructorArguments: [] },
  ];
  if (deployments.oracleRegistry) {
    verificationTargets.push({
      name: "OracleRegistry",
      address: deployments.oracleRegistry,
      constructorArguments: [deployer.address],
    });
  }
  if (deployments.polymarketOracleAdapter) {
    verificationTargets.push({
      name: "PolymarketOracleAdapter",
      address: deployments.polymarketOracleAdapter,
      constructorArguments: [polymarketCTF],
    });
  }

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
