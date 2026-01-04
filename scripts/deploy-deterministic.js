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
  const deployTx = await ContractFactory.getDeployTransaction(...constructorArgs);
  const deploymentData = deployTx?.data;
  if (!deploymentData) {
    throw new Error(
      `Failed to build initCode for ${contractName}. ` +
        `Hardhat/ethers returned empty deployment data; ` +
        `check the contract is compiled and has no unlinked libraries.`
    );
  }
  
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function tryInitializeIfPresent(name, contract, deployer) {
  if (!contract || typeof contract.initialize !== "function") return;
  try {
    const tx = await contract.initialize(deployer.address);
    await tx.wait();
    console.log(`  ✓ ${name} initialized (owner set to ${deployer.address})`);
  } catch (error) {
    const message = error?.message || String(error);
    console.warn(`  ⚠️  ${name} initialize skipped: ${message.split("\n")[0]}`);
  }
}

async function trySetRoleManagerIfPresent(name, contract, roleManagerAddress) {
  if (!contract || typeof contract.setRoleManager !== "function") return;

  try {
    // If the contract exposes roleManager(), skip if already set.
    if (typeof contract.roleManager === "function") {
      const current = await contract.roleManager();
      if (String(current).toLowerCase() !== "0x0000000000000000000000000000000000000000") {
        console.log(`  ✓ ${name} roleManager already set (${current})`);
        return;
      }
    }
  } catch {
    // ignore
  }

  try {
    const tx = await contract.setRoleManager(roleManagerAddress);
    await tx.wait();
    console.log(`  ✓ ${name} roleManager set to ${roleManagerAddress}`);
  } catch (error) {
    const message = error?.message || String(error);
    console.warn(`  ⚠️  ${name} setRoleManager skipped: ${message.split("\n")[0]}`);
  }
}

async function safeTransferOwnershipIfOwnedBy(name, contract, from, to) {
  if (!contract || typeof contract.transferOwnership !== "function") return;
  if (typeof contract.owner !== "function") return;

  try {
    const currentOwner = await contract.owner();
    if (String(currentOwner).toLowerCase() === String(to).toLowerCase()) {
      console.log(`  ✓ ${name} ownership already transferred (${to})`);
      return;
    }
    if (String(currentOwner).toLowerCase() !== String(from).toLowerCase()) {
      console.log(`  ⚠️  ${name} owner is ${currentOwner}; expected ${from}. Skipping transfer.`);
      return;
    }
    console.log(`Transferring ${name} ownership...`);
    const tx = await contract.transferOwnership(to);
    await tx.wait();
    console.log("  ✓ Ownership transferred");
  } catch (error) {
    const message = error?.message || String(error);
    console.warn(`  ⚠️  ${name} transferOwnership skipped: ${message.split("\n")[0]}`);
  }
}

async function verifyIfEnabled(name, address, constructorArguments = []) {
  const verifyEnabled = (process.env.VERIFY ?? "false").toLowerCase() === "true";
  if (!verifyEnabled) return;
  if (hre.network.name === "hardhat" || hre.network.name === "localhost") return;

  const retries = Number(process.env.VERIFY_RETRIES ?? 5);
  const delayMs = Number(process.env.VERIFY_DELAY_MS ?? 15000);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await hre.run("verify:verify", { address, constructorArguments });
      console.log(`  ✓ Verified ${name} at ${address}`);
      return;
    } catch (error) {
      const message = error?.message || String(error);
      const already = message.toLowerCase().includes("already verified");
      if (already) {
        console.log(`  ✓ ${name} already verified at ${address}`);
        return;
      }
      console.warn(`  ⚠️  Verify attempt ${attempt}/${retries} failed for ${name}: ${message.split("\n")[0]}`);
      if (attempt < retries) await sleep(delayMs);
    }
  }
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
  if (!deployer) {
    throw new Error(
      `No deployer signer available for network '${hre.network.name}'.\n` +
        `For testnets/mainnet you must configure an account, e.g.:\n` +
        `  export PRIVATE_KEY=0x...\n` +
        `  npx hardhat run --network ${hre.network.name} scripts/deploy-deterministic.js\n` +
        `\n` +
        `Current hardhat.config.js uses PRIVATE_KEY to populate network accounts.`
    );
  }
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");
  console.log();

  // Use a consistent salt prefix for all contracts in this project
  const saltPrefix = "ClearPathDAO-v1.0-";
  
  // Deploy all contracts deterministically
  const deployments = {};

  // 0. Deploy TieredRoleManager (RBAC)
  const tieredRoleManager = await deployDeterministic(
    "TieredRoleManager",
    [],
    generateSalt(saltPrefix + "TieredRoleManager"),
    deployer
  );
  deployments.tieredRoleManager = tieredRoleManager.address;
  await tryInitializeIfPresent("TieredRoleManager", tieredRoleManager.contract, deployer);

  // 1. Deploy WelfareMetricRegistry
  const welfareRegistry = await deployDeterministic(
    "WelfareMetricRegistry",
    [],
    generateSalt(saltPrefix + "WelfareMetricRegistry"),
    deployer
  );
  deployments.welfareRegistry = welfareRegistry.address;
  await tryInitializeIfPresent("WelfareMetricRegistry", welfareRegistry.contract, deployer);
  await trySetRoleManagerIfPresent(
    "WelfareMetricRegistry",
    welfareRegistry.contract,
    tieredRoleManager.address
  );

  // 2. Deploy ProposalRegistry
  const proposalRegistry = await deployDeterministic(
    "ProposalRegistry",
    [],
    generateSalt(saltPrefix + "ProposalRegistry"),
    deployer
  );
  deployments.proposalRegistry = proposalRegistry.address;
  await tryInitializeIfPresent("ProposalRegistry", proposalRegistry.contract, deployer);
  await trySetRoleManagerIfPresent(
    "ProposalRegistry",
    proposalRegistry.contract,
    tieredRoleManager.address
  );

  // 2b. Deploy MetadataRegistry
  const metadataRegistry = await deployDeterministic(
    "MetadataRegistry",
    [],
    generateSalt(saltPrefix + "MetadataRegistry"),
    deployer
  );
  deployments.metadataRegistry = metadataRegistry.address;
  await tryInitializeIfPresent("MetadataRegistry", metadataRegistry.contract, deployer);

  // 2c. Deploy MarketCorrelationRegistry
  const marketCorrelationRegistry = await deployDeterministic(
    "MarketCorrelationRegistry",
    [],
    generateSalt(saltPrefix + "MarketCorrelationRegistry"),
    deployer
  );
  deployments.marketCorrelationRegistry = marketCorrelationRegistry.address;
  await tryInitializeIfPresent(
    "MarketCorrelationRegistry",
    marketCorrelationRegistry.contract,
    deployer
  );
  await trySetRoleManagerIfPresent(
    "MarketCorrelationRegistry",
    marketCorrelationRegistry.contract,
    tieredRoleManager.address
  );

  // 3. Deploy ConditionalMarketFactory
  const marketFactory = await deployDeterministic(
    "ConditionalMarketFactory",
    [],
    generateSalt(saltPrefix + "ConditionalMarketFactory"),
    deployer
  );
  deployments.marketFactory = marketFactory.address;
  await tryInitializeIfPresent("ConditionalMarketFactory", marketFactory.contract, deployer);
  await trySetRoleManagerIfPresent(
    "ConditionalMarketFactory",
    marketFactory.contract,
    tieredRoleManager.address
  );

  // 4. Deploy PrivacyCoordinator
  const privacyCoordinator = await deployDeterministic(
    "PrivacyCoordinator",
    [],
    generateSalt(saltPrefix + "PrivacyCoordinator"),
    deployer
  );
  deployments.privacyCoordinator = privacyCoordinator.address;
  await tryInitializeIfPresent("PrivacyCoordinator", privacyCoordinator.contract, deployer);
  await trySetRoleManagerIfPresent(
    "PrivacyCoordinator",
    privacyCoordinator.contract,
    tieredRoleManager.address
  );

  // 5. Deploy OracleResolver
  const oracleResolver = await deployDeterministic(
    "OracleResolver",
    [],
    generateSalt(saltPrefix + "OracleResolver"),
    deployer
  );
  deployments.oracleResolver = oracleResolver.address;
  await tryInitializeIfPresent("OracleResolver", oracleResolver.contract, deployer);
  await trySetRoleManagerIfPresent(
    "OracleResolver",
    oracleResolver.contract,
    tieredRoleManager.address
  );

  // 6. Deploy RagequitModule
  // Note: RagequitModule uses initialize pattern - deploy without constructor args
  // Using deployer address as placeholder for both governanceToken and treasuryVault in development
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
      PLACEHOLDER_ADDRESS, // governanceToken - same as deployer for development
      PLACEHOLDER_ADDRESS  // treasuryVault - same as deployer for development
    );
    await tx.wait();
    console.log("  ✓ RagequitModule initialized");
  }

  await trySetRoleManagerIfPresent(
    "RagequitModule",
    ragequitModule.contract,
    tieredRoleManager.address
  );

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

  // Wire RBAC into FutarchyGovernor (onlyOwner)
  try {
    const current = await futarchyGovernor.contract.roleManager();
    if (String(current).toLowerCase() === "0x0000000000000000000000000000000000000000") {
      console.log("Setting FutarchyGovernor role manager...");
      const tx = await futarchyGovernor.contract.setRoleManager(tieredRoleManager.address);
      await tx.wait();
      console.log(`  ✓ FutarchyGovernor roleManager set to ${tieredRoleManager.address}`);
    } else {
      console.log(`  ✓ FutarchyGovernor roleManager already set (${current})`);
    }
  } catch (error) {
    const message = error?.message || String(error);
    console.warn(`  ⚠️  FutarchyGovernor setRoleManager skipped: ${message.split("\n")[0]}`);
  }

  // Setup initial configuration (only if contracts are newly deployed)
  console.log("\n\nSetting up initial configuration...");
  
  const txConfirmations = [];
  
  await safeTransferOwnershipIfOwnedBy(
    "WelfareMetricRegistry",
    welfareRegistry.contract,
    deployer.address,
    futarchyGovernor.address
  );

  await safeTransferOwnershipIfOwnedBy(
    "ProposalRegistry",
    proposalRegistry.contract,
    deployer.address,
    futarchyGovernor.address
  );

  await safeTransferOwnershipIfOwnedBy(
    "MetadataRegistry",
    metadataRegistry.contract,
    deployer.address,
    futarchyGovernor.address
  );

  await safeTransferOwnershipIfOwnedBy(
    "MarketCorrelationRegistry",
    marketCorrelationRegistry.contract,
    deployer.address,
    futarchyGovernor.address
  );

  await safeTransferOwnershipIfOwnedBy(
    "ConditionalMarketFactory",
    marketFactory.contract,
    deployer.address,
    futarchyGovernor.address
  );

  await safeTransferOwnershipIfOwnedBy(
    "OracleResolver",
    oracleResolver.contract,
    deployer.address,
    futarchyGovernor.address
  );

  await safeTransferOwnershipIfOwnedBy(
    "RagequitModule",
    ragequitModule.contract,
    deployer.address,
    futarchyGovernor.address
  );

  // PrivacyCoordinator keeps deployer as owner for coordinator role
  console.log("PrivacyCoordinator coordinator remains as deployer");

  // Print deployment summary
  console.log("\n\n=== Deterministic Deployment Summary ===");
  console.log("Network:", network.name, `(Chain ID: ${network.chainId})`);
  console.log("Safe Singleton Factory:", SINGLETON_FACTORY_ADDRESS);
  console.log("Salt Prefix:", saltPrefix);
  console.log("\nDeployed Contracts:");
  console.log("==================");
  console.log("TieredRoleManager:", deployments.tieredRoleManager);
  console.log("WelfareMetricRegistry:", deployments.welfareRegistry);
  console.log("ProposalRegistry:", deployments.proposalRegistry);
  console.log("MetadataRegistry:", deployments.metadataRegistry);
  console.log("MarketCorrelationRegistry:", deployments.marketCorrelationRegistry);
  console.log("ConditionalMarketFactory:", deployments.marketFactory);
  console.log("PrivacyCoordinator:", deployments.privacyCoordinator);
  console.log("OracleResolver:", deployments.oracleResolver);
  console.log("RagequitModule:", deployments.ragequitModule);
  console.log("FutarchyGovernor:", deployments.futarchyGovernor);

  // Optional verification (set VERIFY=true)
  console.log("\nVerification (set VERIFY=true to enable):");
  await verifyIfEnabled("TieredRoleManager", deployments.tieredRoleManager, []);
  await verifyIfEnabled("WelfareMetricRegistry", deployments.welfareRegistry, []);
  await verifyIfEnabled("ProposalRegistry", deployments.proposalRegistry, []);
  await verifyIfEnabled("MetadataRegistry", deployments.metadataRegistry, []);
  await verifyIfEnabled("MarketCorrelationRegistry", deployments.marketCorrelationRegistry, []);
  await verifyIfEnabled("ConditionalMarketFactory", deployments.marketFactory, []);
  await verifyIfEnabled("PrivacyCoordinator", deployments.privacyCoordinator, []);
  await verifyIfEnabled("OracleResolver", deployments.oracleResolver, []);
  await verifyIfEnabled("RagequitModule", deployments.ragequitModule, []);
  await verifyIfEnabled("FutarchyGovernor", deployments.futarchyGovernor, []);
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
