const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Safe Singleton Factory address (same on all EVM networks)
const SINGLETON_FACTORY_ADDRESS = "0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7";

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
  console.log("Starting MarketCorrelationRegistry Deployment...\n");

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
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  const saltPrefix = "ClearPathDAO-v1.0-";

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
  // Check if ROLE_MANAGER_ADDRESS is provided
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

  // ========== Summary ==========
  console.log("\n\n=== MarketCorrelationRegistry Deployment Summary ===");
  console.log("Network:", network.name, `(Chain ID: ${network.chainId})`);
  console.log("\nDeployed Contract:");
  console.log("==================");
  console.log("MarketCorrelationRegistry:", correlationRegistry.address);

  console.log("\n✓ Deployment completed!");
  console.log("\nFrontend Integration:");
  console.log("  - Update frontend/src/config/contracts.js with:");
  console.log(`    marketCorrelationRegistry: '${correlationRegistry.address}'`);
  console.log("\nNext steps:");
  console.log("  1. Update frontend config with the contract address above");
  console.log("  2. Optionally set role manager: setRoleManager(roleManagerAddress)");
  console.log("  3. Create correlation groups for related markets");

  // Save deployment JSON
  const deploymentsDir = path.join(process.cwd(), "deployments");
  if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir, { recursive: true });

  const deploymentInfo = {
    network: network.name,
    chainId: Number(network.chainId),
    deployer: deployer.address,
    contracts: {
      marketCorrelationRegistry: correlationRegistry.address
    },
    timestamp: new Date().toISOString()
  };

  const outPath = path.join(deploymentsDir, `${network.name}-correlation-registry-deployment.json`);
  fs.writeFileSync(outPath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\nDeployment JSON saved to: ${outPath}`);

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
