import { expect } from "chai";
import hre from "hardhat";

describe("MembershipPaymentManager - Unit Tests", function () {
  let ethers;
  let paymentManager;
  let mockToken1, mockToken2;
  let owner, treasury, paymentAdmin, pricingAdmin, treasuryAdmin, buyer1, buyer2, recipient1, recipient2;

  // Role constants
  let DEFAULT_ADMIN_ROLE;
  let PAYMENT_ADMIN_ROLE;
  let PRICING_ADMIN_ROLE;
  let TREASURY_ADMIN_ROLE;

  // Test role identifiers
  let MARKET_MAKER_ROLE;
  let CLEARPATH_USER_ROLE;

  beforeEach(async function () {
    const connection = await hre.network.connect();
    ethers = connection.ethers;
    [owner, treasury, paymentAdmin, pricingAdmin, treasuryAdmin, buyer1, buyer2, recipient1, recipient2] = await ethers.getSigners();
    
    // Deploy mock ERC20 tokens
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockToken1 = await MockERC20.deploy("USD Coin", "USDC", ethers.parseUnits("1000000", 6));
    await mockToken1.waitForDeployment();
    
    mockToken2 = await MockERC20.deploy("Test Token", "TEST", ethers.parseEther("1000000"));
    await mockToken2.waitForDeployment();
    
    // Deploy MembershipPaymentManager
    const MembershipPaymentManager = await ethers.getContractFactory("MembershipPaymentManager");
    paymentManager = await MembershipPaymentManager.deploy(treasury.address);
    await paymentManager.waitForDeployment();
    
    // Get role constants
    DEFAULT_ADMIN_ROLE = await paymentManager.DEFAULT_ADMIN_ROLE();
    PAYMENT_ADMIN_ROLE = await paymentManager.PAYMENT_ADMIN_ROLE();
    PRICING_ADMIN_ROLE = await paymentManager.PRICING_ADMIN_ROLE();
    TREASURY_ADMIN_ROLE = await paymentManager.TREASURY_ADMIN_ROLE();
    
    // Define test roles
    MARKET_MAKER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MARKET_MAKER_ROLE"));
    CLEARPATH_USER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("CLEARPATH_USER_ROLE"));
    
    // Grant roles to admins
    await paymentManager.grantRole(PAYMENT_ADMIN_ROLE, paymentAdmin.address);
    await paymentManager.grantRole(PRICING_ADMIN_ROLE, pricingAdmin.address);
    await paymentManager.grantRole(TREASURY_ADMIN_ROLE, treasuryAdmin.address);
    
    // Mint tokens to buyers
    await mockToken1.mint(buyer1.address, ethers.parseUnits("10000", 6));
    await mockToken1.mint(buyer2.address, ethers.parseUnits("10000", 6));
    await mockToken2.mint(buyer1.address, ethers.parseEther("10000"));
    await mockToken2.mint(buyer2.address, ethers.parseEther("10000"));
  });

  describe("Deployment", function () {
    it("Should set the treasury address correctly", async function () {
      expect(await paymentManager.treasury()).to.equal(treasury.address);
    });

    it("Should grant all admin roles to deployer", async function () {
      expect(await paymentManager.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.equal(true);
      expect(await paymentManager.hasRole(PAYMENT_ADMIN_ROLE, owner.address)).to.equal(true);
      expect(await paymentManager.hasRole(PRICING_ADMIN_ROLE, owner.address)).to.equal(true);
      expect(await paymentManager.hasRole(TREASURY_ADMIN_ROLE, owner.address)).to.equal(true);
    });

    it("Should reject deployment with zero treasury address", async function () {
      const MembershipPaymentManager = await ethers.getContractFactory("MembershipPaymentManager");
      await expect(
        MembershipPaymentManager.deploy(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid treasury address");
    });
  });

  describe("Payment Token Management", function () {
    it("Should allow payment admin to add payment token", async function () {
      await expect(
        paymentManager.connect(paymentAdmin).addPaymentToken(
          await mockToken1.getAddress(),
          "USDC",
          6
        )
      ).to.emit(paymentManager, "PaymentTokenAdded")
        .withArgs(await mockToken1.getAddress(), "USDC", 6);
      
      const tokenInfo = await paymentManager.paymentTokens(await mockToken1.getAddress());
      expect(tokenInfo.isActive).to.equal(true);
      expect(tokenInfo.decimals).to.equal(6);
      expect(tokenInfo.symbol).to.equal("USDC");
    });

    it("Should reject adding token with zero address", async function () {
      await expect(
        paymentManager.connect(paymentAdmin).addPaymentToken(ethers.ZeroAddress, "INVALID", 18)
      ).to.be.revertedWith("Invalid token address");
    });

    it("Should reject adding duplicate token", async function () {
      await paymentManager.connect(paymentAdmin).addPaymentToken(
        await mockToken1.getAddress(),
        "USDC",
        6
      );
      
      await expect(
        paymentManager.connect(paymentAdmin).addPaymentToken(
          await mockToken1.getAddress(),
          "USDC",
          6
        )
      ).to.be.revertedWith("Token already exists");
    });

    it("Should allow updating token active status", async function () {
      await paymentManager.connect(paymentAdmin).addPaymentToken(
        await mockToken1.getAddress(),
        "USDC",
        6
      );
      
      await expect(
        paymentManager.connect(paymentAdmin).setPaymentTokenActive(
          await mockToken1.getAddress(),
          false
        )
      ).to.emit(paymentManager, "PaymentTokenUpdated")
        .withArgs(await mockToken1.getAddress(), false);
      
      const tokenInfo = await paymentManager.paymentTokens(await mockToken1.getAddress());
      expect(tokenInfo.isActive).to.equal(false);
    });

    it("Should allow removing payment token", async function () {
      await paymentManager.connect(paymentAdmin).addPaymentToken(
        await mockToken1.getAddress(),
        "USDC",
        6
      );
      
      await expect(
        paymentManager.connect(paymentAdmin).removePaymentToken(await mockToken1.getAddress())
      ).to.emit(paymentManager, "PaymentTokenRemoved")
        .withArgs(await mockToken1.getAddress());
      
      const tokenInfo = await paymentManager.paymentTokens(await mockToken1.getAddress());
      expect(tokenInfo.isActive).to.equal(false);
    });

    it("Should reject non-admin adding payment token", async function () {
      await expect(
        paymentManager.connect(buyer1).addPaymentToken(
          await mockToken1.getAddress(),
          "USDC",
          6
        )
      ).to.be.reverted;
    });

    it("Should return list of payment tokens", async function () {
      await paymentManager.connect(paymentAdmin).addPaymentToken(
        await mockToken1.getAddress(),
        "USDC",
        6
      );
      await paymentManager.connect(paymentAdmin).addPaymentToken(
        await mockToken2.getAddress(),
        "TEST",
        18
      );
      
      const tokens = await paymentManager.getPaymentTokens();
      expect(tokens.length).to.equal(2);
      expect(tokens[0]).to.equal(await mockToken1.getAddress());
      expect(tokens[1]).to.equal(await mockToken2.getAddress());
    });
  });

  describe("Pricing Management", function () {
    beforeEach(async function () {
      // Add payment tokens
      await paymentManager.connect(paymentAdmin).addPaymentToken(
        await mockToken1.getAddress(),
        "USDC",
        6
      );
      await paymentManager.connect(paymentAdmin).addPaymentToken(
        await mockToken2.getAddress(),
        "TEST",
        18
      );
    });

    it("Should allow pricing admin to set role price", async function () {
      const price = ethers.parseUnits("100", 6); // 100 USDC
      
      await expect(
        paymentManager.connect(pricingAdmin).setRolePrice(
          MARKET_MAKER_ROLE,
          await mockToken1.getAddress(),
          price
        )
      ).to.emit(paymentManager, "RolePriceUpdated")
        .withArgs(MARKET_MAKER_ROLE, await mockToken1.getAddress(), price);
      
      expect(
        await paymentManager.getRolePrice(MARKET_MAKER_ROLE, await mockToken1.getAddress())
      ).to.equal(price);
    });

    it("Should allow setting prices for multiple tokens", async function () {
      const price1 = ethers.parseUnits("100", 6); // 100 USDC
      const price2 = ethers.parseEther("100"); // 100 TEST
      
      await paymentManager.connect(pricingAdmin).setRolePrices(
        MARKET_MAKER_ROLE,
        [await mockToken1.getAddress(), await mockToken2.getAddress()],
        [price1, price2]
      );
      
      expect(
        await paymentManager.getRolePrice(MARKET_MAKER_ROLE, await mockToken1.getAddress())
      ).to.equal(price1);
      expect(
        await paymentManager.getRolePrice(MARKET_MAKER_ROLE, await mockToken2.getAddress())
      ).to.equal(price2);
    });

    it("Should reject setting price for inactive token", async function () {
      await paymentManager.connect(paymentAdmin).setPaymentTokenActive(
        await mockToken1.getAddress(),
        false
      );
      
      await expect(
        paymentManager.connect(pricingAdmin).setRolePrice(
          MARKET_MAKER_ROLE,
          await mockToken1.getAddress(),
          ethers.parseUnits("100", 6)
        )
      ).to.be.revertedWith("Token not active");
    });

    it("Should reject non-admin setting prices", async function () {
      await expect(
        paymentManager.connect(buyer1).setRolePrice(
          MARKET_MAKER_ROLE,
          await mockToken1.getAddress(),
          ethers.parseUnits("100", 6)
        )
      ).to.be.reverted;
    });

    it("Should reject mismatched array lengths", async function () {
      await expect(
        paymentManager.connect(pricingAdmin).setRolePrices(
          MARKET_MAKER_ROLE,
          [await mockToken1.getAddress()],
          [ethers.parseUnits("100", 6), ethers.parseEther("100")]
        )
      ).to.be.revertedWith("Arrays length mismatch");
    });
  });

  describe("Payment Routing Management", function () {
    it("Should allow treasury admin to set payment routing", async function () {
      const recipients = [recipient1.address, recipient2.address];
      const basisPoints = [7000, 3000]; // 70% and 30%
      
      await paymentManager.connect(treasuryAdmin).setPaymentRouting(recipients, basisPoints);
      
      const routing = await paymentManager.getPaymentRouting();
      expect(routing.recipients.length).to.equal(2);
      expect(routing.recipients[0]).to.equal(recipient1.address);
      expect(routing.recipients[1]).to.equal(recipient2.address);
      expect(routing.basisPoints[0]).to.equal(7000);
      expect(routing.basisPoints[1]).to.equal(3000);
    });

    it("Should reject routing with basis points not summing to 10000", async function () {
      const recipients = [recipient1.address, recipient2.address];
      const basisPoints = [6000, 3000]; // Only 90%
      
      await expect(
        paymentManager.connect(treasuryAdmin).setPaymentRouting(recipients, basisPoints)
      ).to.be.revertedWith("Basis points must sum to 10000");
    });

    it("Should reject routing with zero address recipient", async function () {
      const recipients = [ethers.ZeroAddress, recipient2.address];
      const basisPoints = [7000, 3000];
      
      await expect(
        paymentManager.connect(treasuryAdmin).setPaymentRouting(recipients, basisPoints)
      ).to.be.revertedWith("Invalid recipient");
    });

    it("Should allow clearing payment routing", async function () {
      const recipients = [recipient1.address];
      const basisPoints = [10000];
      
      await paymentManager.connect(treasuryAdmin).setPaymentRouting(recipients, basisPoints);
      
      await expect(
        paymentManager.connect(treasuryAdmin).clearPaymentRouting()
      ).to.emit(paymentManager, "PaymentRoutingCleared");
      
      const routing = await paymentManager.getPaymentRouting();
      expect(routing.recipients.length).to.equal(0);
    });

    it("Should allow updating treasury address", async function () {
      const newTreasury = recipient1.address;
      
      await expect(
        paymentManager.connect(treasuryAdmin).setTreasury(newTreasury)
      ).to.emit(paymentManager, "TreasuryUpdated")
        .withArgs(treasury.address, newTreasury);
      
      expect(await paymentManager.treasury()).to.equal(newTreasury);
    });

    it("Should reject setting zero address as treasury", async function () {
      await expect(
        paymentManager.connect(treasuryAdmin).setTreasury(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid treasury address");
    });
  });

  describe("Payment Processing", function () {
    beforeEach(async function () {
      // Setup payment tokens and pricing
      await paymentManager.connect(paymentAdmin).addPaymentToken(
        await mockToken1.getAddress(),
        "USDC",
        6
      );
      
      const price = ethers.parseUnits("100", 6); // 100 USDC
      await paymentManager.connect(pricingAdmin).setRolePrice(
        MARKET_MAKER_ROLE,
        await mockToken1.getAddress(),
        price
      );
      
      // Approve payment manager to spend tokens
      await mockToken1.connect(buyer1).approve(
        await paymentManager.getAddress(),
        ethers.parseUnits("10000", 6)
      );
    });

    it("Should process payment successfully", async function () {
      const amount = ethers.parseUnits("100", 6);

      const tx = await paymentManager.connect(buyer1).processPayment(buyer1.address, buyer1.address, MARKET_MAKER_ROLE,
        await mockToken1.getAddress(),
        amount,
        0 // tier 0
      );
      
      const receipt = await tx.wait();
      
      // Check event was emitted
      const event = receipt.logs.find(log => {
        try {
          const parsed = paymentManager.interface.parseLog(log);
          return parsed.name === "PaymentProcessed";
        } catch {
          return false;
        }
      });
      expect(event).to.not.be.undefined;
      
      // Check payment was recorded
      expect(await paymentManager.totalPaymentsCount()).to.equal(1);
      
      // Check revenue tracking
      expect(await paymentManager.revenueByToken(await mockToken1.getAddress())).to.equal(amount);
      
      // Check token was transferred to treasury
      expect(await mockToken1.balanceOf(treasury.address)).to.equal(amount);
    });

    it("Should reject payment with inactive token", async function () {
      await paymentManager.connect(paymentAdmin).setPaymentTokenActive(
        await mockToken1.getAddress(),
        false
      );
      
      await expect(
        paymentManager.connect(buyer1).processPayment(buyer1.address, buyer1.address, MARKET_MAKER_ROLE,
          await mockToken1.getAddress(),
          ethers.parseUnits("100", 6),
          0
        )
      ).to.be.revertedWith("Payment token not active");
    });

    it("Should reject payment with insufficient amount", async function () {
      await expect(
        paymentManager.connect(buyer1).processPayment(buyer1.address, buyer1.address, MARKET_MAKER_ROLE,
          await mockToken1.getAddress(),
          ethers.parseUnits("50", 6), // Less than required 100
          0
        )
      ).to.be.revertedWith("Insufficient payment amount");
    });

    it("Should reject payment for role with no price set", async function () {
      await expect(
        paymentManager.connect(buyer1).processPayment(buyer1.address, buyer1.address, CLEARPATH_USER_ROLE, // No price set
          await mockToken1.getAddress(),
          ethers.parseUnits("100", 6),
          0
        )
      ).to.be.revertedWith("Role pricing not configured");
    });

    it("Should route payment according to configuration", async function () {
      const recipients = [recipient1.address, recipient2.address];
      const basisPoints = [7000, 3000]; // 70% and 30%
      await paymentManager.connect(treasuryAdmin).setPaymentRouting(recipients, basisPoints);

      const amount = ethers.parseUnits("100", 6);

      await paymentManager.connect(buyer1).processPayment(buyer1.address, buyer1.address, MARKET_MAKER_ROLE,
        await mockToken1.getAddress(),
        amount,
        0
      );
      
      // Check routing
      expect(await mockToken1.balanceOf(recipient1.address)).to.equal(ethers.parseUnits("70", 6));
      expect(await mockToken1.balanceOf(recipient2.address)).to.equal(ethers.parseUnits("30", 6));
    });

    it("Should track user payment history", async function () {
      const amount = ethers.parseUnits("100", 6);

      await paymentManager.connect(buyer1).processPayment(buyer1.address, buyer1.address, MARKET_MAKER_ROLE,
        await mockToken1.getAddress(),
        amount,
        0
      );

      const userPayments = await paymentManager.getUserPayments(buyer1.address);
      expect(userPayments.length).to.equal(1);
    });

    it("Should handle multiple payments from same user", async function () {
      const amount = ethers.parseUnits("100", 6);

      await paymentManager.connect(buyer1).processPayment(buyer1.address, buyer1.address, MARKET_MAKER_ROLE,
        await mockToken1.getAddress(),
        amount,
        0
      );

      // Set price for another role
      await paymentManager.connect(pricingAdmin).setRolePrice(
        CLEARPATH_USER_ROLE,
        await mockToken1.getAddress(),
        ethers.parseUnits("250", 6)
      );

      await paymentManager.connect(buyer1).processPayment(buyer1.address, buyer1.address, CLEARPATH_USER_ROLE,
        await mockToken1.getAddress(),
        ethers.parseUnits("250", 6),
        1 // tier 1
      );

      const userPayments = await paymentManager.getUserPayments(buyer1.address);
      expect(userPayments.length).to.equal(2);
      expect(await paymentManager.totalPaymentsCount()).to.equal(2);
    });
  });

  describe("Refund Management", function () {
    let paymentId;
    
    beforeEach(async function () {
      // Setup and process a payment
      await paymentManager.connect(paymentAdmin).addPaymentToken(
        await mockToken1.getAddress(),
        "USDC",
        6
      );
      
      const price = ethers.parseUnits("100", 6);
      await paymentManager.connect(pricingAdmin).setRolePrice(
        MARKET_MAKER_ROLE,
        await mockToken1.getAddress(),
        price
      );
      
      await mockToken1.connect(buyer1).approve(
        await paymentManager.getAddress(),
        ethers.parseUnits("10000", 6)
      );
      
      // Process payment and get ID from event
      const tx = await paymentManager.connect(buyer1).processPayment(buyer1.address, buyer1.address, MARKET_MAKER_ROLE,
        await mockToken1.getAddress(),
        price,
        0
      );
      
      const receipt = await tx.wait();
      const event = receipt.logs.find(log => {
        try {
          const parsed = paymentManager.interface.parseLog(log);
          return parsed.name === "PaymentProcessed";
        } catch {
          return false;
        }
      });
      
      const parsed = paymentManager.interface.parseLog(event);
      paymentId = parsed.args.paymentId;
      
      // Transfer tokens to payment manager for refund
      await mockToken1.mint(await paymentManager.getAddress(), ethers.parseUnits("100", 6));
    });

    it("Should allow payment admin to refund payment", async function () {
      const balanceBefore = await mockToken1.balanceOf(buyer1.address);
      
      await expect(
        paymentManager.connect(paymentAdmin).refundPayment(paymentId)
      ).to.emit(paymentManager, "PaymentRefunded")
        .withArgs(paymentId, buyer1.address, ethers.parseUnits("100", 6));
      
      const balanceAfter = await mockToken1.balanceOf(buyer1.address);
      expect(balanceAfter - balanceBefore).to.equal(ethers.parseUnits("100", 6));
    });

    it("Should mark payment as refunded", async function () {
      await paymentManager.connect(paymentAdmin).refundPayment(paymentId);
      
      const payment = await paymentManager.payments(paymentId);
      expect(payment.isRefunded).to.equal(true); // Marked as refunded
    });

    it("Should reject refunding non-existent payment", async function () {
      const fakePaymentId = ethers.keccak256(ethers.toUtf8Bytes("fake"));
      
      await expect(
        paymentManager.connect(paymentAdmin).refundPayment(fakePaymentId)
      ).to.be.revertedWith("Payment not found");
    });

    it("Should reject non-admin refunding payment", async function () {
      await expect(
        paymentManager.connect(buyer1).refundPayment(paymentId)
      ).to.be.reverted;
    });
  });

  describe("Treasury Management", function () {
    beforeEach(async function () {
      // Setup and process payments to accumulate funds
      await paymentManager.connect(paymentAdmin).addPaymentToken(
        await mockToken1.getAddress(),
        "USDC",
        6
      );
      
      const price = ethers.parseUnits("100", 6);
      await paymentManager.connect(pricingAdmin).setRolePrice(
        MARKET_MAKER_ROLE,
        await mockToken1.getAddress(),
        price
      );
      
      await mockToken1.connect(buyer1).approve(
        await paymentManager.getAddress(),
        ethers.parseUnits("10000", 6)
      );
      
      // Clear routing so funds stay in contract
      await paymentManager.connect(treasuryAdmin).clearPaymentRouting();
      
      // Process payment but intercept before routing
      await mockToken1.mint(await paymentManager.getAddress(), ethers.parseUnits("500", 6));
    });

    it("Should allow treasury admin to withdraw funds", async function () {
      const balanceBefore = await mockToken1.balanceOf(treasury.address);
      const contractBalance = await mockToken1.balanceOf(await paymentManager.getAddress());
      
      await expect(
        paymentManager.connect(treasuryAdmin).withdrawToTreasury(await mockToken1.getAddress())
      ).to.emit(paymentManager, "FundsWithdrawn")
        .withArgs(await mockToken1.getAddress(), treasury.address, contractBalance);
      
      const balanceAfter = await mockToken1.balanceOf(treasury.address);
      expect(balanceAfter - balanceBefore).to.equal(contractBalance);
    });

    it("Should reject withdrawal with no balance", async function () {
      // First withdraw all
      await paymentManager.connect(treasuryAdmin).withdrawToTreasury(await mockToken1.getAddress());
      
      // Try to withdraw again
      await expect(
        paymentManager.connect(treasuryAdmin).withdrawToTreasury(await mockToken1.getAddress())
      ).to.be.revertedWith("No balance to withdraw");
    });

    it("Should allow emergency withdrawal by default admin", async function () {
      const amount = ethers.parseUnits("100", 6);
      
      await expect(
        paymentManager.connect(owner).emergencyWithdraw(
          await mockToken1.getAddress(),
          recipient1.address,
          amount
        )
      ).to.emit(paymentManager, "EmergencyWithdrawal")
        .withArgs(await mockToken1.getAddress(), recipient1.address, amount);
      
      expect(await mockToken1.balanceOf(recipient1.address)).to.equal(amount);
    });

    it("Should reject emergency withdrawal by non-admin", async function () {
      await expect(
        paymentManager.connect(buyer1).emergencyWithdraw(
          await mockToken1.getAddress(),
          recipient1.address,
          ethers.parseUnits("100", 6)
        )
      ).to.be.reverted;
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      await paymentManager.connect(paymentAdmin).addPaymentToken(
        await mockToken1.getAddress(),
        "USDC",
        6
      );
      await paymentManager.connect(paymentAdmin).addPaymentToken(
        await mockToken2.getAddress(),
        "TEST",
        18
      );
    });

    it("Should return contract balance for token", async function () {
      await mockToken1.mint(await paymentManager.getAddress(), ethers.parseUnits("500", 6));
      
      expect(
        await paymentManager.getBalance(await mockToken1.getAddress())
      ).to.equal(ethers.parseUnits("500", 6));
    });

    it("Should return payment routing configuration", async function () {
      const recipients = [recipient1.address, recipient2.address];
      const basisPoints = [6000, 4000];
      
      await paymentManager.connect(treasuryAdmin).setPaymentRouting(recipients, basisPoints);
      
      const routing = await paymentManager.getPaymentRouting();
      expect(routing.recipients).to.deep.equal(recipients);
      expect(routing.basisPoints.map(bp => Number(bp))).to.deep.equal(basisPoints);
    });
  });

  describe("Emergency Functions", function () {
    it("Should allow payment admin to pause contract", async function () {
      await paymentManager.connect(paymentAdmin).pause();
      expect(await paymentManager.paused()).to.equal(true);
    });

    it("Should allow payment admin to unpause contract", async function () {
      await paymentManager.connect(paymentAdmin).pause();
      await paymentManager.connect(paymentAdmin).unpause();
      expect(await paymentManager.paused()).to.equal(false);
    });

    it("Should reject payments when paused", async function () {
      await paymentManager.connect(paymentAdmin).addPaymentToken(
        await mockToken1.getAddress(),
        "USDC",
        6
      );
      
      const price = ethers.parseUnits("100", 6);
      await paymentManager.connect(pricingAdmin).setRolePrice(
        MARKET_MAKER_ROLE,
        await mockToken1.getAddress(),
        price
      );
      
      await mockToken1.connect(buyer1).approve(
        await paymentManager.getAddress(),
        ethers.parseUnits("10000", 6)
      );
      
      await paymentManager.connect(paymentAdmin).pause();

      await expect(
        paymentManager.connect(buyer1).processPayment(buyer1.address, buyer1.address, MARKET_MAKER_ROLE,
          await mockToken1.getAddress(),
          price,
          0
        )
      ).to.be.revertedWithCustomError(paymentManager, "EnforcedPause");
    });
  });
});
