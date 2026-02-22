const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

/**
 * UMA Oracle Integration Tests for FriendGroupMarketFactory
 *
 * Tests integration with UMA Optimistic Oracle for arbitrary truth assertions:
 * - Creating conditions for verifiable claims
 * - Asserting outcomes with bonding
 * - Challenge period and settlement
 * - Resolution flow with FriendGroupMarketFactory
 */
describe("FriendGroupMarketFactory - UMA Integration", function () {
  let friendGroupFactory;
  let marketFactory;
  let ragequitModule;
  let tieredRoleManager;
  let paymentManager;
  let oracleRegistry;
  let umaAdapter;
  let mockUMAOracle;
  let bondToken;
  let collateralToken;
  let owner;
  let creator;
  let opponent;
  let asserter;

  const UMA_ORACLE_ID = ethers.keccak256(ethers.toUtf8Bytes("UMA"));
  const FRIEND_MARKET_ROLE = ethers.id("FRIEND_MARKET_ROLE");
  const MembershipTier = { NONE: 0, BRONZE: 1, SILVER: 2, GOLD: 3, PLATINUM: 4 };
  const ResolutionType = { Either: 0, Initiator: 1, Receiver: 2, ThirdParty: 3, AutoPegged: 4 };
  const STAKE_AMOUNT = ethers.parseEther("1");
  const ACCEPTANCE_PERIOD = 7 * 24 * 60 * 60;
  const TRADING_PERIOD = 14 * 24 * 60 * 60;
  const LIVENESS_PERIOD = 2 * 60 * 60; // 2 hours

  beforeEach(async function () {
    [owner, creator, opponent, asserter] = await ethers.getSigners();

    // Deploy CTF1155
    const CTF1155 = await ethers.getContractFactory("CTF1155");
    const ctf1155 = await CTF1155.deploy();
    await ctf1155.waitForDeployment();

    // Deploy collateral token
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    collateralToken = await MockERC20.deploy("Collateral", "COL", ethers.parseEther("10000000"));
    await collateralToken.waitForDeployment();

    // Deploy bond token for UMA
    bondToken = await MockERC20.deploy("Bond Token", "BOND", ethers.parseEther("10000000"));
    await bondToken.waitForDeployment();

    // Distribute bond tokens
    await bondToken.transfer(creator.address, ethers.parseEther("100"));
    await bondToken.transfer(opponent.address, ethers.parseEther("100"));
    await bondToken.transfer(asserter.address, ethers.parseEther("100"));

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

    // Transfer ownership of marketFactory to friendGroupFactory
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

    // Deploy Mock UMA Oracle
    const MockUMAOptimisticOracle = await ethers.getContractFactory("MockUMAOptimisticOracle");
    mockUMAOracle = await MockUMAOptimisticOracle.deploy();

    // Deploy UMA Adapter
    const UMAOracleAdapter = await ethers.getContractFactory("UMAOracleAdapter");
    umaAdapter = await UMAOracleAdapter.deploy(
      owner.address,
      mockUMAOracle.target,
      bondToken.target
    );

    // Deploy OracleRegistry
    const OracleRegistry = await ethers.getContractFactory("OracleRegistry");
    oracleRegistry = await OracleRegistry.deploy(owner.address);
    await oracleRegistry.registerAdapter(UMA_ORACLE_ID, umaAdapter.target);

    // Configure factory
    await friendGroupFactory.setOracleRegistry(oracleRegistry.target);
  });

  describe("UMA Condition Creation", function () {
    it("Should create a UMA condition", async function () {
      const deadline = (await time.latest()) + TRADING_PERIOD;
      const tx = await umaAdapter.createCondition(
        "Lakers will win the 2025 NBA Finals",
        deadline
      );
      const receipt = await tx.wait();

      const event = receipt.logs.find(log => {
        try {
          return umaAdapter.interface.parseLog(log)?.name === "ConditionCreated";
        } catch { return false; }
      });

      expect(event).to.not.be.undefined;
      const conditionId = umaAdapter.interface.parseLog(event).args.conditionId;
      expect(await umaAdapter.isConditionSupported(conditionId)).to.be.true;
    });

    it("Should reject deadline in the past", async function () {
      const pastDeadline = (await time.latest()) - 100;
      await expect(
        umaAdapter.createCondition("Past event", pastDeadline)
      ).to.be.revertedWithCustomError(umaAdapter, "DeadlineInPast");
    });
  });

  describe("UMA Assertion Flow", function () {
    let conditionId;

    beforeEach(async function () {
      const deadline = (await time.latest()) + TRADING_PERIOD;
      const tx = await umaAdapter.createCondition(
        "SpaceX Starship reaches orbit in Q2 2025",
        deadline
      );
      const receipt = await tx.wait();
      const event = receipt.logs.find(log => {
        try {
          return umaAdapter.interface.parseLog(log)?.name === "ConditionCreated";
        } catch { return false; }
      });
      conditionId = umaAdapter.interface.parseLog(event).args.conditionId;
    });

    it("Should assert outcome after deadline", async function () {
      // Wait for deadline
      await time.increase(TRADING_PERIOD + 1);

      // Approve bond
      await bondToken.connect(asserter).approve(umaAdapter.target, ethers.parseEther("1"));

      // Assert outcome
      await expect(
        umaAdapter.connect(asserter).assertOutcome(conditionId, true)
      ).to.emit(umaAdapter, "AssertionMade");
    });

    it("Should revert assertion before deadline", async function () {
      await bondToken.connect(asserter).approve(umaAdapter.target, ethers.parseEther("1"));

      await expect(
        umaAdapter.connect(asserter).assertOutcome(conditionId, true)
      ).to.be.revertedWithCustomError(umaAdapter, "DeadlineNotReached");
    });

    it("Should settle condition after liveness", async function () {
      await time.increase(TRADING_PERIOD + 1);

      await bondToken.connect(asserter).approve(umaAdapter.target, ethers.parseEther("1"));
      await umaAdapter.connect(asserter).assertOutcome(conditionId, true);

      // Wait for liveness period
      await time.increase(LIVENESS_PERIOD + 1);

      await umaAdapter.settleCondition(conditionId);

      expect(await umaAdapter.isConditionResolved(conditionId)).to.be.true;
      const [outcome, confidence, resolvedAt] = await umaAdapter.getOutcome(conditionId);
      expect(outcome).to.be.true;
      expect(confidence).to.equal(10000); // Full confidence
    });
  });

  describe("FriendGroupMarketFactory + UMA Integration", function () {
    let conditionId;

    beforeEach(async function () {
      // Create UMA condition
      const deadline = (await time.latest()) + TRADING_PERIOD;
      const tx = await umaAdapter.createCondition(
        "Bitcoin ETF approved by SEC in 2024",
        deadline
      );
      const receipt = await tx.wait();
      const event = receipt.logs.find(log => {
        try {
          return umaAdapter.interface.parseLog(log)?.name === "ConditionCreated";
        } catch { return false; }
      });
      conditionId = umaAdapter.interface.parseLog(event).args.conditionId;
    });

    it("Should peg market to UMA condition", async function () {
      // Create and accept wager
      const acceptanceDeadline = (await time.latest()) + ACCEPTANCE_PERIOD;
      await friendGroupFactory.connect(creator).createOneVsOneMarketPending(
        opponent.address,
        "Bitcoin ETF approved?",
        TRADING_PERIOD,
        ethers.ZeroAddress,
        acceptanceDeadline,
        STAKE_AMOUNT,
        ethers.ZeroAddress,
        ResolutionType.Either,
        { value: STAKE_AMOUNT }
      );

      await friendGroupFactory.connect(opponent).acceptMarket(0, { value: STAKE_AMOUNT });

      // Peg to UMA oracle
      await expect(
        friendGroupFactory.connect(creator).pegToOracleCondition(0, UMA_ORACLE_ID, conditionId)
      ).to.emit(friendGroupFactory, "MarketPeggedToOracle")
        .withArgs(0, UMA_ORACLE_ID, conditionId);

      expect(await friendGroupFactory.isPeggedToOracle(0)).to.be.true;

      const [oracleId, returnedConditionId] = await friendGroupFactory.getOracleInfo(0);
      expect(oracleId).to.equal(UMA_ORACLE_ID);
      expect(returnedConditionId).to.equal(conditionId);
    });

    it("Should resolve market from UMA oracle", async function () {
      // Create, accept, and peg wager
      const acceptanceDeadline = (await time.latest()) + ACCEPTANCE_PERIOD;
      await friendGroupFactory.connect(creator).createOneVsOneMarketPending(
        opponent.address,
        "ETF wager",
        TRADING_PERIOD,
        ethers.ZeroAddress,
        acceptanceDeadline,
        STAKE_AMOUNT,
        ethers.ZeroAddress,
        ResolutionType.Either,
        { value: STAKE_AMOUNT }
      );

      await friendGroupFactory.connect(opponent).acceptMarket(0, { value: STAKE_AMOUNT });
      await friendGroupFactory.connect(creator).pegToOracleCondition(0, UMA_ORACLE_ID, conditionId);

      // Wait for deadline
      await time.increase(TRADING_PERIOD + 1);

      // Assert and settle
      await bondToken.connect(asserter).approve(umaAdapter.target, ethers.parseEther("1"));
      await umaAdapter.connect(asserter).assertOutcome(conditionId, true);
      await time.increase(LIVENESS_PERIOD + 1);
      await umaAdapter.settleCondition(conditionId);

      // Resolve from oracle
      await expect(friendGroupFactory.resolveFromOracle(0))
        .to.emit(friendGroupFactory, "OracleMarketResolved");

      const market = await friendGroupFactory.friendMarkets(0);
      expect(market.status).to.equal(4); // Resolved

      const [winner, outcome] = await friendGroupFactory.getWagerResolution(0);
      expect(outcome).to.be.true;
      expect(winner).to.equal(creator.address);
    });

    it("Should resolve market when UMA outcome is false", async function () {
      // Create, accept, and peg
      const acceptanceDeadline = (await time.latest()) + ACCEPTANCE_PERIOD;
      await friendGroupFactory.connect(creator).createOneVsOneMarketPending(
        opponent.address,
        "Wager",
        TRADING_PERIOD,
        ethers.ZeroAddress,
        acceptanceDeadline,
        STAKE_AMOUNT,
        ethers.ZeroAddress,
        ResolutionType.Either,
        { value: STAKE_AMOUNT }
      );

      await friendGroupFactory.connect(opponent).acceptMarket(0, { value: STAKE_AMOUNT });
      await friendGroupFactory.connect(creator).pegToOracleCondition(0, UMA_ORACLE_ID, conditionId);

      // Wait for deadline
      await time.increase(TRADING_PERIOD + 1);

      // Assert FALSE outcome
      await bondToken.connect(asserter).approve(umaAdapter.target, ethers.parseEther("1"));
      await umaAdapter.connect(asserter).assertOutcome(conditionId, false);
      await time.increase(LIVENESS_PERIOD + 1);
      await umaAdapter.settleCondition(conditionId);

      // Resolve from oracle
      await friendGroupFactory.resolveFromOracle(0);

      const [winner, outcome] = await friendGroupFactory.getWagerResolution(0);
      expect(outcome).to.be.false;
      expect(winner).to.equal(opponent.address);
    });

    it("Should allow winner to claim after UMA resolution", async function () {
      // Create, accept, and peg
      const acceptanceDeadline = (await time.latest()) + ACCEPTANCE_PERIOD;
      await friendGroupFactory.connect(creator).createOneVsOneMarketPending(
        opponent.address,
        "Claimable wager",
        TRADING_PERIOD,
        ethers.ZeroAddress,
        acceptanceDeadline,
        STAKE_AMOUNT,
        ethers.ZeroAddress,
        ResolutionType.Either,
        { value: STAKE_AMOUNT }
      );

      await friendGroupFactory.connect(opponent).acceptMarket(0, { value: STAKE_AMOUNT });
      await friendGroupFactory.connect(creator).pegToOracleCondition(0, UMA_ORACLE_ID, conditionId);

      // Resolve
      await time.increase(TRADING_PERIOD + 1);
      await bondToken.connect(asserter).approve(umaAdapter.target, ethers.parseEther("1"));
      await umaAdapter.connect(asserter).assertOutcome(conditionId, true);
      await time.increase(LIVENESS_PERIOD + 1);
      await umaAdapter.settleCondition(conditionId);
      await friendGroupFactory.resolveFromOracle(0);

      // Claim winnings
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
      const tx = await umaAdapter.createCondition("Test condition", deadline);
      const receipt = await tx.wait();
      const event = receipt.logs.find(log => {
        try {
          return umaAdapter.interface.parseLog(log)?.name === "ConditionCreated";
        } catch { return false; }
      });
      conditionId = umaAdapter.interface.parseLog(event).args.conditionId;
    });

    it("Should return oracle type as UMA", async function () {
      expect(await umaAdapter.oracleType()).to.equal("UMA");
    });

    it("Should return condition metadata", async function () {
      const [description, expectedResolutionTime] = await umaAdapter.getConditionMetadata(conditionId);
      expect(description).to.equal("Test condition");
      expect(expectedResolutionTime).to.be.gt(0);
    });

    it("Should check canAssert status", async function () {
      // Before deadline
      expect(await umaAdapter.canAssert(conditionId)).to.be.false;

      // After deadline
      await time.increase(TRADING_PERIOD + 1);
      expect(await umaAdapter.canAssert(conditionId)).to.be.true;
    });

    it("Should check canSettle status", async function () {
      await time.increase(TRADING_PERIOD + 1);

      // Before assertion - can't settle
      expect(await umaAdapter.canSettle(conditionId)).to.be.false;

      // After assertion but before liveness expires
      await bondToken.connect(asserter).approve(umaAdapter.target, ethers.parseEther("1"));
      const tx = await umaAdapter.connect(asserter).assertOutcome(conditionId, true);
      const receipt = await tx.wait();

      // Get assertionId from event
      const event = receipt.logs.find(log => {
        try {
          return umaAdapter.interface.parseLog(log)?.name === "AssertionMade";
        } catch { return false; }
      });
      const assertionId = umaAdapter.interface.parseLog(event).args.assertionId;

      // Still false because UMA oracle hasn't settled yet
      expect(await umaAdapter.canSettle(conditionId)).to.be.false;
      expect(await umaAdapter.isConditionResolved(conditionId)).to.be.false;

      // After UMA oracle settles, the callback resolves the condition
      await time.increase(LIVENESS_PERIOD + 1);
      await mockUMAOracle.settleAssertion(assertionId);

      // Now it's resolved via callback, canSettle returns false (already resolved)
      expect(await umaAdapter.canSettle(conditionId)).to.be.false;
      expect(await umaAdapter.isConditionResolved(conditionId)).to.be.true;
    });
  });
});
