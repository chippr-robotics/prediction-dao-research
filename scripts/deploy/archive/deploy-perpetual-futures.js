const hre = require("hardhat");

/**
 * Deployment script for Perpetual Futures contracts
 * Deploys:
 * - FundingRateEngine: Advanced funding rate calculation engine
 * - PerpetualFuturesFactory: Factory for creating perp markets
 * - Optional: Initial market deployment
 */

// Token addresses on ETC (same for mainnet and Mordor testnet)
const TOKENS = {
  USC: '0xDE093684c796204224BC081f937aa059D903c52a', // Classic USD Stablecoin
  WETC: '0x1953cab0E5bFa6D4a9BaD6E05fD46C1CC6527a5a' // Wrapped ETC
};

async function main() {
  console.log("========================================");
  console.log("   Perpetual Futures Deployment Script");
  console.log("========================================\n");

  // Get deployer account
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer address:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETC");
  console.log("Network:", hre.network.name);
  console.log();

  try {
    // ========================================
    // Step 1: Deploy FundingRateEngine
    // ========================================
    console.log("Step 1: Deploying FundingRateEngine...");
    const FundingRateEngine = await hre.ethers.getContractFactory("FundingRateEngine");
    const fundingRateEngine = await FundingRateEngine.deploy();
    await fundingRateEngine.waitForDeployment();
    const fundingRateEngineAddress = await fundingRateEngine.getAddress();
    console.log("  FundingRateEngine deployed to:", fundingRateEngineAddress);
    console.log();

    // ========================================
    // Step 2: Deploy PerpetualFuturesFactory
    // ========================================
    console.log("Step 2: Deploying PerpetualFuturesFactory...");
    const PerpetualFuturesFactory = await hre.ethers.getContractFactory("PerpetualFuturesFactory");
    const perpFactory = await PerpetualFuturesFactory.deploy(
      fundingRateEngineAddress,  // Funding rate engine
      deployer.address,          // Fee recipient
      TOKENS.USC                 // Default collateral token (USC stablecoin)
    );
    await perpFactory.waitForDeployment();
    const perpFactoryAddress = await perpFactory.getAddress();
    console.log("  PerpetualFuturesFactory deployed to:", perpFactoryAddress);
    console.log();

    // ========================================
    // Step 3: Configure FundingRateEngine
    // ========================================
    console.log("Step 3: Configuring FundingRateEngine...");

    // Authorize the factory to settle funding
    console.log("  - Authorizing factory as price updater...");
    await fundingRateEngine.setPriceUpdater(perpFactoryAddress, true);
    console.log("  - Done");
    console.log();

    // ========================================
    // Step 4: Configure allowed collateral tokens
    // ========================================
    console.log("Step 4: Configuring allowed collateral tokens...");

    // Allow WETC as collateral
    console.log("  - Adding WETC as allowed collateral...");
    await perpFactory.setAllowedCollateralToken(TOKENS.WETC, true);
    console.log("  - Done");
    console.log();

    // ========================================
    // Step 5 (Optional): Create initial markets
    // ========================================
    console.log("Step 5: Creating initial perpetual futures markets...");

    // BTC-PERP market
    console.log("  - Creating BTC-PERP market...");
    const btcParams = {
      name: "Bitcoin Perpetual",
      underlyingAsset: "BTC",
      collateralToken: TOKENS.USC,
      category: 0, // Crypto
      initialIndexPrice: hre.ethers.parseEther("100000"), // $100,000
      initialMarkPrice: hre.ethers.parseEther("100000"),
      linkedConditionalMarketId: 0,
      config: {
        maxLeverage: 20 * 10000,         // 20x
        initialMarginRate: 500,           // 5%
        maintenanceMarginRate: 250,       // 2.5%
        liquidationFeeRate: 100,          // 1%
        tradingFeeRate: 10,               // 0.1%
        fundingInterval: 8 * 3600,        // 8 hours
        maxFundingRate: 1000              // 0.1%
      }
    };

    const creationFee = await perpFactory.creationFee();
    const btcTx = await perpFactory.createMarket(btcParams, { value: creationFee });
    await btcTx.wait();

    const btcMarketInfo = await perpFactory.getMarket(0);
    console.log("    BTC-PERP deployed to:", btcMarketInfo.marketAddress);

    // ETH-PERP market
    console.log("  - Creating ETH-PERP market...");
    const ethParams = {
      name: "Ethereum Perpetual",
      underlyingAsset: "ETH",
      collateralToken: TOKENS.USC,
      category: 0, // Crypto
      initialIndexPrice: hre.ethers.parseEther("4000"), // $4,000
      initialMarkPrice: hre.ethers.parseEther("4000"),
      linkedConditionalMarketId: 0,
      config: {
        maxLeverage: 20 * 10000,
        initialMarginRate: 500,
        maintenanceMarginRate: 250,
        liquidationFeeRate: 100,
        tradingFeeRate: 10,
        fundingInterval: 8 * 3600,
        maxFundingRate: 1000
      }
    };

    const ethTx = await perpFactory.createMarket(ethParams, { value: creationFee });
    await ethTx.wait();

    const ethMarketInfo = await perpFactory.getMarket(1);
    console.log("    ETH-PERP deployed to:", ethMarketInfo.marketAddress);

    // ETC-PERP market
    console.log("  - Creating ETC-PERP market...");
    const etcParams = {
      name: "Ethereum Classic Perpetual",
      underlyingAsset: "ETC",
      collateralToken: TOKENS.USC,
      category: 0, // Crypto
      initialIndexPrice: hre.ethers.parseEther("30"), // $30
      initialMarkPrice: hre.ethers.parseEther("30"),
      linkedConditionalMarketId: 0,
      config: {
        maxLeverage: 20 * 10000,
        initialMarginRate: 500,
        maintenanceMarginRate: 250,
        liquidationFeeRate: 100,
        tradingFeeRate: 10,
        fundingInterval: 8 * 3600,
        maxFundingRate: 1000
      }
    };

    const etcTx = await perpFactory.createMarket(etcParams, { value: creationFee });
    await etcTx.wait();

    const etcMarketInfo = await perpFactory.getMarket(2);
    console.log("    ETC-PERP deployed to:", etcMarketInfo.marketAddress);
    console.log();

    // ========================================
    // Deployment Summary
    // ========================================
    console.log("========================================");
    console.log("         Deployment Summary");
    console.log("========================================\n");
    console.log("Core Contracts:");
    console.log("  FundingRateEngine:", fundingRateEngineAddress);
    console.log("  PerpetualFuturesFactory:", perpFactoryAddress);
    console.log();
    console.log("Perpetual Markets:");
    console.log("  BTC-PERP (ID: 0):", btcMarketInfo.marketAddress);
    console.log("  ETH-PERP (ID: 1):", ethMarketInfo.marketAddress);
    console.log("  ETC-PERP (ID: 2):", etcMarketInfo.marketAddress);
    console.log();
    console.log("Configuration:");
    console.log("  Default Collateral:", TOKENS.USC, "(USC)");
    console.log("  Creation Fee:", hre.ethers.formatEther(creationFee), "ETC");
    console.log("  Max Leverage: 20x");
    console.log("  Funding Interval: 8 hours");
    console.log();

    // Save deployment info
    const deploymentInfo = {
      network: hre.network.name,
      timestamp: new Date().toISOString(),
      deployer: deployer.address,
      contracts: {
        fundingRateEngine: fundingRateEngineAddress,
        perpFactory: perpFactoryAddress
      },
      markets: [
        { id: 0, name: "BTC-PERP", address: btcMarketInfo.marketAddress },
        { id: 1, name: "ETH-PERP", address: ethMarketInfo.marketAddress },
        { id: 2, name: "ETC-PERP", address: etcMarketInfo.marketAddress }
      ],
      tokens: TOKENS
    };

    console.log("Deployment Info JSON:");
    console.log(JSON.stringify(deploymentInfo, null, 2));
    console.log();

    console.log("========================================");
    console.log("   Deployment completed successfully!");
    console.log("========================================\n");

    console.log("Next Steps:");
    console.log("1. Add the contract addresses to your frontend configuration");
    console.log("2. Set up a price oracle to update index prices periodically");
    console.log("3. Configure the role manager for access control");
    console.log("4. Deposit to the insurance fund for safety");
    console.log();

  } catch (error) {
    console.error("\n========================================");
    console.error("   Deployment failed!");
    console.error("========================================\n");
    console.error("Error:", error.message);

    if (error.data) {
      console.error("Error data:", error.data);
    }

    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
