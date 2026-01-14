/**
 * Deploy MembershipPaymentManager and Configure PaymentProcessor
 *
 * Run after deploy-modular-rbac.js to add payment processing capability
 *
 * Usage: npx hardhat run scripts/configure-payment-manager.js --network mordor
 */

const hre = require("hardhat");
const { ethers } = require("hardhat");

// Safe Singleton Factory address
const SINGLETON_FACTORY_ADDRESS = "0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7";

// Deployed modular RBAC contracts from previous deployment
const DEPLOYED = {
  roleManagerCore: '0x888332df7621EC341131d85e2228f00407777dD7',
  tierRegistry: '0xB258929f3247897A788EBfE03c37b4B6C3282482',
  paymentProcessor: '0xC6A3D457b0a0D9Fa4859F4211A4c9551F8Ce1F63',
  membershipManager: '0x5fbc6c64CAF5EA21090b50e0E4bb07ADdA0eB661'
};

// USC stablecoin on Mordor
const USC_ADDRESS = '0xDE093684c796204224BC081f937aa059D903c52a';

function generateSalt(identifier) {
  return ethers.id(identifier);
}

async function deployDeterministic(contractName, constructorArgs, salt, deployer) {
  console.log(`\nDeploying ${contractName} deterministically...`);

  const ContractFactory = await ethers.getContractFactory(contractName, deployer);
  const deployTx = await ContractFactory.getDeployTransaction(...constructorArgs);
  const deploymentData = deployTx?.data;

  if (!deploymentData) {
    throw new Error(`Failed to build initCode for ${contractName}`);
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

  const latestBlock = await ethers.provider.getBlock("latest");
  const blockGasLimit = latestBlock?.gasLimit;
  let gasLimit;

  try {
    const estimatedGas = await ethers.provider.estimateGas({
      from: deployer.address,
      to: SINGLETON_FACTORY_ADDRESS,
      data: txData,
    });
    const buffered = (estimatedGas * 120n) / 100n;
    gasLimit = blockGasLimit ? (buffered > (blockGasLimit * 95n / 100n) ? (blockGasLimit * 95n / 100n) : buffered) : buffered;
    console.log(`  Estimated gas: ${estimatedGas.toString()} (using ${gasLimit.toString()})`);
  } catch (error) {
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

  return {
    address: deterministicAddress,
    contract: ContractFactory.attach(deterministicAddress),
    alreadyDeployed: false
  };
}

async function main() {
  console.log("=".repeat(60));
  console.log("Deploy MembershipPaymentManager and Configure PaymentProcessor");
  console.log("=".repeat(60));

  const network = await ethers.provider.getNetwork();
  console.log(`\nNetwork: ${network.name} (Chain ID: ${network.chainId})`);

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  const treasuryAddress = process.env.TREASURY_ADDRESS || deployer.address;
  console.log("Treasury address:", treasuryAddress);

  // Deploy MembershipPaymentManager
  const saltPrefix = "ClearPathDAO-Modular-v1.0-";
  const membershipPaymentManager = await deployDeterministic(
    "MembershipPaymentManager",
    [treasuryAddress],
    generateSalt(saltPrefix + "MembershipPaymentManager"),
    deployer
  );

  // Configure PaymentProcessor with MembershipPaymentManager
  console.log("\nConfiguring PaymentProcessor...");
  const paymentProcessor = await ethers.getContractAt("PaymentProcessor", DEPLOYED.paymentProcessor);

  try {
    const tx = await paymentProcessor.configureAll(
      DEPLOYED.roleManagerCore,
      DEPLOYED.tierRegistry,
      DEPLOYED.membershipManager,
      membershipPaymentManager.address
    );
    await tx.wait();
    console.log("  ✓ PaymentProcessor configured with MembershipPaymentManager");
  } catch (error) {
    console.warn("  ⚠️  PaymentProcessor may already be configured:", error.message);
  }

  // Configure MembershipPaymentManager
  console.log("\nConfiguring MembershipPaymentManager...");

  // Add USC as payment token
  try {
    const tx = await membershipPaymentManager.contract.addPaymentToken(
      USC_ADDRESS,
      "USC",
      6
    );
    await tx.wait();
    console.log("  ✓ USC added as payment token");
  } catch (error) {
    console.warn("  ⚠️  USC may already be configured:", error.message);
  }

  // Set role prices
  const MARKET_MAKER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MARKET_MAKER_ROLE"));
  const FRIEND_MARKET_ROLE = ethers.keccak256(ethers.toUtf8Bytes("FRIEND_MARKET_ROLE"));

  const rolePrices = [
    { role: MARKET_MAKER_ROLE, name: "MARKET_MAKER_ROLE", price: "100" },
    { role: FRIEND_MARKET_ROLE, name: "FRIEND_MARKET_ROLE", price: "50" }
  ];

  for (const { role, name, price } of rolePrices) {
    try {
      const priceWei = ethers.parseUnits(price, 6);
      const tx = await membershipPaymentManager.contract.setRolePrice(role, USC_ADDRESS, priceWei);
      await tx.wait();
      console.log(`  ✓ ${name} price set to ${price} USC`);
    } catch (error) {
      console.warn(`  ⚠️  ${name} price may already be set:`, error.message);
    }
  }

  // ========== Configure TierRegistry with active tiers ==========
  console.log("\nConfiguring TierRegistry tiers...");
  const tierRegistry = await ethers.getContractAt("TierRegistry", DEPLOYED.tierRegistry);

  // Membership tiers (matching contract enum: NONE=0, BRONZE=1, SILVER=2, GOLD=3, PLATINUM=4)
  const MembershipTier = { NONE: 0, BRONZE: 1, SILVER: 2, GOLD: 3, PLATINUM: 4 };

  // Default tier limits
  const defaultLimits = {
    dailyBetLimit: ethers.parseUnits("10000", 6),
    weeklyBetLimit: ethers.parseUnits("50000", 6),
    monthlyMarketCreation: 10,
    maxPositionSize: ethers.parseUnits("5000", 6),
    maxConcurrentMarkets: 5,
    withdrawalLimit: ethers.parseUnits("10000", 6),
    canCreatePrivateMarkets: true,
    canUseAdvancedFeatures: false,
    feeDiscount: 0
  };

  // Configure MARKET_MAKER_ROLE tier 1 (BRONZE) - this is what the frontend uses as "BASIC"
  const marketMakerTiers = [
    {
      tier: MembershipTier.BRONZE,
      name: "Basic Market Maker",
      description: "Basic market creation access",
      price: ethers.parseUnits("100", 6),
      limits: defaultLimits,
      isActive: true
    },
    {
      tier: MembershipTier.SILVER,
      name: "Standard Market Maker",
      description: "Enhanced market creation with higher limits",
      price: ethers.parseUnits("250", 6),
      limits: { ...defaultLimits, monthlyMarketCreation: 25, maxConcurrentMarkets: 10 },
      isActive: true
    }
  ];

  for (const tierConfig of marketMakerTiers) {
    try {
      console.log(`  Setting MARKET_MAKER tier ${tierConfig.tier} (${tierConfig.name})...`);
      const tx = await tierRegistry.setTierMetadata(
        MARKET_MAKER_ROLE,
        tierConfig.tier,
        tierConfig.name,
        tierConfig.description,
        tierConfig.price,
        tierConfig.limits,
        tierConfig.isActive
      );
      await tx.wait();
      console.log(`  ✓ MARKET_MAKER tier ${tierConfig.tier} configured`);
    } catch (error) {
      console.warn(`  ⚠️  MARKET_MAKER tier ${tierConfig.tier} may already be set:`, error.message);
    }
  }

  // Configure FRIEND_MARKET_ROLE tier 1 (BRONZE)
  try {
    console.log(`  Setting FRIEND_MARKET tier 1 (Basic Friend Access)...`);
    const tx = await tierRegistry.setTierMetadata(
      FRIEND_MARKET_ROLE,
      MembershipTier.BRONZE,
      "Basic Friend Access",
      "Access to friend markets",
      ethers.parseUnits("50", 6),
      { ...defaultLimits, monthlyMarketCreation: 0, maxConcurrentMarkets: 0 },
      true
    );
    await tx.wait();
    console.log(`  ✓ FRIEND_MARKET tier 1 configured`);
  } catch (error) {
    console.warn(`  ⚠️  FRIEND_MARKET tier 1 may already be set:`, error.message);
  }

  // Verify TierRegistry configuration
  console.log("\nVerifying TierRegistry configuration...");
  const tier1Active = await tierRegistry.isTierActive(MARKET_MAKER_ROLE, MembershipTier.BRONZE);
  const tier1Price = await tierRegistry.getTierPrice(MARKET_MAKER_ROLE, MembershipTier.BRONZE);
  console.log(`  MARKET_MAKER tier 1 (BRONZE): active=${tier1Active}, price=${ethers.formatUnits(tier1Price, 6)} USC`)

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("Deployment Complete!");
  console.log("=".repeat(60));
  console.log("\nMembershipPaymentManager:", membershipPaymentManager.address);
  console.log("\nUpdate frontend/src/config/contracts.js with:");
  console.log(`  paymentProcessor: '${DEPLOYED.paymentProcessor}',`);
  console.log(`  tierRegistry: '${DEPLOYED.tierRegistry}',`);
  console.log(`  membershipPaymentManager: '${membershipPaymentManager.address}'`);
  console.log(`  roleManagerCore: '${DEPLOYED.roleManagerCore}'`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
