const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ConditionalMarketFactory", function () {
  let marketFactory;
  let owner;
  let addr1;

  beforeEach(async function () {
    [owner, addr1] = await ethers.getSigners();
    
    const ConditionalMarketFactory = await ethers.getContractFactory("ConditionalMarketFactory");
    marketFactory = await ConditionalMarketFactory.deploy();
    await marketFactory.initialize(owner.address);
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await marketFactory.owner()).to.equal(owner.address);
    });

    it("Should initialize with zero markets", async function () {
      expect(await marketFactory.marketCount()).to.equal(0);
    });

    it("Should set correct default trading period", async function () {
      expect(await marketFactory.DEFAULT_TRADING_PERIOD()).to.equal(10 * 24 * 60 * 60); // 10 days
    });
  });

  describe("Market Deployment", function () {
    it("Should allow owner to deploy market pair", async function () {
      const proposalId = 1;
      const collateralToken = ethers.ZeroAddress;
      const liquidityAmount = ethers.parseEther("1000");
      const liquidityParameter = ethers.parseEther("100");
      const tradingPeriod = 7 * 24 * 60 * 60; // 7 days

      await expect(
        marketFactory.deployMarketPair(
          proposalId,
          collateralToken,
          liquidityAmount,
          liquidityParameter,
          tradingPeriod
        )
      ).to.emit(marketFactory, "MarketCreated");
    });

    it("Should reject market deployment with invalid trading period", async function () {
      const proposalId = 1;
      const collateralToken = ethers.ZeroAddress;
      const liquidityAmount = ethers.parseEther("1000");
      const liquidityParameter = ethers.parseEther("100");
      const tradingPeriod = 1 * 24 * 60 * 60; // 1 day (too short)

      await expect(
        marketFactory.deployMarketPair(
          proposalId,
          collateralToken,
          liquidityAmount,
          liquidityParameter,
          tradingPeriod
        )
      ).to.be.revertedWith("Invalid trading period");
    });

    it("Should increment market count", async function () {
      const proposalId = 1;
      const collateralToken = ethers.ZeroAddress;
      const liquidityAmount = ethers.parseEther("1000");
      const liquidityParameter = ethers.parseEther("100");
      const tradingPeriod = 7 * 24 * 60 * 60;

      await marketFactory.deployMarketPair(
        proposalId,
        collateralToken,
        liquidityAmount,
        liquidityParameter,
        tradingPeriod
      );

      expect(await marketFactory.marketCount()).to.equal(1);
    });

    it("Should only allow owner to deploy market", async function () {
      const proposalId = 1;
      const collateralToken = ethers.ZeroAddress;
      const liquidityAmount = ethers.parseEther("1000");
      const liquidityParameter = ethers.parseEther("100");
      const tradingPeriod = 7 * 24 * 60 * 60;

      await expect(
        marketFactory.connect(addr1).deployMarketPair(
          proposalId,
          collateralToken,
          liquidityAmount,
          liquidityParameter,
          tradingPeriod
        )
      ).to.be.revertedWithCustomError(marketFactory, "OwnableUnauthorizedAccount");
    });
  });
});
