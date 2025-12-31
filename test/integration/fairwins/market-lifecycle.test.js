const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { BetType } = require("../../constants/BetType");

/**
 * Simplified deployment fixture for FairWins standalone markets
 * Unlike governance proposals, FairWins markets are standalone predictions
 */
async function deployFairWinsFixture() {
  const [owner, reporter, trader1, trader2, feeRecipient] = await ethers.getSigners();

  // Ensure reporter has enough ETH for bond/report payments (100 ETH per report + gas)
  // This is needed when running as part of full test suite where accounts may be depleted
  const reporterBalance = await ethers.provider.getBalance(reporter.address);
  const requiredBalance = ethers.parseEther("500"); // Buffer for multiple reports
  if (reporterBalance < requiredBalance) {
    const amountNeeded = requiredBalance - reporterBalance;
    const ownerBalance = await ethers.provider.getBalance(owner.address);
    // Only send if owner has enough (leave some for gas)
    if (ownerBalance > amountNeeded + ethers.parseEther("50")) {
      await owner.sendTransaction({
        to: reporter.address,
        value: amountNeeded
      });
    }
  }

  // Deploy only what's needed for standalone markets
  // Deploy CTF1155 (required for ConditionalMarketFactory)
  const CTF1155 = await ethers.getContractFactory("CTF1155");
  const ctf1155 = await CTF1155.deploy();
  await ctf1155.waitForDeployment();
  
  // Deploy mock collateral token for markets (required for CTF1155)
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const collateralToken = await MockERC20.deploy("Market Collateral", "MCOL", ethers.parseEther("10000000"));
  await collateralToken.waitForDeployment();
  
  // Distribute collateral tokens to test accounts
  await collateralToken.transfer(reporter.address, ethers.parseEther("50000"));
  await collateralToken.transfer(trader1.address, ethers.parseEther("50000"));
  await collateralToken.transfer(trader2.address, ethers.parseEther("50000"));
  
  const ConditionalMarketFactory = await ethers.getContractFactory("ConditionalMarketFactory");
  const marketFactory = await ConditionalMarketFactory.deploy();
  await marketFactory.waitForDeployment();
  await marketFactory.initialize(owner.address);
  
  // Set CTF1155 in market factory (required for market creation)
  await marketFactory.setCTF1155(await ctf1155.getAddress());

  const OracleResolver = await ethers.getContractFactory("OracleResolver");
  const oracleResolver = await OracleResolver.deploy();
  await oracleResolver.waitForDeployment();
  await oracleResolver.initialize(owner.address);
  await oracleResolver.connect(owner).addDesignatedReporter(reporter.address);

  // Deploy PredictionMarketExchange for trading
  const PredictionMarketExchange = await ethers.getContractFactory("PredictionMarketExchange");
  const exchange = await PredictionMarketExchange.deploy(feeRecipient.address);
  await exchange.waitForDeployment();

  return {
    contracts: { marketFactory, oracleResolver, collateralToken, ctf1155, exchange },
    accounts: { owner, reporter, trader1, trader2, feeRecipient }
  };
}

/**
 * Helper to create and sign an order for the exchange
 */
async function createSignedOrder(signer, exchange, orderParams) {
  const domain = {
    name: "PredictionMarketExchange",
    version: "1",
    chainId: (await ethers.provider.getNetwork()).chainId,
    verifyingContract: await exchange.getAddress()
  };

  const types = {
    Order: [
      { name: "maker", type: "address" },
      { name: "makerAsset", type: "address" },
      { name: "takerAsset", type: "address" },
      { name: "makerAmount", type: "uint256" },
      { name: "takerAmount", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "expiration", type: "uint256" },
      { name: "salt", type: "bytes32" },
      { name: "isMakerERC1155", type: "bool" },
      { name: "isTakerERC1155", type: "bool" },
      { name: "makerTokenId", type: "uint256" },
      { name: "takerTokenId", type: "uint256" }
    ]
  };

  const order = {
    maker: signer.address,
    makerAsset: orderParams.makerAsset,
    takerAsset: orderParams.takerAsset,
    makerAmount: orderParams.makerAmount,
    takerAmount: orderParams.takerAmount,
    nonce: orderParams.nonce,
    expiration: orderParams.expiration,
    salt: orderParams.salt || ethers.randomBytes(32),
    isMakerERC1155: orderParams.isMakerERC1155,
    isTakerERC1155: orderParams.isTakerERC1155,
    makerTokenId: orderParams.makerTokenId,
    takerTokenId: orderParams.takerTokenId
  };

  const signature = await signer.signTypedData(domain, types, order);
  return { order, signature };
}

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
      // Setup: Load the FairWins-specific fixture
      const { contracts, accounts } = await loadFixture(deployFairWinsFixture);
      const { marketFactory, oracleResolver, collateralToken, ctf1155, exchange } = contracts;
      const { owner, reporter, trader1, trader2, feeRecipient } = accounts;

      console.log("\n=== FairWins Market Lifecycle Test ===\n");

      // ========================================
      // PHASE 1: MARKET CREATION
      // ========================================
      console.log("Phase 1: Market Creation");
      
      const marketQuestion = "Will ETH price reach $5000 by end of Q1 2025?";
      const initialLiquidity = ethers.parseEther("100");
      const tradingPeriod = 14 * 24 * 3600; // 14 days
      
      // Market is created for a standalone prediction
      // proposalId = 0 indicates this is a FairWins market, not a governance proposal
      const createTx = await marketFactory.connect(owner).deployMarketPair(
        0, // proposalId = 0 for standalone FairWins markets
        await collateralToken.getAddress(), // ERC20 collateral token
        initialLiquidity,
        1000, // liquidity parameter for LMSR
        tradingPeriod,
          BetType.YesNo
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
      console.log("  ℹ Market open for trading via PredictionMarketExchange");
      
      // Get position IDs for YES/NO tokens from market
      const yesTokenId = market.passPositionId;
      const noTokenId = market.failPositionId;
      console.log(`  ✓ YES token ID: ${yesTokenId}`);
      console.log(`  ✓ NO token ID: ${noTokenId}`);

      // Traders need to split collateral into conditional tokens first
      const splitAmount1 = ethers.parseEther("1000");
      const splitAmount2 = ethers.parseEther("800");
      
      await collateralToken.connect(trader1).approve(await ctf1155.getAddress(), splitAmount1);
      await collateralToken.connect(trader2).approve(await ctf1155.getAddress(), splitAmount2);
      
      await ctf1155.connect(trader1).splitPosition(
        await collateralToken.getAddress(),
        ethers.ZeroHash,
        market.conditionId,
        [1, 2],
        splitAmount1
      );
      
      await ctf1155.connect(trader2).splitPosition(
        await collateralToken.getAddress(),
        ethers.ZeroHash,
        market.conditionId,
        [1, 2],
        splitAmount2
      );
      
      console.log(`  ✓ Trader1 split ${ethers.formatEther(splitAmount1)} collateral into YES/NO tokens`);
      console.log(`  ✓ Trader2 split ${ethers.formatEther(splitAmount2)} collateral into YES/NO tokens`);

      // Approve exchange to transfer tokens
      await ctf1155.connect(trader1).setApprovalForAll(await exchange.getAddress(), true);
      await ctf1155.connect(trader2).setApprovalForAll(await exchange.getAddress(), true);

      // Scenario 1: Single Fill - Trader1 sells YES tokens for NO tokens
      console.log("\n  Scenario 1: Single Fill Order");
      const currentTime = await time.latest();
      const { order: order1, signature: sig1 } = await createSignedOrder(trader1, exchange, {
        makerAsset: await ctf1155.getAddress(),
        takerAsset: await ctf1155.getAddress(),
        makerAmount: ethers.parseEther("100"), // Selling 100 YES
        takerAmount: ethers.parseEther("100"), // For 100 NO
        nonce: 1,
        expiration: currentTime + 3600,
        isMakerERC1155: true,
        isTakerERC1155: true,
        makerTokenId: yesTokenId,
        takerTokenId: noTokenId
      });

      const trader1YesBefore = await ctf1155.balanceOf(trader1.address, yesTokenId);
      const trader1NoBefore = await ctf1155.balanceOf(trader1.address, noTokenId);
      const trader2YesBefore = await ctf1155.balanceOf(trader2.address, yesTokenId);
      const trader2NoBefore = await ctf1155.balanceOf(trader2.address, noTokenId);

      await exchange.connect(trader2).fillOrder(order1, sig1, ethers.parseEther("100"));
      
      const trader1YesAfter = await ctf1155.balanceOf(trader1.address, yesTokenId);
      const trader1NoAfter = await ctf1155.balanceOf(trader1.address, noTokenId);
      const trader2YesAfter = await ctf1155.balanceOf(trader2.address, yesTokenId);
      const trader2NoAfter = await ctf1155.balanceOf(trader2.address, noTokenId);
      const feeBalance1 = await ctf1155.balanceOf(feeRecipient.address, noTokenId);

      console.log(`    ✓ Trader1 sold 100 YES tokens`);
      console.log(`    ✓ Trader2 bought 100 YES tokens`);
      console.log(`    ✓ Fee collected: ${ethers.formatEther(feeBalance1)} NO tokens`);

      // Verify balances
      expect(trader1YesBefore - trader1YesAfter).to.equal(ethers.parseEther("100"));
      const expectedFee = ethers.parseEther("100") * 10n / 10000n; // 0.1% fee
      expect(trader1NoAfter - trader1NoBefore).to.equal(ethers.parseEther("100") - expectedFee);
      expect(trader2YesAfter - trader2YesBefore).to.equal(ethers.parseEther("100"));
      expect(trader2NoBefore - trader2NoAfter).to.equal(ethers.parseEther("100"));
      expect(feeBalance1).to.equal(expectedFee);

      // Scenario 2: Batch Fill - Multiple orders filled in one transaction
      console.log("\n  Scenario 2: Batch Fill Orders");
      const { order: order2, signature: sig2 } = await createSignedOrder(trader1, exchange, {
        makerAsset: await ctf1155.getAddress(),
        takerAsset: await ctf1155.getAddress(),
        makerAmount: ethers.parseEther("50"),
        takerAmount: ethers.parseEther("50"),
        nonce: 2,
        expiration: currentTime + 3600,
        isMakerERC1155: true,
        isTakerERC1155: true,
        makerTokenId: yesTokenId,
        takerTokenId: noTokenId
      });

      const { order: order3, signature: sig3 } = await createSignedOrder(trader1, exchange, {
        makerAsset: await ctf1155.getAddress(),
        takerAsset: await ctf1155.getAddress(),
        makerAmount: ethers.parseEther("30"),
        takerAmount: ethers.parseEther("30"),
        nonce: 3,
        expiration: currentTime + 3600,
        isMakerERC1155: true,
        isTakerERC1155: true,
        makerTokenId: yesTokenId,
        takerTokenId: noTokenId
      });

      const results = await exchange.connect(trader2).batchFillOrders(
        [order2, order3],
        [sig2, sig3],
        [ethers.parseEther("50"), ethers.parseEther("30")]
      );

      console.log(`    ✓ Batch filled 2 orders (50 + 30 YES tokens)`);
      
      // Scenario 3: Maker-to-Maker matching
      console.log("\n  Scenario 3: Maker-to-Maker Order Matching");
      
      // Trader1 wants to sell YES for NO
      const { order: orderA, signature: sigA } = await createSignedOrder(trader1, exchange, {
        makerAsset: await ctf1155.getAddress(),
        takerAsset: await ctf1155.getAddress(),
        makerAmount: ethers.parseEther("40"),
        takerAmount: ethers.parseEther("40"),
        nonce: 4,
        expiration: currentTime + 3600,
        isMakerERC1155: true,
        isTakerERC1155: true,
        makerTokenId: yesTokenId,
        takerTokenId: noTokenId
      });

      // Trader2 wants to sell NO for YES (inverse)
      const { order: orderB, signature: sigB } = await createSignedOrder(trader2, exchange, {
        makerAsset: await ctf1155.getAddress(),
        takerAsset: await ctf1155.getAddress(),
        makerAmount: ethers.parseEther("40"),
        takerAmount: ethers.parseEther("40"),
        nonce: 5,
        expiration: currentTime + 3600,
        isMakerERC1155: true,
        isTakerERC1155: true,
        makerTokenId: noTokenId,
        takerTokenId: yesTokenId
      });

      await exchange.connect(owner).matchOrders(
        orderA, sigA,
        orderB, sigB,
        ethers.parseEther("40")
      );

      console.log(`    ✓ Matched 40 YES/NO tokens between traders (maker-to-maker)`);
      
      // Verify final balances
      const trader1YesFinal = await ctf1155.balanceOf(trader1.address, yesTokenId);
      const trader1NoFinal = await ctf1155.balanceOf(trader1.address, noTokenId);
      const trader2YesFinal = await ctf1155.balanceOf(trader2.address, yesTokenId);
      const trader2NoFinal = await ctf1155.balanceOf(trader2.address, noTokenId);
      
      console.log(`\n  Final Token Balances After Trading:`);
      console.log(`    Trader1 - YES: ${ethers.formatEther(trader1YesFinal)}, NO: ${ethers.formatEther(trader1NoFinal)}`);
      console.log(`    Trader2 - YES: ${ethers.formatEther(trader2YesFinal)}, NO: ${ethers.formatEther(trader2NoFinal)}`);
      console.log(`    Fee Recipient - NO: ${ethers.formatEther(await ctf1155.balanceOf(feeRecipient.address, noTokenId))}`);
      console.log("");
      
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
      console.log("    - NO token holders: Tokens worth 0 (no redemption value)");
      
      // Calculate expected redemption values based on trading outcomes
      const trader1ExpectedValue = trader1YesFinal * yesValue / ethers.parseEther("1");
      const trader2ExpectedValue = trader2YesFinal * yesValue / ethers.parseEther("1");
      
      console.log(`\n  Expected Redemption Values (YES wins):`);
      console.log(`    Trader1: ${ethers.formatEther(trader1ExpectedValue)} ETH (from ${ethers.formatEther(trader1YesFinal)} YES tokens)`);
      console.log(`    Trader2: ${ethers.formatEther(trader2ExpectedValue)} ETH (from ${ethers.formatEther(trader2YesFinal)} YES tokens)`);
      
      // Verify that traders who accumulated more YES tokens through trading will benefit more
      expect(trader1YesFinal).to.be.lessThan(splitAmount1); // Trader1 sold YES tokens
      expect(trader2YesFinal).to.be.greaterThan(splitAmount2); // Trader2 bought YES tokens
      console.log(`    ✓ Trader2 will profit more (bought YES tokens during trading)`);
      console.log(`    ✓ Trader1 will profit less (sold YES tokens during trading)`);
      console.log("");
      
      console.log("=== Market Lifecycle Complete ===\n");
      console.log("Summary:");
      console.log("  • Market created for standalone prediction");
      console.log("  • Trading period: 14 days with PredictionMarketExchange");
      console.log("  • Trading scenarios tested: single fill, batch fill, maker-to-maker");
      console.log("  • Oracle resolution: YES outcome");
      console.log("  • Winners can redeem tokens for 1:1 ETH value");
      console.log("  • Trading outcomes reflected in final settlement values");
      console.log("");
    });

    it("Should handle NO outcome correctly", async function () {
      const { contracts, accounts } = await loadFixture(deployFairWinsFixture);
      const { marketFactory, oracleResolver, collateralToken, ctf1155, exchange } = contracts;
      const { owner, reporter, trader1, trader2, feeRecipient } = accounts;

      console.log("\n=== FairWins Market: NO Outcome Test ===\n");

      // Create market
      const tradingPeriod = 7 * 24 * 3600; // 7 days
      
      const createTx = await marketFactory.connect(owner).deployMarketPair(
        1, // different proposal ID to avoid collision
        await collateralToken.getAddress(),
        ethers.parseEther("50"),
        1000,
        tradingPeriod,
          BetType.YesNo
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

      // Get market to find trading end time and token IDs
      const market = await marketFactory.getMarket(marketId);
      const yesTokenId = market.passPositionId;
      const noTokenId = market.failPositionId;
      
      // Trading phase - traders betting on NO outcome will benefit
      console.log("Phase: Trading");
      const splitAmount = ethers.parseEther("500");
      await collateralToken.connect(trader1).approve(await ctf1155.getAddress(), splitAmount);
      await collateralToken.connect(trader2).approve(await ctf1155.getAddress(), splitAmount);
      
      await ctf1155.connect(trader1).splitPosition(
        await collateralToken.getAddress(),
        ethers.ZeroHash,
        market.conditionId,
        [1, 2],
        splitAmount
      );
      
      await ctf1155.connect(trader2).splitPosition(
        await collateralToken.getAddress(),
        ethers.ZeroHash,
        market.conditionId,
        [1, 2],
        splitAmount
      );
      
      await ctf1155.connect(trader1).setApprovalForAll(await exchange.getAddress(), true);
      await ctf1155.connect(trader2).setApprovalForAll(await exchange.getAddress(), true);
      
      // Trader1 buys NO tokens (sells YES for NO)
      const currentTime = await time.latest();
      const { order, signature } = await createSignedOrder(trader1, exchange, {
        makerAsset: await ctf1155.getAddress(),
        takerAsset: await ctf1155.getAddress(),
        makerAmount: ethers.parseEther("200"),
        takerAmount: ethers.parseEther("200"),
        nonce: 100,
        expiration: currentTime + 3600,
        isMakerERC1155: true,
        isTakerERC1155: true,
        makerTokenId: yesTokenId,
        takerTokenId: noTokenId
      });
      
      await exchange.connect(trader2).fillOrder(order, signature, ethers.parseEther("200"));
      
      const trader1NoTokens = await ctf1155.balanceOf(trader1.address, noTokenId);
      const trader2YesTokens = await ctf1155.balanceOf(trader2.address, yesTokenId);
      console.log(`  ✓ Trader1 accumulated ${ethers.formatEther(trader1NoTokens)} NO tokens (will win)`);
      console.log(`  ✓ Trader2 accumulated ${ethers.formatEther(trader2YesTokens)} YES tokens (will lose)\n`);
      
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
      console.log(`  ✓ Trader1 profits with ${ethers.formatEther(trader1NoTokens)} NO tokens`);
      console.log(`  ✓ Trader2 loses with worthless YES tokens`);

      console.log("\n=== NO Outcome Test Complete ===\n");
    });
  });

  describe("Market Creation", function () {
    it("Should create market with custom parameters", async function () {
      const { contracts, accounts } = await loadFixture(deployFairWinsFixture);
      const { marketFactory, collateralToken } = contracts;
      const { owner } = accounts;

      const tradingPeriod = 21 * 24 * 3600; // 21 days (max)
      const liquidityParam = 2000;
      const initialLiquidity = ethers.parseEther("200");

      const tx = await marketFactory.connect(owner).deployMarketPair(
        2, // proposalId
        await collateralToken.getAddress(),
        initialLiquidity,
        liquidityParam,
        tradingPeriod,
          BetType.YesNo
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
      const { contracts, accounts } = await loadFixture(deployFairWinsFixture);
      const { marketFactory, collateralToken } = contracts;
      const { owner } = accounts;

      const tooShort = 5 * 24 * 3600; // 5 days (< 7 day minimum)

      await expect(
        marketFactory.connect(owner).deployMarketPair(
          3,
          await collateralToken.getAddress(),
          ethers.parseEther("50"),
          1000,
          tooShort,
          BetType.YesNo
        )
      ).to.be.revertedWith("Invalid trading period");
    });
  });

  describe("Resolution Phase", function () {
    it("Should only allow resolution after trading ends", async function () {
      const { contracts, accounts } = await loadFixture(deployFairWinsFixture);
      const { marketFactory, oracleResolver, collateralToken } = contracts;
      const { owner, reporter } = accounts;

      const tradingPeriod = 7 * 24 * 3600;
      const createTx = await marketFactory.connect(owner).deployMarketPair(
        4,
        await collateralToken.getAddress(),
        ethers.parseEther("50"),
        1000,
        tradingPeriod,
          BetType.YesNo
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
      const { contracts, accounts } = await loadFixture(deployFairWinsFixture);
      const { marketFactory, oracleResolver, collateralToken } = contracts;
      const { owner, reporter } = accounts;

      const createTx = await marketFactory.connect(owner).deployMarketPair(
        5,
        await collateralToken.getAddress(),
        ethers.parseEther("50"),
        1000,
        7 * 24 * 3600,
        BetType.YesNo
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
      const { contracts, accounts } = await loadFixture(deployFairWinsFixture);
      const { marketFactory, oracleResolver, collateralToken } = contracts;
      const { owner, reporter } = accounts;

      const createTx = await marketFactory.connect(owner).deployMarketPair(
        6,
        await collateralToken.getAddress(),
        ethers.parseEther("100"),
        1000,
        7 * 24 * 3600,
        BetType.YesNo
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
