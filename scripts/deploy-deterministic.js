const hre = require("hardhat");
const { ethers } = require("hardhat");
const { getSingletonFactoryInfo } = require("@safe-global/safe-singleton-factory");

// Safe Singleton Factory address (same on all EVM networks)
const SINGLETON_FACTORY_ADDRESS = "0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7";

/**
 * Deploy a contract deterministically using Safe Singleton Factory
 * @param {string} contractName - Name of the contract to deploy
 * @param {Array} constructorArgs - Constructor arguments
 * @param {string} salt - Salt for deterministic deployment (32 bytes hex)
 * @param {Object} deployer - Ethers signer
 * @returns {Object} Contract instance and address
 */
async function deployDeterministic(contractName, constructorArgs, salt, deployer) {
  console.log(`\nDeploying ${contractName} deterministically...`);
  
  // Get contract factory
  const ContractFactory = await ethers.getContractFactory(contractName, deployer);
  
  // Get deployment bytecode
  const deploymentData = ContractFactory.getDeployTransaction(...constructorArgs).data;
  
  // Compute deterministic address
  const initCodeHash = ethers.keccak256(deploymentData);
  const deterministicAddress = ethers.getCreate2Address(
    SINGLETON_FACTORY_ADDRESS,
    salt,
    initCodeHash
  );
  
  console.log(`  Predicted address: ${deterministicAddress}`);
  
  // Check if contract is already deployed
  const existingCode = await ethers.provider.getCode(deterministicAddress);
  if (existingCode !== "0x") {
    console.log(`  ✓ Contract already deployed at this address`);
    return {
      address: deterministicAddress,
      contract: ContractFactory.attach(deterministicAddress),
      alreadyDeployed: true
    };
  }
  
  // Connect to the factory
  const factory = await ethers.getContractAt(
    ["function deploy(bytes memory _initCode, bytes32 _salt) public returns (address createdContract)"],
    SINGLETON_FACTORY_ADDRESS,
    deployer
  );
  
  // Deploy using the factory
  console.log(`  Deploying via Safe Singleton Factory...`);
  
  // Estimate gas and add 20% buffer for safety
  let gasLimit;
  try {
    const estimatedGas = await factory.deploy.estimateGas(deploymentData, salt);
    gasLimit = (estimatedGas * 120n) / 100n; // Add 20% buffer
    console.log(`  Estimated gas: ${estimatedGas.toString()} (using ${gasLimit.toString()} with buffer)`);
  } catch (error) {
    // Fallback to conservative default if estimation fails
    gasLimit = 5000000n;
    console.log(`  Gas estimation failed, using default: ${gasLimit.toString()}`);
  }
  
  const tx = await factory.deploy(deploymentData, salt, {
    gasLimit: gasLimit
  });
  
  const receipt = await tx.wait();
  console.log(`  ✓ Deployed in tx: ${receipt.hash}`);
  console.log(`  ✓ Gas used: ${receipt.gasUsed.toString()}`);
  
  // Verify the deployment
  const deployedCode = await ethers.provider.getCode(deterministicAddress);
  if (deployedCode === "0x") {
    throw new Error("Deployment failed - no code at expected address");
  }
  
  return {
    address: deterministicAddress,
    contract: ContractFactory.attach(deterministicAddress),
    alreadyDeployed: false
  };
}

/**
 * Generate a salt from a string
 */
function generateSalt(identifier) {
  return ethers.id(identifier);
}

async function main() {
  console.log("Starting deterministic deployment using Safe Singleton Factory...\n");
  
  // Verify network
  const network = await ethers.provider.getNetwork();
  console.log(`Network: ${network.name} (Chain ID: ${network.chainId})`);
  
  // Security check: Prevent mainnet deployment with placeholder addresses
  const MAINNET_CHAIN_IDS = [1, 61]; // Ethereum Mainnet, Ethereum Classic Mainnet
  const isMainnet = MAINNET_CHAIN_IDS.includes(Number(network.chainId));
  
  if (isMainnet) {
    console.error("\n❌ MAINNET DEPLOYMENT BLOCKED");
    console.error("═".repeat(60));
    console.error("This script uses PLACEHOLDER addresses for:");
    console.error("  - Governance Token");
    console.error("  - Treasury Vault");
    console.error("\nBefore deploying to mainnet, you must:");
    console.error("  1. Update RagequitModule constructor with real token address");
    console.error("  2. Update FutarchyGovernor constructor with real treasury address");
    console.error("  3. Remove this mainnet check after verification");
    console.error("═".repeat(60));
    throw new Error("Mainnet deployment requires manual configuration changes");
  }
  
  // Check if Safe Singleton Factory is available on this network
  const factoryInfo = getSingletonFactoryInfo(Number(network.chainId));
  if (!factoryInfo) {
    console.warn(`⚠️  Warning: Safe Singleton Factory info not found for chain ${network.chainId}`);
    console.warn(`    Factory may still be deployed at ${SINGLETON_FACTORY_ADDRESS}`);
  } else {
    console.log(`✓ Safe Singleton Factory available at: ${factoryInfo.address}`);
  }
  
  // Verify factory is deployed
  const factoryCode = await ethers.provider.getCode(SINGLETON_FACTORY_ADDRESS);
  if (factoryCode === "0x") {
    throw new Error(
      `Safe Singleton Factory not deployed at ${SINGLETON_FACTORY_ADDRESS} on this network.\n` +
      `Please deploy the factory first or use a different deployment method.`
    );
  }
  console.log("✓ Factory contract verified\n");

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");
  console.log();

  // Use a consistent salt prefix for all contracts in this project
  const saltPrefix = "ClearPathDAO-v1.0-";
  
  // Deploy all contracts deterministically
  const deployments = {};

  // 1. Deploy WelfareMetricRegistry
  const welfareRegistry = await deployDeterministic(
    "WelfareMetricRegistry",
    [],
    generateSalt(saltPrefix + "WelfareMetricRegistry"),
    deployer
  );
  deployments.welfareRegistry = welfareRegistry.address;

  // 2. Deploy ProposalRegistry
  const proposalRegistry = await deployDeterministic(
    "ProposalRegistry",
    [],
    generateSalt(saltPrefix + "ProposalRegistry"),
    deployer
  );
  deployments.proposalRegistry = proposalRegistry.address;

  // 3. Deploy ConditionalMarketFactory
  const marketFactory = await deployDeterministic(
    "ConditionalMarketFactory",
    [],
    generateSalt(saltPrefix + "ConditionalMarketFactory"),
    deployer
  );
  deployments.marketFactory = marketFactory.address;

  // 4. Deploy PrivacyCoordinator
  const privacyCoordinator = await deployDeterministic(
    "PrivacyCoordinator",
    [],
    generateSalt(saltPrefix + "PrivacyCoordinator"),
    deployer
  );
  deployments.privacyCoordinator = privacyCoordinator.address;

  // 5. Deploy OracleResolver
  const oracleResolver = await deployDeterministic(
    "OracleResolver",
    [],
    generateSalt(saltPrefix + "OracleResolver"),
    deployer
  );
  deployments.oracleResolver = oracleResolver.address;

  // 6. Deploy RagequitModule
  // Note: RagequitModule uses initialize pattern - deploy without constructor args
  console.log("\n⚠️  Using deployer address as temporary placeholder for governance token and treasury");
  console.log("    In production, update RagequitModule initialization with actual token and treasury addresses");
  const PLACEHOLDER_ADDRESS = deployer.address;
  
  const ragequitModule = await deployDeterministic(
    "RagequitModule",
    [], // No constructor arguments - uses initialize pattern
    generateSalt(saltPrefix + "RagequitModule"),
    deployer
  );
  deployments.ragequitModule = ragequitModule.address;
  
  // Initialize RagequitModule if newly deployed
  if (!ragequitModule.alreadyDeployed) {
    console.log("Initializing RagequitModule...");
    const tx = await ragequitModule.contract.initialize(
      deployer.address, // initialOwner
      PLACEHOLDER_ADDRESS, // governanceToken
      PLACEHOLDER_ADDRESS  // treasuryVault
    );
    await tx.wait();
    console.log("  ✓ RagequitModule initialized");
  }

  // 7. Deploy FutarchyGovernor
  const futarchyGovernor = await deployDeterministic(
    "FutarchyGovernor",
    [], // No constructor arguments - uses initialize pattern
    generateSalt(saltPrefix + "FutarchyGovernor"),
    deployer
  );
  deployments.futarchyGovernor = futarchyGovernor.address;
  
  // Initialize FutarchyGovernor if newly deployed
  if (!futarchyGovernor.alreadyDeployed) {
    console.log("Initializing FutarchyGovernor...");
    const tx = await futarchyGovernor.contract.initialize(
      deployer.address, // initialOwner
      welfareRegistry.address,
      proposalRegistry.address,
      marketFactory.address,
      privacyCoordinator.address,
      oracleResolver.address,
      ragequitModule.address,
      PLACEHOLDER_ADDRESS // Treasury vault placeholder
    );
    await tx.wait();
    console.log("  ✓ FutarchyGovernor initialized");
  }

  // Setup initial configuration (only if contracts are newly deployed)
  console.log("\n\nSetting up initial configuration...");
  
  const txConfirmations = [];
  
  // Only transfer ownership if the contract was just deployed (not already deployed)
  if (!welfareRegistry.alreadyDeployed) {
    console.log("Transferring WelfareMetricRegistry ownership...");
    const tx = await welfareRegistry.contract.transferOwnership(futarchyGovernor.address);
    await tx.wait();
    console.log("  ✓ Ownership transferred");
  }
  
  if (!proposalRegistry.alreadyDeployed) {
    console.log("Transferring ProposalRegistry ownership...");
    const tx = await proposalRegistry.contract.transferOwnership(futarchyGovernor.address);
    await tx.wait();
    console.log("  ✓ Ownership transferred");
  }
  
  if (!marketFactory.alreadyDeployed) {
    console.log("Transferring ConditionalMarketFactory ownership...");
    const tx = await marketFactory.contract.transferOwnership(futarchyGovernor.address);
    await tx.wait();
    console.log("  ✓ Ownership transferred");
  }
  
  if (!oracleResolver.alreadyDeployed) {
    console.log("Transferring OracleResolver ownership...");
    const tx = await oracleResolver.contract.transferOwnership(futarchyGovernor.address);
    await tx.wait();
    console.log("  ✓ Ownership transferred");
  }
  
  if (!ragequitModule.alreadyDeployed) {
    console.log("Transferring RagequitModule ownership...");
    const tx = await ragequitModule.contract.transferOwnership(futarchyGovernor.address);
    await tx.wait();
    console.log("  ✓ Ownership transferred");
  }

  // PrivacyCoordinator keeps deployer as owner for coordinator role
  console.log("PrivacyCoordinator coordinator remains as deployer");

  // Print deployment summary
  console.log("\n\n=== Deterministic Deployment Summary ===");
  console.log("Network:", network.name, `(Chain ID: ${network.chainId})`);
  console.log("Safe Singleton Factory:", SINGLETON_FACTORY_ADDRESS);
  console.log("Salt Prefix:", saltPrefix);
  console.log("\nDeployed Contracts:");
  console.log("==================");
  console.log("WelfareMetricRegistry:", deployments.welfareRegistry);
  console.log("ProposalRegistry:", deployments.proposalRegistry);
  console.log("ConditionalMarketFactory:", deployments.marketFactory);
  console.log("PrivacyCoordinator:", deployments.privacyCoordinator);
  console.log("OracleResolver:", deployments.oracleResolver);
  console.log("RagequitModule:", deployments.ragequitModule);
  console.log("FutarchyGovernor:", deployments.futarchyGovernor);
  console.log("\n✓ Deployment completed successfully!");
  console.log("\nNote: These addresses are deterministic and will be the same on any");
  console.log("      EVM-compatible network where Safe Singleton Factory is deployed.");

  // Save deployment addresses
  const deploymentInfo = {
    network: network.name,
    chainId: Number(network.chainId),
    deployer: deployer.address,
    factoryAddress: SINGLETON_FACTORY_ADDRESS,
    saltPrefix: saltPrefix,
    contracts: deployments,
    timestamp: new Date().toISOString()
  };

  console.log("\nDeployment info:", JSON.stringify(deploymentInfo, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
