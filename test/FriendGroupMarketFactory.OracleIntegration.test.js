const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

/**
 * Oracle Integration Tests for FriendGroupMarketFactory
 *
 * Tests the multi-oracle resolution feature:
 * - Pegging markets to Chainlink/UMA oracles
 * - Resolution from oracle conditions
 * - View functions for oracle status
 */
describe("FriendGroupMarketFactory - Oracle Integration", function () {
  let friendGroupFactory;
  let marketFactory;
  let ragequitModule;
  let tieredRoleManager;
  let paymentManager;
  let oracleRegistry;
  let chainlinkAdapter;
  let mockChainlinkFeed;
  let collateralToken;
  let owner;
  let creator;
  let opponent;

  const CHAINLINK_ORACLE_ID = ethers.keccak256(ethers.toUtf8Bytes("CHAINLINK"));
  const FRIEND_MARKET_ROLE = ethers.id("FRIEND_MARKET_ROLE");
  const MembershipTier = { NONE: 0, BRONZE: 1, SILVER: 2, GOLD: 3, PLATINUM: 4 };
  const ResolutionType = { Either: 0, Initiator: 1, Receiver: 2, ThirdParty: 3, AutoPegged: 4 };
  const STAKE_AMOUNT = ethers.parseEther("1");
  const ACCEPTANCE_PERIOD = 7 * 24 * 60 * 60;
  const TRADING_PERIOD = 14 * 24 * 60 * 60;

  beforeEach(async function () {
    [owner, creator, opponent] = await ethers.getSigners();

    // Deploy CTF1155
    const CTF1155 = await ethers.getContractFactory("CTF1155");
    const ctf1155 = await CTF1155.deploy();
    await ctf1155.waitForDeployment();

    // Deploy collateral token
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    collateralToken = await MockERC20.deploy("Collateral", "COL", ethers.parseEther("10000000"));
    await collateralToken.waitForDeployment();

    // Deploy ConditionalMarketFactory
    const ConditionalMarketFactory = await ethers.getContractFactory("ConditionalMarketFactory");
    marketFactory = await ConditionalMarketFactory.deploy();
    await marketFactory.initialize(owner.address);
    await marketFactory.setCTF1155(await ctf1155.getAddress());

    // Deploy RagequitModule
    const RagequitModule = await ethers.getContractFactory("RagequitModule");
    ragequitModule = await RagequitModule.deploy();

    // Deploy TieredRoleManager
    const TieredRoleManager = await ethers.getContractFactory("TieredRoleManager");
    tieredRoleManager = await TieredRoleManager.deploy();
    await tieredRoleManager.waitForDeployment();
    await tieredRoleManager.initializeRoleMetadata();

    // Setup tier
    await tieredRoleManager.setTierMetadata(
      FRIEND_MARKET_ROLE,
      MembershipTier.BRONZE,
      "Friend Market Bronze",
      "Basic friend market tier",
      ethers.parseEther("0.1"),
      {
        dailyBetLimit: 10,
        weeklyBetLimit: 50,
        monthlyMarketCreation: 5,
        maxPositionSize: ethers.parseEther("10"),
        maxConcurrentMarkets: 3,
        withdrawalLimit: ethers.parseEther("100"),
        canCreatePrivateMarkets: false,
        canUseAdvancedFeatures: false,
        feeDiscount: 0
      },
      true
    );

    const tierMeta = await tieredRoleManager.tierMetadata(FRIEND_MARKET_ROLE, MembershipTier.BRONZE);
    const price = tierMeta.price;

    // Deploy MembershipPaymentManager
    const MembershipPaymentManager = await ethers.getContractFactory("MembershipPaymentManager");
    paymentManager = await MembershipPaymentManager.deploy(owner.address);
    await paymentManager.waitForDeployment();

    // Deploy FriendGroupMarketFactory
    const FriendGroupMarketFactory = await ethers.getContractFactory("FriendGroupMarketFactory");
    friendGroupFactory = await FriendGroupMarketFactory.deploy(
      await marketFactory.getAddress(),
      await ragequitModule.getAddress(),
      await tieredRoleManager.getAddress(),
      await paymentManager.getAddress(),
      owner.address
    );

    await friendGroupFactory.setDefaultCollateralToken(await collateralToken.getAddress());
    await friendGroupFactory.setTreasury(owner.address);

    // Transfer ownership of marketFactory to friendGroupFactory for market deployment
    await marketFactory.transferOwnership(await friendGroupFactory.getAddress());

    // Purchase memberships
    const durDays = 36500;
    await tieredRoleManager.connect(creator).purchaseRoleWithTier(
      FRIEND_MARKET_ROLE,
      MembershipTier.BRONZE,
      durDays,
      { value: price }
    );
    await tieredRoleManager.connect(opponent).purchaseRoleWithTier(
      FRIEND_MARKET_ROLE,
      MembershipTier.BRONZE,
      durDays,
      { value: price }
    );

    // Deploy Chainlink adapter and feed
    const MockChainlinkAggregator = await ethers.getContractFactory("MockChainlinkAggregator");
    mockChainlinkFeed = await MockChainlinkAggregator.deploy(8, "ETH / USD", 3000_00000000n);

    const ChainlinkOracleAdapter = await ethers.getContractFactory("ChainlinkOracleAdapter");
    chainlinkAdapter = await ChainlinkOracleAdapter.deploy(owner.address);
    await chainlinkAdapter.addPriceFeed(mockChainlinkFeed.target);

    // Deploy OracleRegistry
    const OracleRegistry = await ethers.getContractFactory("OracleRegistry");
    oracleRegistry = await OracleRegistry.deploy(owner.address);
    await oracleRegistry.registerAdapter(CHAINLINK_ORACLE_ID, chainlinkAdapter.target);

    // Configure factory
    await friendGroupFactory.setOracleRegistry(oracleRegistry.target);
  });

  describe("setOracleRegistry", function () {
    it("Should set oracle registry", async function () {
      expect(await friendGroupFactory.oracleRegistry()).to.equal(oracleRegistry.target);
    });

    it("Should emit event on registry update", async function () {
      const OracleRegistry = await ethers.getContractFactory("OracleRegistry");
      const newRegistry = await OracleRegistry.deploy(owner.address);

      await expect(friendGroupFactory.setOracleRegistry(newRegistry.target))
        .to.emit(friendGroupFactory, "OracleRegistryUpdated")
        .withArgs(newRegistry.target);
    });

    it("Should revert when non-owner tries to set registry", async function () {
      const OracleRegistry = await ethers.getContractFactory("OracleRegistry");
      const newRegistry = await OracleRegistry.deploy(owner.address);

      await expect(
        friendGroupFactory.connect(creator).setOracleRegistry(newRegistry.target)
      ).to.be.revertedWithCustomError(friendGroupFactory, "OwnableUnauthorizedAccount");
    });
  });

  describe("pegToOracleCondition", function () {
    let conditionId;

    beforeEach(async function () {
      // Create Chainlink condition
      const deadline = (await time.latest()) + TRADING_PERIOD;
      const tx = await chainlinkAdapter.createCondition(
        mockChainlinkFeed.target,
        5000_00000000n,
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
      conditionId = chainlinkAdapter.interface.parseLog(event).args.conditionId;
    });

    it("Should peg market to oracle condition", async function () {
      // Create and accept wager
      const acceptanceDeadline = (await time.latest()) + ACCEPTANCE_PERIOD;
      await friendGroupFactory.connect(creator).createOneVsOneMarketPending(
        opponent.address,
        "Test wager",
        TRADING_PERIOD,
        ethers.ZeroAddress,  // arbitrator
        acceptanceDeadline,
        STAKE_AMOUNT,
        ethers.ZeroAddress,  // stakeToken (ETH)
        ResolutionType.Either,
        { value: STAKE_AMOUNT }
      );

      await friendGroupFactory.connect(opponent).acceptMarket(0, { value: STAKE_AMOUNT });

      // Peg to oracle
      await expect(
        friendGroupFactory.connect(creator).pegToOracleCondition(0, CHAINLINK_ORACLE_ID, conditionId)
      ).to.emit(friendGroupFactory, "MarketPeggedToOracle")
        .withArgs(0, CHAINLINK_ORACLE_ID, conditionId);

      expect(await friendGroupFactory.isPeggedToOracle(0)).to.be.true;
    });

    it("Should revert when pegging inactive market", async function () {
      // Create wager but don't accept
      const acceptanceDeadline = (await time.latest()) + ACCEPTANCE_PERIOD;
      await friendGroupFactory.connect(creator).createOneVsOneMarketPending(
        opponent.address,
        "Test",
        TRADING_PERIOD,
        ethers.ZeroAddress,
        acceptanceDeadline,
        STAKE_AMOUNT,
        ethers.ZeroAddress,
        ResolutionType.Either,
        { value: STAKE_AMOUNT }
      );

      await expect(
        friendGroupFactory.connect(creator).pegToOracleCondition(0, CHAINLINK_ORACLE_ID, conditionId)
      ).to.be.revertedWithCustomError(friendGroupFactory, "NotActive");
    });

    it("Should revert when non-creator tries to peg", async function () {
      const acceptanceDeadline = (await time.latest()) + ACCEPTANCE_PERIOD;
      await friendGroupFactory.connect(creator).createOneVsOneMarketPending(
        opponent.address,
        "Test",
        TRADING_PERIOD,
        ethers.ZeroAddress,
        acceptanceDeadline,
        STAKE_AMOUNT,
        ethers.ZeroAddress,
        ResolutionType.Either,
        { value: STAKE_AMOUNT }
      );

      await friendGroupFactory.connect(opponent).acceptMarket(0, { value: STAKE_AMOUNT });

      await expect(
        friendGroupFactory.connect(opponent).pegToOracleCondition(0, CHAINLINK_ORACLE_ID, conditionId)
      ).to.be.revertedWithCustomError(friendGroupFactory, "NotAuthorized");
    });

    it("Should revert when pegging twice", async function () {
      const acceptanceDeadline = (await time.latest()) + ACCEPTANCE_PERIOD;
      await friendGroupFactory.connect(creator).createOneVsOneMarketPending(
        opponent.address,
        "Test",
        TRADING_PERIOD,
        ethers.ZeroAddress,
        acceptanceDeadline,
        STAKE_AMOUNT,
        ethers.ZeroAddress,
        ResolutionType.Either,
        { value: STAKE_AMOUNT }
      );

      await friendGroupFactory.connect(opponent).acceptMarket(0, { value: STAKE_AMOUNT });
      await friendGroupFactory.connect(creator).pegToOracleCondition(0, CHAINLINK_ORACLE_ID, conditionId);

      await expect(
        friendGroupFactory.connect(creator).pegToOracleCondition(0, CHAINLINK_ORACLE_ID, conditionId)
      ).to.be.revertedWithCustomError(friendGroupFactory, "AlreadyPeggedToOracle");
    });
  });

  describe("resolveFromOracle", function () {
    let conditionId;

    beforeEach(async function () {
      const deadline = (await time.latest()) + TRADING_PERIOD;
      const tx = await chainlinkAdapter.createCondition(
        mockChainlinkFeed.target,
        5000_00000000n,
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
      conditionId = chainlinkAdapter.interface.parseLog(event).args.conditionId;

      // Create, accept, and peg
      const acceptanceDeadline = (await time.latest()) + ACCEPTANCE_PERIOD;
      await friendGroupFactory.connect(creator).createOneVsOneMarketPending(
        opponent.address,
        "Test",
        TRADING_PERIOD,
        ethers.ZeroAddress,
        acceptanceDeadline,
        STAKE_AMOUNT,
        ethers.ZeroAddress,
        ResolutionType.Either,
        { value: STAKE_AMOUNT }
      );
      await friendGroupFactory.connect(opponent).acceptMarket(0, { value: STAKE_AMOUNT });
      await friendGroupFactory.connect(creator).pegToOracleCondition(0, CHAINLINK_ORACLE_ID, conditionId);
    });

    it("Should resolve when oracle condition resolves true", async function () {
      await time.increase(TRADING_PERIOD + 1);
      await mockChainlinkFeed.updateAnswer(6000_00000000n); // Above target
      await chainlinkAdapter.resolveCondition(conditionId);

      await expect(friendGroupFactory.resolveFromOracle(0))
        .to.emit(friendGroupFactory, "OracleMarketResolved");

      const market = await friendGroupFactory.friendMarkets(0);
      expect(market.status).to.equal(4); // Resolved

      const [winner, outcome] = await friendGroupFactory.getWagerResolution(0);
      expect(outcome).to.be.true;
      expect(winner).to.equal(creator.address);
    });

    it("Should resolve when oracle condition resolves false", async function () {
      await time.increase(TRADING_PERIOD + 1);
      await mockChainlinkFeed.updateAnswer(4000_00000000n); // Below target
      await chainlinkAdapter.resolveCondition(conditionId);

      await friendGroupFactory.resolveFromOracle(0);

      const [winner, outcome] = await friendGroupFactory.getWagerResolution(0);
      expect(outcome).to.be.false;
      expect(winner).to.equal(opponent.address);
    });

    it("Should revert when oracle condition not resolved", async function () {
      await expect(friendGroupFactory.resolveFromOracle(0))
        .to.be.revertedWithCustomError(oracleRegistry, "ConditionNotResolved");
    });

    it("Should allow winner to claim after oracle resolution", async function () {
      await time.increase(TRADING_PERIOD + 1);
      await mockChainlinkFeed.updateAnswer(6000_00000000n);
      await chainlinkAdapter.resolveCondition(conditionId);
      await friendGroupFactory.resolveFromOracle(0);

      const balanceBefore = await ethers.provider.getBalance(creator.address);
      await friendGroupFactory.connect(creator).claimWinnings(0);
      const balanceAfter = await ethers.provider.getBalance(creator.address);

      expect(balanceAfter).to.be.gt(balanceBefore);
    });
  });

  describe("View Functions", function () {
    let conditionId;

    beforeEach(async function () {
      const deadline = (await time.latest()) + TRADING_PERIOD;
      const tx = await chainlinkAdapter.createCondition(
        mockChainlinkFeed.target,
        5000_00000000n,
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
      conditionId = chainlinkAdapter.interface.parseLog(event).args.conditionId;

      const acceptanceDeadline = (await time.latest()) + ACCEPTANCE_PERIOD;
      await friendGroupFactory.connect(creator).createOneVsOneMarketPending(
        opponent.address,
        "Test",
        TRADING_PERIOD,
        ethers.ZeroAddress,
        acceptanceDeadline,
        STAKE_AMOUNT,
        ethers.ZeroAddress,
        ResolutionType.Either,
        { value: STAKE_AMOUNT }
      );
      await friendGroupFactory.connect(opponent).acceptMarket(0, { value: STAKE_AMOUNT });
      await friendGroupFactory.connect(creator).pegToOracleCondition(0, CHAINLINK_ORACLE_ID, conditionId);
    });

    it("Should return oracle info", async function () {
      const [oracleId, returnedConditionId] = await friendGroupFactory.getOracleInfo(0);
      expect(oracleId).to.equal(CHAINLINK_ORACLE_ID);
      expect(returnedConditionId).to.equal(conditionId);
    });

    it("Should check oracle resolution status", async function () {
      let [canResolve, outcome] = await friendGroupFactory.checkOracleResolution(0);
      expect(canResolve).to.be.false;

      await time.increase(TRADING_PERIOD + 1);
      await mockChainlinkFeed.updateAnswer(6000_00000000n);
      await chainlinkAdapter.resolveCondition(conditionId);

      [canResolve, outcome] = await friendGroupFactory.checkOracleResolution(0);
      expect(canResolve).to.be.true;
      expect(outcome).to.be.true;
    });

    it("Should report market as pegged", async function () {
      expect(await friendGroupFactory.isPeggedToOracle(0)).to.be.true;
    });

    it("Should report unpegged market correctly", async function () {
      const acceptanceDeadline = (await time.latest()) + ACCEPTANCE_PERIOD;
      await friendGroupFactory.connect(creator).createOneVsOneMarketPending(
        opponent.address,
        "Unpegged",
        TRADING_PERIOD,
        ethers.ZeroAddress,
        acceptanceDeadline,
        STAKE_AMOUNT,
        ethers.ZeroAddress,
        ResolutionType.Either,
        { value: STAKE_AMOUNT }
      );

      expect(await friendGroupFactory.isPeggedToOracle(1)).to.be.false;
    });
  });
});
