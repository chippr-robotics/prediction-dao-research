import { expect } from "chai";
import hre from "hardhat";

describe("Real Payments Processing - E2E Tests", function () {
  let ethers;
  let roleManager, tieredRoleManager, paymentManager;
  let mockUSDC, mockDAI;
  let owner, treasury, alice, bob, charlie;

  let MARKET_MAKER_ROLE, CLEARPATH_USER_ROLE, TOKENMINT_ROLE;

  before(async function () {
    const connection = await hre.network.connect();
    ethers = connection.ethers;
    [owner, treasury, alice, bob, charlie] = await ethers.getSigners();
    
    // Deploy mock stablecoins
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockUSDC = await MockERC20.deploy("USD Coin", "USDC", ethers.parseUnits("10000000", 6));
    await mockUSDC.waitForDeployment();
    
    mockDAI = await MockERC20.deploy("Dai Stablecoin", "DAI", ethers.parseEther("10000000"));
    await mockDAI.waitForDeployment();
    
    // Deploy payment manager
    const MembershipPaymentManager = await ethers.getContractFactory("MembershipPaymentManager");
    paymentManager = await MembershipPaymentManager.deploy(treasury.address);
    await paymentManager.waitForDeployment();
    
    // Deploy role managers
    const RoleManager = await ethers.getContractFactory("RoleManager");
    roleManager = await RoleManager.deploy();
    await roleManager.waitForDeployment();
    
    const TieredRoleManager = await ethers.getContractFactory("TieredRoleManager");
    tieredRoleManager = await TieredRoleManager.deploy();
    await tieredRoleManager.waitForDeployment();
    
    // Initialize role metadata
    await roleManager.initializeRoleMetadata();
    await tieredRoleManager.initializeRoleMetadata();
    
    // Get role identifiers
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
    
    // Configure payment manager with stablecoins
    await paymentManager.addPaymentToken(await mockUSDC.getAddress(), "USDC", 6);
    await paymentManager.addPaymentToken(await mockDAI.getAddress(), "DAI", 18);
    
    // Set prices (aligned with prediction market stablecoin usage)
    await paymentManager.setRolePrice(
      MARKET_MAKER_ROLE,
      await mockUSDC.getAddress(),
      ethers.parseUnits("100", 6) // 100 USDC
    );
    
    await paymentManager.setRolePrice(
      CLEARPATH_USER_ROLE,
      await mockUSDC.getAddress(),
      ethers.parseUnits("250", 6) // 250 USDC
    );
    
    await paymentManager.setRolePrice(
      TOKENMINT_ROLE,
      await mockDAI.getAddress(),
      ethers.parseEther("150") // 150 DAI
    );
    
    // Connect payment manager to role managers
    await roleManager.setPaymentManager(await paymentManager.getAddress());
    await tieredRoleManager.setPaymentManager(await paymentManager.getAddress());
    
    // Distribute tokens to users
    await mockUSDC.mint(alice.address, ethers.parseUnits("10000", 6));
    await mockUSDC.mint(bob.address, ethers.parseUnits("10000", 6));
    await mockDAI.mint(charlie.address, ethers.parseEther("10000"));
  });

  describe("E2E Scenario 1: Basic Role Purchase with USDC", function () {
    it("Alice purchases Market Maker role with USDC", async function () {
      const price = ethers.parseUnits("100", 6);
      
      // Alice approves and purchases
      await mockUSDC.connect(alice).approve(await roleManager.getAddress(), price);
      
      await roleManager.connect(alice).purchaseRoleWithToken(
        MARKET_MAKER_ROLE,
        await mockUSDC.getAddress(),
        price
      );
      
      // Verify role granted
      expect(await roleManager.hasRole(MARKET_MAKER_ROLE, alice.address)).to.equal(true);
      
      // Verify payment reached treasury
      expect(await mockUSDC.balanceOf(treasury.address)).to.equal(price);
      
      // Verify payment tracked
      const payments = await paymentManager.getUserPayments(alice.address);
      expect(payments.length).to.equal(1);
    });

    it("Tracks Alice's purchase history", async function () {
      const payments = await paymentManager.getUserPayments(alice.address);
      const payment = await paymentManager.payments(payments[0]);
      
      expect(payment.buyer).to.equal(alice.address);
      expect(payment.role).to.equal(MARKET_MAKER_ROLE);
      expect(payment.amount).to.equal(ethers.parseUnits("100", 6));
      expect(payment.paymentToken).to.equal(await mockUSDC.getAddress());
    });
  });

  describe("E2E Scenario 2: Multiple Payment Methods", function () {
    it("Bob purchases different roles with different tokens", async function () {
      // Bob buys CLEARPATH with USDC
      const clearPathPrice = ethers.parseUnits("250", 6);
      await mockUSDC.connect(bob).approve(await roleManager.getAddress(), clearPathPrice);
      
      await roleManager.connect(bob).purchaseRoleWithToken(
        CLEARPATH_USER_ROLE,
        await mockUSDC.getAddress(),
        clearPathPrice
      );
      
      expect(await roleManager.hasRole(CLEARPATH_USER_ROLE, bob.address)).to.equal(true);
      
      // Charlie buys TOKENMINT with DAI
      const tokenMintPrice = ethers.parseEther("150");
      await mockDAI.connect(charlie).approve(await roleManager.getAddress(), tokenMintPrice);
      
      await roleManager.connect(charlie).purchaseRoleWithToken(
        TOKENMINT_ROLE,
        await mockDAI.getAddress(),
        tokenMintPrice
      );
      
      expect(await roleManager.hasRole(TOKENMINT_ROLE, charlie.address)).to.equal(true);
      
      // Verify revenue tracking by token
      expect(await paymentManager.revenueByToken(await mockUSDC.getAddress())).to.equal(
        ethers.parseUnits("350", 6) // 100 + 250
      );
      expect(await paymentManager.revenueByToken(await mockDAI.getAddress())).to.equal(
        ethers.parseEther("150")
      );
    });
  });

  describe("E2E Scenario 3: Tiered Membership Purchases", function () {
    it.skip("Alice upgrades to tiered Market Maker role", async function () {
      // Alice already has basic MARKET_MAKER_ROLE
      // Now purchase Bronze tier via TieredRoleManager
      
      const bronzePrice = ethers.parseUnits("100", 6);
      
      await paymentManager.setRolePrice(
        MARKET_MAKER_ROLE,
        await mockUSDC.getAddress(),
        bronzePrice
      );
      
      await mockUSDC.connect(alice).approve(await tieredRoleManager.getAddress(), bronzePrice);
      
      // Note: Alice has basic role from roleManager, but no tier in tieredRoleManager
      // For production, might want to migrate or have tieredRoleManager check roleManager
      // For now, let's use Bob who doesn't have the role yet
      await mockUSDC.connect(bob).approve(await tieredRoleManager.getAddress(), bronzePrice);
      
      await tieredRoleManager.connect(bob).purchaseRoleWithTierToken(
        MARKET_MAKER_ROLE,
        1, // BRONZE
        await mockUSDC.getAddress(),
        bronzePrice
      );
      
      expect(await tieredRoleManager.getUserTier(bob.address, MARKET_MAKER_ROLE)).to.equal(1);
      expect(await tieredRoleManager.hasRole(MARKET_MAKER_ROLE, bob.address)).to.equal(true);
    });

    it.skip("Bob upgrades his tier from Bronze to Silver", async function () {
      const silverPrice = ethers.parseUnits("150", 6);
      
      await paymentManager.setRolePrice(
        MARKET_MAKER_ROLE,
        await mockUSDC.getAddress(),
        silverPrice
      );
      
      await mockUSDC.connect(bob).approve(await tieredRoleManager.getAddress(), silverPrice);
      
      await tieredRoleManager.connect(bob).upgradeTierWithToken(
        MARKET_MAKER_ROLE,
        2, // SILVER
        await mockUSDC.getAddress(),
        silverPrice
      );
      
      expect(await tieredRoleManager.getUserTier(bob.address, MARKET_MAKER_ROLE)).to.equal(2);
      
      // Verify Bob has multiple payment history entries
      const payments = await paymentManager.getUserPayments(bob.address);
      expect(payments.length).to.be.gte(3); // CLEARPATH + Bronze + Silver
    });
  });

  describe("E2E Scenario 4: Payment Routing", function () {
    it("Configure and test payment routing to multiple recipients", async function () {
      // Setup 60% to treasury, 40% to charity
      const charityWallet = charlie.address;
      
      await paymentManager.setPaymentRouting(
        [treasury.address, charityWallet],
        [6000, 4000] // 60% and 40%
      );
      
      // New user purchases role - need to set price for TOKENMINT with USDC first
      await paymentManager.setRolePrice(
        TOKENMINT_ROLE,
        await mockUSDC.getAddress(),
        ethers.parseUnits("100", 6)
      );
      
      const signers = await ethers.getSigners();
      const newUser = signers[5];
      await mockUSDC.mint(newUser.address, ethers.parseUnits("1000", 6));
      
      const price = ethers.parseUnits("100", 6);
      await mockUSDC.connect(newUser).approve(await roleManager.getAddress(), price);
      
      const treasuryBefore = await mockUSDC.balanceOf(treasury.address);
      const charityBefore = await mockUSDC.balanceOf(charityWallet);
      
      await roleManager.connect(newUser).purchaseRoleWithToken(
        TOKENMINT_ROLE,
        await mockUSDC.getAddress(),
        price
      );
      
      const treasuryAfter = await mockUSDC.balanceOf(treasury.address);
      const charityAfter = await mockUSDC.balanceOf(charityWallet);
      
      expect(treasuryAfter - treasuryBefore).to.equal(ethers.parseUnits("60", 6));
      expect(charityAfter - charityBefore).to.equal(ethers.parseUnits("40", 6));
    });
  });

  describe("E2E Scenario 5: Dynamic Pricing Adjustments", function () {
    it("Admin adjusts prices and users purchase at new prices", async function () {
      // Increase Market Maker price
      const newPrice = ethers.parseUnits("200", 6); // Double the price
      
      await paymentManager.setRolePrice(
        MARKET_MAKER_ROLE,
        await mockUSDC.getAddress(),
        newPrice
      );
      
      // New user purchases at new price
      const signers = await ethers.getSigners();
      const newUser2 = signers[5];
      await mockUSDC.mint(newUser2.address, ethers.parseUnits("1000", 6));
      
      await mockUSDC.connect(newUser2).approve(await roleManager.getAddress(), newPrice);
      
      // Old price would fail
      await expect(
        roleManager.connect(newUser2).purchaseRoleWithToken(
          MARKET_MAKER_ROLE,
          await mockUSDC.getAddress(),
          ethers.parseUnits("100", 6) // Old price
        )
      ).to.be.revertedWith("Insufficient payment amount");
      
      // New price works
      await roleManager.connect(newUser2).purchaseRoleWithToken(
        MARKET_MAKER_ROLE,
        await mockUSDC.getAddress(),
        newPrice
      );
      
      expect(await roleManager.hasRole(MARKET_MAKER_ROLE, newUser2.address)).to.equal(true);
    });
  });

  describe("E2E Scenario 6: Refund Flow", function () {
    it("Admin refunds a payment for dispute resolution", async function () {
      const alicePayments = await paymentManager.getUserPayments(alice.address);
      const paymentId = alicePayments[0];
      
      // Get payment details
      const payment = await paymentManager.payments(paymentId);
      const refundAmount = payment.amount;
      
      // Mint tokens to payment manager for refund
      await mockUSDC.mint(await paymentManager.getAddress(), refundAmount);
      
      const aliceBalanceBefore = await mockUSDC.balanceOf(alice.address);
      
      await paymentManager.refundPayment(paymentId);
      
      const aliceBalanceAfter = await mockUSDC.balanceOf(alice.address);
      
      expect(aliceBalanceAfter - aliceBalanceBefore).to.equal(refundAmount);
      
      // Verify payment marked as refunded
      const refundedPayment = await paymentManager.payments(paymentId);
      expect(refundedPayment.isRefunded).to.equal(true);
    });
  });

  describe("E2E Scenario 7: Emergency Controls", function () {
    it("Admin pauses system and resumes", async function () {
      // Pause
      await paymentManager.pause();
      
      // Purchases should fail
      const signers = await ethers.getSigners();
      const testUser = signers[6];
      await mockUSDC.mint(testUser.address, ethers.parseUnits("1000", 6));
      
      const price = ethers.parseUnits("200", 6); // Use current price
      await mockUSDC.connect(testUser).approve(await roleManager.getAddress(), price);
      
      await expect(
        roleManager.connect(testUser).purchaseRoleWithToken(
          MARKET_MAKER_ROLE,
          await mockUSDC.getAddress(),
          price
        )
      ).to.be.revertedWithCustomError(paymentManager, "EnforcedPause");
      
      // Unpause
      await paymentManager.unpause();
      
      // Purchases work again
      await roleManager.connect(testUser).purchaseRoleWithToken(
        MARKET_MAKER_ROLE,
        await mockUSDC.getAddress(),
        price
      );
      
      expect(await roleManager.hasRole(MARKET_MAKER_ROLE, testUser.address)).to.equal(true);
    });
  });

  describe("E2E Scenario 8: Legacy ETH Compatibility", function () {
    it("Users can still purchase with ETH alongside ERC20", async function () {
      const signers = await ethers.getSigners();
      const ethUser = signers[7];
      const ethPrice = ethers.parseEther("250"); // Match metadata price for CLEARPATH
      
      // Purchase with ETH (legacy method) - using CLEARPATH to avoid duplicate
      await roleManager.connect(ethUser).purchaseRole(CLEARPATH_USER_ROLE, { value: ethPrice });
      
      expect(await roleManager.hasRole(CLEARPATH_USER_ROLE, ethUser.address)).to.equal(true);
      
      // Verify both payment methods work in same system
      const tokenUser = signers[8];
      await mockUSDC.mint(tokenUser.address, ethers.parseUnits("1000", 6));
      
      const usdcPrice = ethers.parseUnits("200", 6); // Use current price for MARKET_MAKER
      await mockUSDC.connect(tokenUser).approve(await roleManager.getAddress(), usdcPrice);
      
      await roleManager.connect(tokenUser).purchaseRoleWithToken(
        MARKET_MAKER_ROLE,
        await mockUSDC.getAddress(),
        usdcPrice
      );
      
      expect(await roleManager.hasRole(MARKET_MAKER_ROLE, tokenUser.address)).to.equal(true);
    });
  });
});
