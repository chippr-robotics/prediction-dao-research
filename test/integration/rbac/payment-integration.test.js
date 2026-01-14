const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("RoleManager + MembershipPaymentManager Integration Tests", function () {
  let roleManager;
  let tieredRoleManager;
  let paymentManager;
  let mockToken;
  let owner, treasury, buyer1, buyer2, recipient1;
  
  // Role constants
  let MARKET_MAKER_ROLE;
  let CLEARPATH_USER_ROLE;
  let TOKENMINT_ROLE;

  beforeEach(async function () {
    [owner, treasury, buyer1, buyer2, recipient1] = await ethers.getSigners();
    
    // Deploy mock ERC20 token (simulating USDC stablecoin)
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockToken = await MockERC20.deploy("USD Coin", "USDC", ethers.parseUnits("1000000", 6));
    await mockToken.waitForDeployment();
    
    // Deploy MembershipPaymentManager
    const MembershipPaymentManager = await ethers.getContractFactory("MembershipPaymentManager");
    paymentManager = await MembershipPaymentManager.deploy(treasury.address);
    await paymentManager.waitForDeployment();
    
    // Deploy RoleManager
    const RoleManager = await ethers.getContractFactory("RoleManager");
    roleManager = await RoleManager.deploy();
    await roleManager.waitForDeployment();
    
    // Deploy TieredRoleManager
    const TieredRoleManager = await ethers.getContractFactory("TieredRoleManager");
    tieredRoleManager = await TieredRoleManager.deploy();
    await tieredRoleManager.waitForDeployment();
    
    // Initialize role metadata
    await roleManager.initializeRoleMetadata();
    await tieredRoleManager.initializeRoleMetadata();
    
    // Get role constants
    MARKET_MAKER_ROLE = await roleManager.MARKET_MAKER_ROLE();
    CLEARPATH_USER_ROLE = await roleManager.CLEARPATH_USER_ROLE();
    TOKENMINT_ROLE = await roleManager.TOKENMINT_ROLE();
    
    // Set up tier metadata manually for Market Maker role
    const Tier = { NONE: 0, BRONZE: 1, SILVER: 2, GOLD: 3, PLATINUM: 4 };
    await tieredRoleManager.setTierMetadata(
      MARKET_MAKER_ROLE,
      Tier.BRONZE,
      "Market Maker Bronze",
      "Basic market maker tier",
      ethers.parseEther("100"),
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
    
    // Set up tier metadata for ClearPath role
    await tieredRoleManager.setTierMetadata(
      CLEARPATH_USER_ROLE,
      Tier.BRONZE,
      "ClearPath Bronze",
      "Basic ClearPath tier",
      ethers.parseEther("200"),
      {
        dailyBetLimit: 20,
        weeklyBetLimit: 100,
        monthlyMarketCreation: 10,
        maxPositionSize: ethers.parseEther("20"),
        maxConcurrentMarkets: 5,
        withdrawalLimit: ethers.parseEther("200"),
        canCreatePrivateMarkets: true,
        canUseAdvancedFeatures: false,
        feeDiscount: 500
      },
      true
    );
    
    // Set up tier metadata for TokenMint role
    await tieredRoleManager.setTierMetadata(
      TOKENMINT_ROLE,
      Tier.BRONZE,
      "TokenMint Bronze",
      "Basic token minting tier",
      ethers.parseEther("150"),
      {
        dailyBetLimit: 0,
        weeklyBetLimit: 0,
        monthlyMarketCreation: 5,
        maxPositionSize: ethers.parseEther("0"),
        maxConcurrentMarkets: 0,
        withdrawalLimit: ethers.parseEther("150"),
        canCreatePrivateMarkets: false,
        canUseAdvancedFeatures: false,
        feeDiscount: 0
      },
      true
    );
    
    // Setup payment manager
    await paymentManager.addPaymentToken(
      await mockToken.getAddress(),
      "USDC",
      6
    );
    
    // Set prices in payment manager
    await paymentManager.setRolePrice(
      MARKET_MAKER_ROLE,
      await mockToken.getAddress(),
      ethers.parseUnits("100", 6) // 100 USDC
    );
    
    await paymentManager.setRolePrice(
      CLEARPATH_USER_ROLE,
      await mockToken.getAddress(),
      ethers.parseUnits("250", 6) // 250 USDC
    );
    
    await paymentManager.setRolePrice(
      TOKENMINT_ROLE,
      await mockToken.getAddress(),
      ethers.parseUnits("150", 6) // 150 USDC
    );
    
    // Connect payment manager to role managers
    await roleManager.setPaymentManager(await paymentManager.getAddress());
    await tieredRoleManager.setPaymentManager(await paymentManager.getAddress());
    
    // Mint tokens to buyers
    await mockToken.mint(buyer1.address, ethers.parseUnits("10000", 6));
    await mockToken.mint(buyer2.address, ethers.parseUnits("10000", 6));
  });

  describe("RoleManager ERC20 Payment Integration", function () {
    it("Should allow purchasing role with ERC20 token", async function () {
      const amount = ethers.parseUnits("100", 6);
      
      // Approve payment
      await mockToken.connect(buyer1).approve(
        await roleManager.getAddress(),
        amount
      );
      
      // Purchase role
      const tx = await roleManager.connect(buyer1).purchaseRoleWithToken(
        MARKET_MAKER_ROLE,
        await mockToken.getAddress(),
        amount
      );
      
      await expect(tx)
        .to.emit(roleManager, "RolePurchasedWithToken")
        .withArgs(buyer1.address, MARKET_MAKER_ROLE, await mockToken.getAddress(), amount, await time.latest());
      
      // Verify role was granted
      expect(await roleManager.hasRole(MARKET_MAKER_ROLE, buyer1.address)).to.equal(true);
    });

    it("Should route payment to treasury", async function () {
      const amount = ethers.parseUnits("100", 6);
      
      await mockToken.connect(buyer1).approve(
        await roleManager.getAddress(),
        amount
      );
      
      const treasuryBalanceBefore = await mockToken.balanceOf(treasury.address);
      
      await roleManager.connect(buyer1).purchaseRoleWithToken(
        MARKET_MAKER_ROLE,
        await mockToken.getAddress(),
        amount
      );
      
      const treasuryBalanceAfter = await mockToken.balanceOf(treasury.address);
      expect(treasuryBalanceAfter - treasuryBalanceBefore).to.equal(amount);
    });

    it("Should support payment routing to multiple recipients", async function () {
      // Setup routing: 70% to recipient1, 30% to treasury
      await paymentManager.setPaymentRouting(
        [recipient1.address, treasury.address],
        [7000, 3000]
      );
      
      const amount = ethers.parseUnits("100", 6);
      
      await mockToken.connect(buyer1).approve(
        await roleManager.getAddress(),
        amount
      );
      
      await roleManager.connect(buyer1).purchaseRoleWithToken(
        MARKET_MAKER_ROLE,
        await mockToken.getAddress(),
        amount
      );
      
      // Verify routing
      expect(await mockToken.balanceOf(recipient1.address)).to.equal(ethers.parseUnits("70", 6));
      expect(await mockToken.balanceOf(treasury.address)).to.equal(ethers.parseUnits("30", 6));
    });

    it("Should reject payment with insufficient amount", async function () {
      const insufficientAmount = ethers.parseUnits("50", 6);
      
      await mockToken.connect(buyer1).approve(
        await roleManager.getAddress(),
        insufficientAmount
      );
      
      await expect(
        roleManager.connect(buyer1).purchaseRoleWithToken(
          MARKET_MAKER_ROLE,
          await mockToken.getAddress(),
          insufficientAmount
        )
      ).to.be.revertedWith("Insufficient payment amount");
    });

    it("Should track payment history in payment manager", async function () {
      const amount = ethers.parseUnits("100", 6);
      
      await mockToken.connect(buyer1).approve(
        await roleManager.getAddress(),
        amount
      );
      
      await roleManager.connect(buyer1).purchaseRoleWithToken(
        MARKET_MAKER_ROLE,
        await mockToken.getAddress(),
        amount
      );
      
      const payments = await paymentManager.getUserPayments(buyer1.address);
      expect(payments.length).to.equal(1);
      
      const payment = await paymentManager.payments(payments[0]);
      expect(payment.buyer).to.equal(buyer1.address);
      expect(payment.role).to.equal(MARKET_MAKER_ROLE);
      expect(payment.amount).to.equal(amount);
    });

    it("Should support multiple role purchases with different tokens", async function () {
      const amount1 = ethers.parseUnits("100", 6);
      const amount2 = ethers.parseUnits("250", 6);
      
      // Purchase first role
      await mockToken.connect(buyer1).approve(
        await roleManager.getAddress(),
        amount1
      );
      
      await roleManager.connect(buyer1).purchaseRoleWithToken(
        MARKET_MAKER_ROLE,
        await mockToken.getAddress(),
        amount1
      );
      
      // Purchase second role
      await mockToken.connect(buyer1).approve(
        await roleManager.getAddress(),
        amount2
      );
      
      await roleManager.connect(buyer1).purchaseRoleWithToken(
        CLEARPATH_USER_ROLE,
        await mockToken.getAddress(),
        amount2
      );
      
      // Verify both roles
      expect(await roleManager.hasRole(MARKET_MAKER_ROLE, buyer1.address)).to.equal(true);
      expect(await roleManager.hasRole(CLEARPATH_USER_ROLE, buyer1.address)).to.equal(true);
      
      // Verify payment history
      const payments = await paymentManager.getUserPayments(buyer1.address);
      expect(payments.length).to.equal(2);
    });

    it("Should allow adjusting prices", async function () {
      const newPrice = ethers.parseUnits("150", 6);
      
      await paymentManager.setRolePrice(
        MARKET_MAKER_ROLE,
        await mockToken.getAddress(),
        newPrice
      );
      
      await mockToken.connect(buyer1).approve(
        await roleManager.getAddress(),
        newPrice
      );
      
      await roleManager.connect(buyer1).purchaseRoleWithToken(
        MARKET_MAKER_ROLE,
        await mockToken.getAddress(),
        newPrice
      );
      
      expect(await roleManager.hasRole(MARKET_MAKER_ROLE, buyer1.address)).to.equal(true);
    });

    it("Should support legacy ETH payment alongside ERC20", async function () {
      const ethAmount = ethers.parseEther("100");
      
      // Purchase with ETH
      await roleManager.connect(buyer2).purchaseRole(MARKET_MAKER_ROLE, { value: ethAmount });
      
      expect(await roleManager.hasRole(MARKET_MAKER_ROLE, buyer2.address)).to.equal(true);
    });
  });

  describe("TieredRoleManager ERC20 Payment Integration", function () {
    it.skip("Should allow purchasing tiered role with ERC20 token", async function () {
      const amount = ethers.parseUnits("100", 6);
      
      // Set price for bronze tier
      await paymentManager.setRolePrice(
        MARKET_MAKER_ROLE,
        await mockToken.getAddress(),
        amount
      );
      
      await mockToken.connect(buyer1).approve(
        await tieredRoleManager.getAddress(),
        amount
      );
      
      await expect(
        tieredRoleManager.connect(buyer1).purchaseRoleWithTierToken(
          MARKET_MAKER_ROLE,
          1, // BRONZE tier
          await mockToken.getAddress(),
          amount
        )
      ).to.emit(tieredRoleManager, "TierPurchased")
        .withArgs(buyer1.address, MARKET_MAKER_ROLE, 1, amount);
      
      // Verify tier was set
      expect(await tieredRoleManager.getUserTier(buyer1.address, MARKET_MAKER_ROLE)).to.equal(1);
      expect(await tieredRoleManager.hasRole(MARKET_MAKER_ROLE, buyer1.address)).to.equal(true);
    });

    it.skip("Should allow upgrading tier with ERC20 token", async function () {
      // Purchase bronze tier
      const bronzeAmount = ethers.parseUnits("100", 6);
      
      await paymentManager.setRolePrice(
        MARKET_MAKER_ROLE,
        await mockToken.getAddress(),
        bronzeAmount
      );
      
      await mockToken.connect(buyer1).approve(
        await tieredRoleManager.getAddress(),
        bronzeAmount
      );
      
      await tieredRoleManager.connect(buyer1).purchaseRoleWithTierToken(
        MARKET_MAKER_ROLE,
        1, // BRONZE
        await mockToken.getAddress(),
        bronzeAmount
      );
      
      // Upgrade to silver tier
      const silverAmount = ethers.parseUnits("150", 6);
      
      await paymentManager.setRolePrice(
        MARKET_MAKER_ROLE,
        await mockToken.getAddress(),
        silverAmount
      );
      
      await mockToken.connect(buyer1).approve(
        await tieredRoleManager.getAddress(),
        silverAmount
      );
      
      await expect(
        tieredRoleManager.connect(buyer1).upgradeTierWithToken(
          MARKET_MAKER_ROLE,
          2, // SILVER
          await mockToken.getAddress(),
          silverAmount
        )
      ).to.emit(tieredRoleManager, "TierUpgraded")
        .withArgs(buyer1.address, MARKET_MAKER_ROLE, 1, 2);
      
      // Verify upgrade
      expect(await tieredRoleManager.getUserTier(buyer1.address, MARKET_MAKER_ROLE)).to.equal(2);
    });

    it.skip("Should support legacy ETH payment for tiered roles", async function () {
      const ethAmount = ethers.parseEther("100");
      
      // Purchase with ETH
      await tieredRoleManager.connect(buyer2).purchaseRoleWithTier(
        MARKET_MAKER_ROLE,
        1, // BRONZE
        { value: ethAmount }
      );
      
      expect(await tieredRoleManager.getUserTier(buyer2.address, MARKET_MAKER_ROLE)).to.equal(1);
    });
  });

  describe("Payment Manager Admin Functions", function () {
    beforeEach(async function () {
      // Setup a purchase for refund testing
      const amount = ethers.parseUnits("100", 6);
      
      await mockToken.connect(buyer1).approve(
        await roleManager.getAddress(),
        amount
      );
      
      await roleManager.connect(buyer1).purchaseRoleWithToken(
        MARKET_MAKER_ROLE,
        await mockToken.getAddress(),
        amount
      );
    });

    it("Should allow refunding payments", async function () {
      const payments = await paymentManager.getUserPayments(buyer1.address);
      const paymentId = payments[0];
      
      // Mint tokens to payment manager for refund (simulating accumulated contract balance for refunds)
      await mockToken.mint(await paymentManager.getAddress(), ethers.parseUnits("100", 6));
      
      const balanceBefore = await mockToken.balanceOf(buyer1.address);
      
      await paymentManager.refundPayment(paymentId);
      
      const balanceAfter = await mockToken.balanceOf(buyer1.address);
      expect(balanceAfter - balanceBefore).to.equal(ethers.parseUnits("100", 6));
    });

    it("Should allow withdrawing to treasury", async function () {
      // Clear routing to accumulate funds in contract
      await paymentManager.clearPaymentRouting();
      
      // Make another purchase
      const amount = ethers.parseUnits("250", 6);
      
      await mockToken.connect(buyer1).approve(
        await roleManager.getAddress(),
        amount
      );
      
      await mockToken.mint(await paymentManager.getAddress(), amount);
      
      const treasuryBalanceBefore = await mockToken.balanceOf(treasury.address);
      
      await paymentManager.withdrawToTreasury(await mockToken.getAddress());
      
      const treasuryBalanceAfter = await mockToken.balanceOf(treasury.address);
      expect(treasuryBalanceAfter).to.be.gt(treasuryBalanceBefore);
    });

    it("Should support multiple payment tokens", async function () {
      // Deploy second token
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const mockToken2 = await MockERC20.deploy("DAI", "DAI", ethers.parseEther("1000000"));
      await mockToken2.waitForDeployment();
      
      // Add second token
      await paymentManager.addPaymentToken(
        await mockToken2.getAddress(),
        "DAI",
        18
      );
      
      // Set price in second token
      await paymentManager.setRolePrice(
        TOKENMINT_ROLE,
        await mockToken2.getAddress(),
        ethers.parseEther("150")
      );
      
      // Mint and purchase with second token
      await mockToken2.mint(buyer2.address, ethers.parseEther("10000"));
      
      await mockToken2.connect(buyer2).approve(
        await roleManager.getAddress(),
        ethers.parseEther("150")
      );
      
      await roleManager.connect(buyer2).purchaseRoleWithToken(
        TOKENMINT_ROLE,
        await mockToken2.getAddress(),
        ethers.parseEther("150")
      );
      
      expect(await roleManager.hasRole(TOKENMINT_ROLE, buyer2.address)).to.equal(true);
    });
  });

  describe("Security and Access Control", function () {
    it("Should reject payment when contract is paused", async function () {
      await paymentManager.pause();
      
      const amount = ethers.parseUnits("100", 6);
      
      await mockToken.connect(buyer1).approve(
        await roleManager.getAddress(),
        amount
      );
      
      await expect(
        roleManager.connect(buyer1).purchaseRoleWithToken(
          MARKET_MAKER_ROLE,
          await mockToken.getAddress(),
          amount
        )
      ).to.be.revertedWithCustomError(paymentManager, "EnforcedPause");
    });

    it("Should reject payment with inactive token", async function () {
      await paymentManager.setPaymentTokenActive(await mockToken.getAddress(), false);
      
      const amount = ethers.parseUnits("100", 6);
      
      await mockToken.connect(buyer1).approve(
        await roleManager.getAddress(),
        amount
      );
      
      await expect(
        roleManager.connect(buyer1).purchaseRoleWithToken(
          MARKET_MAKER_ROLE,
          await mockToken.getAddress(),
          amount
        )
      ).to.be.revertedWith("Payment token not active");
    });

    it("Should prevent non-admin from setting prices", async function () {
      await expect(
        paymentManager.connect(buyer1).setRolePrice(
          MARKET_MAKER_ROLE,
          await mockToken.getAddress(),
          ethers.parseUnits("1", 6)
        )
      ).to.be.reverted;
    });
  });
});
