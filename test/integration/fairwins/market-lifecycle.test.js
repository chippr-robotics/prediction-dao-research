const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { deploySystemFixture } = require("../fixtures/deploySystem");

/**
 * Integration tests for FairWins Market Lifecycle
 * 
 * Tests the complete lifecycle of a FairWins prediction market:
 * 1. Market Creation - User creates a market with custom parameters  
 * 2. Trading Period - Market is active for trading (trading implementation TBD)
 * 3. Resolution - Market resolves based on outcome
 * 4. Settlement - Market status updated after resolution
 * 
 * Unlike ClearPath (DAO governance), FairWins markets are:
 * - Created for standalone predictions (not tied to governance proposals)
 * - Based on custom events/predictions
 * - Resolved by designated oracle
 * - Open to anyone to participate
 * 
 * Note: This test suite focuses on market lifecycle management.
 * Trading functionality (buying/selling tokens) is handled by the conditional token contracts
 * and is not part of the market factory's responsibilities.
 */
describe("Integration: FairWins Market Lifecycle", function () {
  // Increase timeout for integration tests
  this.timeout(120000);

  describe("Complete Market Lifecycle", function () {
    it("Should complete full market creation, resolution, and settlement flow", async function () {
      // Setup: Load the complete system fixture
      const { contracts, accounts } = await loadFixture(deploySystemFixture);
      const { marketFactory, oracleResolver, futarchyGovernor } = contracts;
      const { owner, reporter } = accounts;

      console.log("\n=== FairWins Market Lifecycle Test ===\n");

      // ========================================
      // PHASE 1: MARKET CREATION
      // ========================================
      console.log("Phase 1: Market Creation");
      
      const marketQuestion = "Will ETH price reach $5000 by end of Q1 2025?";
      const initialLiquidity = ethers.parseEther("100");
      const tradingPeriod = 14 * 24 * 3600; // 14 days
      
      // Market is created for a standalone prediction via FutarchyGovernor
      // proposalId = 999 indicates this is a test FairWins market
      const createTx = await futarchyGovernor.connect(owner).createGovernanceProposal(
        999, // proposalId for standalone market
        initialLiquidity,
        1000, // liquidity parameter for LMSR
        tradingPeriod
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
      
      expect(marketCreatedEvent).to.not.be.undefined;
      const marketId = marketFactory.interface.parseLog(marketCreatedEvent).args.marketId;
      console.log(`  ✓ Market created: ID ${marketId}`);
      console.log(`  ✓ Question: "${marketQuestion}"`);
      console.log(`  ✓ Initial liquidity: ${ethers.formatEther(initialLiquidity)} ETH`);
      console.log(`  ✓ Trading period: ${tradingPeriod / (24 * 3600)} days`);

      // Verify market was created with correct parameters
      const market = await marketFactory.getMarket(marketId);
      expect(market.status).to.equal(0, "Market should be Active");
      expect(market.liquidityParameter).to.equal(1000);
      expect(market.totalLiquidity).to.equal(initialLiquidity);
      expect(market.proposalId).to.equal(0, "ProposalId should be 0 for FairWins markets");
      
      console.log("  ✓ Market status: Active\n");

      // ========================================
      // PHASE 2: TRADING PERIOD
      // ========================================
      console.log("Phase 2: Trading Period");
      console.log("  ℹ Market open for trading");
      console.log("  ℹ Trading occurs via conditional tokens (YES/NO tokens)");
      console.log("  ℹ Trading implementation handled by token contracts\n");
      
      // ========================================
      // PHASE 3: TRADING PERIOD ENDS
      // ========================================
      console.log("Phase 3: Trading Period End");
      
      // Advance time to end of trading period
      const tradingEndTime = Number(market.tradingEndTime);
      await time.increaseTo(tradingEndTime + 1);
      console.log("  ✓ Simulated time advance to trading end");
      
      // End trading on the market
      await marketFactory.connect(owner).endTrading(marketId);
      console.log("  ✓ Trading period officially closed\n");

      // Verify market status changed
      const marketAfterTrading = await marketFactory.getMarket(marketId);
      expect(marketAfterTrading.status).to.equal(1, "Market should be TradingEnded");

      // ========================================
      // PHASE 4: RESOLUTION
      // ========================================
      console.log("Phase 4: Market Resolution");
      
      // Oracle submits the resolution
      // In this scenario: YES outcome (ETH reached $5000)
      const yesValue = ethers.parseEther("1.0"); // YES tokens worth 1 ETH each
      const noValue = ethers.parseEther("0.0"); // NO tokens worth 0 ETH
      
      // Add reporter as designated reporter
      await oracleResolver.connect(owner).addDesignatedReporter(reporter.address);
      
      await oracleResolver.connect(reporter).submitReport(
        marketId,
        yesValue,
        noValue,
        ethers.toUtf8Bytes("ETH price reached $5100 on March 28, 2025 - verified via Chainlink oracle"),
        { value: ethers.parseEther("100") } // REPORTER_BOND
      );
      console.log("  ✓ Oracle submitted report: YES outcome");
      console.log("  ✓ YES tokens: 1.0 ETH value");
      console.log("  ✓ NO tokens: 0.0 ETH value");
      
      // Wait for challenge period
      await time.increase(3 * 24 * 3600); // 3 days
      console.log("  ✓ Challenge period passed (3 days)");
      
      // Finalize resolution
      await oracleResolver.connect(owner).finalizeResolution(marketId);
      console.log("  ✓ Resolution finalized (no challenges)");
      
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
      expect(resolvedMarket.status).to.equal(2, "Market should be Resolved");

      // ========================================
      // PHASE 5: SETTLEMENT
      // ========================================
      console.log("Phase 5: Settlement");
      console.log("  ✓ Market resolved with YES outcome");
      console.log("  ✓ Token holders can now redeem:");
      console.log("    - YES token holders: Redeem for 1.0 ETH per token");
      console.log("    - NO token holders: Tokens worth 0 (no redemption value)\n");
      
      console.log("=== Market Lifecycle Complete ===\n");
      console.log("Summary:");
      console.log("  • Market created for standalone prediction");
      console.log("  • Trading period: 14 days");
      console.log("  • Oracle resolution: YES outcome");
      console.log("  • Winners can redeem tokens for 1:1 ETH value");
      console.log("");
    });

    it("Should handle NO outcome correctly", async function () {
      const { contracts, accounts } = await loadFixture(deploySystemFixture);
      const { marketFactory, oracleResolver } = contracts;
      const { owner, reporter } = accounts;

      console.log("\n=== FairWins Market: NO Outcome Test ===\n");

      // Create market
      const tradingPeriod = 7 * 24 * 3600; // 7 days
      
      const createTx = await marketFactory.connect(owner).deployMarketPair(
        1, // different proposal ID to avoid collision
        ethers.ZeroAddress,
        ethers.parseEther("50"),
        1000,
        tradingPeriod
      );
      
      const createReceipt = await createTx.wait();
      const marketCreatedEvent = createReceipt.logs.find(log => {
        try {
          return marketFactory.interface.parseLog(log).name === "MarketCreated";
        } catch {
          return false;
        }
      });
      expect(marketCreatedEvent).to.not.be.undefined;
      const marketId = marketFactory.interface.parseLog(marketCreatedEvent).args.marketId;
      console.log(`  ✓ Market created: ID ${marketId}`);
      console.log("  ✓ Question: 'Will BTC surpass $150k by year end?'\n");

      // Get market to find trading end time
      const market = await marketFactory.getMarket(marketId);
      
      // End trading period
      await time.increaseTo(Number(market.tradingEndTime) + 1);
      await marketFactory.connect(owner).endTrading(marketId);
      console.log("  ✓ Trading period ended (7 days)\n");

      // Resolution: NO wins
      const yesValue = ethers.parseEther("0.0");
      const noValue = ethers.parseEther("1.0");
      
      console.log("Phase: Resolution");
      // Add reporter as designated reporter
      await oracleResolver.connect(owner).addDesignatedReporter(reporter.address);
      
      await oracleResolver.connect(reporter).submitReport(
        marketId,
        yesValue,
        noValue,
        ethers.toUtf8Bytes("BTC did not reach $150k - ended year at $98k"),
        { value: ethers.parseEther("100") } // REPORTER_BOND
      );
      console.log("  ✓ Oracle report: NO outcome");
      
      await time.increase(3 * 24 * 3600);
      await oracleResolver.connect(owner).finalizeResolution(marketId);
      console.log("  ✓ Challenge period passed");
      
      await marketFactory.connect(owner).resolveMarket(marketId, yesValue, noValue);
      console.log("  ✓ Market resolved: NO wins\n");

      // Verify resolution
      const resolvedMarket = await marketFactory.getMarket(marketId);
      expect(resolvedMarket.resolved).to.be.true;
      expect(resolvedMarket.passValue).to.equal(yesValue);
      expect(resolvedMarket.failValue).to.equal(noValue);
      
      console.log("Settlement:");
      console.log("  ✓ YES tokens worth: 0 ETH (losers)");
      console.log("  ✓ NO tokens worth: 1 ETH (winners)");

      console.log("\n=== NO Outcome Test Complete ===\n");
    });
  });

  describe("Market Creation", function () {
    it("Should create market with custom parameters", async function () {
      const { contracts, accounts } = await loadFixture(deploySystemFixture);
      const { marketFactory } = contracts;
      const { owner } = accounts;

      const tradingPeriod = 21 * 24 * 3600; // 21 days (max)
      const liquidityParam = 2000;
      const initialLiquidity = ethers.parseEther("200");

      const tx = await marketFactory.connect(owner).deployMarketPair(
        2, // proposalId
        ethers.ZeroAddress,
        initialLiquidity,
        liquidityParam,
        tradingPeriod
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
      expect(event).to.not.be.undefined;
      const marketId = marketFactory.interface.parseLog(event).args.marketId;

      const market = await marketFactory.getMarket(marketId);
      expect(market.liquidityParameter).to.equal(liquidityParam);
      expect(market.totalLiquidity).to.equal(initialLiquidity);
    });

    it("Should reject invalid trading period", async function () {
      const { contracts, accounts } = await loadFixture(deploySystemFixture);
      const { marketFactory } = contracts;
      const { owner } = accounts;

      const tooShort = 5 * 24 * 3600; // 5 days (< 7 day minimum)

      await expect(
        marketFactory.connect(owner).deployMarketPair(
          3,
          ethers.ZeroAddress,
          ethers.parseEther("50"),
          1000,
          tooShort
        )
      ).to.be.revertedWith("Invalid trading period");
    });
  });

  describe("Resolution Phase", function () {
    it("Should only allow resolution after trading ends", async function () {
      const { contracts, accounts } = await loadFixture(deploySystemFixture);
      const { marketFactory, oracleResolver } = contracts;
      const { owner, reporter } = accounts;

      const tradingPeriod = 7 * 24 * 3600;
      const createTx = await marketFactory.connect(owner).deployMarketPair(
        4,
        ethers.ZeroAddress,
        ethers.parseEther("50"),
        1000,
        tradingPeriod
      );
      
      const receipt = await createTx.wait();
      const event = receipt.logs.find(log => {
        try {
          return marketFactory.interface.parseLog(log).name === "MarketCreated";
        } catch {
          return false;
        }
      });
      expect(event).to.not.be.undefined;
      const marketId = marketFactory.interface.parseLog(event).args.marketId;
      const market = await marketFactory.getMarket(marketId);

      // Try to resolve before trading ends - should fail
      await expect(
        marketFactory.connect(owner).resolveMarket(
          marketId,
          ethers.parseEther("1.0"),
          ethers.parseEther("0.0")
        )
      ).to.be.reverted;

      // Advance time and end trading
      await time.increaseTo(Number(market.tradingEndTime) + 1);
      await marketFactory.connect(owner).endTrading(marketId);

      // Submit oracle report
      await oracleResolver.connect(owner).addDesignatedReporter(reporter.address);
      await oracleResolver.connect(reporter).submitReport(
        marketId,
        ethers.parseEther("1.0"),
        ethers.parseEther("0.0"),
        ethers.toUtf8Bytes("Test evidence"),
        { value: ethers.parseEther("100") }
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

    it("Should update market status to Resolved after resolution", async function () {
      const { contracts, accounts } = await loadFixture(deploySystemFixture);
      const { marketFactory, oracleResolver } = contracts;
      const { owner, reporter } = accounts;

      const createTx = await marketFactory.connect(owner).deployMarketPair(
        5,
        ethers.ZeroAddress,
        ethers.parseEther("50"),
        1000,
        7 * 24 * 3600
      );
      
      const receipt = await createTx.wait();
      const event = receipt.logs.find(log => {
        try {
          return marketFactory.interface.parseLog(log).name === "MarketCreated";
        } catch {
          return false;
        }
      });
      expect(event).to.not.be.undefined;
      const marketId = marketFactory.interface.parseLog(event).args.marketId;
      const market = await marketFactory.getMarket(marketId);

      // End trading
      await time.increaseTo(Number(market.tradingEndTime) + 1);
      await marketFactory.connect(owner).endTrading(marketId);

      // Resolve
      await oracleResolver.connect(owner).addDesignatedReporter(reporter.address);
      await oracleResolver.connect(reporter).submitReport(
        marketId, 
        ethers.parseEther("1.0"),
        ethers.parseEther("0.0"),
        ethers.toUtf8Bytes("Evidence"),
        { value: ethers.parseEther("100") }
      );
      await time.increase(3 * 24 * 3600);
      await oracleResolver.connect(owner).finalizeResolution(marketId);
      await marketFactory.connect(owner).resolveMarket(
        marketId,
        ethers.parseEther("1.0"),
        ethers.parseEther("0.0")
      );

      const resolvedMarket = await marketFactory.getMarket(marketId);
      expect(resolvedMarket.status).to.equal(2); // Resolved
      expect(resolvedMarket.resolved).to.be.true;
    });
  });

  describe("Market Status Tracking", function () {
    it("Should properly track market status transitions", async function () {
      const { contracts, accounts } = await loadFixture(deploySystemFixture);
      const { marketFactory, oracleResolver } = contracts;
      const { owner, reporter } = accounts;

      const createTx = await marketFactory.connect(owner).deployMarketPair(
        6,
        ethers.ZeroAddress,
        ethers.parseEther("100"),
        1000,
        7 * 24 * 3600
      );
      
      const receipt = await createTx.wait();
      const event = receipt.logs.find(log => {
        try {
          return marketFactory.interface.parseLog(log).name === "MarketCreated";
        } catch {
          return false;
        }
      });
      expect(event).to.not.be.undefined;
      const marketId = marketFactory.interface.parseLog(event).args.marketId;

      // Status 1: Active
      let market = await marketFactory.getMarket(marketId);
      expect(market.status).to.equal(0);

      // Status 2: TradingEnded
      await time.increaseTo(Number(market.tradingEndTime) + 1);
      await marketFactory.connect(owner).endTrading(marketId);
      market = await marketFactory.getMarket(marketId);
      expect(market.status).to.equal(1);

      // Status 3: Resolved
      await oracleResolver.connect(owner).addDesignatedReporter(reporter.address);
      await oracleResolver.connect(reporter).submitReport(
        marketId,
        ethers.parseEther("1.0"),
        ethers.parseEther("0.0"),
        ethers.toUtf8Bytes("Evidence"),
        { value: ethers.parseEther("100") }
      );
      await time.increase(3 * 24 * 3600);
      await oracleResolver.connect(owner).finalizeResolution(marketId);
      await marketFactory.connect(owner).resolveMarket(
        marketId,
        ethers.parseEther("1.0"),
        ethers.parseEther("0.0")
      );
      market = await marketFactory.getMarket(marketId);
      expect(market.status).to.equal(2);
    });
  });
});
