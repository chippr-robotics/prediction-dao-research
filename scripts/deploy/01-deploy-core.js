/**
 * 01-deploy-core.js - Core Contract Deployment
 *
 * Deploys the core FairWins DAO contracts deterministically using Safe Singleton Factory.
 *
 * Contracts deployed:
 * - RoleManagerCore (lightweight RBAC)
 * - WelfareMetricRegistry
 * - ProposalRegistry
 * - ConditionalMarketFactory
 * - PrivacyCoordinator
 * - OracleResolver
 * - RagequitModule
 * - FutarchyGovernor
 * - TokenMintFactory
 * - DAOFactory
 *
 * Usage:
 *   npx hardhat run scripts/deploy/01-deploy-core.js --network localhost
 *   npx hardhat run scripts/deploy/01-deploy-core.js --network mordor
 *
 * Environment variables:
 *   VERIFY=true|false      - Enable Blockscout verification (default: true)
 *   VERIFY_RETRIES=6       - Verification retry count
 *   VERIFY_DELAY_MS=20000  - Delay between retries
 *   INIT=true|false        - Auto-initialize contracts (default: true)
 */

const hre = require("hardhat");
const { ethers } = require("hardhat");

const {
  SINGLETON_FACTORY_ADDRESS,
  SALT_PREFIXES,
  MAINNET_CHAIN_IDS,
} = require("./lib/constants");

const {
  generateSalt,
  deployDeterministic,
  ensureSingletonFactory,
  tryInitialize,
  trySetRoleManager,
  safeTransferOwnership,
  verifyOnBlockscout,
  saveDeployment,
  getDeploymentFilename,
} = require("./lib/helpers");

async function main() {
  console.log("=".repeat(60));
  console.log("01 - Core Contract Deployment");
  console.log("=".repeat(60));

  // Verify network
  const network = await ethers.provider.getNetwork();
  console.log(`\nNetwork: ${hre.network.name} (Chain ID: ${network.chainId})`);

  // Security check: Prevent mainnet deployment
  if (MAINNET_CHAIN_IDS.includes(Number(network.chainId))) {
    console.error("\n❌ MAINNET DEPLOYMENT BLOCKED");
    console.error("This script uses placeholder addresses for governance token and treasury.");
    console.error("Update the script before deploying to mainnet.");
    throw new Error("Mainnet deployment requires manual configuration");
  }

  // Ensure factory is available
  await ensureSingletonFactory();

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error(`No deployer signer available for network '${hre.network.name}'`);
  }
  console.log("\nDeployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  const saltPrefix = SALT_PREFIXES.CORE;
  const deployments = {};

  // =========================================================================
  // Deploy contracts
  // =========================================================================

  // 1. RoleManagerCore (lightweight RBAC)
  console.log("\n--- Deploying RoleManagerCore ---");
  const roleManagerCore = await deployDeterministic(
    "RoleManagerCore",
    [],
    generateSalt(saltPrefix + "RoleManagerCore"),
    deployer
  );
  deployments.roleManagerCore = roleManagerCore.address;
  await tryInitialize("RoleManagerCore", roleManagerCore.contract, deployer);

  // 2. WelfareMetricRegistry
  console.log("\n--- Deploying WelfareMetricRegistry ---");
  const welfareRegistry = await deployDeterministic(
    "WelfareMetricRegistry",
    [],
    generateSalt(saltPrefix + "WelfareMetricRegistry"),
    deployer
  );
  deployments.welfareRegistry = welfareRegistry.address;
  await tryInitialize("WelfareMetricRegistry", welfareRegistry.contract, deployer);

  // 3. ProposalRegistry
  console.log("\n--- Deploying ProposalRegistry ---");
  const proposalRegistry = await deployDeterministic(
    "ProposalRegistry",
    [],
    generateSalt(saltPrefix + "ProposalRegistry"),
    deployer
  );
  deployments.proposalRegistry = proposalRegistry.address;
  await tryInitialize("ProposalRegistry", proposalRegistry.contract, deployer);

  // 4. ConditionalMarketFactory
  console.log("\n--- Deploying ConditionalMarketFactory ---");
  const marketFactory = await deployDeterministic(
    "ConditionalMarketFactory",
    [],
    generateSalt(saltPrefix + "ConditionalMarketFactory"),
    deployer
  );
  deployments.marketFactory = marketFactory.address;
  await tryInitialize("ConditionalMarketFactory", marketFactory.contract, deployer);

  // 5. PrivacyCoordinator
  console.log("\n--- Deploying PrivacyCoordinator ---");
  const privacyCoordinator = await deployDeterministic(
    "PrivacyCoordinator",
    [],
    generateSalt(saltPrefix + "PrivacyCoordinator"),
    deployer
  );
  deployments.privacyCoordinator = privacyCoordinator.address;
  await tryInitialize("PrivacyCoordinator", privacyCoordinator.contract, deployer);

  // 6. OracleResolver
  console.log("\n--- Deploying OracleResolver ---");
  const oracleResolver = await deployDeterministic(
    "OracleResolver",
    [],
    generateSalt(saltPrefix + "OracleResolver"),
    deployer
  );
  deployments.oracleResolver = oracleResolver.address;
  await tryInitialize("OracleResolver", oracleResolver.contract, deployer);

  // 7. RagequitModule (uses initialize pattern)
  console.log("\n--- Deploying RagequitModule ---");
  // Note: Using placeholder addresses for development
  const PLACEHOLDER_TOKEN = "0xec6Ed68627749b9C244a25A6d0bAC8962043fdcB";
  const PLACEHOLDER_TREASURY = "0x93F7ee39C02d99289E3c29696f1F3a70656d0772";

  const ragequitModule = await deployDeterministic(
    "RagequitModule",
    [],
    generateSalt(saltPrefix + "RagequitModule"),
    deployer
  );
  deployments.ragequitModule = ragequitModule.address;

  if (!ragequitModule.alreadyDeployed) {
    console.log("  Initializing RagequitModule...");
    try {
      const tx = await ragequitModule.contract.initialize(
        deployer.address,
        PLACEHOLDER_TOKEN,
        PLACEHOLDER_TREASURY
      );
      await tx.wait();
      console.log("  ✓ RagequitModule initialized");
    } catch (error) {
      console.warn(`  ⚠️  Initialize skipped: ${error.message?.split("\n")[0]}`);
    }
  }
  await trySetRoleManager("RagequitModule", ragequitModule.contract, roleManagerCore.address);

  // 8. FutarchyGovernor (uses initialize pattern)
  console.log("\n--- Deploying FutarchyGovernor ---");
  const futarchyGovernor = await deployDeterministic(
    "FutarchyGovernor",
    [],
    generateSalt(saltPrefix + "FutarchyGovernor"),
    deployer
  );
  deployments.futarchyGovernor = futarchyGovernor.address;

  if (!futarchyGovernor.alreadyDeployed) {
    console.log("  Initializing FutarchyGovernor...");
    try {
      const tx = await futarchyGovernor.contract.initialize(
        deployer.address,
        welfareRegistry.address,
        proposalRegistry.address,
        marketFactory.address,
        privacyCoordinator.address,
        oracleResolver.address,
        ragequitModule.address,
        PLACEHOLDER_TREASURY
      );
      await tx.wait();
      console.log("  ✓ FutarchyGovernor initialized");
    } catch (error) {
      console.warn(`  ⚠️  Initialize skipped: ${error.message?.split("\n")[0]}`);
    }
  }
  await trySetRoleManager("FutarchyGovernor", futarchyGovernor.contract, roleManagerCore.address);

  // 9. TokenMintFactory
  console.log("\n--- Deploying TokenMintFactory ---");
  const tokenMintFactory = await deployDeterministic(
    "TokenMintFactory",
    [roleManagerCore.address],
    generateSalt(saltPrefix + "TokenMintFactory"),
    deployer
  );
  deployments.tokenMintFactory = tokenMintFactory.address;

  // 10. DAOFactory
  console.log("\n--- Deploying DAOFactory ---");
  const daoFactory = await deployDeterministic(
    "DAOFactory",
    [
      welfareRegistry.address,
      proposalRegistry.address,
      marketFactory.address,
      privacyCoordinator.address,
      oracleResolver.address,
      ragequitModule.address,
      futarchyGovernor.address,
    ],
    generateSalt(saltPrefix + "DAOFactory"),
    deployer
  );
  deployments.daoFactory = daoFactory.address;

  // =========================================================================
  // Transfer ownership (only for newly deployed contracts)
  // =========================================================================
  console.log("\n\n--- Configuring Ownership ---");

  if (!welfareRegistry.alreadyDeployed) {
    await safeTransferOwnership("WelfareMetricRegistry", welfareRegistry.contract, deployer.address, futarchyGovernor.address);
  }
  if (!proposalRegistry.alreadyDeployed) {
    await safeTransferOwnership("ProposalRegistry", proposalRegistry.contract, deployer.address, futarchyGovernor.address);
  }
  if (!marketFactory.alreadyDeployed) {
    await safeTransferOwnership("ConditionalMarketFactory", marketFactory.contract, deployer.address, futarchyGovernor.address);
  }
  if (!oracleResolver.alreadyDeployed) {
    await safeTransferOwnership("OracleResolver", oracleResolver.contract, deployer.address, futarchyGovernor.address);
  }
  if (!ragequitModule.alreadyDeployed) {
    await safeTransferOwnership("RagequitModule", ragequitModule.contract, deployer.address, futarchyGovernor.address);
  }

  console.log("  PrivacyCoordinator coordinator remains as deployer");

  // =========================================================================
  // Verify contracts on Blockscout
  // =========================================================================
  console.log("\n\n--- Verifying Contracts ---");

  const verificationTargets = [
    { name: "RoleManagerCore", address: roleManagerCore.address, constructorArguments: [] },
    { name: "WelfareMetricRegistry", address: welfareRegistry.address, constructorArguments: [] },
    { name: "ProposalRegistry", address: proposalRegistry.address, constructorArguments: [] },
    { name: "ConditionalMarketFactory", address: marketFactory.address, constructorArguments: [] },
    { name: "PrivacyCoordinator", address: privacyCoordinator.address, constructorArguments: [] },
    { name: "OracleResolver", address: oracleResolver.address, constructorArguments: [] },
    { name: "RagequitModule", address: ragequitModule.address, constructorArguments: [] },
    { name: "FutarchyGovernor", address: futarchyGovernor.address, constructorArguments: [] },
    { name: "TokenMintFactory", address: tokenMintFactory.address, constructorArguments: [roleManagerCore.address] },
    {
      name: "DAOFactory",
      address: daoFactory.address,
      constructorArguments: [
        welfareRegistry.address,
        proposalRegistry.address,
        marketFactory.address,
        privacyCoordinator.address,
        oracleResolver.address,
        ragequitModule.address,
        futarchyGovernor.address,
      ]
    },
  ];

  const verificationFailures = [];
  for (const target of verificationTargets) {
    console.log(`Verifying ${target.name}...`);
    const result = await verifyOnBlockscout(target);
    if (result?.status === "failed") {
      verificationFailures.push({ ...target, error: result.error });
    }
  }

  if (verificationFailures.length > 0) {
    console.log("\n⚠️  Some verifications failed (can retry later):");
    for (const f of verificationFailures) {
      console.log(`  - ${f.name}: ${f.error}`);
    }
  }

  // =========================================================================
  // Summary
  // =========================================================================
  console.log("\n\n" + "=".repeat(60));
  console.log("Deployment Summary");
  console.log("=".repeat(60));
  console.log(`\nNetwork: ${hre.network.name} (Chain ID: ${network.chainId})`);
  console.log(`Safe Singleton Factory: ${SINGLETON_FACTORY_ADDRESS}`);
  console.log(`Salt Prefix: ${saltPrefix}`);
  console.log("\nDeployed Contracts:");
  console.log("─".repeat(50));
  Object.entries(deployments).forEach(([name, address]) => {
    console.log(`  ${name.padEnd(25)} ${address}`);
  });

  // Save deployment
  const deploymentInfo = {
    network: hre.network.name,
    chainId: Number(network.chainId),
    deployer: deployer.address,
    factoryAddress: SINGLETON_FACTORY_ADDRESS,
    saltPrefix,
    contracts: deployments,
    timestamp: new Date().toISOString()
  };

  saveDeployment(getDeploymentFilename(network, "core-deployment"), deploymentInfo);

  console.log("\n✓ Core deployment completed!");
  console.log("\nNext steps:");
  console.log("  1. Run 02-deploy-rbac.js for modular RBAC system");
  console.log("  2. Run 03-deploy-markets.js for market factories");
  console.log("  3. Run 04-deploy-registries.js for additional registries");

  return deploymentInfo;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
