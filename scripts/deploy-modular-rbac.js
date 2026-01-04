const hre = require("hardhat");
const { ethers } = require("hardhat");

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

async function tryInitialize(name, contract, deployer) {
  if (!contract || typeof contract.initialize !== "function") return;
  try {
    const tx = await contract.initialize(deployer.address);
    await tx.wait();
    console.log(`  ✓ ${name} initialized`);
  } catch (error) {
    const message = error?.message || String(error);
    if (!message.includes("Already initialized")) {
      console.warn(`  ⚠️  ${name} initialize skipped: ${message.split("\n")[0]}`);
    }
  }
}

async function main() {
  console.log("Starting Modular Role Manager Deployment...\n");
  
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

  const saltPrefix = "ClearPathDAO-Modular-v1.0-";
  const deployments = {};

  // ========== 1. Deploy RoleManagerCore ==========
  const roleManagerCore = await deployDeterministic(
    "RoleManagerCore",
    [],
    generateSalt(saltPrefix + "RoleManagerCore"),
    deployer
  );
  deployments.roleManagerCore = roleManagerCore.address;
  await tryInitialize("RoleManagerCore", roleManagerCore.contract, deployer);

  // ========== 2. Deploy TierRegistry ==========
  const tierRegistry = await deployDeterministic(
    "TierRegistry",
    [],
    generateSalt(saltPrefix + "TierRegistry"),
    deployer
  );
  deployments.tierRegistry = tierRegistry.address;
  await tryInitialize("TierRegistry", tierRegistry.contract, deployer);

  // ========== 3. Deploy UsageTracker ==========
  const usageTracker = await deployDeterministic(
    "UsageTracker",
    [],
    generateSalt(saltPrefix + "UsageTracker"),
    deployer
  );
  deployments.usageTracker = usageTracker.address;
  await tryInitialize("UsageTracker", usageTracker.contract, deployer);

  // ========== 4. Deploy MembershipManager ==========
  const membershipManager = await deployDeterministic(
    "MembershipManager",
    [],
    generateSalt(saltPrefix + "MembershipManager"),
    deployer
  );
  deployments.membershipManager = membershipManager.address;
  await tryInitialize("MembershipManager", membershipManager.contract, deployer);

  // ========== 5. Deploy PaymentProcessor ==========
  const paymentProcessor = await deployDeterministic(
    "PaymentProcessor",
    [],
    generateSalt(saltPrefix + "PaymentProcessor"),
    deployer
  );
  deployments.paymentProcessor = paymentProcessor.address;
  await tryInitialize("PaymentProcessor", paymentProcessor.contract, deployer);

  // ========== Wire up all contracts ==========
  console.log("\n\nWiring up contracts...");

  // Wire RoleManagerCore extensions
  try {
    console.log("Setting RoleManagerCore extensions...");
    const tx = await roleManagerCore.contract.setAllExtensions(
      tierRegistry.address,
      paymentProcessor.address,
      usageTracker.address,
      membershipManager.address
    );
    await tx.wait();
    console.log("  ✓ RoleManagerCore extensions set");
  } catch (error) {
    console.warn("  ⚠️  RoleManagerCore extensions may already be set");
  }

  // Wire TierRegistry
  try {
    const tx = await tierRegistry.contract.setRoleManagerCore(roleManagerCore.address);
    await tx.wait();
    console.log("  ✓ TierRegistry linked to RoleManagerCore");
  } catch (error) {
    console.warn("  ⚠️  TierRegistry may already be linked");
  }

  // Wire UsageTracker
  try {
    const tx = await usageTracker.contract.configureAll(roleManagerCore.address, tierRegistry.address);
    await tx.wait();
    console.log("  ✓ UsageTracker configured");
  } catch (error) {
    console.warn("  ⚠️  UsageTracker may already be configured");
  }

  // Wire MembershipManager
  try {
    const tx = await membershipManager.contract.configureAll(roleManagerCore.address, tierRegistry.address);
    await tx.wait();
    console.log("  ✓ MembershipManager configured");
  } catch (error) {
    console.warn("  ⚠️  MembershipManager may already be configured");
  }

  // Wire PaymentProcessor
  try {
    const tx = await paymentProcessor.contract.configureAll(
      roleManagerCore.address,
      tierRegistry.address,
      membershipManager.address,
      ethers.ZeroAddress // No PaymentManager yet - set later if needed
    );
    await tx.wait();
    console.log("  ✓ PaymentProcessor configured");
  } catch (error) {
    console.warn("  ⚠️  PaymentProcessor may already be configured");
  }

  // ========== Summary ==========
  console.log("\n\n=== Modular Role Manager Deployment Summary ===");
  console.log("Network:", network.name, `(Chain ID: ${network.chainId})`);
  console.log("\nDeployed Contracts:");
  console.log("==================");
  console.log("RoleManagerCore:    ", deployments.roleManagerCore);
  console.log("TierRegistry:       ", deployments.tierRegistry);
  console.log("UsageTracker:       ", deployments.usageTracker);
  console.log("MembershipManager:  ", deployments.membershipManager);
  console.log("PaymentProcessor:   ", deployments.paymentProcessor);

  console.log("\n✓ Modular deployment completed!");
  console.log("\nNext steps:");
  console.log("  1. Configure tier metadata via TierRegistry.setTierMetadata()");
  console.log("  2. Set PaymentManager address in PaymentProcessor if needed");
  console.log("  3. Use RoleManagerCore address as the 'roleManager' for other contracts");

  return deployments;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
