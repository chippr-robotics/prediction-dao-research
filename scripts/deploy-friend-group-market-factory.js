const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Safe Singleton Factory address (same on all EVM networks)
const SINGLETON_FACTORY_ADDRESS = "0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7";

/**
 * Deploy FriendGroupMarketFactory
 *
 * This script deploys the FriendGroupMarketFactory contract which enables
 * friend-to-friend prediction markets with tiered membership access.
 *
 * Prerequisites:
 * - ConditionalMarketFactory deployed
 * - RagequitModule deployed
 * - TieredRoleManager deployed (use deploy-tiered-role-manager.js)
 * - MembershipPaymentManager deployed
 *
 * Run with: npx hardhat run scripts/deploy-friend-group-market-factory.js --network <network>
 */

// Contract addresses - UPDATE THESE for your network
const NETWORK_CONFIG = {
  mordor: {
    marketFactory: "0x37b9086Cc0d03C8a1030cC50256593B8D0d369Ac",
    ragequitModule: "0x1D30f1DBF2f7B9C050F5de8b98Dc63C54Bfff1e7",  // Checksummed
    tieredRoleManager: "0xA6F794292488C628f91A0475dDF8dE6cEF2706EF",  // New optimized TieredRoleManager
    paymentManager: "0xA61C3a81E25e8E5e7a6a7ECEbED7E1bF58533E28",
    collateralToken: "0xDE093684c796204224BC081f937aa059D903c52a"  // USC stablecoin
  },
  hardhat: {
    // Will be deployed in sequence
    marketFactory: null,
    ragequitModule: null,
    tieredRoleManager: null,
    paymentManager: null,
    collateralToken: null
  }
};

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

async function main() {
  console.log("=".repeat(60));
  console.log("FriendGroupMarketFactory Deployment");
  console.log("=".repeat(60));

  const network = await ethers.provider.getNetwork();
  const networkName = hre.network.name;
  console.log(`\nNetwork: ${networkName} (Chain ID: ${network.chainId})`);

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

  // Get network config
  const config = NETWORK_CONFIG[networkName];
  if (!config) {
    throw new Error(`No configuration found for network: ${networkName}. Please add it to NETWORK_CONFIG.`);
  }

  // Validate addresses
  console.log("\nDependency contracts:");
  console.log("  MarketFactory:", config.marketFactory);
  console.log("  RagequitModule:", config.ragequitModule);
  console.log("  TieredRoleManager:", config.tieredRoleManager);
  console.log("  PaymentManager:", config.paymentManager);

  if (!config.marketFactory || !config.ragequitModule || !config.tieredRoleManager || !config.paymentManager) {
    throw new Error("Missing required contract addresses in config");
  }

  const saltPrefix = "ClearPathDAO-FGMF-v1.0-";

  // Deploy FriendGroupMarketFactory
  const friendGroupMarketFactory = await deployDeterministic(
    "FriendGroupMarketFactory",
    [
      config.marketFactory,
      config.ragequitModule,
      config.tieredRoleManager,
      config.paymentManager
    ],
    generateSalt(saltPrefix + "FriendGroupMarketFactory"),
    deployer
  );

  // Configure the factory if newly deployed
  if (!friendGroupMarketFactory.alreadyDeployed) {
    console.log("\nConfiguring FriendGroupMarketFactory...");

    // Set default collateral token if configured
    if (config.collateralToken) {
      try {
        const tx = await friendGroupMarketFactory.contract.setDefaultCollateralToken(config.collateralToken);
        await tx.wait();
        console.log("  ✓ Default collateral token set:", config.collateralToken);
      } catch (error) {
        console.warn("  ⚠️  Failed to set collateral token:", error.message?.split("\n")[0]);
      }
    }

    // Add USC as accepted payment token
    if (config.collateralToken) {
      try {
        const tx = await friendGroupMarketFactory.contract.addAcceptedPaymentToken(config.collateralToken, true);
        await tx.wait();
        console.log("  ✓ USC added as accepted payment token");
      } catch (error) {
        console.warn("  ⚠️  Failed to add payment token:", error.message?.split("\n")[0]);
      }
    }
  }

  // Summary
  console.log("\n\n" + "=".repeat(60));
  console.log("Deployment Summary");
  console.log("=".repeat(60));
  console.log("\nNetwork:", networkName, `(Chain ID: ${network.chainId})`);
  console.log("FriendGroupMarketFactory:", friendGroupMarketFactory.address);
  console.log("\nDependencies:");
  console.log("  - ConditionalMarketFactory:", config.marketFactory);
  console.log("  - RagequitModule:", config.ragequitModule);
  console.log("  - TieredRoleManager:", config.tieredRoleManager);
  console.log("  - MembershipPaymentManager:", config.paymentManager);

  // Save deployment info
  const deploymentsDir = path.join(process.cwd(), "deployments");
  if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir, { recursive: true });

  const deploymentInfo = {
    network: networkName,
    chainId: Number(network.chainId),
    deployer: deployer.address,
    contracts: {
      friendGroupMarketFactory: friendGroupMarketFactory.address
    },
    dependencies: {
      marketFactory: config.marketFactory,
      ragequitModule: config.ragequitModule,
      tieredRoleManager: config.tieredRoleManager,
      paymentManager: config.paymentManager,
      collateralToken: config.collateralToken
    },
    timestamp: new Date().toISOString()
  };

  const outPath = path.join(deploymentsDir, `${networkName}-friend-group-market-factory.json`);
  fs.writeFileSync(outPath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\nDeployment JSON saved to: ${outPath}`);

  console.log("\n✓ Deployment completed!");
  console.log("\nNext steps:");
  console.log("  1. Update frontend/src/constants/contracts.js with the new address");
  console.log("  2. Users need FRIEND_MARKET_ROLE tier to create markets");
  console.log("  3. Admins can grant tiers via TieredRoleManager.grantTier()");

  return deploymentInfo;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
