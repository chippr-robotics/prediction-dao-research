/**
 * Redeploy Perpetual Futures Contracts
 *
 * This script redeploys the PerpetualFuturesFactory and creates new markets
 * with the fixed decimal handling for non-18 decimal tokens (like USC with 6 decimals).
 *
 * Usage:
 *   npx hardhat run scripts/deploy/redeploy-perpetual-futures.js --network mordor
 */

const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const {
  TOKENS,
} = require("./lib/constants");

const {
  generateSalt,
  deployDeterministic,
  ensureSingletonFactory,
  verifyOnBlockscout,
} = require("./lib/helpers");

// Use a new salt prefix for the fixed version with owner param
const PERP_SALT_PREFIX = "ClearPathDAO-Perp-v2.1-";

async function main() {
  console.log("=".repeat(60));
  console.log("Redeploy Perpetual Futures (Fixed Decimal Handling)");
  console.log("=".repeat(60));

  const network = await ethers.provider.getNetwork();
  console.log(`\nNetwork: ${hre.network.name} (Chain ID: ${network.chainId})`);

  await ensureSingletonFactory();

  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer signer available");
  }
  console.log("\nDeployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETC");

  const networkName = hre.network.name;
  const collateralToken = TOKENS[networkName]?.USC;

  if (!collateralToken) {
    throw new Error(`No USC token configured for network: ${networkName}`);
  }
  console.log("\nCollateral Token (USC):", collateralToken);

  const deployments = {};

  // =========================================================================
  // Deploy FundingRateEngine
  // =========================================================================
  console.log("\n\n--- Deploying FundingRateEngine ---");

  const fundingRateEngine = await deployDeterministic(
    "FundingRateEngine",
    [deployer.address],  // _owner - explicit owner for CREATE2
    generateSalt(PERP_SALT_PREFIX + "FundingRateEngine"),
    deployer
  );
  deployments.fundingRateEngine = fundingRateEngine.address;
  console.log("  FundingRateEngine:", fundingRateEngine.address);

  // =========================================================================
  // Deploy PerpetualFuturesFactory
  // =========================================================================
  console.log("\n\n--- Deploying PerpetualFuturesFactory ---");

  const perpFactory = await deployDeterministic(
    "PerpetualFuturesFactory",
    [
      deployer.address,           // _owner - explicit owner for CREATE2
      fundingRateEngine.address,  // _fundingRateEngine
      deployer.address,           // _feeRecipient (treasury)
      collateralToken             // _defaultCollateralToken (USC)
    ],
    generateSalt(PERP_SALT_PREFIX + "PerpetualFuturesFactory"),
    deployer
  );
  deployments.perpFactory = perpFactory.address;
  console.log("  PerpetualFuturesFactory:", perpFactory.address);

  // =========================================================================
  // Configure Contracts
  // =========================================================================
  console.log("\n\n--- Configuring Contracts ---");

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

  // Set creation fee to 0 for admin-only markets
  if (!perpFactory.alreadyDeployed) {
    try {
      const tx = await perpFactory.contract.setCreationFee(0);
      await tx.wait();
      console.log("  ✓ Creation fee set to 0");
    } catch (error) {
      console.warn(`  ⚠️  Failed to set creation fee: ${error.message?.split("\n")[0]}`);
    }
  }

  // =========================================================================
  // Create Default Markets
  // =========================================================================
  console.log("\n\n--- Creating Default Markets ---");

  const marketConfigs = [
    {
      name: "Bitcoin Perpetual",
      underlyingAsset: "BTC",
      category: 0, // Crypto
      initialIndexPrice: ethers.parseEther("100000"), // $100,000
      initialMarkPrice: ethers.parseEther("100000"),
    },
    {
      name: "Ethereum Perpetual",
      underlyingAsset: "ETH",
      category: 0,
      initialIndexPrice: ethers.parseEther("4000"), // $4,000
      initialMarkPrice: ethers.parseEther("4000"),
    },
    {
      name: "Ethereum Classic Perpetual",
      underlyingAsset: "ETC",
      category: 0,
      initialIndexPrice: ethers.parseEther("30"), // $30
      initialMarkPrice: ethers.parseEther("30"),
    },
  ];

  const defaultConfig = {
    maxLeverage: 20 * 10000,           // 20x
    initialMarginRate: 500,             // 5%
    maintenanceMarginRate: 250,         // 2.5%
    liquidationFeeRate: 100,            // 1%
    tradingFeeRate: 10,                 // 0.1%
    fundingInterval: 8 * 3600,          // 8 hours
    maxFundingRate: 1000                // 0.1%
  };

  const markets = [];

  if (!perpFactory.alreadyDeployed) {
    for (const marketConfig of marketConfigs) {
      try {
        console.log(`\n  Creating ${marketConfig.name}...`);

        const params = {
          name: marketConfig.name,
          underlyingAsset: marketConfig.underlyingAsset,
          collateralToken: collateralToken,
          category: marketConfig.category,
          initialIndexPrice: marketConfig.initialIndexPrice,
          initialMarkPrice: marketConfig.initialMarkPrice,
          linkedConditionalMarketId: 0,
          config: defaultConfig
        };

        const tx = await perpFactory.contract.createMarket(params, { value: 0 });
        const receipt = await tx.wait();

        // Parse MarketCreated event
        const event = receipt.logs.find(log => {
          try {
            const parsed = perpFactory.contract.interface.parseLog(log);
            return parsed?.name === 'MarketCreated';
          } catch {
            return false;
          }
        });

        if (event) {
          const parsed = perpFactory.contract.interface.parseLog(event);
          markets.push({
            id: Number(parsed.args.marketId),
            name: `${marketConfig.underlyingAsset}-PERP`,
            fullName: marketConfig.name,
            address: parsed.args.marketAddress,
            underlyingAsset: marketConfig.underlyingAsset
          });
          console.log(`    ✓ Created: ${parsed.args.marketAddress}`);
        }
      } catch (error) {
        console.error(`    ✗ Failed to create ${marketConfig.name}: ${error.message?.split("\n")[0]}`);
      }
    }
  }

  // =========================================================================
  // Verify Contracts
  // =========================================================================
  console.log("\n\n--- Verifying Contracts ---");

  const verificationTargets = [
    { name: "FundingRateEngine", address: deployments.fundingRateEngine, constructorArguments: [deployer.address] },
    {
      name: "PerpetualFuturesFactory",
      address: deployments.perpFactory,
      constructorArguments: [deployer.address, deployments.fundingRateEngine, deployer.address, collateralToken]
    }
  ];

  for (const target of verificationTargets) {
    console.log(`  Verifying ${target.name}...`);
    await verifyOnBlockscout(target);
  }

  // =========================================================================
  // Save Deployment
  // =========================================================================
  const deploymentInfo = {
    network: hre.network.name,
    chainId: Number(network.chainId),
    timestamp: new Date().toISOString(),
    deployer: deployer.address,
    version: "2.1-fixed-decimals-ownership",
    contracts: {
      fundingRateEngine: deployments.fundingRateEngine,
      perpFactory: deployments.perpFactory
    },
    markets: markets,
    tokens: {
      USC: collateralToken,
      WETC: TOKENS[networkName]?.WETC
    }
  };

  const filename = `${networkName}-perpetual-futures-v2.1-deployment.json`;
  const filepath = path.join(__dirname, "../../deployments", filename);
  fs.writeFileSync(filepath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\n✓ Deployment saved to: deployments/${filename}`);

  // =========================================================================
  // Summary
  // =========================================================================
  console.log("\n\n" + "=".repeat(60));
  console.log("Perpetual Futures Deployment Summary (v2.1 - Fixed Decimals + Ownership)");
  console.log("=".repeat(60));
  console.log(`\nNetwork: ${hre.network.name} (Chain ID: ${network.chainId})`);
  console.log("\nContracts:");
  console.log("─".repeat(50));
  console.log(`  FundingRateEngine:        ${deployments.fundingRateEngine}`);
  console.log(`  PerpetualFuturesFactory:  ${deployments.perpFactory}`);

  if (markets.length > 0) {
    console.log("\nMarkets:");
    console.log("─".repeat(50));
    for (const market of markets) {
      console.log(`  ${market.name.padEnd(10)} ${market.address}`);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("IMPORTANT: Update frontend/src/config/contracts.js with:");
  console.log("─".repeat(50));
  console.log(`  fundingRateEngine: '${deployments.fundingRateEngine}',`);
  console.log(`  perpFactory: '${deployments.perpFactory}',`);
  console.log("=".repeat(60));

  return deploymentInfo;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
