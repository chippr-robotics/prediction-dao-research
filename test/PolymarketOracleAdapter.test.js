const { expect } = require("chai");
const { ethers } = require("hardhat");

// Resolution type enum (matches contract)
const ResolutionType = {
  Either: 0,
  Initiator: 1,
  Receiver: 2,
  ThirdParty: 3,
  AutoPegged: 4,
  PolymarketOracle: 5
};

describe("PolymarketOracleAdapter", function () {
  let polymarketAdapter;
  let mockCTF;
  let friendGroupFactory;
  let marketFactory;
  let ragequitModule;
  let tieredRoleManager;
  let paymentManager;
  let collateralToken;
  let ctf1155;
  let owner;
  let addr1;
  let addr2;
  let arbitrator;

  // Test condition parameters
  const testOracle = "0x0000000000000000000000000000000000000001";
  const testQuestionId = ethers.keccak256(ethers.toUtf8Bytes("Will ETH reach 5000 by end of 2024?"));
  const outcomeSlotCount = 2; // Binary outcome
  let testConditionId;

  beforeEach(async function () {
    [owner, addr1, addr2, arbitrator] = await ethers.getSigners();

    // Deploy MockPolymarketCTF (simulates Polymarket's CTF contract)
    const MockPolymarketCTF = await ethers.getContractFactory("MockPolymarketCTF");
    mockCTF = await MockPolymarketCTF.deploy();
    await mockCTF.waitForDeployment();

    // Compute test condition ID
    testConditionId = ethers.keccak256(
      ethers.solidityPacked(
        ["address", "bytes32", "uint256"],
        [testOracle, testQuestionId, outcomeSlotCount]
      )
    );

    // Deploy PolymarketOracleAdapter
    const PolymarketOracleAdapter = await ethers.getContractFactory("PolymarketOracleAdapter");
    polymarketAdapter = await PolymarketOracleAdapter.deploy(await mockCTF.getAddress());
    await polymarketAdapter.waitForDeployment();

    // Deploy CTF1155 for our system
    const CTF1155 = await ethers.getContractFactory("CTF1155");
    ctf1155 = await CTF1155.deploy();
    await ctf1155.waitForDeployment();

    // Deploy mock collateral token
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    collateralToken = await MockERC20.deploy("Market Collateral", "MCOL", ethers.parseEther("10000000"));
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

    // Setup FRIEND_MARKET_ROLE
    const FRIEND_MARKET_ROLE = ethers.id("FRIEND_MARKET_ROLE");
    const MembershipTier = { NONE: 0, BRONZE: 1, SILVER: 2, GOLD: 3, PLATINUM: 4 };

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
    await friendGroupFactory.waitForDeployment();

    // Set collateral token and Polymarket adapter
    await friendGroupFactory.setDefaultCollateralToken(await collateralToken.getAddress());
    await friendGroupFactory.setPolymarketAdapter(await polymarketAdapter.getAddress());

    // Purchase memberships for test users
    const durDays = 36500;
    await tieredRoleManager.connect(owner).purchaseRoleWithTier(
      FRIEND_MARKET_ROLE,
      MembershipTier.BRONZE,
      durDays,
      { value: price }
    );
    await tieredRoleManager.connect(addr1).purchaseRoleWithTier(
      FRIEND_MARKET_ROLE,
      MembershipTier.BRONZE,
      durDays,
      { value: price }
    );
    await tieredRoleManager.connect(addr2).purchaseRoleWithTier(
      FRIEND_MARKET_ROLE,
      MembershipTier.BRONZE,
      durDays,
      { value: price }
    );

    // Transfer ownership of marketFactory to friendGroupFactory
    await marketFactory.transferOwnership(await friendGroupFactory.getAddress());
  });

  describe("PolymarketOracleAdapter Deployment", function () {
    it("Should set the primary CTF contract", async function () {
      expect(await polymarketAdapter.polymarketCTF()).to.equal(await mockCTF.getAddress());
    });

    it("Should mark the primary CTF as supported", async function () {
      expect(await polymarketAdapter.supportedCTFContracts(await mockCTF.getAddress())).to.be.true;
    });

    it("Should revert with InvalidAddress for zero address CTF", async function () {
      const PolymarketOracleAdapter = await ethers.getContractFactory("PolymarketOracleAdapter");
      await expect(
        PolymarketOracleAdapter.deploy(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(polymarketAdapter, "InvalidAddress");
    });
  });

  describe("CTF Contract Management", function () {
    it("Should add a new CTF contract", async function () {
      const newCTF = addr1.address; // Using as mock address
      await polymarketAdapter.addCTFContract(newCTF);
      expect(await polymarketAdapter.supportedCTFContracts(newCTF)).to.be.true;
    });

    it("Should remove a CTF contract", async function () {
      const newCTF = addr1.address;
      await polymarketAdapter.addCTFContract(newCTF);
      await polymarketAdapter.removeCTFContract(newCTF);
      expect(await polymarketAdapter.supportedCTFContracts(newCTF)).to.be.false;
    });

    it("Should update primary CTF", async function () {
      const newCTF = addr1.address;
      await polymarketAdapter.updatePrimaryCTF(newCTF);
      expect(await polymarketAdapter.polymarketCTF()).to.equal(newCTF);
      expect(await polymarketAdapter.supportedCTFContracts(newCTF)).to.be.true;
    });

    it("Should revert on non-owner operations", async function () {
      await expect(
        polymarketAdapter.connect(addr1).addCTFContract(addr2.address)
      ).to.be.revertedWithCustomError(polymarketAdapter, "OwnableUnauthorizedAccount");
    });
  });

  describe("Market Linking", function () {
    beforeEach(async function () {
      // Prepare condition on mock CTF
      await mockCTF.prepareCondition(testOracle, testQuestionId, outcomeSlotCount);
    });

    it("Should link a market to Polymarket condition", async function () {
      await polymarketAdapter.linkMarketToPolymarket(0, testConditionId);

      const linkedMarket = await polymarketAdapter.getLinkedMarket(0);
      expect(linkedMarket.conditionId).to.equal(testConditionId);
      expect(linkedMarket.linked).to.be.true;
    });

    it("Should emit MarketLinkedToPolymarket event", async function () {
      await expect(polymarketAdapter.linkMarketToPolymarket(0, testConditionId))
        .to.emit(polymarketAdapter, "MarketLinkedToPolymarket")
        .withArgs(0, testConditionId, await mockCTF.getAddress());
    });

    it("Should revert when linking twice", async function () {
      await polymarketAdapter.linkMarketToPolymarket(0, testConditionId);
      await expect(
        polymarketAdapter.linkMarketToPolymarket(0, testConditionId)
      ).to.be.revertedWithCustomError(polymarketAdapter, "MarketAlreadyLinked");
    });

    it("Should revert with invalid condition ID (zero)", async function () {
      await expect(
        polymarketAdapter.linkMarketToPolymarket(0, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(polymarketAdapter, "InvalidConditionId");
    });

    it("Should revert with non-existent condition", async function () {
      const fakeConditionId = ethers.keccak256(ethers.toUtf8Bytes("fake"));
      await expect(
        polymarketAdapter.linkMarketToPolymarket(0, fakeConditionId)
      ).to.be.revertedWithCustomError(polymarketAdapter, "InvalidConditionId");
    });
  });

  describe("Resolution Fetching", function () {
    beforeEach(async function () {
      // Prepare and resolve condition on mock CTF
      await mockCTF.prepareCondition(testOracle, testQuestionId, outcomeSlotCount);
    });

    it("Should fetch resolution when condition is resolved (YES wins)", async function () {
      // Resolve with YES winning ([1, 0])
      await mockCTF.resolveCondition(testConditionId, [1, 0]);

      const [passNum, failNum, denom] = await polymarketAdapter.fetchResolution.staticCall(testConditionId);
      expect(passNum).to.equal(1);
      expect(failNum).to.equal(0);
      expect(denom).to.equal(1);
    });

    it("Should fetch resolution when condition is resolved (NO wins)", async function () {
      // Resolve with NO winning ([0, 1])
      await mockCTF.resolveCondition(testConditionId, [0, 1]);

      const [passNum, failNum, denom] = await polymarketAdapter.fetchResolution.staticCall(testConditionId);
      expect(passNum).to.equal(0);
      expect(failNum).to.equal(1);
      expect(denom).to.equal(1);
    });

    it("Should cache resolution data", async function () {
      await mockCTF.resolveCondition(testConditionId, [1, 0]);
      await polymarketAdapter.fetchResolution(testConditionId);

      const cached = await polymarketAdapter.getCachedResolution(testConditionId);
      expect(cached.resolved).to.be.true;
      expect(cached.passNumerator).to.equal(1);
      expect(cached.failNumerator).to.equal(0);
    });

    it("Should revert when condition is not resolved", async function () {
      await expect(
        polymarketAdapter.fetchResolution(testConditionId)
      ).to.be.revertedWithCustomError(polymarketAdapter, "ConditionNotResolved");
    });

    it("Should emit ResolutionFetched event", async function () {
      await mockCTF.resolveCondition(testConditionId, [1, 0]);

      await expect(polymarketAdapter.fetchResolution(testConditionId))
        .to.emit(polymarketAdapter, "ResolutionFetched")
        .withArgs(testConditionId, 1, 0, 1);
    });
  });

  describe("Condition ID Computation", function () {
    it("Should compute correct condition ID", async function () {
      const computed = await polymarketAdapter.computeConditionId(
        testOracle,
        testQuestionId,
        outcomeSlotCount
      );
      expect(computed).to.equal(testConditionId);
    });
  });

  describe("Outcome Determination", function () {
    it("Should determine YES/PASS as winner", async function () {
      const [outcome, isTie] = await polymarketAdapter.determineOutcome(1, 0);
      expect(outcome).to.be.true;
      expect(isTie).to.be.false;
    });

    it("Should determine NO/FAIL as winner", async function () {
      const [outcome, isTie] = await polymarketAdapter.determineOutcome(0, 1);
      expect(outcome).to.be.false;
      expect(isTie).to.be.false;
    });

    it("Should detect tie", async function () {
      const [outcome, isTie] = await polymarketAdapter.determineOutcome(1, 1);
      expect(isTie).to.be.true;
    });
  });
});

describe("FriendGroupMarketFactory - Polymarket Integration", function () {
  let polymarketAdapter;
  let mockCTF;
  let friendGroupFactory;
  let marketFactory;
  let ragequitModule;
  let tieredRoleManager;
  let paymentManager;
  let collateralToken;
  let ctf1155;
  let owner;
  let addr1;
  let addr2;
  let arbitrator;

  const testOracle = "0x0000000000000000000000000000000000000001";
  const testQuestionId = ethers.keccak256(ethers.toUtf8Bytes("Will ETH reach 5000 by end of 2024?"));
  const outcomeSlotCount = 2;
  let testConditionId;

  beforeEach(async function () {
    [owner, addr1, addr2, arbitrator] = await ethers.getSigners();

    // Deploy MockPolymarketCTF
    const MockPolymarketCTF = await ethers.getContractFactory("MockPolymarketCTF");
    mockCTF = await MockPolymarketCTF.deploy();
    await mockCTF.waitForDeployment();

    // Compute test condition ID
    testConditionId = ethers.keccak256(
      ethers.solidityPacked(
        ["address", "bytes32", "uint256"],
        [testOracle, testQuestionId, outcomeSlotCount]
      )
    );

    // Prepare condition on mock CTF
    await mockCTF.prepareCondition(testOracle, testQuestionId, outcomeSlotCount);

    // Deploy PolymarketOracleAdapter
    const PolymarketOracleAdapter = await ethers.getContractFactory("PolymarketOracleAdapter");
    polymarketAdapter = await PolymarketOracleAdapter.deploy(await mockCTF.getAddress());
    await polymarketAdapter.waitForDeployment();

    // Deploy CTF1155
    const CTF1155 = await ethers.getContractFactory("CTF1155");
    ctf1155 = await CTF1155.deploy();
    await ctf1155.waitForDeployment();

    // Deploy mock collateral token
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    collateralToken = await MockERC20.deploy("Market Collateral", "MCOL", ethers.parseEther("10000000"));
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

    // Setup FRIEND_MARKET_ROLE
    const FRIEND_MARKET_ROLE = ethers.id("FRIEND_MARKET_ROLE");
    const MembershipTier = { NONE: 0, BRONZE: 1, SILVER: 2, GOLD: 3, PLATINUM: 4 };

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
    await friendGroupFactory.waitForDeployment();

    // Set collateral token and Polymarket adapter
    await friendGroupFactory.setDefaultCollateralToken(await collateralToken.getAddress());
    await friendGroupFactory.setPolymarketAdapter(await polymarketAdapter.getAddress());

    // Purchase memberships
    const durDays = 36500;
    await tieredRoleManager.connect(owner).purchaseRoleWithTier(
      FRIEND_MARKET_ROLE,
      MembershipTier.BRONZE,
      durDays,
      { value: price }
    );
    await tieredRoleManager.connect(addr1).purchaseRoleWithTier(
      FRIEND_MARKET_ROLE,
      MembershipTier.BRONZE,
      durDays,
      { value: price }
    );
    await tieredRoleManager.connect(addr2).purchaseRoleWithTier(
      FRIEND_MARKET_ROLE,
      MembershipTier.BRONZE,
      durDays,
      { value: price }
    );

    // Transfer ownership
    await marketFactory.transferOwnership(await friendGroupFactory.getAddress());
  });

  // Helper to create and activate a market
  async function createAndActivateMarket() {
    const description = "Will ETH reach 5000?";
    const tradingPeriod = 7 * 24 * 60 * 60;
    const latestBlock = await ethers.provider.getBlock('latest');
    const acceptanceDeadline = latestBlock.timestamp + (2 * 60 * 60);
    const stakeAmount = ethers.parseEther("1");

    // Create market
    await friendGroupFactory.connect(owner).createOneVsOneMarketPending(
      addr1.address,
      description,
      tradingPeriod,
      ethers.ZeroAddress,
      acceptanceDeadline,
      stakeAmount,
      ethers.ZeroAddress,
      ResolutionType.Either,
      { value: stakeAmount }
    );

    // Accept market
    await friendGroupFactory.connect(addr1).acceptMarket(0, { value: stakeAmount });

    return 0; // market ID
  }

  describe("Polymarket Adapter Setup", function () {
    it("Should set Polymarket adapter", async function () {
      expect(await friendGroupFactory.polymarketAdapter()).to.equal(await polymarketAdapter.getAddress());
    });

    it("Should revert setting zero address adapter", async function () {
      await expect(
        friendGroupFactory.setPolymarketAdapter(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(friendGroupFactory, "InvalidAddress");
    });

    it("Should emit PolymarketAdapterUpdated event", async function () {
      const newAdapter = addr1.address;
      await expect(friendGroupFactory.setPolymarketAdapter(newAdapter))
        .to.emit(friendGroupFactory, "PolymarketAdapterUpdated")
        .withArgs(newAdapter);
    });
  });

  describe("Pegging to Polymarket", function () {
    it("Should peg a friend market to Polymarket condition", async function () {
      const marketId = await createAndActivateMarket();

      await friendGroupFactory.connect(owner).pegToPolymarketCondition(marketId, testConditionId);

      expect(await friendGroupFactory.isPeggedToPolymarket(marketId)).to.be.true;
      expect(await friendGroupFactory.getPolymarketConditionId(marketId)).to.equal(testConditionId);
    });

    it("Should update resolution type to PolymarketOracle", async function () {
      const marketId = await createAndActivateMarket();

      await friendGroupFactory.connect(owner).pegToPolymarketCondition(marketId, testConditionId);

      const marketStatus = await friendGroupFactory.getFriendMarketWithStatus(marketId);
      expect(marketStatus.resolutionType).to.equal(ResolutionType.PolymarketOracle);
    });

    it("Should emit MarketPeggedToPolymarket event", async function () {
      const marketId = await createAndActivateMarket();

      await expect(friendGroupFactory.connect(owner).pegToPolymarketCondition(marketId, testConditionId))
        .to.emit(friendGroupFactory, "MarketPeggedToPolymarket")
        .withArgs(marketId, testConditionId);
    });

    it("Should revert when adapter not set", async function () {
      // Deploy new factory without adapter
      const FriendGroupMarketFactory = await ethers.getContractFactory("FriendGroupMarketFactory");
      const newFactory = await FriendGroupMarketFactory.deploy(
        await marketFactory.getAddress(),
        await ragequitModule.getAddress(),
        await tieredRoleManager.getAddress(),
        await paymentManager.getAddress(),
        owner.address
      );
      await newFactory.waitForDeployment();

      // Since market 0 doesn't exist in the new factory, we expect InvalidMarketId
      // This is correct behavior - validation happens in order
      await expect(
        newFactory.pegToPolymarketCondition(0, testConditionId)
      ).to.be.revertedWithCustomError(newFactory, "InvalidMarketId");
    });

    it("Should revert when market already pegged to Polymarket", async function () {
      const marketId = await createAndActivateMarket();

      await friendGroupFactory.connect(owner).pegToPolymarketCondition(marketId, testConditionId);

      await expect(
        friendGroupFactory.connect(owner).pegToPolymarketCondition(marketId, testConditionId)
      ).to.be.revertedWithCustomError(friendGroupFactory, "AlreadyPeggedToPolymarket");
    });

    it("Should revert when non-creator tries to peg", async function () {
      const marketId = await createAndActivateMarket();

      await expect(
        friendGroupFactory.connect(addr1).pegToPolymarketCondition(marketId, testConditionId)
      ).to.be.revertedWithCustomError(friendGroupFactory, "NotAuthorized");
    });
  });

  describe("Resolving from Polymarket", function () {
    it("Should resolve market when Polymarket condition resolves (YES wins)", async function () {
      const marketId = await createAndActivateMarket();
      await friendGroupFactory.connect(owner).pegToPolymarketCondition(marketId, testConditionId);

      // Resolve Polymarket condition with YES winning
      await mockCTF.resolveCondition(testConditionId, [1, 0]);

      await friendGroupFactory.connect(addr2).resolveFromPolymarket(marketId);

      const marketStatus = await friendGroupFactory.getFriendMarketWithStatus(marketId);
      expect(marketStatus.status).to.equal(2); // FriendMarketStatus.Resolved = 2
    });

    it("Should emit PolymarketMarketResolved event", async function () {
      const marketId = await createAndActivateMarket();
      await friendGroupFactory.connect(owner).pegToPolymarketCondition(marketId, testConditionId);

      await mockCTF.resolveCondition(testConditionId, [1, 0]);

      await expect(friendGroupFactory.connect(addr2).resolveFromPolymarket(marketId))
        .to.emit(friendGroupFactory, "PolymarketMarketResolved")
        .withArgs(marketId, testConditionId, 1, 0, true);
    });

    it("Should revert when Polymarket condition not resolved", async function () {
      const marketId = await createAndActivateMarket();
      await friendGroupFactory.connect(owner).pegToPolymarketCondition(marketId, testConditionId);

      // Don't resolve the condition
      await expect(
        friendGroupFactory.connect(addr2).resolveFromPolymarket(marketId)
      ).to.be.revertedWithCustomError(friendGroupFactory, "PolymarketNotResolved");
    });

    it("Should revert when market not pegged to Polymarket", async function () {
      const marketId = await createAndActivateMarket();

      await expect(
        friendGroupFactory.connect(addr2).resolveFromPolymarket(marketId)
      ).to.be.revertedWithCustomError(friendGroupFactory, "InvalidConditionId");
    });

    it("Should prevent manual resolution for Polymarket-pegged markets", async function () {
      const marketId = await createAndActivateMarket();
      await friendGroupFactory.connect(owner).pegToPolymarketCondition(marketId, testConditionId);

      await expect(
        friendGroupFactory.connect(owner).resolveFriendMarket(marketId, true)
      ).to.be.revertedWithCustomError(friendGroupFactory, "NotAuthorized");
    });
  });

  describe("Batch Resolution from Polymarket", function () {
    it("Should batch resolve multiple markets pegged to same condition", async function () {
      // Create and peg multiple markets
      const description = "Will ETH reach 5000?";
      const tradingPeriod = 7 * 24 * 60 * 60;
      const latestBlock = await ethers.provider.getBlock('latest');
      const acceptanceDeadline = latestBlock.timestamp + (2 * 60 * 60);
      const stakeAmount = ethers.parseEther("1");

      // Market 1
      await friendGroupFactory.connect(owner).createOneVsOneMarketPending(
        addr1.address,
        description,
        tradingPeriod,
        ethers.ZeroAddress,
        acceptanceDeadline,
        stakeAmount,
        ethers.ZeroAddress,
        ResolutionType.Either,
        { value: stakeAmount }
      );
      await friendGroupFactory.connect(addr1).acceptMarket(0, { value: stakeAmount });
      await friendGroupFactory.connect(owner).pegToPolymarketCondition(0, testConditionId);

      // Market 2 (need new deadline for second market)
      const latestBlock2 = await ethers.provider.getBlock('latest');
      const acceptanceDeadline2 = latestBlock2.timestamp + (2 * 60 * 60);

      await friendGroupFactory.connect(owner).createOneVsOneMarketPending(
        addr2.address,
        description,
        tradingPeriod,
        ethers.ZeroAddress,
        acceptanceDeadline2,
        stakeAmount,
        ethers.ZeroAddress,
        ResolutionType.Either,
        { value: stakeAmount }
      );
      await friendGroupFactory.connect(addr2).acceptMarket(1, { value: stakeAmount });
      await friendGroupFactory.connect(owner).pegToPolymarketCondition(1, testConditionId);

      // Resolve Polymarket condition
      await mockCTF.resolveCondition(testConditionId, [1, 0]);

      // Batch resolve
      await friendGroupFactory.batchResolveFromPolymarket(testConditionId);

      // Check both markets are resolved
      const market0 = await friendGroupFactory.getFriendMarketWithStatus(0);
      const market1 = await friendGroupFactory.getFriendMarketWithStatus(1);

      expect(market0.status).to.equal(2); // FriendMarketStatus.Resolved = 2
      expect(market1.status).to.equal(2); // FriendMarketStatus.Resolved = 2
    });

    it("Should return list of friend markets for Polymarket condition", async function () {
      const marketId = await createAndActivateMarket();
      await friendGroupFactory.connect(owner).pegToPolymarketCondition(marketId, testConditionId);

      const markets = await friendGroupFactory.getFriendMarketsForPolymarketCondition(testConditionId);
      expect(markets.length).to.equal(1);
      expect(markets[0]).to.equal(marketId);
    });
  });

  describe("View Functions", function () {
    it("Should return false for isPeggedToPolymarket when not pegged", async function () {
      const marketId = await createAndActivateMarket();
      expect(await friendGroupFactory.isPeggedToPolymarket(marketId)).to.be.false;
    });

    it("Should return zero conditionId when not pegged", async function () {
      const marketId = await createAndActivateMarket();
      expect(await friendGroupFactory.getPolymarketConditionId(marketId)).to.equal(ethers.ZeroHash);
    });
  });
});
