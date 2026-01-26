const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

/**
 * Deployment fixture for Perpetual Futures system
 * Sets up all contracts and test accounts for integration testing
 */
async function deployPerpetualFuturesFixture() {
  const [owner, trader1, trader2, trader3, liquidator, feeRecipient, priceUpdater] = await ethers.getSigners();

  // Deploy mock ERC20 token for collateral (USC stablecoin)
  const MockERC20 = await ethers.getContractFactory("contracts/mocks/MockERC20.sol:MockERC20");
  const collateralToken = await MockERC20.deploy("USD Coin", "USC", ethers.parseEther("100000000"));
  await collateralToken.waitForDeployment();

  // Deploy a second collateral token (WETC)
  const wetcToken = await MockERC20.deploy("Wrapped ETC", "WETC", ethers.parseEther("100000000"));
  await wetcToken.waitForDeployment();

  // Distribute tokens to test accounts
  const distributionAmount = ethers.parseEther("1000000");
  for (const account of [trader1, trader2, trader3, liquidator]) {
    await collateralToken.transfer(account.address, distributionAmount);
    await wetcToken.transfer(account.address, distributionAmount);
  }

  // Deploy FundingRateEngine
  const FundingRateEngine = await ethers.getContractFactory("FundingRateEngine");
  const fundingRateEngine = await FundingRateEngine.deploy(owner.address);
  await fundingRateEngine.waitForDeployment();

  // Deploy PerpetualFuturesFactory
  const PerpetualFuturesFactory = await ethers.getContractFactory("PerpetualFuturesFactory");
  const perpFactory = await PerpetualFuturesFactory.deploy(
    owner.address,
    await fundingRateEngine.getAddress(),
    feeRecipient.address,
    await collateralToken.getAddress()
  );
  await perpFactory.waitForDeployment();

  // Configure allowed collateral tokens
  await perpFactory.setAllowedCollateralToken(await wetcToken.getAddress(), true);

  // Configure funding rate engine
  await fundingRateEngine.setPriceUpdater(await perpFactory.getAddress(), true);
  await fundingRateEngine.setPriceUpdater(priceUpdater.address, true);

  return {
    contracts: {
      fundingRateEngine,
      perpFactory,
      collateralToken,
      wetcToken
    },
    accounts: {
      owner,
      trader1,
      trader2,
      trader3,
      liquidator,
      feeRecipient,
      priceUpdater
    },
    constants: {
      LEVERAGE_PRECISION: 10000n,
      RATE_PRECISION: 10000n,
      FUNDING_RATE_PRECISION: 1000000n
    }
  };
}

/**
 * Helper to create a market via factory
 */
async function createTestMarket(perpFactory, name, asset, collateralToken, initialPrice, config = null) {
  const defaultConfig = {
    maxLeverage: 20n * 10000n,
    initialMarginRate: 500n,
    maintenanceMarginRate: 250n,
    liquidationFeeRate: 100n,
    tradingFeeRate: 10n,
    fundingInterval: 8n * 3600n,
    maxFundingRate: 1000n
  };

  const params = {
    name,
    underlyingAsset: asset,
    collateralToken: await collateralToken.getAddress(),
    category: 0, // Crypto
    initialIndexPrice: initialPrice,
    initialMarkPrice: initialPrice,
    linkedConditionalMarketId: 0,
    config: config || defaultConfig
  };

  const creationFee = await perpFactory.creationFee();
  const tx = await perpFactory.createMarket(params, { value: creationFee });
  await tx.wait();

  // Get market address from event
  const marketCount = await perpFactory.marketCount();
  const marketInfo = await perpFactory.getMarket(marketCount - 1n);

  const PerpetualFuturesMarket = await ethers.getContractFactory("PerpetualFuturesMarket");
  const market = PerpetualFuturesMarket.attach(marketInfo.marketAddress);

  return { market, marketInfo, marketId: marketCount - 1n };
}

/**
 * Helper to open a position
 */
async function openTestPosition(market, collateralToken, trader, side, size, collateral, leverage) {
  await collateralToken.connect(trader).approve(await market.getAddress(), collateral);
  const tx = await market.connect(trader).openPosition(side, size, collateral, leverage);
  await tx.wait();

  const positionIds = await market.getTraderPositions(trader.address);
  return positionIds[positionIds.length - 1];
}

/**
 * Integration tests for Perpetual Futures System
 *
 * Tests the complete lifecycle of perpetual futures markets:
 * 1. Factory deployment and market creation
 * 2. Position opening with various leverage levels
 * 3. PnL calculation and settlement
 * 4. Funding rate application
 * 5. Liquidation scenarios
 * 6. Multi-trader interactions
 */
describe("Integration: Perpetual Futures Lifecycle", function () {
  this.timeout(120000);

  describe("Market Creation and Configuration", function () {
    it("Should deploy factory with correct initial state", async function () {
      const { contracts, accounts } = await loadFixture(deployPerpetualFuturesFixture);
      const { perpFactory, fundingRateEngine, collateralToken } = contracts;
      const { feeRecipient } = accounts;

      console.log("\n=== Factory Deployment Test ===\n");

      // Verify factory state
      expect(await perpFactory.marketCount()).to.equal(0n);
      expect(await perpFactory.feeRecipient()).to.equal(feeRecipient.address);
      expect(await perpFactory.allowedCollateralTokens(await collateralToken.getAddress())).to.be.true;

      // Verify funding rate engine link
      expect(await perpFactory.fundingRateEngine()).to.equal(await fundingRateEngine.getAddress());

      console.log("  ✓ Factory deployed with correct configuration");
      console.log("  ✓ Funding rate engine linked correctly");
    });

    it("Should create multiple markets with different configurations", async function () {
      const { contracts } = await loadFixture(deployPerpetualFuturesFixture);
      const { perpFactory, collateralToken, wetcToken } = contracts;

      console.log("\n=== Multi-Market Creation Test ===\n");

      // Create BTC market
      const { market: btcMarket } = await createTestMarket(
        perpFactory,
        "Bitcoin Perpetual",
        "BTC",
        collateralToken,
        ethers.parseEther("50000")
      );

      // Create ETH market with different leverage
      const ethConfig = {
        maxLeverage: 15n * 10000n,
        initialMarginRate: 667n, // 6.67%
        maintenanceMarginRate: 333n,
        liquidationFeeRate: 150n,
        tradingFeeRate: 15n,
        fundingInterval: 4n * 3600n,
        maxFundingRate: 2000n
      };

      const { market: ethMarket } = await createTestMarket(
        perpFactory,
        "Ethereum Perpetual",
        "ETH",
        collateralToken,
        ethers.parseEther("3000"),
        ethConfig
      );

      // Create ETC market with WETC collateral
      const { market: etcMarket } = await createTestMarket(
        perpFactory,
        "ETC Perpetual",
        "ETC",
        wetcToken,
        ethers.parseEther("25")
      );

      // Verify markets were created
      expect(await perpFactory.marketCount()).to.equal(3n);

      // Verify BTC market
      expect(await btcMarket.marketName()).to.equal("Bitcoin Perpetual");
      expect(await btcMarket.underlyingAsset()).to.equal("BTC");
      expect(await btcMarket.markPrice()).to.equal(ethers.parseEther("50000"));

      // Verify ETH market configuration
      const ethMarketConfig = await ethMarket.getConfig();
      expect(ethMarketConfig.maxLeverage).to.equal(15n * 10000n);
      expect(ethMarketConfig.fundingInterval).to.equal(4n * 3600n);

      // Verify ETC market uses different collateral
      expect(await etcMarket.collateralToken()).to.equal(await wetcToken.getAddress());

      console.log("  ✓ BTC market created at:", await btcMarket.getAddress());
      console.log("  ✓ ETH market created with custom config");
      console.log("  ✓ ETC market created with WETC collateral");
    });

    it("Should retrieve markets by category and asset", async function () {
      const { contracts } = await loadFixture(deployPerpetualFuturesFixture);
      const { perpFactory, collateralToken } = contracts;

      // Create multiple markets
      await createTestMarket(perpFactory, "BTC-PERP", "BTC", collateralToken, ethers.parseEther("50000"));
      await createTestMarket(perpFactory, "ETH-PERP", "ETH", collateralToken, ethers.parseEther("3000"));
      await createTestMarket(perpFactory, "BTC-PERP-2", "BTC", collateralToken, ethers.parseEther("50000"));

      // Get markets by category
      const cryptoMarkets = await perpFactory.getMarketsByCategory(0);
      expect(cryptoMarkets.length).to.equal(3);

      // Get markets by asset
      const btcMarkets = await perpFactory.getMarketsByAsset("BTC");
      expect(btcMarkets.length).to.equal(2);

      const ethMarkets = await perpFactory.getMarketsByAsset("ETH");
      expect(ethMarkets.length).to.equal(1);
    });
  });

  describe("Position Lifecycle", function () {
    it("Should complete full position lifecycle: open -> profit -> close", async function () {
      const { contracts, accounts, constants } = await loadFixture(deployPerpetualFuturesFixture);
      const { perpFactory, collateralToken } = contracts;
      const { trader1, owner } = accounts;
      const { LEVERAGE_PRECISION } = constants;

      console.log("\n=== Position Lifecycle (Profit) Test ===\n");

      // Create market
      const { market } = await createTestMarket(
        perpFactory,
        "BTC-PERP",
        "BTC",
        collateralToken,
        ethers.parseEther("50000")
      );

      const initialBalance = await collateralToken.balanceOf(trader1.address);
      console.log("  Initial balance:", ethers.formatEther(initialBalance), "USC");

      // Open long position
      // For a 1 BTC position at $50,000, notional = $50,000
      // Required margin = $50,000 * 5% = $2,500 minimum
      // Use $10,000 collateral for 5x leverage
      const collateral = ethers.parseEther("10000");
      const size = ethers.parseEther("1"); // 1 BTC
      const leverage = 5n * LEVERAGE_PRECISION;

      const positionId = await openTestPosition(
        market,
        collateralToken,
        trader1,
        0, // Long
        size,
        collateral,
        leverage
      );

      console.log("  ✓ Long position opened with ID:", positionId.toString());

      // Verify position details
      const position = await market.getPosition(positionId);
      expect(position.trader).to.equal(trader1.address);
      expect(position.side).to.equal(0); // Long
      expect(position.size).to.equal(size);
      expect(position.isOpen).to.be.true;

      // Simulate price increase (10%)
      const newPrice = ethers.parseEther("55000");
      await market.connect(owner).updateMarkPrice(newPrice);
      console.log("  ✓ Price updated to:", ethers.formatEther(newPrice));

      // Check unrealized PnL (should be positive for long)
      const pnl = await market.getUnrealizedPnL(positionId);
      expect(pnl).to.be.gt(0);
      console.log("  ✓ Unrealized PnL:", ethers.formatEther(pnl), "USC");

      // Deposit to insurance fund to cover profit payout
      const { trader2 } = accounts;
      await collateralToken.connect(trader2).approve(await market.getAddress(), pnl);
      await market.connect(trader2).depositToInsuranceFund(pnl);

      // Close position
      await market.connect(trader1).closePosition(positionId);

      const finalBalance = await collateralToken.balanceOf(trader1.address);
      const profit = finalBalance - initialBalance + collateral;
      console.log("  ✓ Position closed");
      console.log("  Final balance:", ethers.formatEther(finalBalance), "USC");
      console.log("  Net profit:", ethers.formatEther(profit), "USC");

      // Verify profit was realized
      expect(finalBalance).to.be.gt(initialBalance - collateral);
    });

    it("Should complete full position lifecycle: open -> loss -> close", async function () {
      const { contracts, accounts, constants } = await loadFixture(deployPerpetualFuturesFixture);
      const { perpFactory, collateralToken } = contracts;
      const { trader1, owner } = accounts;
      const { LEVERAGE_PRECISION } = constants;

      console.log("\n=== Position Lifecycle (Loss) Test ===\n");

      // Create market
      const { market } = await createTestMarket(
        perpFactory,
        "BTC-PERP",
        "BTC",
        collateralToken,
        ethers.parseEther("50000")
      );

      const initialBalance = await collateralToken.balanceOf(trader1.address);

      // Open short position with adequate collateral
      const collateral = ethers.parseEther("10000");
      const size = ethers.parseEther("1");
      const leverage = 5n * LEVERAGE_PRECISION;

      const positionId = await openTestPosition(
        market,
        collateralToken,
        trader1,
        1, // Short
        size,
        collateral,
        leverage
      );

      console.log("  ✓ Short position opened with ID:", positionId.toString());

      // Simulate price increase (10%) - bad for shorts
      const newPrice = ethers.parseEther("55000");
      await market.connect(owner).updateMarkPrice(newPrice);

      // Check unrealized PnL (should be negative for short when price goes up)
      const pnl = await market.getUnrealizedPnL(positionId);
      expect(pnl).to.be.lt(0);
      console.log("  ✓ Unrealized PnL (loss):", ethers.formatEther(pnl), "USC");

      // Close position
      await market.connect(trader1).closePosition(positionId);

      const finalBalance = await collateralToken.balanceOf(trader1.address);
      console.log("  ✓ Position closed with loss");

      // Verify loss was realized
      expect(finalBalance).to.be.lt(initialBalance);
    });

    it("Should handle multiple positions from same trader", async function () {
      const { contracts, accounts, constants } = await loadFixture(deployPerpetualFuturesFixture);
      const { perpFactory, collateralToken } = contracts;
      const { trader1 } = accounts;
      const { LEVERAGE_PRECISION } = constants;

      const { market } = await createTestMarket(
        perpFactory,
        "BTC-PERP",
        "BTC",
        collateralToken,
        ethers.parseEther("50000")
      );

      // Open multiple positions with adequate collateral
      // For 0.5 BTC at $50,000, notional = $25,000, required margin = $1,250
      const collateral = ethers.parseEther("5000");
      const size = ethers.parseEther("0.5");
      const leverage = 5n * LEVERAGE_PRECISION;

      // Open 3 positions
      await openTestPosition(market, collateralToken, trader1, 0, size, collateral, leverage);
      const positionId2 = await openTestPosition(market, collateralToken, trader1, 1, size, collateral, leverage);
      await openTestPosition(market, collateralToken, trader1, 0, size, collateral, leverage);

      // Verify all positions are tracked
      const positions = await market.getTraderPositions(trader1.address);
      expect(positions.length).to.equal(3);

      // Verify metrics
      const metrics = await market.getMetrics();
      expect(metrics.totalLongPositions).to.equal(2n);
      expect(metrics.totalShortPositions).to.equal(1n);

      // Close middle position
      await market.connect(trader1).closePosition(positionId2);

      const metricsAfter = await market.getMetrics();
      expect(metricsAfter.totalShortPositions).to.equal(0n);
    });
  });

  describe("Collateral Management", function () {
    it("Should allow adding and removing collateral", async function () {
      const { contracts, accounts, constants } = await loadFixture(deployPerpetualFuturesFixture);
      const { perpFactory, collateralToken } = contracts;
      const { trader1 } = accounts;
      const { LEVERAGE_PRECISION } = constants;

      console.log("\n=== Collateral Management Test ===\n");

      const { market } = await createTestMarket(
        perpFactory,
        "BTC-PERP",
        "BTC",
        collateralToken,
        ethers.parseEther("50000")
      );

      // Open position with adequate collateral
      // For 1 BTC at $50,000, need at least $2,500 margin (5%)
      const initialCollateral = ethers.parseEther("10000");
      const positionId = await openTestPosition(
        market,
        collateralToken,
        trader1,
        0,
        ethers.parseEther("1"),
        initialCollateral,
        5n * LEVERAGE_PRECISION
      );

      const positionBefore = await market.getPosition(positionId);
      console.log("  Initial collateral:", ethers.formatEther(positionBefore.collateral));

      // Add collateral
      const addAmount = ethers.parseEther("500");
      await collateralToken.connect(trader1).approve(await market.getAddress(), addAmount);
      await market.connect(trader1).addCollateral(positionId, addAmount);

      const positionAfterAdd = await market.getPosition(positionId);
      expect(positionAfterAdd.collateral).to.equal(positionBefore.collateral + addAmount);
      console.log("  ✓ Added collateral. New amount:", ethers.formatEther(positionAfterAdd.collateral));

      // Leverage should decrease after adding collateral
      expect(positionAfterAdd.leverage).to.be.lt(positionBefore.leverage);
      console.log("  ✓ Leverage decreased from", positionBefore.leverage.toString(), "to", positionAfterAdd.leverage.toString());

      // Remove some collateral
      const removeAmount = ethers.parseEther("200");
      await market.connect(trader1).removeCollateral(positionId, removeAmount);

      const positionAfterRemove = await market.getPosition(positionId);
      expect(positionAfterRemove.collateral).to.equal(positionAfterAdd.collateral - removeAmount);
      console.log("  ✓ Removed collateral. New amount:", ethers.formatEther(positionAfterRemove.collateral));
    });

    it("Should reject removing too much collateral", async function () {
      const { contracts, accounts, constants } = await loadFixture(deployPerpetualFuturesFixture);
      const { perpFactory, collateralToken } = contracts;
      const { trader1 } = accounts;
      const { LEVERAGE_PRECISION } = constants;

      const { market } = await createTestMarket(
        perpFactory,
        "BTC-PERP",
        "BTC",
        collateralToken,
        ethers.parseEther("50000")
      );

      // Use adequate collateral - for 1 BTC at $50k, 5x leverage needs $10k collateral
      const positionId = await openTestPosition(
        market,
        collateralToken,
        trader1,
        0,
        ethers.parseEther("1"),
        ethers.parseEther("10000"),
        5n * LEVERAGE_PRECISION
      );

      // Try to remove too much collateral (would put position under margin)
      await expect(
        market.connect(trader1).removeCollateral(positionId, ethers.parseEther("8000"))
      ).to.be.revertedWith("Insufficient margin after removal");
    });
  });

  describe("Liquidation Scenarios", function () {
    it("Should liquidate undercollateralized long position", async function () {
      const { contracts, accounts, constants } = await loadFixture(deployPerpetualFuturesFixture);
      const { perpFactory, collateralToken } = contracts;
      const { trader1, liquidator, owner } = accounts;
      const { LEVERAGE_PRECISION } = constants;

      console.log("\n=== Long Liquidation Test ===\n");

      const { market } = await createTestMarket(
        perpFactory,
        "BTC-PERP",
        "BTC",
        collateralToken,
        ethers.parseEther("50000")
      );

      // Open highly leveraged long position with smaller size
      // For 0.1 BTC at $50,000, notional = $5,000, required margin = $250
      // Use $500 collateral for ~10x leverage (easy to liquidate)
      const collateral = ethers.parseEther("500");
      const size = ethers.parseEther("0.1");
      const leverage = 10n * LEVERAGE_PRECISION;

      const positionId = await openTestPosition(
        market,
        collateralToken,
        trader1,
        0, // Long
        size,
        collateral,
        leverage
      );

      const liqPriceBefore = await market.getLiquidationPrice(positionId);
      console.log("  ✓ Position opened");
      console.log("  Liquidation price:", ethers.formatEther(liqPriceBefore));

      // Drop price significantly (20%)
      const newPrice = ethers.parseEther("40000");
      await market.connect(owner).updateMarkPrice(newPrice);
      console.log("  ✓ Price dropped to:", ethers.formatEther(newPrice));

      // Verify position is liquidatable
      expect(await market.isLiquidatable(positionId)).to.be.true;
      console.log("  ✓ Position is liquidatable");

      // Get liquidator balance before
      const liquidatorBalanceBefore = await collateralToken.balanceOf(liquidator.address);

      // Execute liquidation
      await market.connect(liquidator).liquidatePosition(positionId);

      const liquidatorBalanceAfter = await collateralToken.balanceOf(liquidator.address);
      const liquidatorProfit = liquidatorBalanceAfter - liquidatorBalanceBefore;

      console.log("  ✓ Position liquidated");
      console.log("  Liquidator reward:", ethers.formatEther(liquidatorProfit), "USC");

      // Verify position is closed
      const position = await market.getPosition(positionId);
      expect(position.isOpen).to.be.false;

      // Check insurance fund balance (may be 0 if position was severely underwater)
      const insuranceFund = await market.insuranceFund();
      console.log("  Insurance fund balance:", ethers.formatEther(insuranceFund), "USC");
    });

    it("Should liquidate undercollateralized short position", async function () {
      const { contracts, accounts, constants } = await loadFixture(deployPerpetualFuturesFixture);
      const { perpFactory, collateralToken } = contracts;
      const { trader1, liquidator, owner } = accounts;
      const { LEVERAGE_PRECISION } = constants;

      console.log("\n=== Short Liquidation Test ===\n");

      const { market } = await createTestMarket(
        perpFactory,
        "BTC-PERP",
        "BTC",
        collateralToken,
        ethers.parseEther("50000")
      );

      // Open highly leveraged short position with smaller size
      // For 0.1 BTC at $50,000, notional = $5,000, required margin = $250
      const positionId = await openTestPosition(
        market,
        collateralToken,
        trader1,
        1, // Short
        ethers.parseEther("0.1"),
        ethers.parseEther("500"),
        10n * LEVERAGE_PRECISION
      );

      const liqPriceBefore = await market.getLiquidationPrice(positionId);
      console.log("  ✓ Short position opened");
      console.log("  Liquidation price:", ethers.formatEther(liqPriceBefore));

      // Pump price significantly (20%)
      const newPrice = ethers.parseEther("60000");
      await market.connect(owner).updateMarkPrice(newPrice);
      console.log("  ✓ Price pumped to:", ethers.formatEther(newPrice));

      // Verify position is liquidatable
      expect(await market.isLiquidatable(positionId)).to.be.true;

      // Execute liquidation
      await market.connect(liquidator).liquidatePosition(positionId);

      const position = await market.getPosition(positionId);
      expect(position.isOpen).to.be.false;
      console.log("  ✓ Short position liquidated");
    });

    it("Should reject liquidation of healthy position", async function () {
      const { contracts, accounts, constants } = await loadFixture(deployPerpetualFuturesFixture);
      const { perpFactory, collateralToken } = contracts;
      const { trader1, liquidator } = accounts;
      const { LEVERAGE_PRECISION } = constants;

      const { market } = await createTestMarket(
        perpFactory,
        "BTC-PERP",
        "BTC",
        collateralToken,
        ethers.parseEther("50000")
      );

      // Open low leverage position with adequate collateral
      // For 1 BTC at $50k with 2x leverage, need $25,000 collateral
      const positionId = await openTestPosition(
        market,
        collateralToken,
        trader1,
        0,
        ethers.parseEther("1"),
        ethers.parseEther("25000"), // Large collateral for ~2x leverage
        2n * LEVERAGE_PRECISION // Low leverage
      );

      expect(await market.isLiquidatable(positionId)).to.be.false;

      await expect(
        market.connect(liquidator).liquidatePosition(positionId)
      ).to.be.revertedWith("Position not liquidatable");
    });
  });

  describe("Multi-Trader Interactions", function () {
    it("Should handle opposing positions from different traders", async function () {
      const { contracts, accounts, constants } = await loadFixture(deployPerpetualFuturesFixture);
      const { perpFactory, collateralToken } = contracts;
      const { trader1, trader2, owner } = accounts;
      const { LEVERAGE_PRECISION } = constants;

      console.log("\n=== Multi-Trader Test ===\n");

      const { market } = await createTestMarket(
        perpFactory,
        "BTC-PERP",
        "BTC",
        collateralToken,
        ethers.parseEther("50000")
      );

      // Use adequate collateral for 1 BTC at $50k
      const collateral = ethers.parseEther("10000");
      const size = ethers.parseEther("1");
      const leverage = 5n * LEVERAGE_PRECISION;

      // Trader1 goes long
      const longPositionId = await openTestPosition(
        market,
        collateralToken,
        trader1,
        0, // Long
        size,
        collateral,
        leverage
      );

      // Trader2 goes short
      const shortPositionId = await openTestPosition(
        market,
        collateralToken,
        trader2,
        1, // Short
        size,
        collateral,
        leverage
      );

      console.log("  ✓ Trader1 opened long, Trader2 opened short");

      // Check market metrics
      const metrics = await market.getMetrics();
      expect(metrics.totalLongPositions).to.equal(1n);
      expect(metrics.totalShortPositions).to.equal(1n);
      expect(metrics.totalLongSize).to.equal(size);
      expect(metrics.totalShortSize).to.equal(size);

      // Move price up 10%
      await market.connect(owner).updateMarkPrice(ethers.parseEther("55000"));

      // Check PnL - should be opposite
      const longPnL = await market.getUnrealizedPnL(longPositionId);
      const shortPnL = await market.getUnrealizedPnL(shortPositionId);

      expect(longPnL).to.be.gt(0);
      expect(shortPnL).to.be.lt(0);
      console.log("  ✓ Long PnL:", ethers.formatEther(longPnL), "USC");
      console.log("  ✓ Short PnL:", ethers.formatEther(shortPnL), "USC");

      // PnL magnitudes should be approximately equal (before fees)
      const pnlDiff = longPnL > -shortPnL ? longPnL + shortPnL : -shortPnL - longPnL;
      expect(pnlDiff).to.be.lt(ethers.parseEther("1")); // Allow small difference
    });

    it("Should track total open interest correctly across traders", async function () {
      const { contracts, accounts, constants } = await loadFixture(deployPerpetualFuturesFixture);
      const { perpFactory, collateralToken } = contracts;
      const { trader1, trader2, trader3 } = accounts;
      const { LEVERAGE_PRECISION } = constants;

      const { market } = await createTestMarket(
        perpFactory,
        "BTC-PERP",
        "BTC",
        collateralToken,
        ethers.parseEther("50000")
      );

      const leverage = 5n * LEVERAGE_PRECISION;

      // Use adequate collateral for each position
      // 1 BTC at $50k = $50k notional, needs $2,500 min margin -> use $10k
      // 0.5 BTC at $50k = $25k notional, needs $1,250 min margin -> use $5k
      // 2 BTC at $50k = $100k notional, needs $5,000 min margin -> use $20k
      await openTestPosition(market, collateralToken, trader1, 0, ethers.parseEther("1"), ethers.parseEther("10000"), leverage);
      await openTestPosition(market, collateralToken, trader2, 1, ethers.parseEther("0.5"), ethers.parseEther("5000"), leverage);
      await openTestPosition(market, collateralToken, trader3, 0, ethers.parseEther("2"), ethers.parseEther("20000"), leverage);

      const metrics = await market.getMetrics();

      // Total long size: 1 + 2 = 3
      expect(metrics.totalLongSize).to.equal(ethers.parseEther("3"));
      // Total short size: 0.5
      expect(metrics.totalShortSize).to.equal(ethers.parseEther("0.5"));

      // Open interest should be (3 + 0.5) * 50000 = 175000
      const expectedOI = ethers.parseEther("3.5") * ethers.parseEther("50000") / ethers.parseEther("1");
      expect(metrics.openInterest).to.equal(expectedOI);
    });
  });

  describe("Funding Rate Mechanism", function () {
    it("Should initialize funding state for new markets", async function () {
      const { contracts } = await loadFixture(deployPerpetualFuturesFixture);
      const { perpFactory, fundingRateEngine, collateralToken } = contracts;

      const { marketId } = await createTestMarket(
        perpFactory,
        "BTC-PERP",
        "BTC",
        collateralToken,
        ethers.parseEther("50000")
      );

      const fundingState = await fundingRateEngine.getFundingState(marketId);
      expect(fundingState.lastSettlementTime).to.be.gt(0);
      expect(fundingState.currentRate).to.equal(0);
    });

    it("Should record price observations for TWAP", async function () {
      const { contracts, accounts } = await loadFixture(deployPerpetualFuturesFixture);
      const { perpFactory, fundingRateEngine, collateralToken } = contracts;
      const { priceUpdater } = accounts;

      const { marketId } = await createTestMarket(
        perpFactory,
        "BTC-PERP",
        "BTC",
        collateralToken,
        ethers.parseEther("50000")
      );

      // Record multiple observations
      for (let i = 0; i < 5; i++) {
        const indexPrice = ethers.parseEther("50000") + BigInt(i) * ethers.parseEther("100");
        const markPrice = indexPrice + ethers.parseEther("50"); // Small premium
        await fundingRateEngine.connect(priceUpdater).recordPriceObservation(marketId, indexPrice, markPrice);
        await time.increase(60); // 1 minute between observations
      }

      const observationCount = await fundingRateEngine.getObservationCount(marketId);
      expect(observationCount).to.equal(5);
    });

    it("Should calculate positive funding rate when mark > index", async function () {
      const { contracts } = await loadFixture(deployPerpetualFuturesFixture);
      const { perpFactory, fundingRateEngine, collateralToken } = contracts;

      const { marketId } = await createTestMarket(
        perpFactory,
        "BTC-PERP",
        "BTC",
        collateralToken,
        ethers.parseEther("50000")
      );

      // Mark price higher than index (longs should pay shorts)
      const indexPrice = ethers.parseEther("50000");
      const markPrice = ethers.parseEther("51000"); // 2% premium

      const fundingRate = await fundingRateEngine.calculateFundingRate(marketId, indexPrice, markPrice);
      expect(fundingRate).to.be.gt(0);
    });

    it("Should calculate negative funding rate when mark < index", async function () {
      const { contracts } = await loadFixture(deployPerpetualFuturesFixture);
      const { perpFactory, fundingRateEngine, collateralToken } = contracts;

      const { marketId } = await createTestMarket(
        perpFactory,
        "BTC-PERP",
        "BTC",
        collateralToken,
        ethers.parseEther("50000")
      );

      // Mark price lower than index (shorts should pay longs)
      const indexPrice = ethers.parseEther("50000");
      const markPrice = ethers.parseEther("49000"); // 2% discount

      const fundingRate = await fundingRateEngine.calculateFundingRate(marketId, indexPrice, markPrice);
      expect(fundingRate).to.be.lt(0);
    });
  });

  describe("Edge Cases and Security", function () {
    it("Should prevent self-liquidation", async function () {
      const { contracts, accounts, constants } = await loadFixture(deployPerpetualFuturesFixture);
      const { perpFactory, collateralToken } = contracts;
      const { trader1, owner } = accounts;
      const { LEVERAGE_PRECISION } = constants;

      const { market } = await createTestMarket(
        perpFactory,
        "BTC-PERP",
        "BTC",
        collateralToken,
        ethers.parseEther("50000")
      );

      // Open small position with adequate collateral for liquidation test
      const positionId = await openTestPosition(
        market,
        collateralToken,
        trader1,
        0,
        ethers.parseEther("0.1"),
        ethers.parseEther("500"),
        10n * LEVERAGE_PRECISION
      );

      // Make position liquidatable
      await market.connect(owner).updateMarkPrice(ethers.parseEther("40000"));
      expect(await market.isLiquidatable(positionId)).to.be.true;

      // Trader cannot liquidate themselves
      await expect(
        market.connect(trader1).liquidatePosition(positionId)
      ).to.be.revertedWith("Cannot self-liquidate");
    });

    it("Should prevent operations on paused market", async function () {
      const { contracts, accounts, constants } = await loadFixture(deployPerpetualFuturesFixture);
      const { perpFactory, collateralToken } = contracts;
      const { trader1, owner } = accounts;
      const { LEVERAGE_PRECISION } = constants;

      const { market, marketId } = await createTestMarket(
        perpFactory,
        "BTC-PERP",
        "BTC",
        collateralToken,
        ethers.parseEther("50000")
      );

      // Pause market via factory (factory is owner of market)
      await perpFactory.connect(owner).pauseMarket(marketId);

      // Try to open position - should fail
      await collateralToken.connect(trader1).approve(await market.getAddress(), ethers.parseEther("10000"));
      await expect(
        market.connect(trader1).openPosition(0, ethers.parseEther("1"), ethers.parseEther("10000"), 5n * LEVERAGE_PRECISION)
      ).to.be.revertedWith("Market is paused");
    });

    it("Should enforce position limits per trader", async function () {
      const { contracts, accounts, constants } = await loadFixture(deployPerpetualFuturesFixture);
      const { perpFactory, collateralToken } = contracts;
      const { trader1 } = accounts;
      const { LEVERAGE_PRECISION } = constants;

      const { market } = await createTestMarket(
        perpFactory,
        "BTC-PERP",
        "BTC",
        collateralToken,
        ethers.parseEther("50000")
      );

      // Use small positions with adequate collateral
      // For 0.01 BTC at $50k = $500 notional, requires $25 margin -> use $100
      const collateral = ethers.parseEther("100");
      const size = ethers.parseEther("0.01");
      const leverage = 5n * LEVERAGE_PRECISION;

      // Open maximum allowed positions (10)
      for (let i = 0; i < 10; i++) {
        await openTestPosition(market, collateralToken, trader1, 0, size, collateral, leverage);
      }

      // Try to open one more - should fail
      await collateralToken.connect(trader1).approve(await market.getAddress(), collateral);
      await expect(
        market.connect(trader1).openPosition(0, size, collateral, leverage)
      ).to.be.revertedWith("Max positions reached");
    });

    it("Should handle zero-size position rejection", async function () {
      const { contracts, accounts, constants } = await loadFixture(deployPerpetualFuturesFixture);
      const { perpFactory, collateralToken } = contracts;
      const { trader1 } = accounts;
      const { LEVERAGE_PRECISION } = constants;

      const { market } = await createTestMarket(
        perpFactory,
        "BTC-PERP",
        "BTC",
        collateralToken,
        ethers.parseEther("50000")
      );

      await collateralToken.connect(trader1).approve(await market.getAddress(), ethers.parseEther("1000"));
      await expect(
        market.connect(trader1).openPosition(0, 0, ethers.parseEther("1000"), 5n * LEVERAGE_PRECISION)
      ).to.be.revertedWith("Size must be positive");
    });

    it("Should handle zero-collateral position rejection", async function () {
      const { contracts, accounts, constants } = await loadFixture(deployPerpetualFuturesFixture);
      const { perpFactory, collateralToken } = contracts;
      const { trader1 } = accounts;
      const { LEVERAGE_PRECISION } = constants;

      const { market } = await createTestMarket(
        perpFactory,
        "BTC-PERP",
        "BTC",
        collateralToken,
        ethers.parseEther("50000")
      );

      await expect(
        market.connect(trader1).openPosition(0, ethers.parseEther("1"), 0, 5n * LEVERAGE_PRECISION)
      ).to.be.revertedWith("Collateral must be positive");
    });
  });

  describe("Insurance Fund Operations", function () {
    it("Should allow deposits to insurance fund", async function () {
      const { contracts, accounts } = await loadFixture(deployPerpetualFuturesFixture);
      const { perpFactory, collateralToken } = contracts;
      const { trader1 } = accounts;

      const { market } = await createTestMarket(
        perpFactory,
        "BTC-PERP",
        "BTC",
        collateralToken,
        ethers.parseEther("50000")
      );

      const depositAmount = ethers.parseEther("10000");
      await collateralToken.connect(trader1).approve(await market.getAddress(), depositAmount);
      await market.connect(trader1).depositToInsuranceFund(depositAmount);

      expect(await market.insuranceFund()).to.equal(depositAmount);
    });

    it("Should allow owner to withdraw from insurance fund via factory", async function () {
      const { contracts, accounts } = await loadFixture(deployPerpetualFuturesFixture);
      const { perpFactory, collateralToken } = contracts;
      const { owner, trader1, feeRecipient } = accounts;

      const { market, marketId } = await createTestMarket(
        perpFactory,
        "BTC-PERP",
        "BTC",
        collateralToken,
        ethers.parseEther("50000")
      );

      // Deposit to insurance fund
      const depositAmount = ethers.parseEther("10000");
      await collateralToken.connect(trader1).approve(await market.getAddress(), depositAmount);
      await market.connect(trader1).depositToInsuranceFund(depositAmount);

      // Withdraw half via factory (factory is market owner)
      const withdrawAmount = ethers.parseEther("5000");
      const recipientBalanceBefore = await collateralToken.balanceOf(feeRecipient.address);
      await perpFactory.connect(owner).withdrawFromMarketInsuranceFund(marketId, withdrawAmount, feeRecipient.address);
      const recipientBalanceAfter = await collateralToken.balanceOf(feeRecipient.address);

      expect(recipientBalanceAfter - recipientBalanceBefore).to.equal(withdrawAmount);
      expect(await market.insuranceFund()).to.equal(depositAmount - withdrawAmount);
    });
  });
});
