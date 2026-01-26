/**
 * Configure Perpetual Futures v2 Contracts
 *
 * This script configures the newly deployed perpetual futures contracts
 * and creates the default markets.
 *
 * Usage:
 *   npx hardhat run scripts/admin/configure-perp-v2.js --network mordor
 */

const hre = require("hardhat");
const { ethers } = require("hardhat");

// V2 deployment addresses (from mordor-perpetual-futures-v2-deployment.json)
const FUNDING_RATE_ENGINE = "0x1F3ec2FaB298Dd684e90f73e44f9267e02b958fE";
const PERP_FACTORY = "0xF6B327a581D99CC55ed0BA00de2aF6edf2f9b5Db";
const USC_TOKEN = "0xDE093684c796204224BC081f937aa059D903c52a";

async function main() {
  console.log("=".repeat(60));
  console.log("Configure Perpetual Futures v2 Contracts");
  console.log("=".repeat(60));

  const network = await ethers.provider.getNetwork();
  console.log(`\nNetwork: ${hre.network.name} (Chain ID: ${network.chainId})`);

  const [signer] = await ethers.getSigners();
  console.log("\nSigner:", signer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(signer.address)), "ETC");

  // Get contract instances
  const fundingRateEngine = await ethers.getContractAt("FundingRateEngine", FUNDING_RATE_ENGINE);
  const perpFactory = await ethers.getContractAt("PerpetualFuturesFactory", PERP_FACTORY);

  console.log("\nContract Addresses:");
  console.log("  FundingRateEngine:", FUNDING_RATE_ENGINE);
  console.log("  PerpetualFuturesFactory:", PERP_FACTORY);
  console.log("  USC Token:", USC_TOKEN);

  // =========================================================================
  // Step 1: Configure FundingRateEngine
  // =========================================================================
  console.log("\n\n--- Step 1: Configure FundingRateEngine ---");

  try {
    const isAuthorized = await fundingRateEngine.authorizedUpdaters(PERP_FACTORY);
    if (!isAuthorized) {
      console.log("  Authorizing PerpFactory as price updater...");
      const tx = await fundingRateEngine.setPriceUpdater(PERP_FACTORY, true);
      await tx.wait();
      console.log("  ✓ PerpFactory authorized on FundingRateEngine");
    } else {
      console.log("  ✓ PerpFactory already authorized");
    }
  } catch (error) {
    console.error("  ✗ Failed to configure FundingRateEngine:", error.message);
  }

  // =========================================================================
  // Step 2: Set Creation Fee to 0
  // =========================================================================
  console.log("\n\n--- Step 2: Set Creation Fee to 0 ---");

  try {
    const currentFee = await perpFactory.creationFee();
    console.log("  Current fee:", ethers.formatEther(currentFee), "ETC");

    if (currentFee > 0n) {
      console.log("  Setting creation fee to 0...");
      const tx = await perpFactory.setCreationFee(0);
      await tx.wait();
      console.log("  ✓ Creation fee set to 0");
    } else {
      console.log("  ✓ Creation fee already 0");
    }
  } catch (error) {
    console.error("  ✗ Failed to set creation fee:", error.message);
  }

  // =========================================================================
  // Step 3: Create Default Markets
  // =========================================================================
  console.log("\n\n--- Step 3: Create Default Markets ---");

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

  // Check existing market count
  const existingCount = await perpFactory.marketCount();
  console.log(`  Existing markets: ${existingCount}`);

  if (existingCount > 0n) {
    console.log("  Markets already exist, listing them:");
    for (let i = 0; i < existingCount; i++) {
      const market = await perpFactory.getMarket(i);
      console.log(`    [${i}] ${market.name} - ${market.marketAddress}`);
    }
  } else {
    console.log("  Creating default markets...");

    for (const marketConfig of marketConfigs) {
      try {
        console.log(`\n  Creating ${marketConfig.name}...`);

        const params = {
          name: marketConfig.name,
          underlyingAsset: marketConfig.underlyingAsset,
          collateralToken: USC_TOKEN,
          category: marketConfig.category,
          initialIndexPrice: marketConfig.initialIndexPrice,
          initialMarkPrice: marketConfig.initialMarkPrice,
          linkedConditionalMarketId: 0,
          config: defaultConfig
        };

        const tx = await perpFactory.createMarket(params, { value: 0 });
        const receipt = await tx.wait();

        // Parse MarketCreated event
        const event = receipt.logs.find(log => {
          try {
            const parsed = perpFactory.interface.parseLog(log);
            return parsed?.name === 'MarketCreated';
          } catch {
            return false;
          }
        });

        if (event) {
          const parsed = perpFactory.interface.parseLog(event);
          console.log(`    ✓ Created ${marketConfig.underlyingAsset}-PERP: ${parsed.args.marketAddress}`);
        }
      } catch (error) {
        console.error(`    ✗ Failed to create ${marketConfig.name}:`, error.message);
      }
    }
  }

  // =========================================================================
  // Summary
  // =========================================================================
  console.log("\n\n" + "=".repeat(60));
  console.log("Configuration Complete");
  console.log("=".repeat(60));

  // List all markets
  const finalCount = await perpFactory.marketCount();
  console.log(`\nTotal markets: ${finalCount}`);

  for (let i = 0; i < finalCount; i++) {
    const market = await perpFactory.getMarket(i);
    console.log(`  [${i}] ${market.name} - ${market.marketAddress}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("Update frontend/src/config/contracts.js with:");
  console.log("─".repeat(50));
  console.log(`  fundingRateEngine: '${FUNDING_RATE_ENGINE}',`);
  console.log(`  perpFactory: '${PERP_FACTORY}',`);
  console.log("=".repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
