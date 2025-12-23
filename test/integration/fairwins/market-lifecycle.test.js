const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { deploySystemFixture } = require("../fixtures/deploySystem");

/**
 * Integration tests for FairWins Market Lifecycle
 * 
 * Tests the complete lifecycle of a FairWins prediction market:
 * 1. Market Creation - User creates a market with custom parameters
 * 2. Trading - Multiple participants trade YES/NO tokens
 * 3. Resolution - Market resolves based on outcome
 * 4. Settlement - Winners redeem tokens
 * 
 * Unlike ClearPath (DAO governance), FairWins markets are:
 * - Created by any user (permissionless)
 * - Based on custom events/predictions
 * - Resolved by market creator or oracle
 * - Open to anyone to trade
 */
describe("Integration: FairWins Market Lifecycle", function () {
  // Increase timeout for integration tests
  this.timeout(120000);

  describe("Complete Market Lifecycle", function () {
    it("Should complete full market creation, trading, resolution, and settlement flow", async function () {
      // Setup: Load the complete system fixture
      const { contracts, accounts, constants } = await loadFixture(deploySystemFixture);
      const { marketFactory, oracleResolver } = contracts;
      const { owner, trader1, trader2, trader3, proposer1: marketCreator, reporter } = accounts;

      console.log("\n=== FairWins Market Lifecycle Test ===\n");

      // ========================================
      // PHASE 1: MARKET CREATION
      // ========================================
      console.log("Phase 1: Market Creation");
      
      const marketQuestion = "Will ETH price reach $5000 by end of Q1 2025?";
      const initialLiquidity = ethers.parseEther("100");
      const tradingPeriod = 14 * 24 * 3600; // 14 days
      const currentTime = await time.latest();
      const tradingEndTime = currentTime + tradingPeriod;
      
      // Market creator creates a new prediction market
      // In FairWins, markets are created directly without proposals
      const createTx = await marketFactory.connect(marketCreator).createMarket(
        0, // proposalId = 0 for standalone markets
        ethers.ZeroAddress, // collateral token (ETH)
        tradingEndTime,
        1000, // liquidity parameter for LMSR
        { value: initialLiquidity }
      );
      
      const createReceipt = await createTx.wait();
      
      // Find MarketCreated event to get market ID
      const marketCreatedEvent = createReceipt.logs.find(log => {
        try {
          return marketFactory.interface.parseLog(log).name === "MarketCreated";
        } catch {
          return false;
        }
      });
      
      const marketId = marketFactory.interface.parseLog(marketCreatedEvent).args.marketId;
      console.log(`  ✓ Market created: ID ${marketId}`);
      console.log(`  ✓ Question: "${marketQuestion}"`);
      console.log(`  ✓ Initial liquidity: ${ethers.formatEther(initialLiquidity)} ETH`);
      console.log(`  ✓ Trading period: ${tradingPeriod / (24 * 3600)} days`);

      // Verify market was created with correct parameters
      const market = await marketFactory.getMarket(marketId);
      expect(market.status).to.equal(0, "Market should be Active");
      expect(market.tradingEndTime).to.equal(tradingEndTime);
      expect(market.liquidityParameter).to.equal(1000);
      
      console.log("  ✓ Market status: Active\n");

      // ========================================
      // PHASE 2: TRADING
      // ========================================
      console.log("Phase 2: Trading");
      
      // Multiple traders participate in the market
      // Trader 1: Bullish (buys YES tokens)
      const trade1Amount = ethers.parseEther("50");
      await marketFactory.connect(trader1).buyTokens(
        marketId,
        true, // YES tokens
        trade1Amount,
        { value: trade1Amount }
      );
      console.log(`  ✓ Trader 1: Bought ${ethers.formatEther(trade1Amount)} ETH worth of YES tokens`);

      // Trader 2: Also bullish (buys YES tokens)
      const trade2Amount = ethers.parseEther("30");
      await marketFactory.connect(trader2).buyTokens(
        marketId,
        true, // YES tokens
        trade2Amount,
        { value: trade2Amount }
      );
      console.log(`  ✓ Trader 2: Bought ${ethers.formatEther(trade2Amount)} ETH worth of YES tokens`);

      // Trader 3: Bearish (buys NO tokens)
      const trade3Amount = ethers.parseEther("20");
      await marketFactory.connect(trader3).buyTokens(
        marketId,
        false, // NO tokens
        trade3Amount,
        { value: trade3Amount }
      );
      console.log(`  ✓ Trader 3: Bought ${ethers.formatEther(trade3Amount)} ETH worth of NO tokens`);
      
      // Verify market reflects trading activity
      const marketAfterTrading = await marketFactory.getMarket(marketId);
      expect(marketAfterTrading.totalLiquidity).to.be.gt(initialLiquidity, "Liquidity should increase with trades");
      console.log(`  ✓ Total market liquidity: ${ethers.formatEther(marketAfterTrading.totalLiquidity)} ETH\n`);

      // ========================================
      // PHASE 3: TRADING PERIOD ENDS
      // ========================================
      console.log("Phase 3: Trading Period End");
      
      // Advance time to end of trading period
      await time.increaseTo(tradingEndTime + 1);
      console.log("  ✓ Trading period ended");
      
      // Verify no more trading is allowed
      await expect(
        marketFactory.connect(trader1).buyTokens(marketId, true, ethers.parseEther("10"), {
          value: ethers.parseEther("10")
        })
      ).to.be.revertedWith("Trading period has ended");
      console.log("  ✓ Trading disabled after period ends\n");

      // ========================================
      // PHASE 4: RESOLUTION
      // ========================================
      console.log("Phase 4: Market Resolution");
      
      // Oracle submits the resolution
      // In this scenario: YES outcome (ETH reached $5000)
      const yesValue = ethers.parseEther("1.0"); // YES tokens worth 1 ETH each
      const noValue = ethers.parseEther("0.0"); // NO tokens worth 0 ETH
      
      await oracleResolver.connect(reporter).submitReport(
        marketId,
        yesValue,
        "ETH price reached $5100 on March 28, 2025"
      );
      console.log("  ✓ Oracle submitted report: YES outcome");
      
      // Wait for challenge period
      await time.increase(3 * 24 * 3600); // 3 days
      console.log("  ✓ Challenge period passed (3 days)");
      
      // Finalize resolution
      await oracleResolver.connect(owner).finalizeResolution(marketId);
      console.log("  ✓ Resolution finalized");
      
      // Resolve the market
      await marketFactory.connect(owner).resolveMarket(
        marketId,
        yesValue,
        noValue
      );
      console.log("  ✓ Market resolved: YES wins\n");
      
      // Verify market is resolved
      const resolvedMarket = await marketFactory.getMarket(marketId);
      expect(resolvedMarket.resolved).to.be.true;
      expect(resolvedMarket.passValue).to.equal(yesValue);
      expect(resolvedMarket.failValue).to.equal(noValue);

      // ========================================
      // PHASE 5: SETTLEMENT
      // ========================================
      console.log("Phase 5: Settlement");
      
      // Get trader balances before redemption
      const trader1BalanceBefore = await ethers.provider.getBalance(trader1.address);
      const trader2BalanceBefore = await ethers.provider.getBalance(trader2.address);
      const trader3BalanceBefore = await ethers.provider.getBalance(trader3.address);
      
      // Traders redeem their tokens
      // Trader 1 (YES tokens) should receive payout
      const redeem1Tx = await marketFactory.connect(trader1).redeemTokens(marketId, true);
      const redeem1Receipt = await redeem1Tx.wait();
      const redeem1GasCost = redeem1Receipt.gasUsed * redeem1Receipt.gasPrice;
      console.log("  ✓ Trader 1: Redeemed YES tokens");
      
      // Trader 2 (YES tokens) should receive payout
      const redeem2Tx = await marketFactory.connect(trader2).redeemTokens(marketId, true);
      const redeem2Receipt = await redeem2Tx.wait();
      const redeem2GasCost = redeem2Receipt.gasUsed * redeem2Receipt.gasPrice;
      console.log("  ✓ Trader 2: Redeemed YES tokens");
      
      // Trader 3 (NO tokens) should receive nothing
      const redeem3Tx = await marketFactory.connect(trader3).redeemTokens(marketId, false);
      const redeem3Receipt = await redeem3Tx.wait();
      const redeem3GasCost = redeem3Receipt.gasUsed * redeem3Receipt.gasPrice;
      console.log("  ✓ Trader 3: Redeemed NO tokens (no value)");
      
      // Verify payouts
      const trader1BalanceAfter = await ethers.provider.getBalance(trader1.address);
      const trader2BalanceAfter = await ethers.provider.getBalance(trader2.address);
      const trader3BalanceAfter = await ethers.provider.getBalance(trader3.address);
      
      // Trader 1 should have gained (minus gas)
      const trader1Profit = trader1BalanceAfter - trader1BalanceBefore + redeem1GasCost;
      expect(trader1Profit).to.be.gt(0, "Trader 1 should profit from YES tokens");
      console.log(`  ✓ Trader 1 profit: ${ethers.formatEther(trader1Profit)} ETH`);
      
      // Trader 2 should have gained (minus gas)
      const trader2Profit = trader2BalanceAfter - trader2BalanceBefore + redeem2GasCost;
      expect(trader2Profit).to.be.gt(0, "Trader 2 should profit from YES tokens");
      console.log(`  ✓ Trader 2 profit: ${ethers.formatEther(trader2Profit)} ETH`);
      
      // Trader 3 should have lost (only gas cost)
      const trader3Loss = trader3BalanceBefore - trader3BalanceAfter - redeem3GasCost;
      expect(trader3Loss).to.be.lte(0, "Trader 3 should lose with NO tokens");
      console.log(`  ✓ Trader 3 loss: ${ethers.formatEther(trader3Loss)} ETH`);
      
      console.log("\n=== Market Lifecycle Complete ===\n");
    });

    it("Should handle NO outcome correctly", async function () {
      const { contracts, accounts, constants } = await loadFixture(deploySystemFixture);
      const { marketFactory, oracleResolver } = contracts;
      const { owner, trader1, trader2, proposer1: marketCreator, reporter } = accounts;

      console.log("\n=== FairWins Market: NO Outcome Test ===\n");

      // Create market
      const tradingPeriod = 7 * 24 * 3600; // 7 days
      const currentTime = await time.latest();
      const tradingEndTime = currentTime + tradingPeriod;
      
      const createTx = await marketFactory.connect(marketCreator).createMarket(
        0,
        ethers.ZeroAddress,
        tradingEndTime,
        1000,
        { value: ethers.parseEther("50") }
      );
      
      const createReceipt = await createTx.wait();
      const marketCreatedEvent = createReceipt.logs.find(log => {
        try {
          return marketFactory.interface.parseLog(log).name === "MarketCreated";
        } catch {
          return false;
        }
      });
      const marketId = marketFactory.interface.parseLog(marketCreatedEvent).args.marketId;
      console.log(`  ✓ Market created: ID ${marketId}\n`);

      // Trading: More NO votes than YES
      await marketFactory.connect(trader1).buyTokens(
        marketId,
        false, // NO tokens
        ethers.parseEther("30"),
        { value: ethers.parseEther("30") }
      );
      console.log("  ✓ Trader 1: Bought NO tokens");

      await marketFactory.connect(trader2).buyTokens(
        marketId,
        true, // YES tokens
        ethers.parseEther("10"),
        { value: ethers.parseEther("10") }
      );
      console.log("  ✓ Trader 2: Bought YES tokens\n");

      // End trading period
      await time.increaseTo(tradingEndTime + 1);
      console.log("  ✓ Trading period ended\n");

      // Resolution: NO wins
      const yesValue = ethers.parseEther("0.0");
      const noValue = ethers.parseEther("1.0");
      
      await oracleResolver.connect(reporter).submitReport(
        marketId,
        noValue,
        "Event did not occur as predicted"
      );
      await time.increase(3 * 24 * 3600);
      await oracleResolver.connect(owner).finalizeResolution(marketId);
      await marketFactory.connect(owner).resolveMarket(marketId, yesValue, noValue);
      console.log("  ✓ Market resolved: NO wins\n");

      // Settlement
      const trader1BalanceBefore = await ethers.provider.getBalance(trader1.address);
      const trader2BalanceBefore = await ethers.provider.getBalance(trader2.address);

      const redeem1Tx = await marketFactory.connect(trader1).redeemTokens(marketId, false);
      const redeem1Receipt = await redeem1Tx.wait();
      const redeem1GasCost = redeem1Receipt.gasUsed * redeem1Receipt.gasPrice;
      
      const redeem2Tx = await marketFactory.connect(trader2).redeemTokens(marketId, true);
      const redeem2Receipt = await redeem2Tx.wait();
      const redeem2GasCost = redeem2Receipt.gasUsed * redeem2Receipt.gasPrice;

      const trader1BalanceAfter = await ethers.provider.getBalance(trader1.address);
      const trader2BalanceAfter = await ethers.provider.getBalance(trader2.address);

      // Trader 1 (NO) should profit
      const trader1Profit = trader1BalanceAfter - trader1BalanceBefore + redeem1GasCost;
      expect(trader1Profit).to.be.gt(0, "Trader 1 should profit from NO tokens");
      console.log(`  ✓ Trader 1 (NO) profit: ${ethers.formatEther(trader1Profit)} ETH`);

      // Trader 2 (YES) should lose
      const trader2Loss = trader2BalanceBefore - trader2BalanceAfter - redeem2GasCost;
      expect(trader2Loss).to.be.lte(0, "Trader 2 should lose with YES tokens");
      console.log(`  ✓ Trader 2 (YES) loss: ${ethers.formatEther(trader2Loss)} ETH`);

      console.log("\n=== NO Outcome Test Complete ===\n");
    });
  });

  describe("Market Creation", function () {
    it("Should create market with custom parameters", async function () {
      const { contracts, accounts } = await loadFixture(deploySystemFixture);
      const { marketFactory } = contracts;
      const { proposer1: creator } = accounts;

      const tradingEndTime = (await time.latest()) + (21 * 24 * 3600); // 21 days
      const liquidityParam = 2000;
      const initialLiquidity = ethers.parseEther("200");

      const tx = await marketFactory.connect(creator).createMarket(
        0,
        ethers.ZeroAddress,
        tradingEndTime,
        liquidityParam,
        { value: initialLiquidity }
      );

      await expect(tx).to.emit(marketFactory, "MarketCreated");
      
      const receipt = await tx.wait();
      const event = receipt.logs.find(log => {
        try {
          return marketFactory.interface.parseLog(log).name === "MarketCreated";
        } catch {
          return false;
        }
      });
      const marketId = marketFactory.interface.parseLog(event).args.marketId;

      const market = await marketFactory.getMarket(marketId);
      expect(market.liquidityParameter).to.equal(liquidityParam);
      expect(market.tradingEndTime).to.equal(tradingEndTime);
    });

    it("Should require initial liquidity for market creation", async function () {
      const { contracts, accounts } = await loadFixture(deploySystemFixture);
      const { marketFactory } = contracts;
      const { proposer1: creator } = accounts;

      const tradingEndTime = (await time.latest()) + (14 * 24 * 3600);

      await expect(
        marketFactory.connect(creator).createMarket(
          0,
          ethers.ZeroAddress,
          tradingEndTime,
          1000,
          { value: 0 } // No liquidity
        )
      ).to.be.reverted;
    });
  });

  describe("Trading Phase", function () {
    it("Should allow multiple traders to participate", async function () {
      const { contracts, accounts } = await loadFixture(deploySystemFixture);
      const { marketFactory } = contracts;
      const { trader1, trader2, trader3, proposer1: creator } = accounts;

      // Create market
      const tradingEndTime = (await time.latest()) + (14 * 24 * 3600);
      const createTx = await marketFactory.connect(creator).createMarket(
        0,
        ethers.ZeroAddress,
        tradingEndTime,
        1000,
        { value: ethers.parseEther("100") }
      );
      
      const receipt = await createTx.wait();
      const event = receipt.logs.find(log => {
        try {
          return marketFactory.interface.parseLog(log).name === "MarketCreated";
        } catch {
          return false;
        }
      });
      const marketId = marketFactory.interface.parseLog(event).args.marketId;

      // Multiple trades
      await marketFactory.connect(trader1).buyTokens(marketId, true, ethers.parseEther("20"), {
        value: ethers.parseEther("20")
      });
      
      await marketFactory.connect(trader2).buyTokens(marketId, false, ethers.parseEther("15"), {
        value: ethers.parseEther("15")
      });
      
      await marketFactory.connect(trader3).buyTokens(marketId, true, ethers.parseEther("25"), {
        value: ethers.parseEther("25")
      });

      const market = await marketFactory.getMarket(marketId);
      expect(market.totalLiquidity).to.be.gt(ethers.parseEther("100"));
    });

    it("Should prevent trading after period ends", async function () {
      const { contracts, accounts } = await loadFixture(deploySystemFixture);
      const { marketFactory } = contracts;
      const { trader1, proposer1: creator } = accounts;

      const tradingPeriod = 7 * 24 * 3600;
      const currentTime = await time.latest();
      const tradingEndTime = currentTime + tradingPeriod;
      
      const createTx = await marketFactory.connect(creator).createMarket(
        0,
        ethers.ZeroAddress,
        tradingEndTime,
        1000,
        { value: ethers.parseEther("50") }
      );
      
      const receipt = await createTx.wait();
      const event = receipt.logs.find(log => {
        try {
          return marketFactory.interface.parseLog(log).name === "MarketCreated";
        } catch {
          return false;
        }
      });
      const marketId = marketFactory.interface.parseLog(event).args.marketId;

      // Advance past trading end time
      await time.increaseTo(tradingEndTime + 1);

      // Should revert
      await expect(
        marketFactory.connect(trader1).buyTokens(marketId, true, ethers.parseEther("10"), {
          value: ethers.parseEther("10")
        })
      ).to.be.revertedWith("Trading period has ended");
    });
  });

  describe("Resolution Phase", function () {
    it("Should only allow resolution after trading ends", async function () {
      const { contracts, accounts } = await loadFixture(deploySystemFixture);
      const { marketFactory, oracleResolver } = contracts;
      const { owner, reporter, proposer1: creator } = accounts;

      const tradingEndTime = (await time.latest()) + (7 * 24 * 3600);
      const createTx = await marketFactory.connect(creator).createMarket(
        0,
        ethers.ZeroAddress,
        tradingEndTime,
        1000,
        { value: ethers.parseEther("50") }
      );
      
      const receipt = await createTx.wait();
      const event = receipt.logs.find(log => {
        try {
          return marketFactory.interface.parseLog(log).name === "MarketCreated";
        } catch {
          return false;
        }
      });
      const marketId = marketFactory.interface.parseLog(event).args.marketId;

      // Try to resolve before trading ends - should fail
      await expect(
        marketFactory.connect(owner).resolveMarket(
          marketId,
          ethers.parseEther("1.0"),
          ethers.parseEther("0.0")
        )
      ).to.be.reverted;

      // Advance time
      await time.increaseTo(tradingEndTime + 1);

      // Submit oracle report
      await oracleResolver.connect(reporter).submitReport(
        marketId,
        ethers.parseEther("1.0"),
        "Test evidence"
      );
      await time.increase(3 * 24 * 3600);
      await oracleResolver.connect(owner).finalizeResolution(marketId);

      // Now should succeed
      await expect(
        marketFactory.connect(owner).resolveMarket(
          marketId,
          ethers.parseEther("1.0"),
          ethers.parseEther("0.0")
        )
      ).to.not.be.reverted;
    });
  });

  describe("Settlement Phase", function () {
    it("Should prevent redemption before resolution", async function () {
      const { contracts, accounts } = await loadFixture(deploySystemFixture);
      const { marketFactory } = contracts;
      const { trader1, proposer1: creator } = accounts;

      const tradingEndTime = (await time.latest()) + (7 * 24 * 3600);
      const createTx = await marketFactory.connect(creator).createMarket(
        0,
        ethers.ZeroAddress,
        tradingEndTime,
        1000,
        { value: ethers.parseEther("50") }
      );
      
      const receipt = await createTx.wait();
      const event = receipt.logs.find(log => {
        try {
          return marketFactory.interface.parseLog(log).name === "MarketCreated";
        } catch {
          return false;
        }
      });
      const marketId = marketFactory.interface.parseLog(event).args.marketId;

      // Trade
      await marketFactory.connect(trader1).buyTokens(marketId, true, ethers.parseEther("10"), {
        value: ethers.parseEther("10")
      });

      // Try to redeem before resolution
      await expect(
        marketFactory.connect(trader1).redeemTokens(marketId, true)
      ).to.be.reverted;
    });

    it("Should distribute payouts correctly to winners", async function () {
      const { contracts, accounts } = await loadFixture(deploySystemFixture);
      const { marketFactory, oracleResolver } = contracts;
      const { owner, trader1, reporter, proposer1: creator } = accounts;

      // Create and trade on market
      const tradingEndTime = (await time.latest()) + (7 * 24 * 3600);
      const createTx = await marketFactory.connect(creator).createMarket(
        0,
        ethers.ZeroAddress,
        tradingEndTime,
        1000,
        { value: ethers.parseEther("100") }
      );
      
      const receipt = await createTx.wait();
      const event = receipt.logs.find(log => {
        try {
          return marketFactory.interface.parseLog(log).name === "MarketCreated";
        } catch {
          return false;
        }
      });
      const marketId = marketFactory.interface.parseLog(event).args.marketId;

      const tradeAmount = ethers.parseEther("50");
      await marketFactory.connect(trader1).buyTokens(marketId, true, tradeAmount, {
        value: tradeAmount
      });

      // End trading and resolve
      await time.increaseTo(tradingEndTime + 1);
      await oracleResolver.connect(reporter).submitReport(
        marketId,
        ethers.parseEther("1.0"),
        "Test evidence"
      );
      await time.increase(3 * 24 * 3600);
      await oracleResolver.connect(owner).finalizeResolution(marketId);
      await marketFactory.connect(owner).resolveMarket(
        marketId,
        ethers.parseEther("1.0"),
        ethers.parseEther("0.0")
      );

      // Redeem and verify payout
      const balanceBefore = await ethers.provider.getBalance(trader1.address);
      const redeemTx = await marketFactory.connect(trader1).redeemTokens(marketId, true);
      const redeemReceipt = await redeemTx.wait();
      const gasCost = redeemReceipt.gasUsed * redeemReceipt.gasPrice;
      const balanceAfter = await ethers.provider.getBalance(trader1.address);

      const profit = balanceAfter - balanceBefore + gasCost;
      expect(profit).to.be.gt(0, "Winner should receive payout");
    });
  });
});
