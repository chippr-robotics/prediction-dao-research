const hre = require("hardhat");
const { ethers } = require("hardhat");
const { getSingletonFactoryInfo } = require("@safe-global/safe-singleton-factory");
const fs = require("fs");
const path = require("path");

// Safe Singleton Factory address (same on all EVM networks)
const SINGLETON_FACTORY_ADDRESS = "0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isLikelyAlreadyVerifiedError(message) {
  const m = (message || "").toLowerCase();
  return (
    m.includes("already verified") ||
    m.includes("contract source code already verified") ||
    m.includes("already been verified")
  );
}

function isLikelyNotIndexedYetError(message) {
  const m = (message || "").toLowerCase();
  return (
    m.includes("contract not found") ||
    m.includes("unable to locate") ||
    m.includes("does not have bytecode") ||
    m.includes("doesn't have bytecode") ||
    m.includes("not verified") ||
    m.includes("request failed") ||
    m.includes("timeout")
  );
}

function getArtifactsBuildInfoDir() {
  // Prefer Hardhat-configured artifacts dir, fallback to ./artifacts
  const artifactsDir = hre?.config?.paths?.artifacts
    ? hre.config.paths.artifacts
    : path.join(process.cwd(), "artifacts");
  return path.join(artifactsDir, "build-info");
}

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function findBuildInfoContainingContract(contractName) {
  const buildInfoDir = getArtifactsBuildInfoDir();
  if (!fs.existsSync(buildInfoDir)) return null;

  const files = fs
    .readdirSync(buildInfoDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.join(buildInfoDir, f));

  // Newest first
  files.sort((a, b) => {
    try {
      return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs;
    } catch {
      return 0;
    }
  });

  for (const file of files) {
    const buildInfo = safeReadJson(file);
    if (!buildInfo?.output?.contracts) continue;
    for (const sourceName of Object.keys(buildInfo.output.contracts)) {
      if (buildInfo.output.contracts[sourceName]?.[contractName]) {
        return { file, buildInfo };
      }
    }
  }
  return null;
}

function exportSolcStandardJsonInput(contractName) {
  const found = findBuildInfoContainingContract(contractName);
  if (!found?.buildInfo?.input) return null;

  const outDir = path.join(process.cwd(), "blockscout");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, `${hre.network.name}-${contractName}-solc-input.json`);
  fs.writeFileSync(outPath, JSON.stringify(found.buildInfo.input, null, 2));
  return outPath;
}

async function verifyOnBlockscout({ name, address, contract, constructorArguments }) {
  const verifyEnabled = (process.env.VERIFY ?? "true").toLowerCase() !== "false";
  if (!verifyEnabled) return;

  const networkName = hre.network.name;
  if (networkName === "hardhat" || networkName === "localhost") {
    console.log(`Skipping verification on local network: ${networkName}`);
    return;
  }

  const retries = Number(process.env.VERIFY_RETRIES ?? 6);
  const delayMs = Number(process.env.VERIFY_DELAY_MS ?? 20000);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await hre.run("verify:verify", {
        address,
        constructorArguments: constructorArguments ?? [],
        ...(contract ? { contract } : {}),
      });
      console.log(`  ✓ Verified on Blockscout: ${address}`);
      return;
    } catch (error) {
      const message = error?.message || String(error);

      if (isLikelyAlreadyVerifiedError(message)) {
        console.log(`  ✓ Already verified: ${address}`);
        return;
      }

      const shouldRetry = attempt < retries && isLikelyNotIndexedYetError(message);
      console.warn(`  ⚠️  Verify attempt ${attempt}/${retries} failed for ${address}`);
      console.warn(`      ${message.split("\n")[0]}`);
      if (!shouldRetry) {
        const dumpEnabled = (process.env.DUMP_SOLC_INPUT_ON_VERIFY_FAIL ?? "true").toLowerCase() !== "false";
        if (dumpEnabled && name) {
          try {
            const outPath = exportSolcStandardJsonInput(name);
            if (outPath) {
              console.warn(`      Wrote solc Standard JSON input for manual Blockscout upload:`);
              console.warn(`      ${outPath}`);
              console.warn(`      (In Blockscout UI: verify -> Solidity (Standard JSON input))`);
            } else {
              console.warn(`      Could not locate build-info for ${name}; run 'npx hardhat compile' first.`);
            }
          } catch (e) {
            console.warn(`      Failed to write solc input snapshot: ${e?.message || String(e)}`);
          }
        }
        throw error;
      }
      await sleep(delayMs);
    }
  }
}

async function tryInitializeIfPresent({ name, contract, deployer }) {
  const initEnabled = (process.env.INIT ?? "true").toLowerCase() !== "false";
  if (!initEnabled) return;

  if (!contract || typeof contract.initialize !== "function") return;

  try {
    const tx = await contract.initialize(deployer.address);
    await tx.wait();
    console.log(`  ✓ ${name} initialized (owner set to ${deployer.address})`);
  } catch (error) {
    const message = error?.message || String(error);
    // If already initialized or initialize doesn't apply, don't hard-fail.
    console.warn(`  ⚠️  ${name} initialize skipped: ${message.split("\n")[0]}`);
  }
}

async function safeTransferOwnership({ name, contract, from, to }) {
  try {
    if (!contract || typeof contract.owner !== "function") {
      console.warn(`  ⚠️  ${name} has no owner(); skipping transfer`);
      return;
    }
    const currentOwner = await contract.owner();
    if (currentOwner.toLowerCase() !== from.toLowerCase()) {
      console.warn(`  ⚠️  ${name} owner is ${currentOwner}; expected ${from}. Skipping transfer.`);
      return;
    }
    const tx = await contract.transferOwnership(to);
    await tx.wait();
    console.log("  ✓ Ownership transferred");
  } catch (error) {
    const message = error?.message || String(error);
    console.warn(`  ⚠️  ${name} transferOwnership failed (continuing): ${message.split("\n")[0]}`);
  }
}

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

  // Deploy using the Safe Singleton Factory.
  // IMPORTANT: The factory expects calldata formatted as:
  //   bytes32 salt || initCode
  // (no ABI function selector).
  console.log(`  Deploying via Safe Singleton Factory...`);

  const txData = ethers.concat([salt, deploymentData]);

  // Estimate gas and add 20% buffer for safety
  let gasLimit;
  try {
    const estimatedGas = await ethers.provider.estimateGas({
      from: deployer.address,
      to: SINGLETON_FACTORY_ADDRESS,
      data: txData,
    });
    gasLimit = (estimatedGas * 120n) / 100n; // Add 20% buffer
    console.log(`  Estimated gas: ${estimatedGas.toString()} (using ${gasLimit.toString()} with buffer)`);
  } catch (error) {
    // Fallback to conservative default if estimation fails
    gasLimit = 5000000n;
    console.log(`  Gas estimation failed, using default: ${gasLimit.toString()}`);
  }

  const tx = await deployer.sendTransaction({
    to: SINGLETON_FACTORY_ADDRESS,
    data: txData,
    gasLimit,
  });
  
  const receipt = await tx.wait();
  if (receipt && receipt.status === 0) {
    throw new Error(`Deployment transaction reverted: ${receipt.hash}`);
  }
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
  if (!deployer) {
    throw new Error(
      `No deployer signer available for network '${hre.network.name}'.\n` +
      `Make sure you have configured an account (e.g. export PRIVATE_KEY=0x... for this network) in hardhat.config.js.`
    );
  }
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");
  console.log();

  // Use a consistent salt prefix for all contracts in this project
  const saltPrefix = "FairWinsDAO-v1.0-";
  
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
  await tryInitializeIfPresent({ name: "WelfareMetricRegistry", contract: welfareRegistry.contract, deployer });

  // 2. Deploy ProposalRegistry
  const proposalRegistry = await deployDeterministic(
    "ProposalRegistry",
    [],
    generateSalt(saltPrefix + "ProposalRegistry"),
    deployer
  );
  deployments.proposalRegistry = proposalRegistry.address;
  await tryInitializeIfPresent({ name: "ProposalRegistry", contract: proposalRegistry.contract, deployer });

  // 3. Deploy ConditionalMarketFactory
  const marketFactory = await deployDeterministic(
    "ConditionalMarketFactory",
    [],
    generateSalt(saltPrefix + "ConditionalMarketFactory"),
    deployer
  );
  deployments.marketFactory = marketFactory.address;
  await tryInitializeIfPresent({ name: "ConditionalMarketFactory", contract: marketFactory.contract, deployer });

  // 4. Deploy PrivacyCoordinator
  const privacyCoordinator = await deployDeterministic(
    "PrivacyCoordinator",
    [],
    generateSalt(saltPrefix + "PrivacyCoordinator"),
    deployer
  );
  deployments.privacyCoordinator = privacyCoordinator.address;
  await tryInitializeIfPresent({ name: "PrivacyCoordinator", contract: privacyCoordinator.contract, deployer });

  // 5. Deploy OracleResolver
  const oracleResolver = await deployDeterministic(
    "OracleResolver",
    [],
    generateSalt(saltPrefix + "OracleResolver"),
    deployer
  );
  deployments.oracleResolver = oracleResolver.address;
  await tryInitializeIfPresent({ name: "OracleResolver", contract: oracleResolver.contract, deployer });

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
      "0xec6Ed68627749b9C244a25A6d0bAC8962043fdcB", // governanceToken - same as deployer for development
      "0x93F7ee39C02d99289E3c29696f1F3a70656d0772"  // treasuryVault - same as deployer for development
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
      "0x93F7ee39C02d99289E3c29696f1F3a70656d0772" // Treasury vault placeholder
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
    await safeTransferOwnership({
      name: "WelfareMetricRegistry",
      contract: welfareRegistry.contract,
      from: deployer.address,
      to: futarchyGovernor.address,
    });
  }
  
  if (!proposalRegistry.alreadyDeployed) {
    console.log("Transferring ProposalRegistry ownership...");
    await safeTransferOwnership({
      name: "ProposalRegistry",
      contract: proposalRegistry.contract,
      from: deployer.address,
      to: futarchyGovernor.address,
    });
  }
  
  if (!marketFactory.alreadyDeployed) {
    console.log("Transferring ConditionalMarketFactory ownership...");
    await safeTransferOwnership({
      name: "ConditionalMarketFactory",
      contract: marketFactory.contract,
      from: deployer.address,
      to: futarchyGovernor.address,
    });
  }
  
  if (!oracleResolver.alreadyDeployed) {
    console.log("Transferring OracleResolver ownership...");
    await safeTransferOwnership({
      name: "OracleResolver",
      contract: oracleResolver.contract,
      from: deployer.address,
      to: futarchyGovernor.address,
    });
  }
  
  if (!ragequitModule.alreadyDeployed) {
    console.log("Transferring RagequitModule ownership...");
    await safeTransferOwnership({
      name: "RagequitModule",
      contract: ragequitModule.contract,
      from: deployer.address,
      to: futarchyGovernor.address,
    });
  }

  // PrivacyCoordinator keeps deployer as owner for coordinator role
  console.log("PrivacyCoordinator coordinator remains as deployer");

  // Verify contracts on Blockscout (via Hardhat verify) after deployment
  console.log("\n\nVerifying contracts on Blockscout...");
  console.log("(Set VERIFY=false to skip; tune with VERIFY_RETRIES / VERIFY_DELAY_MS)\n");

  const verificationTargets = [
    {
      name: "WelfareMetricRegistry",
      address: welfareRegistry.address,
      constructorArguments: [],
    },
    {
      name: "ProposalRegistry",
      address: proposalRegistry.address,
      constructorArguments: [],
    },
    {
      name: "ConditionalMarketFactory",
      address: marketFactory.address,
      constructorArguments: [],
    },
    {
      name: "PrivacyCoordinator",
      address: privacyCoordinator.address,
      constructorArguments: [],
    },
    {
      name: "OracleResolver",
      address: oracleResolver.address,
      constructorArguments: [],
    },
    {
      name: "RagequitModule",
      address: ragequitModule.address,
      constructorArguments: [],
    },
    {
      name: "FutarchyGovernor",
      address: futarchyGovernor.address,
      constructorArguments: [],
    },
  ];

  for (const target of verificationTargets) {
    console.log(`Verifying ${target.name}...`);
    await verifyOnBlockscout({
      name: target.name,
      address: target.address,
      constructorArguments: target.constructorArguments,
    });
  }

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
