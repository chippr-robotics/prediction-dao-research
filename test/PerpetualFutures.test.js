const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Perpetual Futures System", function () {
  let owner, trader1, trader2, liquidator, feeRecipient;
  let fundingRateEngine, perpFactory, perpMarket;
  let mockCollateralToken;

  const LEVERAGE_PRECISION = 10000n;

  beforeEach(async function () {
    [owner, trader1, trader2, liquidator, feeRecipient] = await ethers.getSigners();

    // Deploy mock ERC20 token for collateral
    const MockToken = await ethers.getContractFactory("contracts/mocks/MockERC20.sol:MockERC20");
    mockCollateralToken = await MockToken.deploy("Mock USC", "mUSC", ethers.parseEther("10000000"));
    await mockCollateralToken.waitForDeployment();

    // Mint tokens to traders
    const mintAmount = ethers.parseEther("1000000");
    await mockCollateralToken.mint(trader1.address, mintAmount);
    await mockCollateralToken.mint(trader2.address, mintAmount);
    await mockCollateralToken.mint(liquidator.address, mintAmount);

    // Deploy FundingRateEngine
    const FundingRateEngine = await ethers.getContractFactory("FundingRateEngine");
    fundingRateEngine = await FundingRateEngine.deploy(owner.address);
    await fundingRateEngine.waitForDeployment();

    // Deploy PerpetualFuturesFactory
    const PerpetualFuturesFactory = await ethers.getContractFactory("PerpetualFuturesFactory");
    perpFactory = await PerpetualFuturesFactory.deploy(
      owner.address,
      await fundingRateEngine.getAddress(),
      feeRecipient.address,
      await mockCollateralToken.getAddress()
    );
    await perpFactory.waitForDeployment();

    // Configure funding rate engine
    await fundingRateEngine.setPriceUpdater(await perpFactory.getAddress(), true);
  });

  describe("FundingRateEngine", function () {
    it("should deploy with correct default configuration", async function () {
      const config = await fundingRateEngine.defaultConfig();
      expect(config.fundingInterval).to.equal(8n * 3600n); // 8 hours
      expect(config.maxFundingRate).to.equal(10000n); // 1%
      expect(config.useTimeWeightedAverage).to.be.true;
    });

    it("should allow owner to set price updaters", async function () {
      await fundingRateEngine.setPriceUpdater(trader1.address, true);
      expect(await fundingRateEngine.priceUpdaters(trader1.address)).to.be.true;

      await fundingRateEngine.setPriceUpdater(trader1.address, false);
      expect(await fundingRateEngine.priceUpdaters(trader1.address)).to.be.false;
    });

    it("should reject non-owner setting price updaters", async function () {
      await expect(
        fundingRateEngine.connect(trader1).setPriceUpdater(trader2.address, true)
      ).to.be.revertedWithCustomError(fundingRateEngine, "OwnableUnauthorizedAccount");
    });

    it("should allow price updater to record observations", async function () {
      await fundingRateEngine.setPriceUpdater(trader1.address, true);

      const indexPrice = ethers.parseEther("100");
      const markPrice = ethers.parseEther("101");

      await fundingRateEngine.initializeMarket(1);
      await fundingRateEngine.connect(trader1).recordPriceObservation(1, indexPrice, markPrice);

      const observationCount = await fundingRateEngine.getObservationCount(1);
      expect(observationCount).to.equal(1n);
    });

    it("should calculate funding rate based on premium", async function () {
      await fundingRateEngine.initializeMarket(1);

      // Mark price higher than index = positive funding (longs pay shorts)
      const indexPrice = ethers.parseEther("100");
      const markPrice = ethers.parseEther("101");

      const fundingRate = await fundingRateEngine.calculateFundingRate(1, indexPrice, markPrice);
      expect(fundingRate).to.be.gt(0); // Positive rate
    });
  });

  describe("PerpetualFuturesFactory", function () {
    it("should deploy with correct initial configuration", async function () {
      expect(await perpFactory.marketCount()).to.equal(0n);
      expect(await perpFactory.feeRecipient()).to.equal(feeRecipient.address);
      expect(await perpFactory.allowedCollateralTokens(await mockCollateralToken.getAddress())).to.be.true;
    });

    it("should allow creating a new market", async function () {
      const params = {
        name: "BTC-PERP",
        underlyingAsset: "BTC",
        collateralToken: await mockCollateralToken.getAddress(),
        category: 0, // Crypto
        initialIndexPrice: ethers.parseEther("100000"),
        initialMarkPrice: ethers.parseEther("100000"),
        linkedConditionalMarketId: 0,
        config: {
          maxLeverage: 20n * LEVERAGE_PRECISION,
          initialMarginRate: 500n,
          maintenanceMarginRate: 250n,
          liquidationFeeRate: 100n,
          tradingFeeRate: 10n,
          fundingInterval: 8n * 3600n,
          maxFundingRate: 1000n
        }
      };

      const creationFee = await perpFactory.creationFee();
      const tx = await perpFactory.createMarket(params, { value: creationFee });
      await tx.wait();

      expect(await perpFactory.marketCount()).to.equal(1n);

      const marketInfo = await perpFactory.getMarket(0);
      expect(marketInfo.name).to.equal("BTC-PERP");
      expect(marketInfo.underlyingAsset).to.equal("BTC");
      expect(marketInfo.active).to.be.true;
    });

    it("should reject market creation with disallowed collateral token", async function () {
      const MockToken = await ethers.getContractFactory("contracts/mocks/MockERC20.sol:MockERC20");
      const badToken = await MockToken.deploy("Bad Token", "BAD", ethers.parseEther("1000000"));
      await badToken.waitForDeployment();

      const params = {
        name: "BAD-PERP",
        underlyingAsset: "BAD",
        collateralToken: await badToken.getAddress(),
        category: 0,
        initialIndexPrice: ethers.parseEther("100"),
        initialMarkPrice: ethers.parseEther("100"),
        linkedConditionalMarketId: 0,
        config: {
          maxLeverage: 20n * LEVERAGE_PRECISION,
          initialMarginRate: 500n,
          maintenanceMarginRate: 250n,
          liquidationFeeRate: 100n,
          tradingFeeRate: 10n,
          fundingInterval: 8n * 3600n,
          maxFundingRate: 1000n
        }
      };

      const creationFee = await perpFactory.creationFee();
      await expect(
        perpFactory.createMarket(params, { value: creationFee })
      ).to.be.revertedWith("Collateral not allowed");
    });

    it("should reject market creation with insufficient fee", async function () {
      const params = {
        name: "BTC-PERP",
        underlyingAsset: "BTC",
        collateralToken: await mockCollateralToken.getAddress(),
        category: 0,
        initialIndexPrice: ethers.parseEther("100000"),
        initialMarkPrice: ethers.parseEther("100000"),
        linkedConditionalMarketId: 0,
        config: {
          maxLeverage: 20n * LEVERAGE_PRECISION,
          initialMarginRate: 500n,
          maintenanceMarginRate: 250n,
          liquidationFeeRate: 100n,
          tradingFeeRate: 10n,
          fundingInterval: 8n * 3600n,
          maxFundingRate: 1000n
        }
      };

      await expect(
        perpFactory.createMarket(params, { value: 0 })
      ).to.be.revertedWith("Insufficient fee");
    });
  });

  describe("PerpetualFuturesMarket", function () {
    beforeEach(async function () {
      // Create a market via factory
      const params = {
        name: "BTC-PERP",
        underlyingAsset: "BTC",
        collateralToken: await mockCollateralToken.getAddress(),
        category: 0,
        initialIndexPrice: ethers.parseEther("100"),
        initialMarkPrice: ethers.parseEther("100"),
        linkedConditionalMarketId: 0,
        config: {
          maxLeverage: 20n * LEVERAGE_PRECISION,
          initialMarginRate: 500n,
          maintenanceMarginRate: 250n,
          liquidationFeeRate: 100n,
          tradingFeeRate: 10n,
          fundingInterval: 8n * 3600n,
          maxFundingRate: 1000n
        }
      };

      const creationFee = await perpFactory.creationFee();
      await perpFactory.createMarket(params, { value: creationFee });

      const marketInfo = await perpFactory.getMarket(0);
      const PerpetualFuturesMarket = await ethers.getContractFactory("PerpetualFuturesMarket");
      perpMarket = PerpetualFuturesMarket.attach(marketInfo.marketAddress);
    });

    describe("Position Opening", function () {
      it("should allow opening a long position", async function () {
        const collateral = ethers.parseEther("100");
        const size = ethers.parseEther("1");
        const leverage = 5n * LEVERAGE_PRECISION;

        await mockCollateralToken.connect(trader1).approve(await perpMarket.getAddress(), collateral);

        const tx = await perpMarket.connect(trader1).openPosition(
          0, // Long
          size,
          collateral,
          leverage
        );
        await tx.wait();

        const positionIds = await perpMarket.getTraderPositions(trader1.address);
        expect(positionIds.length).to.equal(1);

        const position = await perpMarket.getPosition(positionIds[0]);
        expect(position.trader).to.equal(trader1.address);
        expect(position.side).to.equal(0); // Long
        expect(position.isOpen).to.be.true;
      });

      it("should allow opening a short position", async function () {
        const collateral = ethers.parseEther("100");
        const size = ethers.parseEther("1");
        const leverage = 5n * LEVERAGE_PRECISION;

        await mockCollateralToken.connect(trader1).approve(await perpMarket.getAddress(), collateral);

        await perpMarket.connect(trader1).openPosition(
          1, // Short
          size,
          collateral,
          leverage
        );

        const positionIds = await perpMarket.getTraderPositions(trader1.address);
        const position = await perpMarket.getPosition(positionIds[0]);
        expect(position.side).to.equal(1); // Short
      });

      it("should reject position with leverage exceeding maximum", async function () {
        const collateral = ethers.parseEther("100");
        const size = ethers.parseEther("1");
        const leverage = 25n * LEVERAGE_PRECISION; // Exceeds 20x max

        await mockCollateralToken.connect(trader1).approve(await perpMarket.getAddress(), collateral);

        await expect(
          perpMarket.connect(trader1).openPosition(0, size, collateral, leverage)
        ).to.be.revertedWith("Leverage exceeds maximum");
      });

      it("should reject position with insufficient margin", async function () {
        const collateral = ethers.parseEther("1"); // Very small collateral
        const size = ethers.parseEther("100"); // Large size
        const leverage = 20n * LEVERAGE_PRECISION;

        await mockCollateralToken.connect(trader1).approve(await perpMarket.getAddress(), collateral);

        await expect(
          perpMarket.connect(trader1).openPosition(0, size, collateral, leverage)
        ).to.be.revertedWith("Insufficient margin");
      });
    });

    describe("Position Closing", function () {
      let positionId;

      beforeEach(async function () {
        const collateral = ethers.parseEther("100");
        const size = ethers.parseEther("1");
        const leverage = 5n * LEVERAGE_PRECISION;

        await mockCollateralToken.connect(trader1).approve(await perpMarket.getAddress(), collateral);
        await perpMarket.connect(trader1).openPosition(0, size, collateral, leverage);

        const positionIds = await perpMarket.getTraderPositions(trader1.address);
        positionId = positionIds[0];
      });

      it("should allow position owner to close position", async function () {
        await perpMarket.connect(trader1).closePosition(positionId);

        const position = await perpMarket.getPosition(positionId);
        expect(position.isOpen).to.be.false;
      });

      it("should reject close from non-owner", async function () {
        await expect(
          perpMarket.connect(trader2).closePosition(positionId)
        ).to.be.revertedWith("Not position owner");
      });

      it("should calculate PnL correctly on close", async function () {
        // Deposit funds to insurance fund to cover potential profits
        const insuranceDeposit = ethers.parseEther("100");
        await mockCollateralToken.connect(trader2).approve(await perpMarket.getAddress(), insuranceDeposit);
        await perpMarket.connect(trader2).depositToInsuranceFund(insuranceDeposit);

        // Get initial balance
        const initialBalance = await mockCollateralToken.balanceOf(trader1.address);

        // Update mark price to simulate profit
        await perpMarket.updateMarkPrice(ethers.parseEther("110")); // 10% increase

        // Close position
        await perpMarket.connect(trader1).closePosition(positionId);

        // Check final balance is greater (profit from long)
        const finalBalance = await mockCollateralToken.balanceOf(trader1.address);
        expect(finalBalance).to.be.gt(initialBalance);
      });
    });

    describe("Collateral Management", function () {
      let positionId;

      beforeEach(async function () {
        const collateral = ethers.parseEther("100");
        const size = ethers.parseEther("1");
        const leverage = 5n * LEVERAGE_PRECISION;

        await mockCollateralToken.connect(trader1).approve(await perpMarket.getAddress(), ethers.parseEther("1000"));
        await perpMarket.connect(trader1).openPosition(0, size, collateral, leverage);

        const positionIds = await perpMarket.getTraderPositions(trader1.address);
        positionId = positionIds[0];
      });

      it("should allow adding collateral", async function () {
        const addAmount = ethers.parseEther("50");

        const positionBefore = await perpMarket.getPosition(positionId);
        await perpMarket.connect(trader1).addCollateral(positionId, addAmount);
        const positionAfter = await perpMarket.getPosition(positionId);

        expect(positionAfter.collateral).to.equal(positionBefore.collateral + addAmount);
      });

      it("should allow removing collateral if margin allows", async function () {
        const removeAmount = ethers.parseEther("10");

        const positionBefore = await perpMarket.getPosition(positionId);
        await perpMarket.connect(trader1).removeCollateral(positionId, removeAmount);
        const positionAfter = await perpMarket.getPosition(positionId);

        expect(positionAfter.collateral).to.equal(positionBefore.collateral - removeAmount);
      });

      it("should reject removing collateral if margin insufficient", async function () {
        const removeAmount = ethers.parseEther("95"); // Would leave only 5 collateral

        await expect(
          perpMarket.connect(trader1).removeCollateral(positionId, removeAmount)
        ).to.be.revertedWith("Insufficient margin after removal");
      });
    });

    describe("Liquidation", function () {
      let positionId;

      beforeEach(async function () {
        const collateral = ethers.parseEther("10"); // Small collateral
        const size = ethers.parseEther("1");
        const leverage = 10n * LEVERAGE_PRECISION; // High leverage

        await mockCollateralToken.connect(trader1).approve(await perpMarket.getAddress(), collateral);
        await perpMarket.connect(trader1).openPosition(0, size, collateral, leverage);

        const positionIds = await perpMarket.getTraderPositions(trader1.address);
        positionId = positionIds[0];
      });

      it("should correctly identify liquidatable positions", async function () {
        // Initially not liquidatable
        expect(await perpMarket.isLiquidatable(positionId)).to.be.false;

        // Update price to trigger liquidation (large drop for long position)
        await perpMarket.updateMarkPrice(ethers.parseEther("80")); // 20% drop

        // Now should be liquidatable
        expect(await perpMarket.isLiquidatable(positionId)).to.be.true;
      });

      it("should allow liquidation of undercollateralized position", async function () {
        // Update price to trigger liquidation
        await perpMarket.updateMarkPrice(ethers.parseEther("80"));

        await perpMarket.connect(liquidator).liquidatePosition(positionId);

        const position = await perpMarket.getPosition(positionId);
        expect(position.isOpen).to.be.false;
      });

      it("should reject liquidation of healthy position", async function () {
        await expect(
          perpMarket.connect(liquidator).liquidatePosition(positionId)
        ).to.be.revertedWith("Position not liquidatable");
      });

      it("should reject self-liquidation", async function () {
        await perpMarket.updateMarkPrice(ethers.parseEther("80"));

        await expect(
          perpMarket.connect(trader1).liquidatePosition(positionId)
        ).to.be.revertedWith("Cannot self-liquidate");
      });
    });

    describe("View Functions", function () {
      let positionId;

      beforeEach(async function () {
        const collateral = ethers.parseEther("100");
        const size = ethers.parseEther("1");
        const leverage = 5n * LEVERAGE_PRECISION;

        await mockCollateralToken.connect(trader1).approve(await perpMarket.getAddress(), collateral);
        await perpMarket.connect(trader1).openPosition(0, size, collateral, leverage);

        const positionIds = await perpMarket.getTraderPositions(trader1.address);
        positionId = positionIds[0];
      });

      it("should calculate unrealized PnL correctly for long", async function () {
        // Price increase = profit for long
        await perpMarket.updateMarkPrice(ethers.parseEther("110"));
        const pnl = await perpMarket.getUnrealizedPnL(positionId);
        expect(pnl).to.be.gt(0);

        // Price decrease = loss for long
        await perpMarket.updateMarkPrice(ethers.parseEther("90"));
        const pnlLoss = await perpMarket.getUnrealizedPnL(positionId);
        expect(pnlLoss).to.be.lt(0);
      });

      it("should return correct liquidation price", async function () {
        const liqPrice = await perpMarket.getLiquidationPrice(positionId);
        const position = await perpMarket.getPosition(positionId);

        // For a long position, liquidation price should be below entry price
        expect(liqPrice).to.be.lt(position.entryPrice);
      });

      it("should return market metrics", async function () {
        const metrics = await perpMarket.getMetrics();
        expect(metrics.totalLongPositions).to.equal(1n);
        expect(metrics.totalShortPositions).to.equal(0n);
        expect(metrics.openInterest).to.be.gt(0n);
      });

      it("should return market configuration", async function () {
        const config = await perpMarket.getConfig();
        expect(config.maxLeverage).to.equal(20n * LEVERAGE_PRECISION);
        expect(config.tradingFeeRate).to.equal(10n);
      });
    });
  });
});
