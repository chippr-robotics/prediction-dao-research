const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Deployment Script for MarketCorrelationRegistry
 *
 * Features:
 * - Deploys MarketCorrelationRegistry using Safe Singleton Factory (deterministic)
 * - Verifies contract on Blockscout
 * - Automatically updates frontend/src/config/contracts.js
 * - Saves deployment info to deployments/ directory
 *
 * Usage:
 *   npx hardhat run scripts/deploy-correlation-registry.js --network mordor
 *
 * Environment variables:
 *   VERIFY=true|false           Enable/disable Blockscout verification (default: true)
 *   VERIFY_RETRIES=6            Number of verification retries (default: 6)
 *   VERIFY_DELAY_MS=20000       Delay between retries in ms (default: 20000)
 *   UPDATE_FRONTEND=true|false  Update frontend contracts.js (default: true)
 *   ROLE_MANAGER_ADDRESS=0x...  Optional role manager address to configure
 */

// Safe Singleton Factory address (same on all EVM networks)
const SINGLETON_FACTORY_ADDRESS = "0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7";

// Utility functions
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
    m.includes("unable to verify") ||
    m.includes("request failed") ||
    m.includes("timeout")
  );
}

/**
 * Verify contract on Blockscout with retries
 */
async function verifyOnBlockscout({ name, address, constructorArguments }) {
  const verifyEnabled = (process.env.VERIFY ?? "true").toLowerCase() !== "false";
  if (!verifyEnabled) {
    console.log(`  ⏭️  Verification skipped (VERIFY=false)`);
    return { status: "skipped" };
  }

  const networkName = hre.network.name;
  if (networkName === "hardhat" || networkName === "localhost") {
    console.log(`  ⏭️  Skipping verification on local network: ${networkName}`);
    return { status: "skipped" };
  }

  const retries = Number(process.env.VERIFY_RETRIES ?? 6);
  const delayMs = Number(process.env.VERIFY_DELAY_MS ?? 20000);

  console.log(`  Verifying ${name} on Blockscout...`);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await hre.run("verify:verify", {
        address,
        constructorArguments: constructorArguments ?? [],
      });
      console.log(`  ✓ Verified on Blockscout: ${address}`);
      return { status: "verified" };
    } catch (error) {
      const message = error?.message || String(error);

      if (isLikelyAlreadyVerifiedError(message)) {
        console.log(`  ✓ Already verified: ${address}`);
        return { status: "verified" };
      }

      const shouldRetry = attempt < retries && isLikelyNotIndexedYetError(message);
      console.warn(`  ⚠️  Verify attempt ${attempt}/${retries} failed`);
      console.warn(`      ${message.split("\n")[0]}`);

      if (!shouldRetry) {
        console.warn(`  ⚠️  Verification failed (continuing deployment)`);
        return { status: "failed", error: message.split("\n")[0] };
      }

      console.log(`  ⏳ Waiting ${delayMs / 1000}s before retry...`);
      await sleep(delayMs);
    }
  }

  return { status: "failed", error: "Verification failed after retries" };
}

/**
 * Update frontend contracts.js with new correlation registry address
 */
function updateFrontendContracts(deploymentInfo) {
  const updateEnabled = (process.env.UPDATE_FRONTEND ?? "true").toLowerCase() !== "false";
  if (!updateEnabled) {
    console.log("  ⏭️  Frontend update skipped (UPDATE_FRONTEND=false)");
    return false;
  }

  const contractsPath = path.join(__dirname, "../frontend/src/config/contracts.js");

  if (!fs.existsSync(contractsPath)) {
    console.warn(`  ⚠️  Frontend contracts.js not found at: ${contractsPath}`);
    return false;
  }

  try {
    let content = fs.readFileSync(contractsPath, "utf8");

    // Check if marketCorrelationRegistry entry exists and update it
    const hasEntry = content.includes("marketCorrelationRegistry:");

    if (hasEntry) {
      // Update existing entry (handles both null and address values)
      content = content.replace(
        /marketCorrelationRegistry:\s*(?:null|'[^']*'|"[^"]*"),?/,
        `marketCorrelationRegistry: '${deploymentInfo.contracts.marketCorrelationRegistry}',`
      );
      console.log("  ✓ Updated marketCorrelationRegistry in contracts.js");
    } else {
      // Add new entry before the closing brace
      const insertPoint = content.lastIndexOf("}");
      if (insertPoint > 0) {
        const newEntry = `\n  // Market Correlation Registry - Deployed via: npx hardhat run scripts/deploy-correlation-registry.js --network ${deploymentInfo.network}\n  marketCorrelationRegistry: '${deploymentInfo.contracts.marketCorrelationRegistry}',\n`;
        content = content.slice(0, insertPoint) + newEntry + content.slice(insertPoint);
        console.log("  ✓ Added marketCorrelationRegistry to contracts.js");
      }
    }

    fs.writeFileSync(contractsPath, content);
    return true;
  } catch (error) {
    console.warn(`  ⚠️  Failed to update contracts.js: ${error.message}`);
    return false;
  }
}

/**
 * Deploy a contract deterministically using Safe Singleton Factory
 */
async function deployDeterministic(contractName, constructorArgs, salt, deployer) {
  console.log(`\nDeploying ${contractName} deterministically...`);

  const ContractFactory = await ethers.getContractFactory(contractName, deployer);
  const deployTx = await ContractFactory.getDeployTransaction(...constructorArgs);
  const deploymentData = deployTx?.data;

  if (!deploymentData) {
    throw new Error(`Failed to build initCode for ${contractName}`);
  }

  if (ethers.dataLength(salt) !== 32) {
    throw new Error(`Invalid salt length for ${contractName}`);
  }

  const initCodeHash = ethers.keccak256(deploymentData);
  const deterministicAddress = ethers.getCreate2Address(
    SINGLETON_FACTORY_ADDRESS,
    salt,
    initCodeHash
  );

  console.log(`  Predicted address: ${deterministicAddress}`);

  const existingCode = await ethers.provider.getCode(deterministicAddress);
  if (existingCode !== "0x") {
    console.log(`  ✓ Contract already deployed at this address`);
    return {
      address: deterministicAddress,
      contract: ContractFactory.attach(deterministicAddress),
      alreadyDeployed: true
    };
  }

  console.log(`  Deploying via Safe Singleton Factory...`);
  const txData = ethers.hexlify(ethers.concat([salt, deploymentData]));

  let gasLimit;
  try {
    const latestBlock = await ethers.provider.getBlock("latest");
    const blockGasLimit = latestBlock?.gasLimit;
    const estimatedGas = await ethers.provider.estimateGas({
      from: deployer.address,
      to: SINGLETON_FACTORY_ADDRESS,
      data: txData,
    });
    const buffered = (estimatedGas * 120n) / 100n;
    if (blockGasLimit) {
      const cap = (blockGasLimit * 95n) / 100n;
      gasLimit = buffered > cap ? cap : buffered;
    } else {
      gasLimit = buffered;
    }
    console.log(`  Estimated gas: ${estimatedGas.toString()} (using ${gasLimit.toString()})`);
  } catch (error) {
    const latestBlock = await ethers.provider.getBlock("latest");
    const blockGasLimit = latestBlock?.gasLimit;
    gasLimit = blockGasLimit ? (blockGasLimit * 95n) / 100n : 7_500_000n;
    console.warn(`  ⚠️  Gas estimation failed; using cap=${gasLimit.toString()}`);
  }

  const tx = await deployer.sendTransaction({
    to: SINGLETON_FACTORY_ADDRESS,
    data: txData,
    gasLimit,
  });

  const receipt = await tx.wait();
  console.log(`  ✓ Deployed in tx: ${receipt.hash}`);
  console.log(`  ✓ Gas used: ${receipt.gasUsed.toString()}`);

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

function generateSalt(identifier) {
  return ethers.id(identifier);
}

async function main() {
  console.log("=".repeat(60));
  console.log("MarketCorrelationRegistry Deployment");
  console.log("=".repeat(60));
  console.log();

  const network = await ethers.provider.getNetwork();
  console.log(`Network: ${network.name} (Chain ID: ${network.chainId})`);

  // Verify factory
  const factoryCode = await ethers.provider.getCode(SINGLETON_FACTORY_ADDRESS);
  if (factoryCode === "0x") {
    throw new Error("Safe Singleton Factory not deployed on this network");
  }
  console.log("✓ Factory contract verified\n");

  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer signer available");
  }
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETC\n");

  const saltPrefix = "ClearPathDAO-v1.0-";
  const verificationResults = {};

  // ========== Deploy MarketCorrelationRegistry ==========
  const correlationRegistry = await deployDeterministic(
    "MarketCorrelationRegistry",
    [],
    generateSalt(saltPrefix + "MarketCorrelationRegistry"),
    deployer
  );

  // Initialize if needed (for CREATE2 deployments)
  if (!correlationRegistry.alreadyDeployed) {
    try {
      console.log("\nInitializing MarketCorrelationRegistry...");
      const tx = await correlationRegistry.contract.initialize(deployer.address);
      await tx.wait();
      console.log("  ✓ MarketCorrelationRegistry initialized with owner:", deployer.address);
    } catch (error) {
      const message = error?.message || String(error);
      if (message.includes("Already initialized")) {
        console.log("  ✓ MarketCorrelationRegistry already initialized");
      } else {
        console.warn("  ⚠️  Initialize skipped:", message.split("\n")[0]);
      }
    }
  }

  // ========== Configure Role Manager (optional) ==========
  const roleManagerAddress = process.env.ROLE_MANAGER_ADDRESS;
  if (roleManagerAddress && roleManagerAddress !== ethers.ZeroAddress) {
    try {
      console.log("\nSetting Role Manager...");
      const tx = await correlationRegistry.contract.setRoleManager(roleManagerAddress);
      await tx.wait();
      console.log("  ✓ Role Manager set to:", roleManagerAddress);
    } catch (error) {
      const message = error?.message || String(error);
      if (message.includes("Role manager already set")) {
        console.log("  ✓ Role Manager already configured");
      } else {
        console.warn("  ⚠️  Set Role Manager skipped:", message.split("\n")[0]);
      }
    }
  } else {
    console.log("\nSkipping Role Manager configuration (set ROLE_MANAGER_ADDRESS env var to configure)");
  }

  // ========== Verify on Blockscout ==========
  console.log("\n\nVerifying contracts on Blockscout...");
  verificationResults.marketCorrelationRegistry = await verifyOnBlockscout({
    name: "MarketCorrelationRegistry",
    address: correlationRegistry.address,
    constructorArguments: []
  });

  // ========== Prepare deployment info ==========
  const deploymentInfo = {
    network: hre.network.name,
    chainId: Number(network.chainId),
    deployer: deployer.address,
    contracts: {
      marketCorrelationRegistry: correlationRegistry.address
    },
    verification: verificationResults,
    timestamp: new Date().toISOString()
  };

  // ========== Update frontend config ==========
  console.log("\n\nUpdating frontend configuration...");
  updateFrontendContracts(deploymentInfo);

  // ========== Save deployment JSON ==========
  const deploymentsDir = path.join(process.cwd(), "deployments");
  if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir, { recursive: true });

  const outPath = path.join(deploymentsDir, `${hre.network.name}-correlation-registry-deployment.json`);
  fs.writeFileSync(outPath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\nDeployment JSON saved to: ${outPath}`);

  // ========== Summary ==========
  console.log("\n\n" + "=".repeat(60));
  console.log("MarketCorrelationRegistry Deployment Summary");
  console.log("=".repeat(60));
  console.log();
  console.log("Network:", hre.network.name, `(Chain ID: ${network.chainId})`);
  console.log("\nDeployed Contract:");
  console.log("==================");
  console.log("MarketCorrelationRegistry:", correlationRegistry.address);
  console.log();
  console.log("Verification Status:");
  console.log("==================");
  console.log(`MarketCorrelationRegistry: ${verificationResults.marketCorrelationRegistry?.status || 'unknown'}`);
  console.log();
  console.log("=".repeat(60));
  console.log("NEXT STEPS");
  console.log("=".repeat(60));
  console.log();
  console.log("1. Frontend config updated automatically (if UPDATE_FRONTEND=true)");
  console.log("   Or manually update frontend/src/config/contracts.js:");
  console.log(`   marketCorrelationRegistry: '${correlationRegistry.address}'`);
  console.log();
  console.log("2. Optionally set role manager:");
  console.log("   ROLE_MANAGER_ADDRESS=0x... npx hardhat run scripts/deploy-correlation-registry.js --network mordor");
  console.log();
  console.log("3. Create correlation groups for related markets");
  console.log();

  console.log("✓ Deployment completed!");

  return {
    marketCorrelationRegistry: correlationRegistry.address
  };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
