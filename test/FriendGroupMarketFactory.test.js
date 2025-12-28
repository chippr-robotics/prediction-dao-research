const { expect } = require("chai");
const { ethers } = require("hardhat");

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
    
    // Deploy ConditionalMarketFactory
    const ConditionalMarketFactory = await ethers.getContractFactory("ConditionalMarketFactory");
    marketFactory = await ConditionalMarketFactory.deploy();
    await marketFactory.initialize(owner.address);
    
    // Deploy RagequitModule (with mock token and treasury)
    const RagequitModule = await ethers.getContractFactory("RagequitModule");
    ragequitModule = await RagequitModule.deploy();
    
    // Deploy TieredRoleManager
    const TieredRoleManager = await ethers.getContractFactory("TieredRoleManager");
    tieredRoleManager = await TieredRoleManager.deploy();
    await tieredRoleManager.waitForDeployment();
    
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
      await paymentManager.getAddress()
    );
    
    // Grant FRIEND_MARKET_ROLE to test users directly (for testing, avoids draining ETH balance)
    const FRIEND_MARKET_ROLE = await tieredRoleManager.FRIEND_MARKET_ROLE();
    const OPERATIONS_ADMIN_ROLE = await tieredRoleManager.OPERATIONS_ADMIN_ROLE();
    const CORE_SYSTEM_ADMIN_ROLE = await tieredRoleManager.CORE_SYSTEM_ADMIN_ROLE();
    
    // Role hierarchy: DEFAULT_ADMIN -> CORE_SYSTEM_ADMIN -> OPERATIONS_ADMIN -> FRIEND_MARKET_ROLE
    // Owner (who has DEFAULT_ADMIN_ROLE) grants themselves CORE_SYSTEM_ADMIN_ROLE first
    await tieredRoleManager.connect(owner).grantRole(CORE_SYSTEM_ADMIN_ROLE, owner.address);
    
    // Now owner (with CORE_SYSTEM_ADMIN_ROLE) can grant OPERATIONS_ADMIN_ROLE
    await tieredRoleManager.connect(owner).grantRole(OPERATIONS_ADMIN_ROLE, owner.address);
    
    // Now owner (with OPERATIONS_ADMIN_ROLE) can grant FRIEND_MARKET_ROLE to test users
    // This avoids purchasing expensive memberships which drains test account balances
    await tieredRoleManager.connect(owner).grantRole(FRIEND_MARKET_ROLE, owner.address);
    await tieredRoleManager.connect(owner).grantRole(FRIEND_MARKET_ROLE, addr1.address);
    await tieredRoleManager.connect(owner).grantRole(FRIEND_MARKET_ROLE, addr2.address);
    await tieredRoleManager.connect(owner).grantRole(FRIEND_MARKET_ROLE, addr3.address);
    await tieredRoleManager.connect(owner).grantRole(FRIEND_MARKET_ROLE, addr4.address);
    
    // Transfer ownership of marketFactory to friendGroupFactory for testing
    await marketFactory.transferOwnership(await friendGroupFactory.getAddress());
  });

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
    it("Should create a 1v1 market with correct fee", async function () {
      const description = "Will it rain tomorrow?";
      const tradingPeriod = 7 * 24 * 60 * 60; // 7 days
      const fee = ethers.parseEther("0.1"); // Extra for liquidity
      
      await expect(
        friendGroupFactory.connect(addr1).createOneVsOneMarket(
          addr2.address,
          description,
          tradingPeriod,
          ethers.ZeroAddress,
          0, // No pegged market
          { value: fee }
        )
      ).to.emit(friendGroupFactory, "FriendMarketCreated");
      
      expect(await friendGroupFactory.friendMarketCount()).to.equal(1);
    });

    it("Should add both participants as members", async function () {
      const description = "Bitcoin above $50k?";
      const tradingPeriod = 7 * 24 * 60 * 60;
      const fee = ethers.parseEther("0.1");
      
      await friendGroupFactory.connect(addr1).createOneVsOneMarket(
        addr2.address,
        description,
        tradingPeriod,
        ethers.ZeroAddress,
        0, // No pegged market
        { value: fee }
      );
      
      expect(await friendGroupFactory.isMember(0, addr1.address)).to.equal(true);
      expect(await friendGroupFactory.isMember(0, addr2.address)).to.equal(true);
      expect(await friendGroupFactory.getMemberCount(0)).to.equal(2);
    });

    it("Should reject 1v1 market with insufficient fee", async function () {
      const description = "Test bet";
      const tradingPeriod = 7 * 24 * 60 * 60;
      const lowFee = ethers.parseEther("0.01"); // Too low
      
      await expect(
        friendGroupFactory.connect(addr1).createOneVsOneMarket(
          addr2.address,
          description,
          tradingPeriod,
          ethers.ZeroAddress,
          0,
          { value: lowFee }
        )
      ).to.be.revertedWith("Insufficient creation fee");
    });

    it("Should reject 1v1 market with invalid opponent", async function () {
      const description = "Test bet";
      const tradingPeriod = 7 * 24 * 60 * 60;
      const fee = ethers.parseEther("0.1");
      
      await expect(
        friendGroupFactory.connect(addr1).createOneVsOneMarket(
          ethers.ZeroAddress,
          description,
          tradingPeriod,
          ethers.ZeroAddress,
          0,
          { value: fee }
        )
      ).to.be.revertedWith("Invalid opponent");
    });

    it("Should reject betting against yourself", async function () {
      const description = "Test bet";
      const tradingPeriod = 7 * 24 * 60 * 60;
      const fee = ethers.parseEther("0.1");
      
      await expect(
        friendGroupFactory.connect(addr1).createOneVsOneMarket(
          addr1.address,
          description,
          tradingPeriod,
          ethers.ZeroAddress,
          0,
          { value: fee }
        )
      ).to.be.revertedWith("Cannot bet against yourself");
    });

    it("Should set arbitrator when provided", async function () {
      const description = "Who wins the game?";
      const tradingPeriod = 7 * 24 * 60 * 60;
      const fee = ethers.parseEther("0.1");
      
      await expect(
        friendGroupFactory.connect(addr1).createOneVsOneMarket(
          addr2.address,
          description,
          tradingPeriod,
          arbitrator.address,
          0,
          { value: fee }
        )
      ).to.emit(friendGroupFactory, "ArbitratorSet");
    });
  });

  describe("Small Group Markets", function () {
    it("Should create a small group market", async function () {
      const description = "Will our team win the championship?";
      const members = [addr1.address, addr2.address, addr3.address];
      const memberLimit = 5;
      const tradingPeriod = 14 * 24 * 60 * 60; // 14 days
      const fee = ethers.parseEther("0.2");
      
      await expect(
        friendGroupFactory.createSmallGroupMarket(
          description,
          members,
          memberLimit,
          tradingPeriod,
          ethers.ZeroAddress,
          0, // No pegged market
          { value: fee }
        )
      ).to.emit(friendGroupFactory, "FriendMarketCreated");
      
      expect(await friendGroupFactory.friendMarketCount()).to.equal(1);
    });

    it("Should enforce member limits", async function () {
      const description = "Test market";
      const members = [addr1.address, addr2.address];
      const memberLimit = 5;
      const tradingPeriod = 7 * 24 * 60 * 60;
      const fee = ethers.parseEther("0.2");
      
      await friendGroupFactory.createSmallGroupMarket(
        description,
        members,
        memberLimit,
        tradingPeriod,
        ethers.ZeroAddress,
        0,
        { value: fee }
      );
      
      expect(await friendGroupFactory.getMemberCount(0)).to.equal(2);
    });

    it("Should reject member limit above maximum", async function () {
      const description = "Test market";
      const members = [addr1.address];
      const memberLimit = 15; // Above MAX_SMALL_GROUP_MEMBERS (10)
      const tradingPeriod = 7 * 24 * 60 * 60;
      const fee = ethers.parseEther("0.2");
      
      await expect(
        friendGroupFactory.createSmallGroupMarket(
          description,
          members,
          memberLimit,
          tradingPeriod,
          ethers.ZeroAddress,
          0,
          { value: fee }
        )
      ).to.be.revertedWith("Invalid member limit");
    });

    it("Should reject member limit too low", async function () {
      const description = "Test market";
      const members = [addr1.address];
      const memberLimit = 2; // Should be > 2
      const tradingPeriod = 7 * 24 * 60 * 60;
      const fee = ethers.parseEther("0.2");
      
      await expect(
        friendGroupFactory.createSmallGroupMarket(
          description,
          members,
          memberLimit,
          tradingPeriod,
          ethers.ZeroAddress,
          0,
          { value: fee }
        )
      ).to.be.revertedWith("Invalid member limit");
    });

    it("Should reject duplicate members", async function () {
      const description = "Test market";
      const members = [addr1.address, addr1.address]; // Duplicate
      const memberLimit = 5;
      const tradingPeriod = 7 * 24 * 60 * 60;
      const fee = ethers.parseEther("0.2");
      
      await expect(
        friendGroupFactory.createSmallGroupMarket(
          description,
          members,
          memberLimit,
          tradingPeriod,
          ethers.ZeroAddress,
          0,
          { value: fee }
        )
      ).to.be.revertedWith("Duplicate member");
    });

    it("Should track user markets correctly", async function () {
      const description = "Test market";
      const members = [addr1.address, addr2.address, addr3.address];
      const memberLimit = 5;
      const tradingPeriod = 7 * 24 * 60 * 60;
      const fee = ethers.parseEther("0.2");
      
      await friendGroupFactory.createSmallGroupMarket(
        description,
        members,
        memberLimit,
        tradingPeriod,
        ethers.ZeroAddress,
        0,
        { value: fee }
      );
      
      const addr1Markets = await friendGroupFactory.getUserMarkets(addr1.address);
      const addr2Markets = await friendGroupFactory.getUserMarkets(addr2.address);
      const addr3Markets = await friendGroupFactory.getUserMarkets(addr3.address);
      
      expect(addr1Markets.length).to.equal(1);
      expect(addr2Markets.length).to.equal(1);
      expect(addr3Markets.length).to.equal(1);
      expect(addr1Markets[0]).to.equal(0);
    });
  });

  describe("Event Tracking Markets", function () {
    it("Should create an event tracking market", async function () {
      const description = "Friday night game tournament";
      const players = [addr1.address, addr2.address, addr3.address, addr4.address];
      const tradingPeriod = 7 * 24 * 60 * 60; // 7 days minimum
      const fee = ethers.parseEther("0.2");
      
      await expect(
        friendGroupFactory.createEventTrackingMarket(
          description,
          players,
          tradingPeriod,
          0, // No pegged market
          { value: fee }
        )
      ).to.emit(friendGroupFactory, "FriendMarketCreated");
    });

    it("Should require minimum players for event tracking", async function () {
      const description = "Game tournament";
      const players = [addr1.address, addr2.address]; // Only 2, minimum is 3
      const tradingPeriod = 7 * 24 * 60 * 60; // 7 days
      const fee = ethers.parseEther("0.2");
      
      await expect(
        friendGroupFactory.createEventTrackingMarket(
          description,
          players,
          tradingPeriod,
          0,
          { value: fee }
        )
      ).to.be.revertedWith("Invalid number of players");
    });

    it("Should enforce maximum players for event tracking", async function () {
      const description = "Game tournament";
      const players = new Array(11).fill(0).map(() => 
        ethers.Wallet.createRandom().address
      ); // 11 players, max is 10
      const tradingPeriod = 7 * 24 * 60 * 60; // 7 days
      const fee = ethers.parseEther("0.2");
      
      await expect(
        friendGroupFactory.createEventTrackingMarket(
          description,
          players,
          tradingPeriod,
          0,
          { value: fee }
        )
      ).to.be.revertedWith("Invalid number of players");
    });
  });

  describe("Member Management", function () {
    beforeEach(async function () {
      // Create a small group market for testing
      const description = "Test market for member management";
      const members = [addr1.address, addr2.address];
      const memberLimit = 5;
      const tradingPeriod = 7 * 24 * 60 * 60;
      const fee = ethers.parseEther("0.2");
      
      await friendGroupFactory.createSmallGroupMarket(
        description,
        members,
        memberLimit,
        tradingPeriod,
        ethers.ZeroAddress,
        0,
        { value: fee }
      );
    });

    it("Should allow creator to add members", async function () {
      await expect(
        friendGroupFactory.addMember(0, addr3.address)
      ).to.emit(friendGroupFactory, "MemberAdded");
      
      expect(await friendGroupFactory.isMember(0, addr3.address)).to.equal(true);
      expect(await friendGroupFactory.getMemberCount(0)).to.equal(3);
    });

    it("Should reject adding member by non-creator", async function () {
      await expect(
        friendGroupFactory.connect(addr1).addMember(0, addr3.address)
      ).to.be.revertedWith("Only creator can add members");
    });

    it("Should reject adding duplicate member", async function () {
      await expect(
        friendGroupFactory.addMember(0, addr1.address)
      ).to.be.revertedWith("Already a member");
    });

    it("Should enforce member limit when adding", async function () {
      // Add members up to limit
      await friendGroupFactory.addMember(0, addr3.address);
      await friendGroupFactory.addMember(0, addr4.address);
      await friendGroupFactory.addMember(0, arbitrator.address);
      
      // Try to add beyond limit
      const extraAddr = ethers.Wallet.createRandom().address;
      await expect(
        friendGroupFactory.addMember(0, extraAddr)
      ).to.be.revertedWith("Member limit reached");
    });

    it("Should allow members to remove themselves", async function () {
      await expect(
        friendGroupFactory.connect(addr1).removeSelf(0)
      ).to.emit(friendGroupFactory, "MemberRemoved");
      
      expect(await friendGroupFactory.isMember(0, addr1.address)).to.equal(false);
      expect(await friendGroupFactory.getMemberCount(0)).to.equal(1);
    });

    it("Should reject removal by non-member", async function () {
      await expect(
        friendGroupFactory.connect(addr3).removeSelf(0)
      ).to.be.revertedWith("Not a member");
    });
  });

  describe("Market Resolution", function () {
    beforeEach(async function () {
      // Create a 1v1 market with arbitrator
      const description = "Test bet with arbitrator";
      const tradingPeriod = 7 * 24 * 60 * 60;
      const fee = ethers.parseEther("0.1");
      
      await friendGroupFactory.connect(addr1).createOneVsOneMarket(
        addr2.address,
        description,
        tradingPeriod,
        arbitrator.address,
        0,
        { value: fee }
      );
    });

    it("Should allow creator to resolve market", async function () {
      await expect(
        friendGroupFactory.connect(addr1).resolveFriendMarket(0, true)
      ).to.emit(friendGroupFactory, "MarketResolved");
      
      const market = await friendGroupFactory.getFriendMarket(0);
      expect(market.active).to.equal(false);
    });

    it("Should allow arbitrator to resolve market", async function () {
      await expect(
        friendGroupFactory.connect(arbitrator).resolveFriendMarket(0, false)
      ).to.emit(friendGroupFactory, "MarketResolved");
      
      const market = await friendGroupFactory.getFriendMarket(0);
      expect(market.active).to.equal(false);
    });

    it("Should reject resolution by unauthorized party", async function () {
      await expect(
        friendGroupFactory.connect(addr3).resolveFriendMarket(0, true)
      ).to.be.revertedWith("Not authorized to resolve");
    });

    it("Should reject resolution of already resolved market", async function () {
      await friendGroupFactory.connect(addr1).resolveFriendMarket(0, true);
      
      await expect(
        friendGroupFactory.connect(addr1).resolveFriendMarket(0, true)
      ).to.be.revertedWith("Market not active");
    });
  });

  describe("Fee Management", function () {
    it("Should accumulate fees from market creation", async function () {
      const fee = ethers.parseEther("0.1");
      
      await friendGroupFactory.connect(addr1).createOneVsOneMarket(
        addr2.address,
        "Test",
        7 * 24 * 60 * 60,
        ethers.ZeroAddress,
        0,
        { value: fee }
      );
      
      const balance = await ethers.provider.getBalance(await friendGroupFactory.getAddress());
      expect(balance).to.be.gt(0);
    });

    it("Should allow owner to withdraw fees", async function () {
      const fee = ethers.parseEther("0.1");
      
      await friendGroupFactory.connect(addr1).createOneVsOneMarket(
        addr2.address,
        "Test",
        7 * 24 * 60 * 60,
        ethers.ZeroAddress,
        0,
        { value: fee }
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
      const fee = ethers.parseEther("0.1");
      
      await friendGroupFactory.connect(addr1).createOneVsOneMarket(
        addr2.address,
        "Bet 1",
        7 * 24 * 60 * 60,
        ethers.ZeroAddress,
        0,
        { value: fee }
      );
      
      await friendGroupFactory.createSmallGroupMarket(
        "Bet 2",
        [addr1.address, addr3.address],
        5,
        7 * 24 * 60 * 60,
        ethers.ZeroAddress,
        0,
        { value: ethers.parseEther("0.2") }
      );
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
      ).to.be.revertedWith("Invalid address");
      
      await expect(
        friendGroupFactory.updateRagequitModule(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid address");
    });
  });

  describe("Market Pegging", function () {
    it("Should create market with pegging parameter", async function () {
      const description = "Bet on event";
      const tradingPeriod = 7 * 24 * 60 * 60;
      const fee = ethers.parseEther("0.1");
      
      // First create a "public" market to peg to
      await friendGroupFactory.createSmallGroupMarket(
        "Public market",
        [owner.address],
        5,
        tradingPeriod,
        ethers.ZeroAddress,
        0,
        { value: ethers.parseEther("0.2") }
      );
      
      const publicMarket = await friendGroupFactory.getFriendMarket(0);
      const publicMarketId = publicMarket.marketId;
      
      // Create pegged friend market
      await friendGroupFactory.connect(addr1).createOneVsOneMarket(
        addr2.address,
        description,
        tradingPeriod,
        ethers.ZeroAddress,
        publicMarketId,
        { value: fee }
      );
      
      const market = await friendGroupFactory.getFriendMarket(1);
      expect(market.peggedPublicMarketId).to.equal(publicMarketId);
      expect(market.autoPegged).to.equal(true);
    });

    it("Should allow pegging existing market to public market", async function () {
      const tradingPeriod = 7 * 24 * 60 * 60;
      const fee = ethers.parseEther("0.1");
      
      // Create public market
      await friendGroupFactory.createSmallGroupMarket(
        "Public market",
        [owner.address],
        5,
        tradingPeriod,
        ethers.ZeroAddress,
        0,
        { value: ethers.parseEther("0.2") }
      );
      
      const publicMarket = await friendGroupFactory.getFriendMarket(0);
      const publicMarketId = publicMarket.marketId;
      
      // Create unpegged friend market
      await friendGroupFactory.connect(addr1).createOneVsOneMarket(
        addr2.address,
        "Test",
        tradingPeriod,
        ethers.ZeroAddress,
        0,
        { value: fee }
      );
      
      // Peg it
      await expect(
        friendGroupFactory.connect(addr1).pegToPublicMarket(1, publicMarketId)
      ).to.emit(friendGroupFactory, "MarketPeggedToPublic");
      
      const market = await friendGroupFactory.getFriendMarket(1);
      expect(market.autoPegged).to.equal(true);
    });

    it("Should track pegged markets correctly", async function () {
      const tradingPeriod = 7 * 24 * 60 * 60;
      const fee = ethers.parseEther("0.1");
      
      // Create public market
      await friendGroupFactory.createSmallGroupMarket(
        "Public market",
        [owner.address],
        5,
        tradingPeriod,
        ethers.ZeroAddress,
        0,
        { value: ethers.parseEther("0.2") }
      );
      
      const publicMarket = await friendGroupFactory.getFriendMarket(0);
      const publicMarketId = publicMarket.marketId;
      
      // Create two pegged markets
      await friendGroupFactory.connect(addr1).createOneVsOneMarket(
        addr2.address,
        "Bet 1",
        tradingPeriod,
        ethers.ZeroAddress,
        publicMarketId,
        { value: fee }
      );
      
      await friendGroupFactory.connect(addr3).createOneVsOneMarket(
        addr4.address,
        "Bet 2",
        tradingPeriod,
        ethers.ZeroAddress,
        publicMarketId,
        { value: fee }
      );
      
      const peggedMarkets = await friendGroupFactory.getPeggedFriendMarkets(publicMarketId);
      expect(peggedMarkets.length).to.equal(2);
    });
  });
});
