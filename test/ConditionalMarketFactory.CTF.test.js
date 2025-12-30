const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BetType } = require("./constants/BetType");

describe("ConditionalMarketFactory - CTF1155 Integration", function () {
  let marketFactory;
  let ctf1155;
  let collateralToken;
  let owner;
  let addr1;
  let addr2;

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();
    
    // Deploy CTF1155
    const CTF1155 = await ethers.getContractFactory("CTF1155");
    ctf1155 = await CTF1155.deploy();
    await ctf1155.waitForDeployment();
    
    // Deploy ConditionalMarketFactory
    const ConditionalMarketFactory = await ethers.getContractFactory("ConditionalMarketFactory");
    marketFactory = await ConditionalMarketFactory.deploy();
    await marketFactory.initialize(owner.address);
    
    // Set CTF1155 in market factory
    await marketFactory.setCTF1155(await ctf1155.getAddress());
    
    // Deploy mock ERC20 collateral token
    const MockERC20 = await ethers.getContractFactory("ConditionalToken");
    collateralToken = await MockERC20.deploy("Collateral", "COL");
    await collateralToken.waitForDeployment();
    
    // Mint collateral to users
    await collateralToken.mint(addr1.address, ethers.parseEther("10000"));
    await collateralToken.mint(addr2.address, ethers.parseEther("10000"));
  });

  describe("CTF1155 Setup", function () {
    it("Should set CTF1155 correctly", async function () {
      expect(await marketFactory.ctf1155()).to.equal(await ctf1155.getAddress());
    });

    it("Should reject invalid CTF1155 address", async function () {
      await expect(
        marketFactory.setCTF1155(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid CTF1155 address");
    });
  });

  describe("CTF Market Creation", function () {
    it("Should create market using CTF1155", async function () {
      const proposalId = 1;
      const liquidityAmount = ethers.parseEther("1000");
      const liquidityParameter = ethers.parseEther("100");
      const tradingPeriod = 7 * 24 * 60 * 60; // 7 days

      const tx = await marketFactory.deployMarketPair(
        proposalId,
        await collateralToken.getAddress(),
        liquidityAmount,
        liquidityParameter,
        tradingPeriod,
        BetType.PassFail
      );
      
      const receipt = await tx.wait();
      
      // Check MarketCreated event
      const marketCreatedEvent = receipt.logs.find(log => {
        try {
          const parsed = marketFactory.interface.parseLog({
            topics: log.topics,
            data: log.data
          });
          return parsed && parsed.name === "MarketCreated";
        } catch {
          return false;
        }
      });
      
      expect(marketCreatedEvent).to.not.be.undefined;
      
      // Check CTFMarketCreated event
      const ctfMarketEvent = receipt.logs.find(log => {
        try {
          const parsed = marketFactory.interface.parseLog({
            topics: log.topics,
            data: log.data
          });
          return parsed && parsed.name === "CTFMarketCreated";
        } catch {
          return false;
        }
      });
      
      expect(ctfMarketEvent).to.not.be.undefined;
    });

    it("Should create market with CTF condition prepared", async function () {
      const proposalId = 1;
      const liquidityAmount = ethers.parseEther("1000");
      const liquidityParameter = ethers.parseEther("100");
      const tradingPeriod = 7 * 24 * 60 * 60;

      await marketFactory.deployMarketPair(
        proposalId,
        await collateralToken.getAddress(),
        liquidityAmount,
        liquidityParameter,
        tradingPeriod,
        BetType.PassFail
      );

      const market = await marketFactory.getMarket(0);
      
      expect(market.useCTF).to.be.true;
      expect(market.conditionId).to.not.equal(ethers.ZeroHash);
      expect(market.questionId).to.not.equal(ethers.ZeroHash);
      expect(market.passToken).to.equal(await ctf1155.getAddress());
      expect(market.failToken).to.equal(await ctf1155.getAddress());
      
      // Verify condition is prepared in CTF1155
      const [oracle, , outcomeSlotCount, resolved] = await ctf1155.getCondition(market.conditionId);
      expect(oracle).to.equal(await marketFactory.getAddress());
      expect(outcomeSlotCount).to.equal(2);
      expect(resolved).to.be.false;
    });

    it("Should reject market creation without CTF1155 set", async function () {
      // Deploy new factory without CTF1155
      const ConditionalMarketFactory = await ethers.getContractFactory("ConditionalMarketFactory");
      const newFactory = await ConditionalMarketFactory.deploy();
      await newFactory.initialize(owner.address);

      const proposalId = 1;
      const liquidityAmount = ethers.parseEther("1000");
      const liquidityParameter = ethers.parseEther("100");
      const tradingPeriod = 7 * 24 * 60 * 60;

      await expect(
        newFactory.deployMarketPair(
          proposalId,
          await collateralToken.getAddress(),
          liquidityAmount,
          liquidityParameter,
          tradingPeriod,
          BetType.PassFail
        )
      ).to.be.revertedWith("CTF1155 not set");
    });

    it("Should reject market creation with zero collateral address", async function () {
      const proposalId = 1;
      const liquidityAmount = ethers.parseEther("1000");
      const liquidityParameter = ethers.parseEther("100");
      const tradingPeriod = 7 * 24 * 60 * 60;

      await expect(
        marketFactory.deployMarketPair(
          proposalId,
          ethers.ZeroAddress,
          liquidityAmount,
          liquidityParameter,
          tradingPeriod,
          BetType.PassFail
        )
      ).to.be.revertedWith("CTF requires ERC20 collateral");
    });

    it("Should create multiple markets with unique conditions", async function () {
      const proposalIds = [1, 2, 3];
      const liquidityAmount = ethers.parseEther("1000");
      const liquidityParameter = ethers.parseEther("100");
      const tradingPeriod = 7 * 24 * 60 * 60;

      for (let i = 0; i < proposalIds.length; i++) {
        await marketFactory.deployMarketPair(
          proposalIds[i],
          await collateralToken.getAddress(),
          liquidityAmount,
          liquidityParameter,
          tradingPeriod,
          BetType.PassFail
        );
      }

      // Verify each market has unique condition IDs
      const market0 = await marketFactory.getMarket(0);
      const market1 = await marketFactory.getMarket(1);
      const market2 = await marketFactory.getMarket(2);

      expect(market0.conditionId).to.not.equal(market1.conditionId);
      expect(market1.conditionId).to.not.equal(market2.conditionId);
      expect(market0.conditionId).to.not.equal(market2.conditionId);
    });
  });

  describe("CTF Position Trading", function () {
    beforeEach(async function () {
      const proposalId = 1;
      const liquidityAmount = ethers.parseEther("1000");
      const liquidityParameter = ethers.parseEther("100");
      const tradingPeriod = 7 * 24 * 60 * 60;

      await marketFactory.deployMarketPair(
        proposalId,
        await collateralToken.getAddress(),
        liquidityAmount,
        liquidityParameter,
        tradingPeriod,
        BetType.PassFail
      );
    });

    it("Should allow users to split collateral into CTF positions", async function () {
      const market = await marketFactory.getMarket(0);
      const amount = ethers.parseEther("100");

      // Approve collateral
      await collateralToken.connect(addr1).approve(await ctf1155.getAddress(), amount);

      // Split position
      const partition = [1, 2]; // Binary outcomes
      await ctf1155.connect(addr1).splitPosition(
        await collateralToken.getAddress(),
        ethers.ZeroHash,
        market.conditionId,
        partition,
        amount
      );

      // Check balances
      const passBalance = await ctf1155.balanceOf(addr1.address, market.passPositionId);
      const failBalance = await ctf1155.balanceOf(addr1.address, market.failPositionId);

      expect(passBalance).to.equal(amount);
      expect(failBalance).to.equal(amount);
    });

    it("Should allow users to merge CTF positions back to collateral", async function () {
      const market = await marketFactory.getMarket(0);
      const amount = ethers.parseEther("100");

      // Split position first
      await collateralToken.connect(addr1).approve(await ctf1155.getAddress(), amount);
      const partition = [1, 2];
      await ctf1155.connect(addr1).splitPosition(
        await collateralToken.getAddress(),
        ethers.ZeroHash,
        market.conditionId,
        partition,
        amount
      );

      const initialBalance = await collateralToken.balanceOf(addr1.address);

      // Merge positions back
      await ctf1155.connect(addr1).mergePositions(
        await collateralToken.getAddress(),
        ethers.ZeroHash,
        market.conditionId,
        partition,
        amount
      );

      const finalBalance = await collateralToken.balanceOf(addr1.address);
      expect(finalBalance).to.equal(initialBalance + amount);

      // Check positions are burned
      const passBalance = await ctf1155.balanceOf(addr1.address, market.passPositionId);
      const failBalance = await ctf1155.balanceOf(addr1.address, market.failPositionId);

      expect(passBalance).to.equal(0);
      expect(failBalance).to.equal(0);
    });
  });

  describe("CTF Market Resolution", function () {
    beforeEach(async function () {
      const proposalId = 1;
      const liquidityAmount = ethers.parseEther("1000");
      const liquidityParameter = ethers.parseEther("100");
      const tradingPeriod = 7 * 24 * 60 * 60;

      await marketFactory.deployMarketPair(
        proposalId,
        await collateralToken.getAddress(),
        liquidityAmount,
        liquidityParameter,
        tradingPeriod,
        BetType.PassFail
      );

      // Fast forward and end trading
      await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine");
      await marketFactory.endTrading(0);
    });

    it("Should resolve market and report payouts to CTF1155", async function () {
      const market = await marketFactory.getMarket(0);
      const passValue = ethers.parseEther("100");
      const failValue = ethers.parseEther("50");

      await marketFactory.resolveMarket(0, passValue, failValue);

      // Verify market is resolved
      const updatedMarket = await marketFactory.getMarket(0);
      expect(updatedMarket.resolved).to.be.true;
      expect(updatedMarket.passValue).to.equal(passValue);
      expect(updatedMarket.failValue).to.equal(failValue);

      // Verify CTF1155 condition is resolved
      const isResolved = await ctf1155.isResolved(market.conditionId);
      expect(isResolved).to.be.true;

      // Check payouts
      const payouts = await ctf1155.getPayoutNumerators(market.conditionId);
      expect(payouts[0]).to.equal(1); // Pass wins
      expect(payouts[1]).to.equal(0); // Fail loses
    });

    it("Should handle fail outcome winning", async function () {
      const market = await marketFactory.getMarket(0);
      const passValue = ethers.parseEther("30");
      const failValue = ethers.parseEther("70");

      await marketFactory.resolveMarket(0, passValue, failValue);

      const payouts = await ctf1155.getPayoutNumerators(market.conditionId);
      expect(payouts[0]).to.equal(0); // Pass loses
      expect(payouts[1]).to.equal(1); // Fail wins
    });

    it("Should handle tie outcome", async function () {
      const market = await marketFactory.getMarket(0);
      const passValue = ethers.parseEther("50");
      const failValue = ethers.parseEther("50");

      await marketFactory.resolveMarket(0, passValue, failValue);

      const payouts = await ctf1155.getPayoutNumerators(market.conditionId);
      expect(payouts[0]).to.equal(1); // Both outcomes
      expect(payouts[1]).to.equal(1); // get equal payout
    });
  });

  describe("CTF Position Redemption", function () {
    beforeEach(async function () {
      const proposalId = 1;
      const liquidityAmount = ethers.parseEther("1000");
      const liquidityParameter = ethers.parseEther("100");
      const tradingPeriod = 7 * 24 * 60 * 60;

      await marketFactory.deployMarketPair(
        proposalId,
        await collateralToken.getAddress(),
        liquidityAmount,
        liquidityParameter,
        tradingPeriod,
        BetType.PassFail
      );

      // Split positions for addr1
      const market = await marketFactory.getMarket(0);
      const amount = ethers.parseEther("100");
      await collateralToken.connect(addr1).approve(await ctf1155.getAddress(), amount);
      await ctf1155.connect(addr1).splitPosition(
        await collateralToken.getAddress(),
        ethers.ZeroHash,
        market.conditionId,
        [1, 2],
        amount
      );

      // End trading and resolve
      await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine");
      await marketFactory.endTrading(0);
      await marketFactory.resolveMarket(0, ethers.parseEther("100"), ethers.parseEther("50"));
    });

    it("Should allow redemption of winning positions", async function () {
      const market = await marketFactory.getMarket(0);
      const initialBalance = await collateralToken.balanceOf(addr1.address);

      // Redeem pass position (winner)
      await ctf1155.connect(addr1).redeemPositions(
        await collateralToken.getAddress(),
        ethers.ZeroHash,
        market.conditionId,
        [1] // Pass position index
      );

      const finalBalance = await collateralToken.balanceOf(addr1.address);
      
      // Should get full collateral back for winning position
      expect(finalBalance).to.be.gt(initialBalance);
    });

    it("Should handle redemption of losing positions", async function () {
      const market = await marketFactory.getMarket(0);
      const initialBalance = await collateralToken.balanceOf(addr1.address);

      // Try to redeem fail position (loser)
      await ctf1155.connect(addr1).redeemPositions(
        await collateralToken.getAddress(),
        ethers.ZeroHash,
        market.conditionId,
        [2] // Fail position index
      );

      const finalBalance = await collateralToken.balanceOf(addr1.address);
      
      // Should get nothing back for losing position
      expect(finalBalance).to.equal(initialBalance);
    });
  });

  describe("Batch Operations with CTF", function () {
    it("Should create multiple CTF markets in batch", async function () {
      const params = [
        {
          proposalId: 1,
          collateralToken: await collateralToken.getAddress(),
          liquidityAmount: ethers.parseEther("1000"),
          liquidityParameter: ethers.parseEther("100"),
          tradingPeriod: 7 * 24 * 60 * 60,
          betType: BetType.PassFail
        },
        {
          proposalId: 2,
          collateralToken: await collateralToken.getAddress(),
          liquidityAmount: ethers.parseEther("2000"),
          liquidityParameter: ethers.parseEther("200"),
          tradingPeriod: 10 * 24 * 60 * 60,
          betType: BetType.YesNo
        },
        {
          proposalId: 3,
          collateralToken: await collateralToken.getAddress(),
          liquidityAmount: ethers.parseEther("1500"),
          liquidityParameter: ethers.parseEther("150"),
          tradingPeriod: 14 * 24 * 60 * 60,
          betType: BetType.ForAgainst
        }
      ];

      await marketFactory.batchDeployMarkets(params);

      expect(await marketFactory.marketCount()).to.equal(3);

      // Verify all markets use CTF
      for (let i = 0; i < 3; i++) {
        const market = await marketFactory.getMarket(i);
        expect(market.useCTF).to.be.true;
        expect(market.conditionId).to.not.equal(ethers.ZeroHash);
      }
    });

    it("Should batch resolve CTF markets", async function () {
      // Create markets
      const params = [
        {
          proposalId: 1,
          collateralToken: await collateralToken.getAddress(),
          liquidityAmount: ethers.parseEther("1000"),
          liquidityParameter: ethers.parseEther("100"),
          tradingPeriod: 7 * 24 * 60 * 60,
          betType: BetType.PassFail
        },
        {
          proposalId: 2,
          collateralToken: await collateralToken.getAddress(),
          liquidityAmount: ethers.parseEther("2000"),
          liquidityParameter: ethers.parseEther("200"),
          tradingPeriod: 7 * 24 * 60 * 60,
          betType: BetType.YesNo
        }
      ];

      await marketFactory.batchDeployMarkets(params);

      // End trading for both
      await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine");
      await marketFactory.endTrading(0);
      await marketFactory.endTrading(1);

      // Batch resolve
      const resolutionParams = [
        {
          marketId: 0,
          passValue: ethers.parseEther("100"),
          failValue: ethers.parseEther("50")
        },
        {
          marketId: 1,
          passValue: ethers.parseEther("60"),
          failValue: ethers.parseEther("80")
        }
      ];

      const tx = await marketFactory.batchResolveMarkets(resolutionParams);
      const receipt = await tx.wait();

      // Note: We can't easily check return values from transactions
      // Instead verify the markets are resolved

      // Verify both conditions are resolved in CTF
      const market0 = await marketFactory.getMarket(0);
      const market1 = await marketFactory.getMarket(1);

      expect(await ctf1155.isResolved(market0.conditionId)).to.be.true;
      expect(await ctf1155.isResolved(market1.conditionId)).to.be.true;
    });
  });
});
