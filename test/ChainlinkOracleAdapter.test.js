const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("ChainlinkOracleAdapter", function () {
  let chainlinkAdapter;
  let mockEthFeed;
  let mockBtcFeed;
  let owner;
  let user1;

  const ETH_DECIMALS = 8;
  const BTC_DECIMALS = 8;
  const INITIAL_ETH_PRICE = 3000_00000000n; // $3000 with 8 decimals
  const INITIAL_BTC_PRICE = 60000_00000000n; // $60000 with 8 decimals

  beforeEach(async function () {
    [owner, user1] = await ethers.getSigners();

    // Deploy mock Chainlink feeds
    const MockChainlinkAggregator = await ethers.getContractFactory("MockChainlinkAggregator");
    mockEthFeed = await MockChainlinkAggregator.deploy(ETH_DECIMALS, "ETH / USD", INITIAL_ETH_PRICE);
    mockBtcFeed = await MockChainlinkAggregator.deploy(BTC_DECIMALS, "BTC / USD", INITIAL_BTC_PRICE);

    // Deploy ChainlinkOracleAdapter
    const ChainlinkOracleAdapter = await ethers.getContractFactory("ChainlinkOracleAdapter");
    chainlinkAdapter = await ChainlinkOracleAdapter.deploy(owner.address);

    // Add supported feeds
    await chainlinkAdapter.addPriceFeed(mockEthFeed.target);
    await chainlinkAdapter.addPriceFeed(mockBtcFeed.target);
  });

  describe("Constructor", function () {
    it("Should set the owner correctly", async function () {
      expect(await chainlinkAdapter.owner()).to.equal(owner.address);
    });

    it("Should return correct oracle type", async function () {
      expect(await chainlinkAdapter.oracleType()).to.equal("Chainlink");
    });

    it("Should have default staleness threshold of 1 hour", async function () {
      expect(await chainlinkAdapter.stalenessThreshold()).to.equal(3600);
    });
  });

  describe("Price Feed Management", function () {
    it("Should add a price feed", async function () {
      const MockChainlinkAggregator = await ethers.getContractFactory("MockChainlinkAggregator");
      const newFeed = await MockChainlinkAggregator.deploy(8, "LINK / USD", 15_00000000n);

      await expect(chainlinkAdapter.addPriceFeed(newFeed.target))
        .to.emit(chainlinkAdapter, "PriceFeedAdded")
        .withArgs(newFeed.target, "LINK / USD");

      expect(await chainlinkAdapter.supportedFeeds(newFeed.target)).to.be.true;
    });

    it("Should revert when adding zero address feed", async function () {
      await expect(
        chainlinkAdapter.addPriceFeed(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(chainlinkAdapter, "InvalidFeed");
    });

    it("Should revert when adding duplicate feed", async function () {
      await expect(
        chainlinkAdapter.addPriceFeed(mockEthFeed.target)
      ).to.be.revertedWithCustomError(chainlinkAdapter, "FeedAlreadySupported");
    });

    it("Should remove a price feed", async function () {
      await expect(chainlinkAdapter.removePriceFeed(mockEthFeed.target))
        .to.emit(chainlinkAdapter, "PriceFeedRemoved")
        .withArgs(mockEthFeed.target);

      expect(await chainlinkAdapter.supportedFeeds(mockEthFeed.target)).to.be.false;
    });

    it("Should revert when removing unsupported feed", async function () {
      await expect(
        chainlinkAdapter.removePriceFeed(user1.address)
      ).to.be.revertedWithCustomError(chainlinkAdapter, "FeedNotSupported");
    });

    it("Should only allow owner to add feeds", async function () {
      const MockChainlinkAggregator = await ethers.getContractFactory("MockChainlinkAggregator");
      const newFeed = await MockChainlinkAggregator.deploy(8, "LINK / USD", 15_00000000n);

      await expect(
        chainlinkAdapter.connect(user1).addPriceFeed(newFeed.target)
      ).to.be.revertedWithCustomError(chainlinkAdapter, "OwnableUnauthorizedAccount");
    });

    it("Should get all supported feeds", async function () {
      const feeds = await chainlinkAdapter.getSupportedFeeds();
      expect(feeds.length).to.equal(2);
      expect(feeds).to.include(mockEthFeed.target);
      expect(feeds).to.include(mockBtcFeed.target);
    });

    it("Should update staleness threshold", async function () {
      await expect(chainlinkAdapter.setStalenessThreshold(7200))
        .to.emit(chainlinkAdapter, "StalenessThresholdUpdated")
        .withArgs(3600, 7200);

      expect(await chainlinkAdapter.stalenessThreshold()).to.equal(7200);
    });
  });

  describe("Condition Creation", function () {
    const targetPrice = 5000_00000000n; // $5000

    it("Should create an ABOVE condition", async function () {
      const deadline = (await time.latest()) + 86400; // 1 day from now
      const tx = await chainlinkAdapter.createCondition(
        mockEthFeed.target,
        targetPrice,
        0, // ABOVE
        deadline,
        "ETH above $5000"
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(log => {
        try {
          return chainlinkAdapter.interface.parseLog(log)?.name === "PriceConditionCreated";
        } catch { return false; }
      });

      expect(event).to.not.be.undefined;
      const parsedEvent = chainlinkAdapter.interface.parseLog(event);
      expect(parsedEvent.args.priceFeed).to.equal(mockEthFeed.target);
      expect(parsedEvent.args.targetPrice).to.equal(targetPrice);
      expect(parsedEvent.args.comparison).to.equal(0); // ABOVE
    });

    it("Should create a BELOW condition", async function () {
      const deadline = (await time.latest()) + 86400;
      const tx = await chainlinkAdapter.createCondition(
        mockEthFeed.target,
        targetPrice,
        1, // BELOW
        deadline,
        "ETH below $5000"
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(log => {
        try {
          return chainlinkAdapter.interface.parseLog(log)?.name === "PriceConditionCreated";
        } catch { return false; }
      });

      expect(event).to.not.be.undefined;
      const parsedEvent = chainlinkAdapter.interface.parseLog(event);
      expect(parsedEvent.args.comparison).to.equal(1); // BELOW
    });

    it("Should revert for unsupported feed", async function () {
      const deadline = (await time.latest()) + 86400;
      await expect(
        chainlinkAdapter.createCondition(user1.address, targetPrice, 0, deadline, "Test")
      ).to.be.revertedWithCustomError(chainlinkAdapter, "FeedNotSupported");
    });

    it("Should revert for deadline in past", async function () {
      const pastDeadline = Math.floor(Date.now() / 1000) - 3600;
      await expect(
        chainlinkAdapter.createCondition(mockEthFeed.target, targetPrice, 0, pastDeadline, "Test")
      ).to.be.revertedWithCustomError(chainlinkAdapter, "DeadlineInPast");
    });

    it("Should revert for zero target price", async function () {
      const deadline = (await time.latest()) + 86400;
      await expect(
        chainlinkAdapter.createCondition(mockEthFeed.target, 0, 0, deadline, "Test")
      ).to.be.revertedWithCustomError(chainlinkAdapter, "InvalidTargetPrice");
    });

    it("Should return condition details", async function () {
      const deadline = (await time.latest()) + 86400;
      const tx = await chainlinkAdapter.createCondition(
        mockEthFeed.target,
        targetPrice,
        0,
        deadline,
        "ETH above $5000"
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(log => {
        try {
          return chainlinkAdapter.interface.parseLog(log)?.name === "PriceConditionCreated";
        } catch { return false; }
      });
      const conditionId = chainlinkAdapter.interface.parseLog(event).args.conditionId;

      const condition = await chainlinkAdapter.getCondition(conditionId);
      expect(condition.priceFeed).to.equal(mockEthFeed.target);
      expect(condition.targetPrice).to.equal(targetPrice);
      expect(condition.comparison).to.equal(0);
      expect(condition.deadline).to.equal(deadline);
      expect(condition.description).to.equal("ETH above $5000");
      expect(condition.registered).to.be.true;
    });
  });

  describe("Condition Resolution", function () {
    let conditionId;
    const targetPrice = 5000_00000000n; // $5000

    beforeEach(async function () {
      const deadline = (await time.latest()) + 86400; // 1 day from now

      const tx = await chainlinkAdapter.createCondition(
        mockEthFeed.target,
        targetPrice,
        0, // ABOVE
        deadline,
        "ETH above $5000"
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(log => {
        try {
          return chainlinkAdapter.interface.parseLog(log)?.name === "PriceConditionCreated";
        } catch { return false; }
      });
      conditionId = chainlinkAdapter.interface.parseLog(event).args.conditionId;
    });

    it("Should revert when deadline not reached", async function () {
      await expect(
        chainlinkAdapter.resolveCondition(conditionId)
      ).to.be.revertedWithCustomError(chainlinkAdapter, "DeadlineNotReached");
    });

    it("Should resolve with PASS when price is above target", async function () {
      // Advance time past deadline
      await time.increase(86401);

      // Update price to above target (also refreshes timestamp)
      await mockEthFeed.updateAnswer(6000_00000000n); // $6000

      await expect(chainlinkAdapter.resolveCondition(conditionId))
        .to.emit(chainlinkAdapter, "PriceConditionResolved");

      const resolution = await chainlinkAdapter.getResolution(conditionId);
      expect(resolution.resolved).to.be.true;
      expect(resolution.outcome).to.be.true; // PASS
      expect(resolution.priceAtResolution).to.equal(6000_00000000n);
    });

    it("Should resolve with FAIL when price is below target", async function () {
      // Advance time past deadline
      await time.increase(86401);
      // Refresh feed timestamp (price stays at $3000, below $5000 target)
      await mockEthFeed.updateAnswer(INITIAL_ETH_PRICE);

      await chainlinkAdapter.resolveCondition(conditionId);

      const resolution = await chainlinkAdapter.getResolution(conditionId);
      expect(resolution.resolved).to.be.true;
      expect(resolution.outcome).to.be.false; // FAIL
    });

    it("Should resolve with PASS when price equals target (ABOVE)", async function () {
      await time.increase(86401);
      await mockEthFeed.updateAnswer(targetPrice);

      await chainlinkAdapter.resolveCondition(conditionId);

      const resolution = await chainlinkAdapter.getResolution(conditionId);
      expect(resolution.outcome).to.be.true; // PASS (>= target)
    });

    it("Should handle BELOW condition correctly", async function () {
      const deadline = (await time.latest()) + 86400;

      const tx = await chainlinkAdapter.createCondition(
        mockEthFeed.target,
        targetPrice,
        1, // BELOW
        deadline,
        "ETH below $5000"
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(log => {
        try {
          return chainlinkAdapter.interface.parseLog(log)?.name === "PriceConditionCreated";
        } catch { return false; }
      });
      const belowConditionId = chainlinkAdapter.interface.parseLog(event).args.conditionId;

      // Advance time and refresh price (stays at $3000, below $5000)
      await time.increase(86401);
      await mockEthFeed.updateAnswer(INITIAL_ETH_PRICE);

      await chainlinkAdapter.resolveCondition(belowConditionId);

      const resolution = await chainlinkAdapter.getResolution(belowConditionId);
      expect(resolution.outcome).to.be.true; // PASS (price below target)
    });

    it("Should revert for stale price data", async function () {
      await time.increase(86401);

      // Set timestamp to be stale (2 hours ago)
      const staleTime = (await time.latest()) - 7200;
      await mockEthFeed.setTimestamp(staleTime);

      await expect(
        chainlinkAdapter.resolveCondition(conditionId)
      ).to.be.revertedWithCustomError(chainlinkAdapter, "StalePrice");
    });

    it("Should not re-resolve already resolved condition", async function () {
      await time.increase(86401);
      await mockEthFeed.updateAnswer(INITIAL_ETH_PRICE);
      await chainlinkAdapter.resolveCondition(conditionId);

      // Second resolution should not fail, just return
      await chainlinkAdapter.resolveCondition(conditionId);

      // Check it's still resolved with same data
      const resolution = await chainlinkAdapter.getResolution(conditionId);
      expect(resolution.resolved).to.be.true;
    });
  });

  describe("IOracleAdapter Interface", function () {
    let conditionId;

    beforeEach(async function () {
      const deadline = (await time.latest()) + 86400;

      const tx = await chainlinkAdapter.createCondition(
        mockEthFeed.target,
        5000_00000000n,
        0,
        deadline,
        "Test condition"
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(log => {
        try {
          return chainlinkAdapter.interface.parseLog(log)?.name === "PriceConditionCreated";
        } catch { return false; }
      });
      conditionId = chainlinkAdapter.interface.parseLog(event).args.conditionId;
    });

    it("Should report condition as supported", async function () {
      expect(await chainlinkAdapter.isConditionSupported(conditionId)).to.be.true;
    });

    it("Should report unknown condition as not supported", async function () {
      const unknownId = ethers.keccak256(ethers.toUtf8Bytes("unknown"));
      expect(await chainlinkAdapter.isConditionSupported(unknownId)).to.be.false;
    });

    it("Should report unresolved condition correctly", async function () {
      expect(await chainlinkAdapter.isConditionResolved(conditionId)).to.be.false;
    });

    it("Should report resolved condition correctly", async function () {
      await time.increase(86401);
      await mockEthFeed.updateAnswer(INITIAL_ETH_PRICE);
      await chainlinkAdapter.resolveCondition(conditionId);

      expect(await chainlinkAdapter.isConditionResolved(conditionId)).to.be.true;
    });

    it("Should return outcome with 100% confidence", async function () {
      await time.increase(86401);
      await mockEthFeed.updateAnswer(6000_00000000n);
      await chainlinkAdapter.resolveCondition(conditionId);

      const [outcome, confidence, resolvedAt] = await chainlinkAdapter.getOutcome(conditionId);
      expect(outcome).to.be.true;
      expect(confidence).to.equal(10000); // 100%
      expect(resolvedAt).to.be.gt(0);
    });

    it("Should return zero outcome for unresolved condition", async function () {
      const [outcome, confidence, resolvedAt] = await chainlinkAdapter.getOutcome(conditionId);
      expect(outcome).to.be.false;
      expect(confidence).to.equal(0);
      expect(resolvedAt).to.equal(0);
    });

    it("Should return condition metadata", async function () {
      const [description, expectedResolutionTime] = await chainlinkAdapter.getConditionMetadata(conditionId);
      expect(description).to.equal("Test condition");
      expect(expectedResolutionTime).to.be.gt(0);
    });
  });

  describe("View Functions", function () {
    it("Should get latest price from feed", async function () {
      const [price, updatedAt] = await chainlinkAdapter.getLatestPrice(mockEthFeed.target);
      expect(price).to.equal(INITIAL_ETH_PRICE);
      expect(updatedAt).to.be.gt(0);
    });

    it("Should revert getLatestPrice for unsupported feed", async function () {
      await expect(
        chainlinkAdapter.getLatestPrice(user1.address)
      ).to.be.revertedWithCustomError(chainlinkAdapter, "FeedNotSupported");
    });

    it("Should check if condition can be resolved", async function () {
      const deadline = (await time.latest()) + 86400;

      const tx = await chainlinkAdapter.createCondition(
        mockEthFeed.target,
        5000_00000000n,
        0,
        deadline,
        "Test"
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(log => {
        try {
          return chainlinkAdapter.interface.parseLog(log)?.name === "PriceConditionCreated";
        } catch { return false; }
      });
      const conditionId = chainlinkAdapter.interface.parseLog(event).args.conditionId;

      // Before deadline
      expect(await chainlinkAdapter.canResolve(conditionId)).to.be.false;

      // After deadline
      await time.increase(86401);
      expect(await chainlinkAdapter.canResolve(conditionId)).to.be.true;

      // After resolution
      await mockEthFeed.updateAnswer(INITIAL_ETH_PRICE);
      await chainlinkAdapter.resolveCondition(conditionId);
      expect(await chainlinkAdapter.canResolve(conditionId)).to.be.false;
    });

    it("Should return feed count", async function () {
      expect(await chainlinkAdapter.getFeedCount()).to.equal(2);
    });
  });
});
