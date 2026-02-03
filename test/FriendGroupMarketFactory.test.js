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

describe("FriendGroupMarketFactory", function () {
  let friendGroupFactory;
  let marketFactory;
  let ragequitModule;
  let tieredRoleManager;
  let paymentManager;
  let owner;
  let addr1;
  let addr2;
  let addr3;
  let addr4;
  let arbitrator;

  beforeEach(async function () {
    [owner, addr1, addr2, addr3, addr4, arbitrator] = await ethers.getSigners();
    
    // Deploy CTF1155 (required for ConditionalMarketFactory)
    const CTF1155 = await ethers.getContractFactory("CTF1155");
    const ctf1155 = await CTF1155.deploy();
    await ctf1155.waitForDeployment();
    
    // Deploy mock collateral token for markets (required for CTF1155)
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const collateralToken = await MockERC20.deploy("Market Collateral", "MCOL", ethers.parseEther("10000000"));
    await collateralToken.waitForDeployment();
    
    // Deploy ConditionalMarketFactory
    const ConditionalMarketFactory = await ethers.getContractFactory("ConditionalMarketFactory");
    marketFactory = await ConditionalMarketFactory.deploy();
    await marketFactory.initialize(owner.address);
    
    // Set CTF1155 in market factory (required for market creation)
    await marketFactory.setCTF1155(await ctf1155.getAddress());
    
    // Deploy RagequitModule (with mock token and treasury)
    const RagequitModule = await ethers.getContractFactory("RagequitModule");
    ragequitModule = await RagequitModule.deploy();
    
    // Deploy TieredRoleManager
    const TieredRoleManager = await ethers.getContractFactory("TieredRoleManager");
    tieredRoleManager = await TieredRoleManager.deploy();
    await tieredRoleManager.waitForDeployment();
    
    // Initialize role metadata (required to set isPremium flags)
    await tieredRoleManager.initializeRoleMetadata();
    
    // Setup FRIEND_MARKET_ROLE
    const FRIEND_MARKET_ROLE = ethers.id("FRIEND_MARKET_ROLE");
    // Match Solidity enum: NONE = 0, BRONZE = 1, SILVER = 2, GOLD = 3, PLATINUM = 4
    const MembershipTier = { NONE: 0, BRONZE: 1, SILVER: 2, GOLD: 3, PLATINUM: 4 };
    
    // Set up Friend Market tier metadata (Bronze tier)
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
      true // isActive
    );
    
    // Get Bronze tier price
    const tierMeta = await tieredRoleManager.tierMetadata(FRIEND_MARKET_ROLE, MembershipTier.BRONZE);
    const price = tierMeta.price;
    
    // Deploy MembershipPaymentManager
    const MembershipPaymentManager = await ethers.getContractFactory("MembershipPaymentManager");
    paymentManager = await MembershipPaymentManager.deploy(owner.address); // owner as treasury
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
    
    // Set collateral token for markets (required for CTF1155)
    await friendGroupFactory.setDefaultCollateralToken(await collateralToken.getAddress());
    
    // Purchase memberships for test users (100 years = never expires during tests)
    const durDays = 36500; // 100 years
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
    await tieredRoleManager.connect(addr3).purchaseRoleWithTier(
      FRIEND_MARKET_ROLE,
      MembershipTier.BRONZE,
      durDays,
      { value: price }
    );
    await tieredRoleManager.connect(addr4).purchaseRoleWithTier(
      FRIEND_MARKET_ROLE,
      MembershipTier.BRONZE,
      durDays,
      { value: price }
    );
    
    // Verify memberships were purchased successfully (for debugging if tests fail)
    const ownerTier = await tieredRoleManager.userTiers(owner.address, FRIEND_MARKET_ROLE);
    const addr1Tier = await tieredRoleManager.userTiers(addr1.address, FRIEND_MARKET_ROLE);
    const ownerHasRole = await tieredRoleManager.hasRole(FRIEND_MARKET_ROLE, owner.address);
    const addr1HasRole = await tieredRoleManager.hasRole(FRIEND_MARKET_ROLE, addr1.address);
    const ownerActive = await tieredRoleManager.isMembershipActive(owner.address, FRIEND_MARKET_ROLE);
    const addr1Active = await tieredRoleManager.isMembershipActive(addr1.address, FRIEND_MARKET_ROLE);
    
    // Debug output
    console.log(`Owner: tier=${ownerTier}, hasRole=${ownerHasRole}, active=${ownerActive}`);
    console.log(`Addr1: tier=${addr1Tier}, hasRole=${addr1HasRole}, active=${addr1Active}`);
    
    if (ownerTier == 0 || addr1Tier == 0) {
      throw new Error(`Membership purchase failed: owner tier=${ownerTier}, addr1 tier=${addr1Tier}`);
    }
    
    // Transfer ownership of marketFactory to friendGroupFactory for testing
    await marketFactory.transferOwnership(await friendGroupFactory.getAddress());
  });

  // Helper function to accept a market (activates it)
  async function acceptMarket(marketId, participant) {
    const marketWithStatus = await friendGroupFactory.getFriendMarketWithStatus(marketId);
    const stakeAmount = marketWithStatus.stakePerParticipant;
    const stakeToken = marketWithStatus.stakeToken;

    if (stakeToken === ethers.ZeroAddress) {
      // Native token
      await friendGroupFactory.connect(participant).acceptMarket(marketId, { value: stakeAmount });
    } else {
      // ERC20 token - would need approval first
      await friendGroupFactory.connect(participant).acceptMarket(marketId);
    }
  }

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await friendGroupFactory.owner()).to.equal(owner.address);
    });

    it("Should initialize with zero friend markets", async function () {
      expect(await friendGroupFactory.friendMarketCount()).to.equal(0);
    });

    it("Should set correct fee values", async function () {
      expect(await friendGroupFactory.friendMarketFee()).to.equal(ethers.parseEther("0.1"));
      expect(await friendGroupFactory.oneVsOneFee()).to.equal(ethers.parseEther("0.05"));
    });

    it("Should set correct member limit values", async function () {
      expect(await friendGroupFactory.maxSmallGroupMembers()).to.equal(10);
      expect(await friendGroupFactory.maxOneVsOneMembers()).to.equal(2);
    });
  });

  describe("One vs One Markets", function () {
    it("Should create a 1v1 market (pending acceptance)", async function () {
      const description = "Will it rain tomorrow?";
      const tradingPeriod = 7 * 24 * 60 * 60; // 7 days
      const latestBlock = await ethers.provider.getBlock('latest');
      const acceptanceDeadline = latestBlock.timestamp + (2 * 60 * 60); // 2 hours from now
      const stakeAmount = ethers.parseEther("0.1");

      await expect(
        friendGroupFactory.connect(addr1).createOneVsOneMarketPending(
          addr2.address,
          description,
          tradingPeriod,
          ethers.ZeroAddress, // No arbitrator
          acceptanceDeadline,
          stakeAmount,
          ethers.ZeroAddress, // Native token
          ResolutionType.Either,
          { value: stakeAmount }
        )
      ).to.emit(friendGroupFactory, "MarketCreatedPending");

      expect(await friendGroupFactory.friendMarketCount()).to.equal(1);
    });

    it("Should add both participants as members after acceptance", async function () {
      const description = "Bitcoin above $50k?";
      const tradingPeriod = 7 * 24 * 60 * 60;
      const latestBlock = await ethers.provider.getBlock('latest');
      const acceptanceDeadline = latestBlock.timestamp + (2 * 60 * 60);
      const stakeAmount = ethers.parseEther("0.1");

      await friendGroupFactory.connect(addr1).createOneVsOneMarketPending(
        addr2.address,
        description,
        tradingPeriod,
        ethers.ZeroAddress,
        acceptanceDeadline,
        stakeAmount,
        ethers.ZeroAddress,
        ResolutionType.Either,
        { value: stakeAmount }
      );

      // Initially only creator is listed in members
      expect(await friendGroupFactory.isMember(0, addr1.address)).to.equal(true);
      expect(await friendGroupFactory.getMemberCount(0)).to.equal(2); // Both are listed from creation

      // After acceptance, market becomes active
      await acceptMarket(0, addr2);
      expect(await friendGroupFactory.isMember(0, addr2.address)).to.equal(true);
    });

    it("Should create 1v1 market with equal stakes", async function () {
      const description = "Test bet";
      const tradingPeriod = 7 * 24 * 60 * 60;
      const latestBlock = await ethers.provider.getBlock('latest');
      const acceptanceDeadline = latestBlock.timestamp + (2 * 60 * 60);
      const stakeAmount = ethers.parseEther("0.1");

      await expect(
        friendGroupFactory.connect(addr1).createOneVsOneMarketPending(
          addr2.address,
          description,
          tradingPeriod,
          ethers.ZeroAddress,
          acceptanceDeadline,
          stakeAmount,
          ethers.ZeroAddress,
          ResolutionType.Either,
          { value: stakeAmount }
        )
      ).to.emit(friendGroupFactory, "MarketCreatedPending");

      // Verify market was created with correct stake
      const marketBasic = await friendGroupFactory.getFriendMarket(0);
      const marketWithStatus = await friendGroupFactory.getFriendMarketWithStatus(0);
      expect(marketWithStatus.stakePerParticipant).to.equal(stakeAmount);
      expect(marketBasic.creationFee).to.equal(0); // Fee waived for members
    });

    it("Should reject 1v1 market with invalid opponent", async function () {
      const description = "Test bet";
      const tradingPeriod = 7 * 24 * 60 * 60;
      const latestBlock = await ethers.provider.getBlock('latest');
      const acceptanceDeadline = latestBlock.timestamp + (2 * 60 * 60);
      const stakeAmount = ethers.parseEther("0.1");

      await expect(
        friendGroupFactory.connect(addr1).createOneVsOneMarketPending(
          ethers.ZeroAddress,
          description,
          tradingPeriod,
          ethers.ZeroAddress,
          acceptanceDeadline,
          stakeAmount,
          ethers.ZeroAddress,
          ResolutionType.Either,
          { value: stakeAmount }
        )
      ).to.be.revertedWithCustomError(friendGroupFactory, "InvalidOpponent");
    });

    it("Should reject betting against yourself", async function () {
      const description = "Test bet";
      const tradingPeriod = 7 * 24 * 60 * 60;
      const latestBlock = await ethers.provider.getBlock('latest');
      const acceptanceDeadline = latestBlock.timestamp + (2 * 60 * 60);
      const stakeAmount = ethers.parseEther("0.1");

      await expect(
        friendGroupFactory.connect(addr1).createOneVsOneMarketPending(
          addr1.address,
          description,
          tradingPeriod,
          ethers.ZeroAddress,
          acceptanceDeadline,
          stakeAmount,
          ethers.ZeroAddress,
          ResolutionType.Either,
          { value: stakeAmount }
        )
      ).to.be.revertedWithCustomError(friendGroupFactory, "InvalidOpponent");
    });

    it("Should support different resolution types", async function () {
      const description = "Who wins the game?";
      const tradingPeriod = 7 * 24 * 60 * 60;
      const latestBlock = await ethers.provider.getBlock('latest');
      const acceptanceDeadline = latestBlock.timestamp + (2 * 60 * 60);
      const stakeAmount = ethers.parseEther("0.1");

      // Test with ThirdParty resolution type
      await expect(
        friendGroupFactory.connect(addr1).createOneVsOneMarketPending(
          addr2.address,
          description,
          tradingPeriod,
          arbitrator.address, // Required for ThirdParty
          acceptanceDeadline,
          stakeAmount,
          ethers.ZeroAddress,
          ResolutionType.ThirdParty,
          { value: stakeAmount }
        )
      ).to.emit(friendGroupFactory, "MarketCreatedPending");

      const market = await friendGroupFactory.getFriendMarket(0);
      expect(market.arbitrator).to.equal(arbitrator.address);
    });
  });

  describe("Small Group Markets", function () {
    it("Should create a small group market (pending acceptance)", async function () {
      const description = "Will our team win the championship?";
      const members = [addr1.address, addr2.address, addr3.address];
      const memberLimit = 5;
      const tradingPeriod = 14 * 24 * 60 * 60; // 14 days
      const latestBlock = await ethers.provider.getBlock('latest');
      const acceptanceDeadline = latestBlock.timestamp + (2 * 60 * 60); // 2 hours from now
      const minThreshold = 3; // Need all 3 to accept
      const stakeAmount = ethers.parseEther("0.1");

      await expect(
        friendGroupFactory.createSmallGroupMarketPending(
          description,
          members,
          memberLimit,
          tradingPeriod,
          ethers.ZeroAddress,
          acceptanceDeadline,
          minThreshold,
          stakeAmount,
          ethers.ZeroAddress,
          { value: stakeAmount }
        )
      ).to.emit(friendGroupFactory, "MarketCreatedPending");

      expect(await friendGroupFactory.friendMarketCount()).to.equal(1);
    });

    it("Should enforce member limits", async function () {
      const description = "Test market";
      const members = [addr1.address, addr2.address];
      const memberLimit = 5;
      const tradingPeriod = 7 * 24 * 60 * 60;
      const latestBlock = await ethers.provider.getBlock('latest');
      const acceptanceDeadline = latestBlock.timestamp + (2 * 60 * 60); // 2 hours from now
      const stakeAmount = ethers.parseEther("0.1");

      await friendGroupFactory.createSmallGroupMarketPending(
        description,
        members,
        memberLimit,
        tradingPeriod,
        ethers.ZeroAddress,
        acceptanceDeadline,
        2,
        stakeAmount,
        ethers.ZeroAddress,
        { value: stakeAmount }
      );

      // Creator plus invited members are all listed from creation in pending acceptance flow
      expect(await friendGroupFactory.getMemberCount(0)).to.equal(3); // owner + addr1 + addr2
    });

    it("Should reject member limit above maximum", async function () {
      const description = "Test market";
      const members = [addr1.address];
      const memberLimit = 15; // Above MAX_SMALL_GROUP_MEMBERS (10)
      const tradingPeriod = 7 * 24 * 60 * 60;
      const latestBlock = await ethers.provider.getBlock('latest');
      const acceptanceDeadline = latestBlock.timestamp + (2 * 60 * 60); // 2 hours from now
      const stakeAmount = ethers.parseEther("0.1");

      await expect(
        friendGroupFactory.createSmallGroupMarketPending(
          description,
          members,
          memberLimit,
          tradingPeriod,
          ethers.ZeroAddress,
          acceptanceDeadline,
          2,
          stakeAmount,
          ethers.ZeroAddress,
          { value: stakeAmount }
        )
      ).to.be.revertedWithCustomError(friendGroupFactory, "InvalidLimit");
    });

    it("Should reject member limit too low", async function () {
      const description = "Test market";
      const members = [addr1.address];
      const memberLimit = 2; // Should be > 2
      const tradingPeriod = 7 * 24 * 60 * 60;
      const latestBlock = await ethers.provider.getBlock('latest');
      const acceptanceDeadline = latestBlock.timestamp + (2 * 60 * 60); // 2 hours from now
      const stakeAmount = ethers.parseEther("0.1");

      await expect(
        friendGroupFactory.createSmallGroupMarketPending(
          description,
          members,
          memberLimit,
          tradingPeriod,
          ethers.ZeroAddress,
          acceptanceDeadline,
          2,
          stakeAmount,
          ethers.ZeroAddress,
          { value: stakeAmount }
        )
      ).to.be.revertedWithCustomError(friendGroupFactory, "InvalidLimit");
    });

    it("Should reject duplicate members", async function () {
      const description = "Test market";
      const members = [addr1.address, addr1.address]; // Duplicate
      const memberLimit = 5;
      const tradingPeriod = 7 * 24 * 60 * 60;
      const latestBlock = await ethers.provider.getBlock('latest');
      const acceptanceDeadline = latestBlock.timestamp + (2 * 60 * 60); // 2 hours from now
      const stakeAmount = ethers.parseEther("0.1");

      await expect(
        friendGroupFactory.createSmallGroupMarketPending(
          description,
          members,
          memberLimit,
          tradingPeriod,
          ethers.ZeroAddress,
          acceptanceDeadline,
          2,
          stakeAmount,
          ethers.ZeroAddress,
          { value: stakeAmount }
        )
      ).to.be.revertedWithCustomError(friendGroupFactory, "DuplicateMember");
    });

    it("Should track invited members correctly", async function () {
      const description = "Test market";
      const members = [addr1.address, addr2.address, addr3.address];
      const memberLimit = 5;
      const tradingPeriod = 7 * 24 * 60 * 60;
      const latestBlock = await ethers.provider.getBlock('latest');
      const acceptanceDeadline = latestBlock.timestamp + (2 * 60 * 60); // 2 hours from now
      const stakeAmount = ethers.parseEther("0.1");

      await friendGroupFactory.createSmallGroupMarketPending(
        description,
        members,
        memberLimit,
        tradingPeriod,
        ethers.ZeroAddress,
        acceptanceDeadline,
        3,
        stakeAmount,
        ethers.ZeroAddress,
        { value: stakeAmount }
      );

      // Initially only creator is member
      const ownerMarkets = await friendGroupFactory.getUserMarkets(owner.address);
      expect(ownerMarkets.length).to.equal(1);
    });
  });

  // Event Tracking Markets functionality was removed to reduce contract size
  // Use Small Group Markets instead for multi-party markets
  describe.skip("Event Tracking Markets (REMOVED)", function () {
    it("Function removed to reduce contract bytecode size", async function () {
      // createEventTrackingMarket was removed
      // Use createSmallGroupMarketPending instead
    });
  });

  describe("Member Management", function () {
    beforeEach(async function () {
      // Create a small group market for testing
      const description = "Test market for member management";
      const members = [addr1.address, addr2.address];
      const memberLimit = 5;
      const tradingPeriod = 7 * 24 * 60 * 60;
      const latestBlock = await ethers.provider.getBlock('latest');
      const acceptanceDeadline = latestBlock.timestamp + (2 * 60 * 60); // 2 hours from now
      const stakeAmount = ethers.parseEther("0.1");

      await friendGroupFactory.createSmallGroupMarketPending(
        description,
        members,
        memberLimit,
        tradingPeriod,
        ethers.ZeroAddress,
        acceptanceDeadline,
        2,
        stakeAmount,
        ethers.ZeroAddress,
        { value: stakeAmount }
      );

      // Accept the market to activate it
      // Creator (owner) is auto-accepted (count=1), need 1 more to meet threshold of 2
      await acceptMarket(0, addr1);
    });

    it("Should allow creator to add members", async function () {
      await expect(
        friendGroupFactory.addMember(0, addr3.address)
      ).to.emit(friendGroupFactory, "MemberAdded");

      expect(await friendGroupFactory.isMember(0, addr3.address)).to.equal(true);
      // Initial: owner + addr1 + addr2 = 3, after adding addr3 = 4
      expect(await friendGroupFactory.getMemberCount(0)).to.equal(4);
    });

    it("Should reject adding member by non-creator", async function () {
      await expect(
        friendGroupFactory.connect(addr1).addMember(0, addr3.address)
      ).to.be.revertedWithCustomError(friendGroupFactory, "NotAuthorized");
    });

    it("Should reject adding duplicate member", async function () {
      await expect(
        friendGroupFactory.addMember(0, addr1.address)
      ).to.be.revertedWithCustomError(friendGroupFactory, "AlreadyMember");
    });

    it("Should enforce member limit when adding", async function () {
      // Initial: owner + addr1 + addr2 = 3 members, limit = 5
      // Can add 2 more to reach the limit
      await friendGroupFactory.addMember(0, addr3.address); // 4 members
      await friendGroupFactory.addMember(0, addr4.address); // 5 members (at limit)

      // Try to add beyond limit
      await expect(
        friendGroupFactory.addMember(0, arbitrator.address)
      ).to.be.revertedWithCustomError(friendGroupFactory, "MemberLimitReached");
    });

    it("Should allow members to remove themselves", async function () {
      await expect(
        friendGroupFactory.connect(addr1).removeSelf(0)
      ).to.emit(friendGroupFactory, "MemberRemoved");

      expect(await friendGroupFactory.isMember(0, addr1.address)).to.equal(false);
      // Initial: owner + addr1 + addr2 = 3, after removing addr1 = 2
      expect(await friendGroupFactory.getMemberCount(0)).to.equal(2);
    });

    it("Should reject removal by non-member", async function () {
      await expect(
        friendGroupFactory.connect(addr3).removeSelf(0)
      ).to.be.revertedWithCustomError(friendGroupFactory, "NotMember");
    });
  });

  describe("Market Resolution", function () {
    beforeEach(async function () {
      // Create a 1v1 market with arbitrator
      const description = "Test bet with arbitrator";
      const tradingPeriod = 7 * 24 * 60 * 60;
      const latestBlock = await ethers.provider.getBlock('latest');
      const acceptanceDeadline = latestBlock.timestamp + (2 * 60 * 60); // 2 hours from now
      const stakeAmount = ethers.parseEther("0.1");

      await friendGroupFactory.connect(addr1).createOneVsOneMarketPending(
        addr2.address,
        description,
        tradingPeriod,
        arbitrator.address,
        acceptanceDeadline,
        stakeAmount,
        ethers.ZeroAddress,
        ResolutionType.Either, // Allow creator, opponent, OR arbitrator to resolve
        { value: stakeAmount }
      );

      // Accept the market to activate it
      // With arbitrator set, they must also accept
      await acceptMarket(0, addr2); // Opponent accepts
      await friendGroupFactory.connect(arbitrator).acceptMarket(0); // Arbitrator accepts (no payment required)
    });

    it("Should allow creator to resolve market", async function () {
      await expect(
        friendGroupFactory.connect(addr1).resolveFriendMarket(0, true)
      ).to.emit(friendGroupFactory, "MarketResolved")
        .withArgs(0, addr1.address, true);
      
      const market = await friendGroupFactory.getFriendMarket(0);
      expect(market.active).to.equal(false);
    });

    it("Should allow arbitrator to resolve market", async function () {
      await expect(
        friendGroupFactory.connect(arbitrator).resolveFriendMarket(0, false)
      ).to.emit(friendGroupFactory, "MarketResolved")
        .withArgs(0, arbitrator.address, false);
      
      const market = await friendGroupFactory.getFriendMarket(0);
      expect(market.active).to.equal(false);
    });

    it("Should reject resolution by unauthorized party", async function () {
      await expect(
        friendGroupFactory.connect(addr3).resolveFriendMarket(0, true)
      ).to.be.revertedWithCustomError(friendGroupFactory, "NotAuthorized");
    });

    it("Should reject resolution of already resolved market", async function () {
      await friendGroupFactory.connect(addr1).resolveFriendMarket(0, true);
      
      await expect(
        friendGroupFactory.connect(addr1).resolveFriendMarket(0, true)
      ).to.be.revertedWithCustomError(friendGroupFactory, "NotActive");
    });
  });

  describe("Fee Management", function () {
    it("Should hold stakes in contract before market activation", async function () {
      const stakeAmount = ethers.parseEther("0.1");
      const latestBlock = await ethers.provider.getBlock('latest');
      const acceptanceDeadline = latestBlock.timestamp + (2 * 60 * 60); // 2 hours from now

      await friendGroupFactory.connect(addr1).createOneVsOneMarketPending(
        addr2.address,
        "Test",
        7 * 24 * 60 * 60,
        ethers.ZeroAddress,
        acceptanceDeadline,
        stakeAmount,
        ethers.ZeroAddress,
        ResolutionType.Either,
        { value: stakeAmount }
      );

      const balance = await ethers.provider.getBalance(await friendGroupFactory.getAddress());
      expect(balance).to.be.gte(stakeAmount);
    });

    it("Should allow owner to withdraw fees", async function () {
      const stakeAmount = ethers.parseEther("0.1");
      const latestBlock = await ethers.provider.getBlock('latest');
      const acceptanceDeadline = latestBlock.timestamp + (2 * 60 * 60); // 2 hours from now

      await friendGroupFactory.connect(addr1).createOneVsOneMarketPending(
        addr2.address,
        "Test",
        7 * 24 * 60 * 60,
        ethers.ZeroAddress,
        acceptanceDeadline,
        stakeAmount,
        ethers.ZeroAddress,
        ResolutionType.Either,
        { value: stakeAmount }
      );

      await expect(
        friendGroupFactory.withdrawFees()
      ).to.not.be.reverted;
    });

    it("Should reject fee withdrawal by non-owner", async function () {
      await expect(
        friendGroupFactory.connect(addr1).withdrawFees()
      ).to.be.reverted;
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      // Create multiple markets
      const stakeAmount = ethers.parseEther("0.1");
      const latestBlock = await ethers.provider.getBlock('latest');
      const acceptanceDeadline = latestBlock.timestamp + (2 * 60 * 60); // 2 hours from now

      await friendGroupFactory.connect(addr1).createOneVsOneMarketPending(
        addr2.address,
        "Bet 1",
        7 * 24 * 60 * 60,
        ethers.ZeroAddress,
        acceptanceDeadline,
        stakeAmount,
        ethers.ZeroAddress,
        ResolutionType.Either,
        { value: stakeAmount }
      );

      await friendGroupFactory.createSmallGroupMarketPending(
        "Bet 2",
        [addr1.address, addr3.address],
        5,
        7 * 24 * 60 * 60,
        ethers.ZeroAddress,
        acceptanceDeadline,
        2,
        stakeAmount,
        ethers.ZeroAddress,
        { value: stakeAmount }
      );

      // Accept both markets to activate them
      await acceptMarket(0, addr2);  // Bet 1 (1v1 between addr1 and addr2) - addr1 auto-accepted, addr2 makes it 2/2
      await acceptMarket(1, addr1);  // Bet 2 (small group) - owner auto-accepted, addr1 makes it 2/2
    });

    it("Should return correct friend market details", async function () {
      const market = await friendGroupFactory.getFriendMarket(0);
      
      expect(market.creator).to.equal(addr1.address);
      expect(market.members.length).to.equal(2);
      expect(market.active).to.equal(true);
      expect(market.description).to.equal("Bet 1");
    });

    it("Should return user markets correctly", async function () {
      const addr1Markets = await friendGroupFactory.getUserMarkets(addr1.address);
      expect(addr1Markets.length).to.equal(2);
      expect(addr1Markets[0]).to.equal(0);
      expect(addr1Markets[1]).to.equal(1);
    });

    it("Should check membership correctly", async function () {
      expect(await friendGroupFactory.isMember(0, addr1.address)).to.equal(true);
      expect(await friendGroupFactory.isMember(0, addr2.address)).to.equal(true);
      expect(await friendGroupFactory.isMember(0, addr3.address)).to.equal(false);
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to update market factory", async function () {
      const newFactory = ethers.Wallet.createRandom().address;
      await expect(
        friendGroupFactory.updateMarketFactory(newFactory)
      ).to.not.be.reverted;
    });

    it("Should reject market factory update by non-owner", async function () {
      const newFactory = ethers.Wallet.createRandom().address;
      await expect(
        friendGroupFactory.connect(addr1).updateMarketFactory(newFactory)
      ).to.be.reverted;
    });

    it("Should allow owner to update ragequit module", async function () {
      const newModule = ethers.Wallet.createRandom().address;
      await expect(
        friendGroupFactory.updateRagequitModule(newModule)
      ).to.not.be.reverted;
    });

    it("Should reject invalid addresses in updates", async function () {
      await expect(
        friendGroupFactory.updateMarketFactory(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(friendGroupFactory, "InvalidAddress");
      
      await expect(
        friendGroupFactory.updateRagequitModule(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(friendGroupFactory, "InvalidAddress");
    });
  });

  describe("Market Pegging", function () {
    it("Should support AutoPegged resolution type", async function () {
      const description = "Bet on event";
      const tradingPeriod = 7 * 24 * 60 * 60;
      const stakeAmount = ethers.parseEther("0.1");
      const latestBlock = await ethers.provider.getBlock('latest');
      const acceptanceDeadline = latestBlock.timestamp + (2 * 60 * 60); // 2 hours from now

      // Create a dummy market first so the "public" market gets a non-zero marketId
      await friendGroupFactory.createSmallGroupMarketPending(
        "Dummy market",
        [addr1.address],
        5,
        tradingPeriod,
        ethers.ZeroAddress,
        acceptanceDeadline,
        2,
        stakeAmount,
        ethers.ZeroAddress,
        { value: stakeAmount }
      );

      // Now create the "public" market to peg to (will have marketId > 0)
      await friendGroupFactory.createSmallGroupMarketPending(
        "Public market",
        [addr1.address],
        5,
        tradingPeriod,
        ethers.ZeroAddress,
        acceptanceDeadline,
        2,
        stakeAmount,
        ethers.ZeroAddress,
        { value: stakeAmount }
      );

      // Activate the public market so it gets an underlying marketId
      await acceptMarket(1, addr1); // Owner is auto-accepted, addr1 makes it 2/2

      const publicMarket = await friendGroupFactory.getFriendMarket(1);
      const publicMarketId = publicMarket.marketId;

      // Create pegged friend market with AutoPegged resolution type
      await friendGroupFactory.connect(addr1).createOneVsOneMarketPending(
        addr2.address,
        description,
        tradingPeriod,
        ethers.ZeroAddress, // No arbitrator for AutoPegged
        acceptanceDeadline,
        stakeAmount,
        ethers.ZeroAddress,
        ResolutionType.AutoPegged,
        { value: stakeAmount }
      );

      // Activate the pegged market (required before pegging)
      await acceptMarket(2, addr2); // addr1 auto-accepted, addr2 makes it 2/2

      // Peg the market to the public market
      await friendGroupFactory.connect(addr1).pegToPublicMarket(2, publicMarketId);

      const marketWithStatus = await friendGroupFactory.getFriendMarketWithStatus(2);
      // For AutoPegged, the resolution type indicates auto-resolution based on another market
      expect(marketWithStatus.resolutionType).to.equal(ResolutionType.AutoPegged);
    });

    it("Should allow pegging existing market to public market", async function () {
      const tradingPeriod = 7 * 24 * 60 * 60;
      const stakeAmount = ethers.parseEther("0.1");
      const latestBlock = await ethers.provider.getBlock('latest');
      const acceptanceDeadline = latestBlock.timestamp + (2 * 60 * 60); // 2 hours from now

      // Create public market
      await friendGroupFactory.createSmallGroupMarketPending(
        "Public market",
        [addr1.address],
        5,
        tradingPeriod,
        ethers.ZeroAddress,
        acceptanceDeadline,
        2,
        stakeAmount,
        ethers.ZeroAddress,
        { value: stakeAmount }
      );

      // Activate the public market
      await acceptMarket(0, addr1); // Owner auto-accepted, addr1 makes it 2/2

      const publicMarket = await friendGroupFactory.getFriendMarket(0);
      const publicMarketId = publicMarket.marketId;

      // Create unpegged friend market
      await friendGroupFactory.connect(addr1).createOneVsOneMarketPending(
        addr2.address,
        "Test",
        tradingPeriod,
        ethers.ZeroAddress,
        acceptanceDeadline,
        stakeAmount,
        ethers.ZeroAddress,
        ResolutionType.Either,
        { value: stakeAmount }
      );

      // Activate the friend market (required before pegging)
      await acceptMarket(1, addr2); // addr1 auto-accepted, addr2 makes it 2/2

      // Peg it
      await expect(
        friendGroupFactory.connect(addr1).pegToPublicMarket(1, publicMarketId)
      ).to.emit(friendGroupFactory, "MarketPeggedToPublic");

      const market = await friendGroupFactory.getFriendMarket(1);
      expect(market.autoPegged).to.equal(true);
    });

    it("Should track pegged markets correctly", async function () {
      const tradingPeriod = 7 * 24 * 60 * 60;
      const stakeAmount = ethers.parseEther("0.1");
      const latestBlock = await ethers.provider.getBlock('latest');
      const acceptanceDeadline = latestBlock.timestamp + (2 * 60 * 60); // 2 hours from now

      // Create dummy market first so the "public" market gets a non-zero marketId
      await friendGroupFactory.createSmallGroupMarketPending(
        "Dummy market",
        [addr1.address],
        5,
        tradingPeriod,
        ethers.ZeroAddress,
        acceptanceDeadline,
        2,
        stakeAmount,
        ethers.ZeroAddress,
        { value: stakeAmount }
      );

      // Create public market (will have marketId > 0)
      await friendGroupFactory.createSmallGroupMarketPending(
        "Public market",
        [addr1.address],
        5,
        tradingPeriod,
        ethers.ZeroAddress,
        acceptanceDeadline,
        2,
        stakeAmount,
        ethers.ZeroAddress,
        { value: stakeAmount }
      );

      // Activate the public market
      await acceptMarket(1, addr1); // Owner auto-accepted, addr1 makes it 2/2

      const publicMarket = await friendGroupFactory.getFriendMarket(1);
      const publicMarketId = publicMarket.marketId;

      // Create two markets and peg them
      await friendGroupFactory.connect(addr1).createOneVsOneMarketPending(
        addr2.address,
        "Bet 1",
        tradingPeriod,
        ethers.ZeroAddress,
        acceptanceDeadline,
        stakeAmount,
        ethers.ZeroAddress,
        ResolutionType.Either,
        { value: stakeAmount }
      );

      await friendGroupFactory.connect(addr3).createOneVsOneMarketPending(
        addr4.address,
        "Bet 2",
        tradingPeriod,
        ethers.ZeroAddress,
        acceptanceDeadline,
        stakeAmount,
        ethers.ZeroAddress,
        ResolutionType.Either,
        { value: stakeAmount }
      );

      // Activate both friend markets before pegging
      await acceptMarket(2, addr2); // Market 2: addr1 vs addr2
      await acceptMarket(3, addr4); // Market 3: addr3 vs addr4

      // Peg both markets
      await friendGroupFactory.connect(addr1).pegToPublicMarket(2, publicMarketId);
      await friendGroupFactory.connect(addr3).pegToPublicMarket(3, publicMarketId);

      const peggedMarkets = await friendGroupFactory.getPeggedFriendMarkets(publicMarketId);
      expect(peggedMarkets.length).to.equal(2);
    });
  });
});
