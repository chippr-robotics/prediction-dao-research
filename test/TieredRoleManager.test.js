const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("TieredRoleManager - Unit Tests", function () {
  let tieredRoleManager;
  let owner, user1, user2, user3;
  
  // Role constants
  let MARKET_MAKER_ROLE, CLEARPATH_USER_ROLE, TOKENMINT_ROLE;
  
  // Tier enum values
  const Tier = {
    NONE: 0,
    BRONZE: 1,
    SILVER: 2,
    GOLD: 3,
    PLATINUM: 4
  };

  beforeEach(async function () {
    [owner, user1, user2, user3] = await ethers.getSigners();
    
    const TieredRoleManager = await ethers.getContractFactory("TieredRoleManager");
    tieredRoleManager = await TieredRoleManager.deploy();
    await tieredRoleManager.waitForDeployment();
    
    // Initialize role metadata and all tiers
    await tieredRoleManager.initializeRoleMetadata();
    await tieredRoleManager.initializeMarketMakerTiers();
    await tieredRoleManager.initializeClearPathTiers();
    await tieredRoleManager.initializeTokenMintTiers();
    await tieredRoleManager.initializeFriendMarketTiers();
    
    MARKET_MAKER_ROLE = await tieredRoleManager.MARKET_MAKER_ROLE();
    CLEARPATH_USER_ROLE = await tieredRoleManager.CLEARPATH_USER_ROLE();
    TOKENMINT_ROLE = await tieredRoleManager.TOKENMINT_ROLE();
  });

  describe("Tier Initialization", function () {
    it("Should initialize all tiers for Market Maker", async function () {
      const bronze = await tieredRoleManager.getTierMetadata(MARKET_MAKER_ROLE, Tier.BRONZE);
      expect(bronze.name).to.equal("Market Maker Bronze");
      expect(bronze.price).to.equal(ethers.parseEther("100"));
      
      const platinum = await tieredRoleManager.getTierMetadata(MARKET_MAKER_ROLE, Tier.PLATINUM);
      expect(platinum.name).to.equal("Market Maker Platinum");
      expect(platinum.price).to.equal(ethers.parseEther("500"));
    });

    it("Should initialize different limits for each tier", async function () {
      const bronzeLimits = await tieredRoleManager.getTierLimits(MARKET_MAKER_ROLE, Tier.BRONZE);
      expect(bronzeLimits.dailyBetLimit).to.equal(10);
      expect(bronzeLimits.monthlyMarketCreation).to.equal(5);
      
      const goldLimits = await tieredRoleManager.getTierLimits(MARKET_MAKER_ROLE, Tier.GOLD);
      expect(goldLimits.dailyBetLimit).to.equal(100);
      expect(goldLimits.monthlyMarketCreation).to.equal(50);
    });
  });

  describe("Tier Purchase", function () {
    it("Should allow purchasing role at specific tier", async function () {
      const price = ethers.parseEther("100");
      
      await expect(
        tieredRoleManager.connect(user1).purchaseRoleWithTier(MARKET_MAKER_ROLE, Tier.BRONZE, { value: price })
      ).to.emit(tieredRoleManager, "TierPurchased");
      
      expect(await tieredRoleManager.hasRole(MARKET_MAKER_ROLE, user1.address)).to.equal(true);
      expect(await tieredRoleManager.getUserTier(user1.address, MARKET_MAKER_ROLE)).to.equal(Tier.BRONZE);
    });

    it("Should allow purchasing higher tier directly", async function () {
      const price = ethers.parseEther("250");
      
      await tieredRoleManager.connect(user1).purchaseRoleWithTier(MARKET_MAKER_ROLE, Tier.GOLD, { value: price });
      
      expect(await tieredRoleManager.getUserTier(user1.address, MARKET_MAKER_ROLE)).to.equal(Tier.GOLD);
    });

    it("Should reject insufficient payment", async function () {
      const insufficientPrice = ethers.parseEther("50");
      
      await expect(
        tieredRoleManager.connect(user1).purchaseRoleWithTier(MARKET_MAKER_ROLE, Tier.BRONZE, { value: insufficientPrice })
      ).to.be.revertedWith("Insufficient payment");
    });
  });

  describe("Tier Upgrades", function () {
    beforeEach(async function () {
      // User1 starts with Bronze
      await tieredRoleManager.connect(user1).purchaseRoleWithTier(
        MARKET_MAKER_ROLE, 
        Tier.BRONZE, 
        { value: ethers.parseEther("100") }
      );
    });

    it("Should allow upgrading to higher tier", async function () {
      const upgradePrice = ethers.parseEther("150");
      
      await expect(
        tieredRoleManager.connect(user1).upgradeTier(MARKET_MAKER_ROLE, Tier.SILVER, { value: upgradePrice })
      ).to.emit(tieredRoleManager, "TierUpgraded")
        .withArgs(user1.address, MARKET_MAKER_ROLE, Tier.BRONZE, Tier.SILVER);
      
      expect(await tieredRoleManager.getUserTier(user1.address, MARKET_MAKER_ROLE)).to.equal(Tier.SILVER);
    });

    it("Should reject downgrade attempt", async function () {
      await expect(
        tieredRoleManager.connect(user1).upgradeTier(MARKET_MAKER_ROLE, Tier.NONE, { value: 0 })
      ).to.be.revertedWith("Can only upgrade to higher tier");
    });

    it("Should allow multiple upgrades", async function () {
      // Upgrade to Silver
      await tieredRoleManager.connect(user1).upgradeTier(MARKET_MAKER_ROLE, Tier.SILVER, { value: ethers.parseEther("150") });
      
      // Upgrade to Gold
      await tieredRoleManager.connect(user1).upgradeTier(MARKET_MAKER_ROLE, Tier.GOLD, { value: ethers.parseEther("250") });
      
      // Upgrade to Platinum
      await tieredRoleManager.connect(user1).upgradeTier(MARKET_MAKER_ROLE, Tier.PLATINUM, { value: ethers.parseEther("500") });
      
      expect(await tieredRoleManager.getUserTier(user1.address, MARKET_MAKER_ROLE)).to.equal(Tier.PLATINUM);
    });
  });

  describe("Usage Limits - Betting", function () {
    beforeEach(async function () {
      // User1 has Bronze (10 daily bets)
      await tieredRoleManager.connect(user1).purchaseRoleWithTier(
        MARKET_MAKER_ROLE,
        Tier.BRONZE,
        { value: ethers.parseEther("100") }
      );
      
      // User2 has Gold (100 daily bets)
      await tieredRoleManager.connect(user2).purchaseRoleWithTier(
        MARKET_MAKER_ROLE,
        Tier.GOLD,
        { value: ethers.parseEther("250") }
      );
    });

    it("Should enforce daily bet limit for Bronze tier", async function () {
      // Make 10 bets (Bronze limit)
      for (let i = 0; i < 10; i++) {
        const result = await tieredRoleManager.connect(user1).checkBetLimit.staticCall(MARKET_MAKER_ROLE);
        expect(result).to.equal(true);
        await tieredRoleManager.connect(user1).checkBetLimit(MARKET_MAKER_ROLE);
      }
      
      // 11th bet should fail
      const result = await tieredRoleManager.connect(user1).checkBetLimit.staticCall(MARKET_MAKER_ROLE);
      expect(result).to.equal(false);
    });

    it("Should allow more bets for higher tiers", async function () {
      // Gold can make 100 bets
      for (let i = 0; i < 100; i++) {
        const result = await tieredRoleManager.connect(user2).checkBetLimit.staticCall(MARKET_MAKER_ROLE);
        expect(result).to.equal(true);
        await tieredRoleManager.connect(user2).checkBetLimit(MARKET_MAKER_ROLE);
      }
      
      // 101st should fail
      const result = await tieredRoleManager.connect(user2).checkBetLimit.staticCall(MARKET_MAKER_ROLE);
      expect(result).to.equal(false);
    });

    it("Should reset limits after 24 hours", async function () {
      // Use all bets
      for (let i = 0; i < 10; i++) {
        await tieredRoleManager.connect(user1).checkBetLimit(MARKET_MAKER_ROLE);
      }
      
      const result1 = await tieredRoleManager.connect(user1).checkBetLimit.staticCall(MARKET_MAKER_ROLE);
      expect(result1).to.equal(false);
      
      // Advance time 24 hours
      await time.increase(24 * 60 * 60 + 1);
      
      // Should be able to bet again
      const result2 = await tieredRoleManager.connect(user1).checkBetLimit.staticCall(MARKET_MAKER_ROLE);
      expect(result2).to.equal(true);
    });
  });

  describe("Usage Limits - Market Creation", function () {
    beforeEach(async function () {
      await tieredRoleManager.connect(user1).purchaseRoleWithTier(
        MARKET_MAKER_ROLE,
        Tier.BRONZE, // 5 monthly markets
        { value: ethers.parseEther("100") }
      );
    });

    it("Should enforce monthly market creation limit", async function () {
      // Bronze allows 5 monthly markets but only 3 concurrent
      // Create 3 markets
      for (let i = 0; i < 3; i++) {
        const result = await tieredRoleManager.connect(user1).checkMarketCreationLimit.staticCall(MARKET_MAKER_ROLE);
        expect(result).to.equal(true);
        await tieredRoleManager.connect(user1).checkMarketCreationLimit(MARKET_MAKER_ROLE);
      }
      
      // Close 2 markets to free up concurrent slots
      await tieredRoleManager.connect(user1).recordMarketClosure(MARKET_MAKER_ROLE);
      await tieredRoleManager.connect(user1).recordMarketClosure(MARKET_MAKER_ROLE);
      
      // Create 2 more (total 5 monthly)
      for (let i = 0; i < 2; i++) {
        const result = await tieredRoleManager.connect(user1).checkMarketCreationLimit.staticCall(MARKET_MAKER_ROLE);
        expect(result).to.equal(true);
        await tieredRoleManager.connect(user1).checkMarketCreationLimit(MARKET_MAKER_ROLE);
      }
      
      // 6th should fail (monthly limit reached)
      const result = await tieredRoleManager.connect(user1).checkMarketCreationLimit.staticCall(MARKET_MAKER_ROLE);
      expect(result).to.equal(false);
    });

    it("Should enforce concurrent market limit", async function () {
      // Create 3 markets (Bronze concurrent limit)
      for (let i = 0; i < 3; i++) {
        await tieredRoleManager.connect(user1).checkMarketCreationLimit(MARKET_MAKER_ROLE);
      }
      
      // 4th should fail (concurrent limit)
      const result1 = await tieredRoleManager.connect(user1).checkMarketCreationLimit.staticCall(MARKET_MAKER_ROLE);
      expect(result1).to.equal(false);
      
      // Close one market
      await tieredRoleManager.connect(user1).recordMarketClosure(MARKET_MAKER_ROLE);
      
      // Should be able to create another
      const result2 = await tieredRoleManager.connect(user1).checkMarketCreationLimit.staticCall(MARKET_MAKER_ROLE);
      expect(result2).to.equal(true);
    });
  });

  describe("Feature Access", function () {
    it("Bronze should not have access to private markets", async function () {
      await tieredRoleManager.connect(user1).purchaseRoleWithTier(
        MARKET_MAKER_ROLE,
        Tier.BRONZE,
        { value: ethers.parseEther("100") }
      );
      
      expect(await tieredRoleManager.canCreatePrivateMarkets(user1.address, MARKET_MAKER_ROLE)).to.equal(false);
    });

    it("Gold should have access to private markets", async function () {
      await tieredRoleManager.connect(user1).purchaseRoleWithTier(
        MARKET_MAKER_ROLE,
        Tier.GOLD,
        { value: ethers.parseEther("250") }
      );
      
      expect(await tieredRoleManager.canCreatePrivateMarkets(user1.address, MARKET_MAKER_ROLE)).to.equal(true);
    });

    it("Should provide correct fee discounts", async function () {
      // Bronze - no discount
      await tieredRoleManager.connect(user1).purchaseRoleWithTier(
        MARKET_MAKER_ROLE,
        Tier.BRONZE,
        { value: ethers.parseEther("100") }
      );
      expect(await tieredRoleManager.getFeeDiscount(user1.address, MARKET_MAKER_ROLE)).to.equal(0);
      
      // Platinum - 20% discount
      await tieredRoleManager.connect(user2).purchaseRoleWithTier(
        MARKET_MAKER_ROLE,
        Tier.PLATINUM,
        { value: ethers.parseEther("500") }
      );
      expect(await tieredRoleManager.getFeeDiscount(user2.address, MARKET_MAKER_ROLE)).to.equal(2000); // 20% in basis points
    });
  });

  describe("ClearPath Tiers", function () {
    it("Should have different limits for ClearPath roles", async function () {
      const bronzeLimits = await tieredRoleManager.getTierLimits(CLEARPATH_USER_ROLE, Tier.BRONZE);
      expect(bronzeLimits.dailyBetLimit).to.equal(5); // ClearPath Bronze
      
      const goldLimits = await tieredRoleManager.getTierLimits(CLEARPATH_USER_ROLE, Tier.GOLD);
      expect(goldLimits.dailyBetLimit).to.equal(50); // ClearPath Gold
    });

    it("Should allow purchasing ClearPath tiers", async function () {
      await tieredRoleManager.connect(user1).purchaseRoleWithTier(
        CLEARPATH_USER_ROLE,
        Tier.SILVER,
        { value: ethers.parseEther("200") }
      );
      
      expect(await tieredRoleManager.hasRole(CLEARPATH_USER_ROLE, user1.address)).to.equal(true);
      expect(await tieredRoleManager.getUserTier(user1.address, CLEARPATH_USER_ROLE)).to.equal(Tier.SILVER);
    });
  });

  describe("TokenMint Tiers", function () {
    it("Should have appropriate limits for token operations", async function () {
      const bronzeLimits = await tieredRoleManager.getTierLimits(TOKENMINT_ROLE, Tier.BRONZE);
      expect(bronzeLimits.monthlyMarketCreation).to.equal(10); // Monthly mints
      expect(bronzeLimits.maxConcurrentMarkets).to.equal(5); // Active contracts
      
      const platinumLimits = await tieredRoleManager.getTierLimits(TOKENMINT_ROLE, Tier.PLATINUM);
      expect(platinumLimits.monthlyMarketCreation).to.equal(ethers.MaxUint256); // Unlimited
    });
  });
});
