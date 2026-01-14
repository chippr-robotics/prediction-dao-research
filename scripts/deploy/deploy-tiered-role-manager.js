const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Safe Singleton Factory address (same on all EVM networks)
const SINGLETON_FACTORY_ADDRESS = "0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7";

/**
 * Deploy TieredRoleManager with full tier configuration
 *
 * This script deploys the optimized TieredRoleManager contract and configures
 * all Friend Market tiers post-deployment (since tier initialization was removed
 * from the contract to reduce bytecode size under 24KB).
 *
 * Run with: npx hardhat run scripts/deploy-tiered-role-manager.js --network <network>
 */

// Role hashes
const FRIEND_MARKET_ROLE = ethers.keccak256(ethers.toUtf8Bytes("FRIEND_MARKET_ROLE"));
const MARKET_MAKER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MARKET_MAKER_ROLE"));

// Tier enum values
const MembershipTier = {
  NONE: 0,
  BRONZE: 1,
  SILVER: 2,
  GOLD: 3,
  PLATINUM: 4
};

// Friend Market tier configurations (from TierInitLib)
const FRIEND_MARKET_TIERS = [
  {
    tier: MembershipTier.BRONZE,
    name: "Friend Market Bronze",
    description: "Basic friend market creation - 15 markets/month",
    price: ethers.parseEther("50"),
    limits: {
      dailyBetLimit: 5,
      weeklyBetLimit: 20,
      monthlyMarketCreation: 15,
      maxPositionSize: ethers.parseEther("5"),
      maxConcurrentMarkets: 5,
      withdrawalLimit: ethers.parseEther("25"),
      canCreatePrivateMarkets: true,
      canUseAdvancedFeatures: false,
      feeDiscount: 10000  // 100% discount (no fees for friend markets)
    }
  },
  {
    tier: MembershipTier.SILVER,
    name: "Friend Market Silver",
    description: "Enhanced friend market creation - 30 markets/month",
    price: ethers.parseEther("100"),
    limits: {
      dailyBetLimit: 10,
      weeklyBetLimit: 50,
      monthlyMarketCreation: 30,
      maxPositionSize: ethers.parseEther("15"),
      maxConcurrentMarkets: 10,
      withdrawalLimit: ethers.parseEther("100"),
      canCreatePrivateMarkets: true,
      canUseAdvancedFeatures: true,
      feeDiscount: 10000
    }
  },
  {
    tier: MembershipTier.GOLD,
    name: "Friend Market Gold",
    description: "Advanced friend market creation - 100 markets/month",
    price: ethers.parseEther("200"),
    limits: {
      dailyBetLimit: 35,
      weeklyBetLimit: 200,
      monthlyMarketCreation: 100,
      maxPositionSize: ethers.parseEther("50"),
      maxConcurrentMarkets: 30,
      withdrawalLimit: ethers.parseEther("500"),
      canCreatePrivateMarkets: true,
      canUseAdvancedFeatures: true,
      feeDiscount: 10000
    }
  },
  {
    tier: MembershipTier.PLATINUM,
    name: "Friend Market Platinum",
    description: "Unlimited friend market creation",
    price: ethers.parseEther("400"),
    limits: {
      dailyBetLimit: ethers.MaxUint256,
      weeklyBetLimit: ethers.MaxUint256,
      monthlyMarketCreation: ethers.MaxUint256,
      maxPositionSize: ethers.MaxUint256,
      maxConcurrentMarkets: ethers.MaxUint256,
      withdrawalLimit: ethers.MaxUint256,
      canCreatePrivateMarkets: true,
      canUseAdvancedFeatures: true,
      feeDiscount: 10000
    }
  }
];

// Market Maker tier configurations
const MARKET_MAKER_TIERS = [
  {
    tier: MembershipTier.BRONZE,
    name: "Market Maker Bronze",
    description: "Basic market creation capabilities",
    price: ethers.parseEther("100"),
    limits: {
      dailyBetLimit: 10,
      weeklyBetLimit: 50,
      monthlyMarketCreation: 5,
      maxPositionSize: ethers.parseEther("10"),
      maxConcurrentMarkets: 3,
      withdrawalLimit: ethers.parseEther("50"),
      canCreatePrivateMarkets: false,
      canUseAdvancedFeatures: false,
      feeDiscount: 0
    }
  },
  {
    tier: MembershipTier.SILVER,
    name: "Market Maker Silver",
    description: "Enhanced market creation with more limits",
    price: ethers.parseEther("150"),
    limits: {
      dailyBetLimit: 25,
      weeklyBetLimit: 150,
      monthlyMarketCreation: 15,
      maxPositionSize: ethers.parseEther("50"),
      maxConcurrentMarkets: 10,
      withdrawalLimit: ethers.parseEther("200"),
      canCreatePrivateMarkets: false,
      canUseAdvancedFeatures: true,
      feeDiscount: 500  // 5% discount
    }
  },
  {
    tier: MembershipTier.GOLD,
    name: "Market Maker Gold",
    description: "Professional market creation capabilities",
    price: ethers.parseEther("250"),
    limits: {
      dailyBetLimit: 100,
      weeklyBetLimit: 500,
      monthlyMarketCreation: 50,
      maxPositionSize: ethers.parseEther("200"),
      maxConcurrentMarkets: 30,
      withdrawalLimit: ethers.parseEther("1000"),
      canCreatePrivateMarkets: true,
      canUseAdvancedFeatures: true,
      feeDiscount: 1000  // 10% discount
    }
  },
  {
    tier: MembershipTier.PLATINUM,
    name: "Market Maker Platinum",
    description: "Unlimited market creation for institutions",
    price: ethers.parseEther("500"),
    limits: {
      dailyBetLimit: ethers.MaxUint256,
      weeklyBetLimit: ethers.MaxUint256,
      monthlyMarketCreation: ethers.MaxUint256,
      maxPositionSize: ethers.MaxUint256,
      maxConcurrentMarkets: ethers.MaxUint256,
      withdrawalLimit: ethers.MaxUint256,
      canCreatePrivateMarkets: true,
      canUseAdvancedFeatures: true,
      feeDiscount: 2000  // 20% discount
    }
  }
];

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

  // Log bytecode size
  const artifact = await hre.artifacts.readArtifact(contractName);
  const runtimeBytes = Math.floor((artifact?.deployedBytecode?.length - 2) / 2);
  console.log(`  Runtime code size: ${runtimeBytes} bytes (limit: 24,576)`);

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
  const txData = ethers.concat([salt, deploymentData]);

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

async function configureTier(contract, role, tierConfig, roleLabel, deployer) {
  const tierNames = ["NONE", "BRONZE", "SILVER", "GOLD", "PLATINUM"];
  const tierName = tierNames[tierConfig.tier];

  console.log(`  Setting ${roleLabel} ${tierName} tier...`);

  // Convert limits to tuple format expected by contract
  const limitsArray = [
    tierConfig.limits.dailyBetLimit,
    tierConfig.limits.weeklyBetLimit,
    tierConfig.limits.monthlyMarketCreation,
    tierConfig.limits.maxPositionSize,
    tierConfig.limits.maxConcurrentMarkets,
    tierConfig.limits.withdrawalLimit,
    tierConfig.limits.canCreatePrivateMarkets,
    tierConfig.limits.canUseAdvancedFeatures,
    tierConfig.limits.feeDiscount
  ];

  try {
    const tx = await contract.setTierMetadata(
      role,
      tierConfig.tier,
      tierConfig.name,
      tierConfig.description,
      tierConfig.price,
      limitsArray,
      true  // isActive
    );
    await tx.wait();
    console.log(`    ✓ ${tierName} configured`);
    return true;
  } catch (error) {
    const message = error?.message || String(error);
    console.warn(`    ⚠️  ${tierName} configuration failed: ${message.split("\n")[0]}`);
    return false;
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("TieredRoleManager Deployment with Tier Configuration");
  console.log("=".repeat(60));

  const network = await ethers.provider.getNetwork();
  console.log(`\nNetwork: ${network.name} (Chain ID: ${network.chainId})`);

  // Verify factory
  const factoryCode = await ethers.provider.getCode(SINGLETON_FACTORY_ADDRESS);
  if (factoryCode === "0x") {
    throw new Error("Safe Singleton Factory not deployed on this network");
  }
  console.log("✓ Factory contract verified");

  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer signer available");
  }
  console.log("\nDeployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  const saltPrefix = "ClearPathDAO-TRM-v1.1-";

  // Deploy TieredRoleManager
  const tieredRoleManager = await deployDeterministic(
    "TieredRoleManager",
    [],
    generateSalt(saltPrefix + "TieredRoleManager"),
    deployer
  );

  // Initialize if newly deployed
  if (!tieredRoleManager.alreadyDeployed) {
    console.log("\nInitializing TieredRoleManager...");
    try {
      const tx = await tieredRoleManager.contract.initialize(deployer.address);
      await tx.wait();
      console.log("  ✓ Initialized with admin:", deployer.address);
    } catch (error) {
      const message = error?.message || String(error);
      if (message.includes("TRMAlreadyInit")) {
        console.log("  ✓ Already initialized");
      } else {
        console.warn(`  ⚠️  Initialize failed: ${message.split("\n")[0]}`);
      }
    }
  }

  // Configure Friend Market tiers
  console.log("\n\nConfiguring Friend Market tiers...");
  console.log("Role hash:", FRIEND_MARKET_ROLE);

  for (const tierConfig of FRIEND_MARKET_TIERS) {
    await configureTier(
      tieredRoleManager.contract,
      FRIEND_MARKET_ROLE,
      tierConfig,
      "FRIEND_MARKET",
      deployer
    );
  }

  // Configure Market Maker tiers
  console.log("\nConfiguring Market Maker tiers...");
  console.log("Role hash:", MARKET_MAKER_ROLE);

  for (const tierConfig of MARKET_MAKER_TIERS) {
    await configureTier(
      tieredRoleManager.contract,
      MARKET_MAKER_ROLE,
      tierConfig,
      "MARKET_MAKER",
      deployer
    );
  }

  // Set up Friend Market role as premium (purchasable)
  console.log("\nConfiguring role metadata...");
  try {
    const contract = tieredRoleManager.contract;

    // Check if setRoleMetadata exists
    if (typeof contract.setRoleMetadata === "function") {
      // Set FRIEND_MARKET_ROLE as premium
      const tx1 = await contract.setRoleMetadata(
        FRIEND_MARKET_ROLE,
        "Friend Market Role",
        "Create private prediction markets with friends",
        true,  // isPremium
        0      // maxMembers (unlimited)
      );
      await tx1.wait();
      console.log("  ✓ FRIEND_MARKET_ROLE configured as premium");

      // Set MARKET_MAKER_ROLE as premium
      const tx2 = await contract.setRoleMetadata(
        MARKET_MAKER_ROLE,
        "Market Maker Role",
        "Create public prediction markets",
        true,  // isPremium
        0      // maxMembers (unlimited)
      );
      await tx2.wait();
      console.log("  ✓ MARKET_MAKER_ROLE configured as premium");
    } else {
      console.log("  ⚠️  setRoleMetadata not available (inherited from RoleManager)");
    }
  } catch (error) {
    const message = error?.message || String(error);
    console.warn(`  ⚠️  Role metadata configuration failed: ${message.split("\n")[0]}`);
  }

  // Summary
  console.log("\n\n" + "=".repeat(60));
  console.log("Deployment Summary");
  console.log("=".repeat(60));
  console.log("\nNetwork:", network.name, `(Chain ID: ${network.chainId})`);
  console.log("TieredRoleManager:", tieredRoleManager.address);
  console.log("Admin:", deployer.address);
  console.log("\nConfigured Roles:");
  console.log("  - FRIEND_MARKET_ROLE:", FRIEND_MARKET_ROLE);
  console.log("  - MARKET_MAKER_ROLE:", MARKET_MAKER_ROLE);
  console.log("\nTiers configured for each role: BRONZE, SILVER, GOLD, PLATINUM");

  // Save deployment info
  const deploymentsDir = path.join(process.cwd(), "deployments");
  if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir, { recursive: true });

  const deploymentInfo = {
    network: network.name,
    chainId: Number(network.chainId),
    deployer: deployer.address,
    saltPrefix,
    contracts: {
      tieredRoleManager: tieredRoleManager.address
    },
    roles: {
      FRIEND_MARKET_ROLE,
      MARKET_MAKER_ROLE
    },
    timestamp: new Date().toISOString()
  };

  const outPath = path.join(deploymentsDir, `${network.name}-tiered-role-manager.json`);
  fs.writeFileSync(outPath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\nDeployment JSON saved to: ${outPath}`);

  console.log("\n✓ Deployment completed!");
  console.log("\nNext steps:");
  console.log("  1. Update FriendGroupMarketFactory to use this TieredRoleManager address");
  console.log("  2. Users can purchase tiers via purchaseRoleWithTier()");
  console.log("  3. Admins can grant tiers via grantTier()");

  return deploymentInfo;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
