/**
 * 03-deploy-markets.js - Market Factories Deployment
 *
 * Deploys market-related contracts:
 * - CTF1155 (ERC1155 conditional tokens)
 * - FriendGroupMarketFactory
 * - PerpetualFuturesFactory (optional)
 * - FundingRateEngine (optional)
 *
 * Prerequisites:
 *   - Run 01-deploy-core.js first
 *   - Run 02-deploy-rbac.js first
 *
 * Usage:
 *   npx hardhat run scripts/deploy/03-deploy-markets.js --network localhost
 *   npx hardhat run scripts/deploy/03-deploy-markets.js --network mordor
 *
 * Environment variables:
 *   DEPLOY_PERPETUALS=true|false - Deploy perpetual futures (default: false)
 */

const hre = require("hardhat");
const { ethers } = require("hardhat");

const {
  SALT_PREFIXES,
  TOKENS,
} = require("./lib/constants");

const {
  generateSalt,
  deployDeterministic,
  ensureSingletonFactory,
  saveDeployment,
  getDeploymentFilename,
  loadDeployment,
  verifyOnBlockscout,
} = require("./lib/helpers");

async function main() {
  console.log("=".repeat(60));
  console.log("03 - Market Factories Deployment");
  console.log("=".repeat(60));

  const network = await ethers.provider.getNetwork();
  console.log(`\nNetwork: ${hre.network.name} (Chain ID: ${network.chainId})`);

  await ensureSingletonFactory();

  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer signer available");
  }
  console.log("\nDeployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  // Load previous deployments
  const coreDeployment = loadDeployment(getDeploymentFilename(network, "core-deployment"));
  const rbacDeployment = loadDeployment(getDeploymentFilename(network, "rbac-deployment"));

  if (!coreDeployment?.contracts) {
    throw new Error("Core deployment not found. Run 01-deploy-core.js first.");
  }
  if (!rbacDeployment?.contracts) {
    throw new Error("RBAC deployment not found. Run 02-deploy-rbac.js first.");
  }

  console.log("\nDependencies:");
  console.log("  MarketFactory:", coreDeployment.contracts.marketFactory);
  console.log("  RagequitModule:", coreDeployment.contracts.ragequitModule);
  console.log("  TieredRoleManager:", rbacDeployment.contracts.tieredRoleManager);
  console.log("  PaymentManager:", rbacDeployment.contracts.membershipPaymentManager);

  const saltPrefix = SALT_PREFIXES.FRIEND_MARKETS;
  const deployments = {};
  const deployPerpetuals = (process.env.DEPLOY_PERPETUALS ?? "false").toLowerCase() === "true";

  // =========================================================================
  // Deploy CTF1155
  // =========================================================================
  console.log("\n\n--- Deploying CTF1155 ---");

  const ctf1155 = await deployDeterministic(
    "CTF1155",
    [],
    generateSalt(saltPrefix + "CTF1155"),
    deployer
  );
  deployments.ctf1155 = ctf1155.address;

  // Configure CTF1155 on MarketFactory
  if (!ctf1155.alreadyDeployed) {
    console.log("  Configuring CTF1155 on MarketFactory...");
    try {
      const Factory = await ethers.getContractFactory("ConditionalMarketFactory", deployer);
      const marketFactory = Factory.attach(coreDeployment.contracts.marketFactory);

      // Check if setCTF1155 exists
      if (typeof marketFactory.setCTF1155 === "function") {
        const tx = await marketFactory.setCTF1155(ctf1155.address);
        await tx.wait();
        console.log("  ✓ CTF1155 set on MarketFactory");
      } else {
        console.warn("  ⚠️  MarketFactory.setCTF1155 not available");
      }
    } catch (error) {
      console.warn(`  ⚠️  CTF1155 configuration skipped: ${error.message?.split("\n")[0]}`);
    }
  }

  // =========================================================================
  // Deploy FriendGroupMarketFactory
  // =========================================================================
  console.log("\n\n--- Deploying FriendGroupMarketFactory ---");

  const networkName = hre.network.name;
  const collateralToken = TOKENS[networkName]?.USC || deployer.address;

  const friendGroupMarketFactory = await deployDeterministic(
    "FriendGroupMarketFactory",
    [
      coreDeployment.contracts.marketFactory,
      coreDeployment.contracts.ragequitModule,
      rbacDeployment.contracts.tieredRoleManager,
      rbacDeployment.contracts.membershipPaymentManager,
      deployer.address  // Explicit owner for deterministic deployment
    ],
    generateSalt(saltPrefix + "FriendGroupMarketFactory-v5"),
    deployer
  );
  deployments.friendGroupMarketFactory = friendGroupMarketFactory.address;

  // Configure FriendGroupMarketFactory
  if (!friendGroupMarketFactory.alreadyDeployed) {
    console.log("  Configuring FriendGroupMarketFactory...");

    // Set default collateral token
    if (TOKENS[networkName]?.USC) {
      try {
        const tx = await friendGroupMarketFactory.contract.setDefaultCollateralToken(collateralToken);
        await tx.wait();
        console.log(`  ✓ Default collateral token set: ${collateralToken}`);
      } catch (error) {
        console.warn(`  ⚠️  Failed to set collateral token: ${error.message?.split("\n")[0]}`);
      }

      // Add as accepted payment token
      try {
        const tx = await friendGroupMarketFactory.contract.addAcceptedPaymentToken(collateralToken, true);
        await tx.wait();
        console.log("  ✓ USC added as accepted payment token");
      } catch (error) {
        console.warn(`  ⚠️  Failed to add payment token: ${error.message?.split("\n")[0]}`);
      }
    }
  }

  // =========================================================================
  // Deploy Perpetual Futures (optional)
  // =========================================================================
  if (deployPerpetuals) {
    console.log("\n\n--- Deploying Perpetual Futures ---");

    const perpSaltPrefix = SALT_PREFIXES.PERPETUALS;

    // FundingRateEngine
    console.log("\n  Deploying FundingRateEngine...");
    const fundingRateEngine = await deployDeterministic(
      "FundingRateEngine",
      [],
      generateSalt(perpSaltPrefix + "FundingRateEngine"),
      deployer
    );
    deployments.fundingRateEngine = fundingRateEngine.address;

    // PerpetualFuturesFactory
    console.log("\n  Deploying PerpetualFuturesFactory...");
    const perpFactory = await deployDeterministic(
      "PerpetualFuturesFactory",
      [fundingRateEngine.address],
      generateSalt(perpSaltPrefix + "PerpetualFuturesFactory"),
      deployer
    );
    deployments.perpFactory = perpFactory.address;

    // Wire FundingRateEngine
    if (!fundingRateEngine.alreadyDeployed) {
      try {
        const tx = await fundingRateEngine.contract.setPriceUpdater(perpFactory.address, true);
        await tx.wait();
        console.log("  ✓ PerpFactory authorized on FundingRateEngine");
      } catch (error) {
        console.warn(`  ⚠️  FundingRateEngine configuration skipped: ${error.message?.split("\n")[0]}`);
      }
    }

    // Create default markets (BTC, ETH, ETC)
    if (!perpFactory.alreadyDeployed && TOKENS[networkName]?.USC) {
      console.log("\n  Creating default perpetual markets...");
      const markets = [
        { name: "BTC-PERP", oracle: deployer.address },
        { name: "ETH-PERP", oracle: deployer.address },
        { name: "ETC-PERP", oracle: deployer.address },
      ];

      for (const market of markets) {
        try {
          const tx = await perpFactory.contract.createMarket(
            market.name,
            TOKENS[networkName].USC,
            market.oracle
          );
          const receipt = await tx.wait();
          console.log(`  ✓ Created ${market.name}`);
        } catch (error) {
          console.warn(`  ⚠️  Failed to create ${market.name}: ${error.message?.split("\n")[0]}`);
        }
      }
    }
  } else {
    console.log("\n\nSkipping perpetual futures deployment (set DEPLOY_PERPETUALS=true to enable)");
  }

  // =========================================================================
  // Verify contracts
  // =========================================================================
  console.log("\n\n--- Verifying Contracts ---");

  const verificationTargets = [
    { name: "CTF1155", address: ctf1155.address, constructorArguments: [] },
    {
      name: "FriendGroupMarketFactory",
      address: friendGroupMarketFactory.address,
      constructorArguments: [
        coreDeployment.contracts.marketFactory,
        coreDeployment.contracts.ragequitModule,
        rbacDeployment.contracts.tieredRoleManager,
        rbacDeployment.contracts.membershipPaymentManager,
        deployer.address
      ]
    },
  ];

  if (deployPerpetuals && deployments.fundingRateEngine) {
    verificationTargets.push(
      { name: "FundingRateEngine", address: deployments.fundingRateEngine, constructorArguments: [] },
      { name: "PerpetualFuturesFactory", address: deployments.perpFactory, constructorArguments: [deployments.fundingRateEngine] }
    );
  }

  for (const target of verificationTargets) {
    console.log(`Verifying ${target.name}...`);
    await verifyOnBlockscout(target);
  }

  // =========================================================================
  // Summary
  // =========================================================================
  console.log("\n\n" + "=".repeat(60));
  console.log("Markets Deployment Summary");
  console.log("=".repeat(60));
  console.log(`\nNetwork: ${hre.network.name} (Chain ID: ${network.chainId})`);
  console.log("\nDeployed Contracts:");
  console.log("─".repeat(50));
  Object.entries(deployments).forEach(([name, address]) => {
    console.log(`  ${name.padEnd(30)} ${address}`);
  });

  // Save deployment
  const deploymentInfo = {
    network: hre.network.name,
    chainId: Number(network.chainId),
    deployer: deployer.address,
    contracts: deployments,
    dependencies: {
      marketFactory: coreDeployment.contracts.marketFactory,
      ragequitModule: coreDeployment.contracts.ragequitModule,
      tieredRoleManager: rbacDeployment.contracts.tieredRoleManager,
      paymentManager: rbacDeployment.contracts.membershipPaymentManager,
    },
    timestamp: new Date().toISOString()
  };

  saveDeployment(getDeploymentFilename(network, "markets-deployment"), deploymentInfo);

  console.log("\n✓ Markets deployment completed!");
  console.log("\nNext steps:");
  console.log("  1. Run 04-deploy-registries.js for additional registries");
  console.log("  2. Run 05-configure.js for final authorization setup");
  console.log("  3. Users need FRIEND_MARKET_ROLE tier to create friend markets");

  return deploymentInfo;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
