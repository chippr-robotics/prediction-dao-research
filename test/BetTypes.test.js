const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BetType } = require("./constants/BetType");

describe("ConditionalMarketFactory - Bet Types", function () {
  let marketFactory;
  let owner;
  let addr1;

  beforeEach(async function () {
    [owner, addr1] = await ethers.getSigners();
    
    const ConditionalMarketFactory = await ethers.getContractFactory("ConditionalMarketFactory");
    marketFactory = await ConditionalMarketFactory.deploy();
    await marketFactory.initialize(owner.address);
  });

  describe("Bet Type Labels", function () {
    it("Should return correct labels for YesNo bet type", async function () {
      const [positive, negative] = await marketFactory.getOutcomeLabels(BetType.YesNo);
      expect(positive).to.equal("YES");
      expect(negative).to.equal("NO");
    });

    it("Should return correct labels for PassFail bet type", async function () {
      const [positive, negative] = await marketFactory.getOutcomeLabels(BetType.PassFail);
      expect(positive).to.equal("PASS");
      expect(negative).to.equal("FAIL");
    });

    it("Should return correct labels for AboveBelow bet type", async function () {
      const [positive, negative] = await marketFactory.getOutcomeLabels(BetType.AboveBelow);
      expect(positive).to.equal("ABOVE");
      expect(negative).to.equal("BELOW");
    });

    it("Should return correct labels for HigherLower bet type", async function () {
      const [positive, negative] = await marketFactory.getOutcomeLabels(BetType.HigherLower);
      expect(positive).to.equal("HIGHER");
      expect(negative).to.equal("LOWER");
    });

    it("Should return correct labels for InOut bet type", async function () {
      const [positive, negative] = await marketFactory.getOutcomeLabels(BetType.InOut);
      expect(positive).to.equal("IN");
      expect(negative).to.equal("OUT");
    });

    it("Should return correct labels for OverUnder bet type", async function () {
      const [positive, negative] = await marketFactory.getOutcomeLabels(BetType.OverUnder);
      expect(positive).to.equal("OVER");
      expect(negative).to.equal("UNDER");
    });

    it("Should return correct labels for ForAgainst bet type", async function () {
      const [positive, negative] = await marketFactory.getOutcomeLabels(BetType.ForAgainst);
      expect(positive).to.equal("FOR");
      expect(negative).to.equal("AGAINST");
    });

    it("Should return correct labels for TrueFalse bet type", async function () {
      const [positive, negative] = await marketFactory.getOutcomeLabels(BetType.TrueFalse);
      expect(positive).to.equal("TRUE");
      expect(negative).to.equal("FALSE");
    });

    it("Should return correct labels for WinLose bet type", async function () {
      const [positive, negative] = await marketFactory.getOutcomeLabels(BetType.WinLose);
      expect(positive).to.equal("WIN");
      expect(negative).to.equal("LOSE");
    });

    it("Should return correct labels for UpDown bet type", async function () {
      const [positive, negative] = await marketFactory.getOutcomeLabels(BetType.UpDown);
      expect(positive).to.equal("UP");
      expect(negative).to.equal("DOWN");
    });
  });

  describe("Market Creation with Bet Types", function () {
    it("Should create market with YesNo bet type", async function () {
      const proposalId = 1;
      const collateralToken = ethers.ZeroAddress;
      const liquidityAmount = ethers.parseEther("1000");
      const liquidityParameter = ethers.parseEther("100");
      const tradingPeriod = 7 * 24 * 60 * 60; // 7 days

      const tx = await marketFactory.deployMarketPair(
        proposalId,
        collateralToken,
        liquidityAmount,
        liquidityParameter,
        tradingPeriod,
        BetType.YesNo
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(log => {
        try {
          return marketFactory.interface.parseLog(log).name === 'MarketCreated';
        } catch (e) {
          return false;
        }
      });

      expect(event).to.not.be.undefined;
      const parsedEvent = marketFactory.interface.parseLog(event);
      expect(parsedEvent.args.betType).to.equal(BetType.YesNo);
    });

    it("Should create market with AboveBelow bet type", async function () {
      const proposalId = 2;
      const collateralToken = ethers.ZeroAddress;
      const liquidityAmount = ethers.parseEther("1000");
      const liquidityParameter = ethers.parseEther("100");
      const tradingPeriod = 7 * 24 * 60 * 60;

      await expect(
        marketFactory.deployMarketPair(
          proposalId,
          collateralToken,
          liquidityAmount,
          liquidityParameter,
          tradingPeriod,
          BetType.AboveBelow
        )
      ).to.emit(marketFactory, "MarketCreated");

      const market = await marketFactory.getMarket(0);
      expect(market.betType).to.equal(BetType.AboveBelow);
    });

    it("Should create market with OverUnder bet type", async function () {
      const proposalId = 3;
      const collateralToken = ethers.ZeroAddress;
      const liquidityAmount = ethers.parseEther("1000");
      const liquidityParameter = ethers.parseEther("100");
      const tradingPeriod = 7 * 24 * 60 * 60;

      await marketFactory.deployMarketPair(
        proposalId,
        collateralToken,
        liquidityAmount,
        liquidityParameter,
        tradingPeriod,
        BetType.OverUnder
      );

      const market = await marketFactory.getMarket(0);
      expect(market.betType).to.equal(BetType.OverUnder);
    });

    it("Should create tokens with correct names based on bet type", async function () {
      const proposalId = 4;
      const collateralToken = ethers.ZeroAddress;
      const liquidityAmount = ethers.parseEther("1000");
      const liquidityParameter = ethers.parseEther("100");
      const tradingPeriod = 7 * 24 * 60 * 60;

      await marketFactory.deployMarketPair(
        proposalId,
        collateralToken,
        liquidityAmount,
        liquidityParameter,
        tradingPeriod,
        BetType.HigherLower
      );

      const market = await marketFactory.getMarket(0);
      
      // Get the token contracts
      const ConditionalToken = await ethers.getContractFactory("ConditionalToken");
      const passToken = ConditionalToken.attach(market.passToken);
      const failToken = ConditionalToken.attach(market.failToken);

      // Check token names
      const passName = await passToken.name();
      const failName = await failToken.name();
      
      expect(passName).to.equal("HIGHER");
      expect(failName).to.equal("LOWER");
    });
  });

  describe("Batch Market Creation with Bet Types", function () {
    it("Should create multiple markets with different bet types", async function () {
      const params = [
        {
          proposalId: 10,
          collateralToken: ethers.ZeroAddress,
          liquidityAmount: ethers.parseEther("1000"),
          liquidityParameter: ethers.parseEther("100"),
          tradingPeriod: 7 * 24 * 60 * 60,
          betType: BetType.YesNo
        },
        {
          proposalId: 11,
          collateralToken: ethers.ZeroAddress,
          liquidityAmount: ethers.parseEther("1000"),
          liquidityParameter: ethers.parseEther("100"),
          tradingPeriod: 7 * 24 * 60 * 60,
          betType: BetType.AboveBelow
        },
        {
          proposalId: 12,
          collateralToken: ethers.ZeroAddress,
          liquidityAmount: ethers.parseEther("1000"),
          liquidityParameter: ethers.parseEther("100"),
          tradingPeriod: 7 * 24 * 60 * 60,
          betType: BetType.OverUnder
        }
      ];

      await marketFactory.batchDeployMarkets(params);

      // Verify each market has the correct bet type
      const market0 = await marketFactory.getMarket(0);
      const market1 = await marketFactory.getMarket(1);
      const market2 = await marketFactory.getMarket(2);

      expect(market0.betType).to.equal(BetType.YesNo);
      expect(market1.betType).to.equal(BetType.AboveBelow);
      expect(market2.betType).to.equal(BetType.OverUnder);
    });

    it("Should emit MarketCreated events with correct bet types", async function () {
      const params = [
        {
          proposalId: 20,
          collateralToken: ethers.ZeroAddress,
          liquidityAmount: ethers.parseEther("1000"),
          liquidityParameter: ethers.parseEther("100"),
          tradingPeriod: 7 * 24 * 60 * 60,
          betType: BetType.WinLose
        },
        {
          proposalId: 21,
          collateralToken: ethers.ZeroAddress,
          liquidityAmount: ethers.parseEther("1000"),
          liquidityParameter: ethers.parseEther("100"),
          tradingPeriod: 7 * 24 * 60 * 60,
          betType: BetType.UpDown
        }
      ];

      await expect(marketFactory.batchDeployMarkets(params))
        .to.emit(marketFactory, "MarketCreated")
        .and.to.emit(marketFactory, "BatchMarketsCreated");

      expect(await marketFactory.marketCount()).to.equal(2);
    });
  });

  describe("Market Storage and Retrieval", function () {
    it("Should store and retrieve bet type correctly", async function () {
      const proposalId = 30;
      const collateralToken = ethers.ZeroAddress;
      const liquidityAmount = ethers.parseEther("1000");
      const liquidityParameter = ethers.parseEther("100");
      const tradingPeriod = 7 * 24 * 60 * 60;

      await marketFactory.deployMarketPair(
        proposalId,
        collateralToken,
        liquidityAmount,
        liquidityParameter,
        tradingPeriod,
        BetType.ForAgainst
      );

      const market = await marketFactory.getMarket(0);
      expect(market.betType).to.equal(BetType.ForAgainst);
      expect(market.proposalId).to.equal(proposalId);
    });

    it("Should maintain bet type after market operations", async function () {
      const proposalId = 31;
      const collateralToken = ethers.ZeroAddress;
      const liquidityAmount = ethers.parseEther("1000");
      const liquidityParameter = ethers.parseEther("100");
      const tradingPeriod = 7 * 24 * 60 * 60;

      await marketFactory.deployMarketPair(
        proposalId,
        collateralToken,
        liquidityAmount,
        liquidityParameter,
        tradingPeriod,
        BetType.TrueFalse
      );

      // Fast forward time to end trading
      await ethers.provider.send("evm_increaseTime", [tradingPeriod + 1]);
      await ethers.provider.send("evm_mine");

      await marketFactory.endTrading(0);

      const market = await marketFactory.getMarket(0);
      expect(market.betType).to.equal(BetType.TrueFalse);
      expect(market.status).to.equal(1); // TradingEnded
    });
  });
});
