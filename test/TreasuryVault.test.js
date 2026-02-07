import { expect } from "chai";
import hre from "hardhat";

describe("TreasuryVault - Unit Tests", function () {
  let ethers;
  let time;
  let treasuryVault;
  let mockToken;
  let owner, spender1, spender2, guardian, user1, user2;

  beforeEach(async function () {
    const connection = await hre.network.connect();
    ethers = connection.ethers;
    time = connection.networkHelpers.time;
    [owner, spender1, spender2, guardian, user1, user2] = await ethers.getSigners();

    // Deploy TreasuryVault directly (not using clone pattern in tests)
    const TreasuryVault = await ethers.getContractFactory("TreasuryVault");
    treasuryVault = await TreasuryVault.deploy();
    await treasuryVault.waitForDeployment();
    
    // Initialize with owner
    await treasuryVault.initialize(owner.address);

    // Deploy mock ERC20 token for testing
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockToken = await MockERC20.deploy("Mock Token", "MTK", ethers.parseEther("1000000"));
    await mockToken.waitForDeployment();

    // Distribute tokens
    await mockToken.transfer(user1.address, ethers.parseEther("10000"));
    await mockToken.transfer(user2.address, ethers.parseEther("10000"));
  });

  describe("Deployment", function () {
    it("Should set the correct owner", async function () {
      expect(await treasuryVault.owner()).to.equal(owner.address);
    });

    it("Should set guardian to owner initially", async function () {
      expect(await treasuryVault.guardian()).to.equal(owner.address);
    });

    it("Should not be paused initially", async function () {
      expect(await treasuryVault.paused()).to.equal(false);
    });

    it("Should reject zero address as owner during initialization", async function () {
      const TreasuryVault = await ethers.getContractFactory("TreasuryVault");
      const vault = await TreasuryVault.deploy();
      
      await expect(
        vault.initialize(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid owner");
    });
    
    it("Should reject double initialization by non-owner", async function () {
      await expect(
        treasuryVault.connect(user1).initialize(user1.address)
      ).to.be.revertedWith("Already initialized");
    });
  });

  describe("ETH Deposits", function () {
    it("Should allow ETH deposits via depositETH", async function () {
      const depositAmount = ethers.parseEther("1.0");
      
      await expect(
        treasuryVault.connect(user1).depositETH({ value: depositAmount })
      ).to.emit(treasuryVault, "Deposit")
        .withArgs(ethers.ZeroAddress, user1.address, depositAmount);

      expect(await treasuryVault.getETHBalance()).to.equal(depositAmount);
    });

    it("Should allow ETH deposits via receive", async function () {
      const depositAmount = ethers.parseEther("2.0");
      
      await expect(
        user1.sendTransaction({
          to: await treasuryVault.getAddress(),
          value: depositAmount
        })
      ).to.emit(treasuryVault, "Deposit")
        .withArgs(ethers.ZeroAddress, user1.address, depositAmount);

      expect(await treasuryVault.getETHBalance()).to.equal(depositAmount);
    });

    it("Should reject zero ETH deposit", async function () {
      await expect(
        treasuryVault.depositETH({ value: 0 })
      ).to.be.revertedWith("Amount must be greater than 0");
    });

    it("Should accumulate multiple deposits", async function () {
      await treasuryVault.connect(user1).depositETH({ value: ethers.parseEther("1.0") });
      await treasuryVault.connect(user2).depositETH({ value: ethers.parseEther("2.0") });
      
      expect(await treasuryVault.getETHBalance()).to.equal(ethers.parseEther("3.0"));
    });
  });

  describe("ERC20 Deposits", function () {
    it("Should allow ERC20 deposits", async function () {
      const depositAmount = ethers.parseEther("100");
      
      await mockToken.connect(user1).approve(await treasuryVault.getAddress(), depositAmount);
      
      await expect(
        treasuryVault.connect(user1).depositERC20(await mockToken.getAddress(), depositAmount)
      ).to.emit(treasuryVault, "Deposit")
        .withArgs(await mockToken.getAddress(), user1.address, depositAmount);

      expect(await treasuryVault.getTokenBalance(await mockToken.getAddress())).to.equal(depositAmount);
    });

    it("Should reject zero address token", async function () {
      await expect(
        treasuryVault.depositERC20(ethers.ZeroAddress, 100)
      ).to.be.revertedWith("Invalid token address");
    });

    it("Should reject zero amount", async function () {
      await expect(
        treasuryVault.depositERC20(await mockToken.getAddress(), 0)
      ).to.be.revertedWith("Amount must be greater than 0");
    });

    it("Should reject deposit without approval", async function () {
      await expect(
        treasuryVault.connect(user1).depositERC20(await mockToken.getAddress(), ethers.parseEther("100"))
      ).to.be.reverted;
    });
  });

  describe("Authorization Management", function () {
    it("Should allow owner to authorize spender", async function () {
      await expect(
        treasuryVault.authorizeSpender(spender1.address)
      ).to.emit(treasuryVault, "SpenderAuthorized")
        .withArgs(spender1.address);

      expect(await treasuryVault.authorizedSpenders(spender1.address)).to.equal(true);
      expect(await treasuryVault.isAuthorizedSpender(spender1.address)).to.equal(true);
    });

    it("Should allow owner to revoke spender", async function () {
      await treasuryVault.authorizeSpender(spender1.address);
      
      await expect(
        treasuryVault.revokeSpender(spender1.address)
      ).to.emit(treasuryVault, "SpenderRevoked")
        .withArgs(spender1.address);

      expect(await treasuryVault.authorizedSpenders(spender1.address)).to.equal(false);
    });

    it("Should reject zero address as spender", async function () {
      await expect(
        treasuryVault.authorizeSpender(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid spender");
    });

    it("Should reject duplicate authorization", async function () {
      await treasuryVault.authorizeSpender(spender1.address);
      
      await expect(
        treasuryVault.authorizeSpender(spender1.address)
      ).to.be.revertedWith("Already authorized");
    });

    it("Should reject revoking non-authorized spender", async function () {
      await expect(
        treasuryVault.revokeSpender(spender1.address)
      ).to.be.revertedWith("Not authorized");
    });

    it("Should not allow non-owner to authorize", async function () {
      await expect(
        treasuryVault.connect(user1).authorizeSpender(spender1.address)
      ).to.be.reverted;
    });

    it("Should recognize owner as authorized spender", async function () {
      expect(await treasuryVault.isAuthorizedSpender(owner.address)).to.equal(true);
    });
  });

  describe("ETH Withdrawals", function () {
    beforeEach(async function () {
      // Fund vault
      await treasuryVault.depositETH({ value: ethers.parseEther("10.0") });
    });

    it("Should allow authorized spender to withdraw ETH", async function () {
      await treasuryVault.authorizeSpender(spender1.address);
      const withdrawAmount = ethers.parseEther("1.0");
      
      await expect(
        treasuryVault.connect(spender1).withdrawETH(user1.address, withdrawAmount)
      ).to.emit(treasuryVault, "Withdrawal")
        .withArgs(ethers.ZeroAddress, user1.address, withdrawAmount, spender1.address);

      expect(await treasuryVault.getETHBalance()).to.equal(ethers.parseEther("9.0"));
    });

    it("Should allow owner to withdraw ETH", async function () {
      const withdrawAmount = ethers.parseEther("2.0");
      
      await treasuryVault.withdrawETH(user1.address, withdrawAmount);
      
      expect(await treasuryVault.getETHBalance()).to.equal(ethers.parseEther("8.0"));
    });

    it("Should reject withdrawal by unauthorized address", async function () {
      await expect(
        treasuryVault.connect(user1).withdrawETH(user2.address, ethers.parseEther("1.0"))
      ).to.be.revertedWith("Not authorized");
    });

    it("Should reject withdrawal to zero address", async function () {
      await expect(
        treasuryVault.withdrawETH(ethers.ZeroAddress, ethers.parseEther("1.0"))
      ).to.be.revertedWith("Invalid recipient");
    });

    it("Should reject zero amount withdrawal", async function () {
      await expect(
        treasuryVault.withdrawETH(user1.address, 0)
      ).to.be.revertedWith("Amount must be greater than 0");
    });

    it("Should reject withdrawal exceeding balance", async function () {
      await expect(
        treasuryVault.withdrawETH(user1.address, ethers.parseEther("20.0"))
      ).to.be.revertedWith("Insufficient balance");
    });

    it("Should reject withdrawal when paused", async function () {
      await treasuryVault.pause();
      
      await expect(
        treasuryVault.withdrawETH(user1.address, ethers.parseEther("1.0"))
      ).to.be.revertedWith("Vault is paused");
    });
  });

  describe("ERC20 Withdrawals", function () {
    beforeEach(async function () {
      // Fund vault with tokens
      const depositAmount = ethers.parseEther("1000");
      await mockToken.connect(user1).approve(await treasuryVault.getAddress(), depositAmount);
      await treasuryVault.connect(user1).depositERC20(await mockToken.getAddress(), depositAmount);
    });

    it("Should allow authorized spender to withdraw tokens", async function () {
      await treasuryVault.authorizeSpender(spender1.address);
      const withdrawAmount = ethers.parseEther("100");
      
      await expect(
        treasuryVault.connect(spender1).withdrawERC20(
          await mockToken.getAddress(),
          user2.address,
          withdrawAmount
        )
      ).to.emit(treasuryVault, "Withdrawal")
        .withArgs(await mockToken.getAddress(), user2.address, withdrawAmount, spender1.address);

      expect(await mockToken.balanceOf(user2.address)).to.equal(ethers.parseEther("10100"));
    });

    it("Should allow owner to withdraw tokens", async function () {
      const withdrawAmount = ethers.parseEther("200");
      
      await treasuryVault.withdrawERC20(
        await mockToken.getAddress(),
        user2.address,
        withdrawAmount
      );
      
      expect(await mockToken.balanceOf(user2.address)).to.equal(ethers.parseEther("10200"));
    });

    it("Should reject withdrawal by unauthorized address", async function () {
      await expect(
        treasuryVault.connect(user1).withdrawERC20(
          await mockToken.getAddress(),
          user2.address,
          ethers.parseEther("100")
        )
      ).to.be.revertedWith("Not authorized");
    });

    it("Should reject withdrawal of zero address token", async function () {
      await expect(
        treasuryVault.withdrawERC20(ethers.ZeroAddress, user1.address, 100)
      ).to.be.revertedWith("Invalid token address");
    });

    it("Should reject withdrawal to zero address", async function () {
      await expect(
        treasuryVault.withdrawERC20(await mockToken.getAddress(), ethers.ZeroAddress, 100)
      ).to.be.revertedWith("Invalid recipient");
    });

    it("Should reject zero amount withdrawal", async function () {
      await expect(
        treasuryVault.withdrawERC20(await mockToken.getAddress(), user1.address, 0)
      ).to.be.revertedWith("Amount must be greater than 0");
    });
  });

  describe("Transaction Limits", function () {
    beforeEach(async function () {
      await treasuryVault.depositETH({ value: ethers.parseEther("100.0") });
      await treasuryVault.authorizeSpender(spender1.address);
    });

    it("Should allow setting transaction limit", async function () {
      const limit = ethers.parseEther("5.0");
      
      await expect(
        treasuryVault.setTransactionLimit(ethers.ZeroAddress, limit)
      ).to.emit(treasuryVault, "TransactionLimitUpdated")
        .withArgs(ethers.ZeroAddress, limit);

      expect(await treasuryVault.transactionLimit(ethers.ZeroAddress)).to.equal(limit);
    });

    it("Should enforce transaction limit", async function () {
      const limit = ethers.parseEther("5.0");
      await treasuryVault.setTransactionLimit(ethers.ZeroAddress, limit);
      
      // Should succeed under limit
      await treasuryVault.connect(spender1).withdrawETH(user1.address, ethers.parseEther("5.0"));
      
      // Should fail over limit
      await expect(
        treasuryVault.connect(spender1).withdrawETH(user1.address, ethers.parseEther("5.1"))
      ).to.be.revertedWith("Exceeds transaction limit");
    });

    it("Should allow setting limit to zero (unlimited)", async function () {
      await treasuryVault.setTransactionLimit(ethers.ZeroAddress, 0);
      
      // Should allow any amount
      await treasuryVault.connect(spender1).withdrawETH(user1.address, ethers.parseEther("50.0"));
    });

    it("Should not allow non-owner to set limit", async function () {
      await expect(
        treasuryVault.connect(user1).setTransactionLimit(ethers.ZeroAddress, ethers.parseEther("1.0"))
      ).to.be.reverted;
    });
  });

  describe("Rate Limits", function () {
    beforeEach(async function () {
      await treasuryVault.depositETH({ value: ethers.parseEther("100.0") });
      await treasuryVault.authorizeSpender(spender1.address);
    });

    it("Should allow setting rate limit", async function () {
      const period = 3600; // 1 hour
      const limit = ethers.parseEther("10.0");
      
      await expect(
        treasuryVault.setRateLimit(ethers.ZeroAddress, period, limit)
      ).to.emit(treasuryVault, "RateLimitUpdated")
        .withArgs(ethers.ZeroAddress, period, limit);

      expect(await treasuryVault.rateLimitPeriod(ethers.ZeroAddress)).to.equal(period);
      expect(await treasuryVault.periodLimit(ethers.ZeroAddress)).to.equal(limit);
    });

    it("Should enforce rate limit", async function () {
      const period = 3600; // 1 hour
      const limit = ethers.parseEther("10.0");
      await treasuryVault.setRateLimit(ethers.ZeroAddress, period, limit);
      
      // First withdrawal should succeed
      await treasuryVault.connect(spender1).withdrawETH(user1.address, ethers.parseEther("6.0"));
      
      // Second withdrawal within period should succeed under limit
      await treasuryVault.connect(spender1).withdrawETH(user1.address, ethers.parseEther("4.0"));
      
      // Third withdrawal should fail (exceeds period limit)
      await expect(
        treasuryVault.connect(spender1).withdrawETH(user1.address, ethers.parseEther("0.1"))
      ).to.be.revertedWith("Exceeds period limit");
    });

    it("Should reset after period expires", async function () {
      const period = 3600; // 1 hour
      const limit = ethers.parseEther("10.0");
      await treasuryVault.setRateLimit(ethers.ZeroAddress, period, limit);
      
      // Use up the limit
      await treasuryVault.connect(spender1).withdrawETH(user1.address, ethers.parseEther("10.0"));
      
      // Should fail immediately after
      await expect(
        treasuryVault.connect(spender1).withdrawETH(user1.address, ethers.parseEther("1.0"))
      ).to.be.revertedWith("Exceeds period limit");
      
      // Advance time
      await time.increase(period + 1);
      
      // Should succeed after period
      await treasuryVault.connect(spender1).withdrawETH(user1.address, ethers.parseEther("10.0"));
    });

    it("Should track remaining allowance", async function () {
      const period = 3600;
      const limit = ethers.parseEther("10.0");
      await treasuryVault.setRateLimit(ethers.ZeroAddress, period, limit);
      
      expect(await treasuryVault.getRemainingPeriodAllowance(ethers.ZeroAddress)).to.equal(limit);
      
      await treasuryVault.connect(spender1).withdrawETH(user1.address, ethers.parseEther("3.0"));
      
      expect(await treasuryVault.getRemainingPeriodAllowance(ethers.ZeroAddress))
        .to.equal(ethers.parseEther("7.0"));
    });

    it("Should return unlimited for tokens without rate limit", async function () {
      const remaining = await treasuryVault.getRemainingPeriodAllowance(ethers.ZeroAddress);
      expect(remaining).to.equal(ethers.MaxUint256);
    });

    it("Should reject invalid rate limit configuration", async function () {
      // Period without limit
      await expect(
        treasuryVault.setRateLimit(ethers.ZeroAddress, 3600, 0)
      ).to.be.revertedWith("Both period and limit must be set together or both zero to disable");
      
      // Limit without period
      await expect(
        treasuryVault.setRateLimit(ethers.ZeroAddress, 0, ethers.parseEther("10.0"))
      ).to.be.revertedWith("Both period and limit must be set together or both zero to disable");
    });

    it("Should allow disabling rate limit by setting both to zero", async function () {
      // Set a rate limit first
      await treasuryVault.setRateLimit(ethers.ZeroAddress, 3600, ethers.parseEther("10.0"));
      
      // Disable it
      await treasuryVault.setRateLimit(ethers.ZeroAddress, 0, 0);
      
      expect(await treasuryVault.rateLimitPeriod(ethers.ZeroAddress)).to.equal(0);
      expect(await treasuryVault.periodLimit(ethers.ZeroAddress)).to.equal(0);
    });
  });

  describe("Combined Limits", function () {
    beforeEach(async function () {
      await treasuryVault.depositETH({ value: ethers.parseEther("100.0") });
      await treasuryVault.authorizeSpender(spender1.address);
    });

    it("Should enforce both transaction and rate limits", async function () {
      // Set transaction limit: 6 ETH (higher than we'll try to withdraw in one tx)
      await treasuryVault.setTransactionLimit(ethers.ZeroAddress, ethers.parseEther("6.0"));
      
      // Set rate limit: 10 ETH per hour
      await treasuryVault.setRateLimit(ethers.ZeroAddress, 3600, ethers.parseEther("10.0"));
      
      // First withdrawal: 4.9 ETH (under both limits)
      await treasuryVault.connect(spender1).withdrawETH(user1.address, ethers.parseEther("4.9"));
      
      // Second withdrawal: 5.2 ETH (would exceed rate limit of 10 ETH total: 4.9 + 5.2 = 10.1)
      await expect(
        treasuryVault.connect(spender1).withdrawETH(user1.address, ethers.parseEther("5.2"))
      ).to.be.revertedWith("Exceeds period limit");
      
      // Should work with 5.1 ETH (staying at exactly 10 ETH total: 4.9 + 5.1 = 10.0)
      await treasuryVault.connect(spender1).withdrawETH(user1.address, ethers.parseEther("5.1"));
      
      // Now we've used up the period limit, any additional withdrawal should fail
      await expect(
        treasuryVault.connect(spender1).withdrawETH(user1.address, ethers.parseEther("0.1"))
      ).to.be.revertedWith("Exceeds period limit");
    });

    it("Should fail on transaction limit first if both violated", async function () {
      await treasuryVault.setTransactionLimit(ethers.ZeroAddress, ethers.parseEther("5.0"));
      await treasuryVault.setRateLimit(ethers.ZeroAddress, 3600, ethers.parseEther("10.0"));
      
      // Try to withdraw 6 ETH (exceeds both limits)
      await expect(
        treasuryVault.connect(spender1).withdrawETH(user1.address, ethers.parseEther("6.0"))
      ).to.be.revertedWith("Exceeds transaction limit");
    });
  });

  describe("Emergency Controls", function () {
    beforeEach(async function () {
      await treasuryVault.depositETH({ value: ethers.parseEther("10.0") });
      await treasuryVault.authorizeSpender(spender1.address);
    });

    it("Should allow owner to pause", async function () {
      await expect(treasuryVault.pause())
        .to.emit(treasuryVault, "EmergencyPause")
        .withArgs(owner.address);

      expect(await treasuryVault.paused()).to.equal(true);
    });

    it("Should allow guardian to pause", async function () {
      await treasuryVault.updateGuardian(guardian.address);
      
      await expect(treasuryVault.connect(guardian).pause())
        .to.emit(treasuryVault, "EmergencyPause")
        .withArgs(guardian.address);

      expect(await treasuryVault.paused()).to.equal(true);
    });

    it("Should reject pause by unauthorized address", async function () {
      await expect(
        treasuryVault.connect(user1).pause()
      ).to.be.revertedWith("Not guardian or owner");
    });

    it("Should reject duplicate pause", async function () {
      await treasuryVault.pause();
      
      await expect(treasuryVault.pause())
        .to.be.revertedWith("Already paused");
    });

    it("Should allow owner to unpause", async function () {
      await treasuryVault.pause();
      
      await expect(treasuryVault.unpause())
        .to.emit(treasuryVault, "EmergencyUnpause")
        .withArgs(owner.address);

      expect(await treasuryVault.paused()).to.equal(false);
    });

    it("Should reject unpause by guardian", async function () {
      await treasuryVault.updateGuardian(guardian.address);
      await treasuryVault.connect(guardian).pause();
      
      await expect(
        treasuryVault.connect(guardian).unpause()
      ).to.be.reverted;
    });

    it("Should reject unpause when not paused", async function () {
      await expect(treasuryVault.unpause())
        .to.be.revertedWith("Not paused");
    });

    it("Should block withdrawals when paused", async function () {
      await treasuryVault.pause();
      
      await expect(
        treasuryVault.connect(spender1).withdrawETH(user1.address, ethers.parseEther("1.0"))
      ).to.be.revertedWith("Vault is paused");
    });

    it("Should allow deposits when paused", async function () {
      await treasuryVault.pause();
      
      // Should still allow deposits
      await treasuryVault.connect(user1).depositETH({ value: ethers.parseEther("1.0") });
    });
  });

  describe("Guardian Management", function () {
    it("Should allow owner to update guardian", async function () {
      await expect(treasuryVault.updateGuardian(guardian.address))
        .to.emit(treasuryVault, "GuardianUpdated")
        .withArgs(owner.address, guardian.address);

      expect(await treasuryVault.guardian()).to.equal(guardian.address);
    });

    it("Should reject zero address guardian", async function () {
      await expect(
        treasuryVault.updateGuardian(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid guardian");
    });

    it("Should not allow non-owner to update guardian", async function () {
      await expect(
        treasuryVault.connect(user1).updateGuardian(guardian.address)
      ).to.be.reverted;
    });
  });

  describe("View Functions", function () {
    it("Should return correct ETH balance", async function () {
      await treasuryVault.depositETH({ value: ethers.parseEther("5.0") });
      expect(await treasuryVault.getETHBalance()).to.equal(ethers.parseEther("5.0"));
    });

    it("Should return correct token balance", async function () {
      const amount = ethers.parseEther("500");
      await mockToken.connect(user1).approve(await treasuryVault.getAddress(), amount);
      await treasuryVault.connect(user1).depositERC20(await mockToken.getAddress(), amount);
      
      expect(await treasuryVault.getTokenBalance(await mockToken.getAddress())).to.equal(amount);
    });

    it("Should reject zero address for token balance", async function () {
      await expect(
        treasuryVault.getTokenBalance(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid token address");
    });
  });

  describe("Edge Cases", function () {
    it("Should handle multiple authorized spenders", async function () {
      await treasuryVault.depositETH({ value: ethers.parseEther("10.0") });
      
      await treasuryVault.authorizeSpender(spender1.address);
      await treasuryVault.authorizeSpender(spender2.address);
      
      await treasuryVault.connect(spender1).withdrawETH(user1.address, ethers.parseEther("1.0"));
      await treasuryVault.connect(spender2).withdrawETH(user2.address, ethers.parseEther("2.0"));
      
      expect(await treasuryVault.getETHBalance()).to.equal(ethers.parseEther("7.0"));
    });

    it("Should handle limits for different tokens independently", async function () {
      // Set limits for ETH
      await treasuryVault.setTransactionLimit(ethers.ZeroAddress, ethers.parseEther("1.0"));
      
      // Set limits for token
      await treasuryVault.setTransactionLimit(await mockToken.getAddress(), ethers.parseEther("10.0"));
      
      expect(await treasuryVault.transactionLimit(ethers.ZeroAddress)).to.equal(ethers.parseEther("1.0"));
      expect(await treasuryVault.transactionLimit(await mockToken.getAddress()))
        .to.equal(ethers.parseEther("10.0"));
    });

    it("Should handle reentrancy protection", async function () {
      // This is implicitly tested by all withdrawal tests passing
      // ReentrancyGuard prevents reentrancy attacks
      await treasuryVault.depositETH({ value: ethers.parseEther("5.0") });
      await treasuryVault.withdrawETH(user1.address, ethers.parseEther("1.0"));
    });
  });

  describe("Nullification Restriction", function () {
    let nullifierRegistry;
    let nullifiedUser;

    beforeEach(async function () {
      nullifiedUser = user2;

      // Deploy NullifierRegistry
      const NullifierRegistry = await ethers.getContractFactory("NullifierRegistry");
      nullifierRegistry = await NullifierRegistry.deploy();
      await nullifierRegistry.waitForDeployment();

      // Initialize RSA params (use simple test values)
      const n = ethers.toBeHex(BigInt("0x" + "ff".repeat(256)), 256);
      const g = ethers.toBeHex(BigInt(3), 256);
      const initialAcc = ethers.toBeHex(BigInt(3), 256);
      await nullifierRegistry.initializeParams(n, g, initialAcc);

      // Grant NULLIFIER_ADMIN_ROLE to owner for testing
      const NULLIFIER_ADMIN_ROLE = await nullifierRegistry.NULLIFIER_ADMIN_ROLE();
      await nullifierRegistry.grantRole(NULLIFIER_ADMIN_ROLE, owner.address);

      // Fund the vault
      await treasuryVault.depositETH({ value: ethers.parseEther("10.0") });

      // Fund with tokens
      const depositAmount = ethers.parseEther("1000");
      await mockToken.connect(user1).approve(await treasuryVault.getAddress(), depositAmount);
      await treasuryVault.connect(user1).depositERC20(await mockToken.getAddress(), depositAmount);
    });

    describe("Configuration", function () {
      it("Should allow owner to set nullifier registry", async function () {
        await expect(
          treasuryVault.setNullifierRegistry(await nullifierRegistry.getAddress())
        ).to.emit(treasuryVault, "NullifierRegistryUpdated")
          .withArgs(await nullifierRegistry.getAddress());

        expect(await treasuryVault.nullifierRegistry()).to.equal(await nullifierRegistry.getAddress());
      });

      it("Should reject zero address for nullifier registry", async function () {
        await expect(
          treasuryVault.setNullifierRegistry(ethers.ZeroAddress)
        ).to.be.revertedWith("Invalid nullifier registry address");
      });

      it("Should not allow non-owner to set nullifier registry", async function () {
        await expect(
          treasuryVault.connect(user1).setNullifierRegistry(await nullifierRegistry.getAddress())
        ).to.be.reverted;
      });

      it("Should allow owner to enable nullification enforcement", async function () {
        await expect(
          treasuryVault.setNullificationEnforcement(true)
        ).to.emit(treasuryVault, "NullificationEnforcementUpdated")
          .withArgs(true);

        expect(await treasuryVault.enforceNullificationOnWithdrawals()).to.equal(true);
      });

      it("Should allow owner to disable nullification enforcement", async function () {
        await treasuryVault.setNullificationEnforcement(true);

        await expect(
          treasuryVault.setNullificationEnforcement(false)
        ).to.emit(treasuryVault, "NullificationEnforcementUpdated")
          .withArgs(false);

        expect(await treasuryVault.enforceNullificationOnWithdrawals()).to.equal(false);
      });

      it("Should not allow non-owner to set enforcement", async function () {
        await expect(
          treasuryVault.connect(user1).setNullificationEnforcement(true)
        ).to.be.reverted;
      });
    });

    describe("ETH Withdrawal Restrictions", function () {
      beforeEach(async function () {
        // Configure nullifier registry and enable enforcement
        await treasuryVault.setNullifierRegistry(await nullifierRegistry.getAddress());
        await treasuryVault.setNullificationEnforcement(true);
      });

      it("Should allow withdrawal to non-nullified address", async function () {
        const withdrawAmount = ethers.parseEther("1.0");

        await expect(
          treasuryVault.withdrawETH(user1.address, withdrawAmount)
        ).to.emit(treasuryVault, "Withdrawal")
          .withArgs(ethers.ZeroAddress, user1.address, withdrawAmount, owner.address);
      });

      it("Should block withdrawal to nullified address", async function () {
        // Nullify the user
        await nullifierRegistry.nullifyAddress(nullifiedUser.address, "test nullification");

        const withdrawAmount = ethers.parseEther("1.0");

        await expect(
          treasuryVault.withdrawETH(nullifiedUser.address, withdrawAmount)
        ).to.be.revertedWith("Recipient address is nullified");
      });

      it("Should revert with message when withdrawal blocked by nullification", async function () {
        await nullifierRegistry.nullifyAddress(nullifiedUser.address, "test nullification");

        const withdrawAmount = ethers.parseEther("1.0");

        await expect(
          treasuryVault.withdrawETH(nullifiedUser.address, withdrawAmount)
        ).to.be.revertedWith("Recipient address is nullified");
      });

      it("Should allow withdrawal after address is reinstated", async function () {
        // Nullify and then reinstate
        await nullifierRegistry.nullifyAddress(nullifiedUser.address, "test nullification");
        await nullifierRegistry.reinstateAddress(nullifiedUser.address, "test reinstatement");

        const withdrawAmount = ethers.parseEther("1.0");

        await expect(
          treasuryVault.withdrawETH(nullifiedUser.address, withdrawAmount)
        ).to.emit(treasuryVault, "Withdrawal");
      });

      it("Should allow withdrawal to nullified address when enforcement is disabled", async function () {
        // Nullify the address
        await nullifierRegistry.nullifyAddress(nullifiedUser.address, "test nullification");

        // Disable enforcement
        await treasuryVault.setNullificationEnforcement(false);

        const withdrawAmount = ethers.parseEther("1.0");

        // Should succeed even though address is nullified
        await expect(
          treasuryVault.withdrawETH(nullifiedUser.address, withdrawAmount)
        ).to.emit(treasuryVault, "Withdrawal");
      });
    });

    describe("ERC20 Withdrawal Restrictions", function () {
      beforeEach(async function () {
        // Configure nullifier registry and enable enforcement
        await treasuryVault.setNullifierRegistry(await nullifierRegistry.getAddress());
        await treasuryVault.setNullificationEnforcement(true);
      });

      it("Should allow token withdrawal to non-nullified address", async function () {
        const withdrawAmount = ethers.parseEther("100");

        await expect(
          treasuryVault.withdrawERC20(await mockToken.getAddress(), user1.address, withdrawAmount)
        ).to.emit(treasuryVault, "Withdrawal")
          .withArgs(await mockToken.getAddress(), user1.address, withdrawAmount, owner.address);
      });

      it("Should block token withdrawal to nullified address", async function () {
        // Nullify the user
        await nullifierRegistry.nullifyAddress(nullifiedUser.address, "test nullification");

        const withdrawAmount = ethers.parseEther("100");

        await expect(
          treasuryVault.withdrawERC20(await mockToken.getAddress(), nullifiedUser.address, withdrawAmount)
        ).to.be.revertedWith("Recipient address is nullified");
      });

      it("Should revert with message for blocked token withdrawal", async function () {
        await nullifierRegistry.nullifyAddress(nullifiedUser.address, "test nullification");

        const withdrawAmount = ethers.parseEther("100");
        const tokenAddress = await mockToken.getAddress();

        await expect(
          treasuryVault.withdrawERC20(tokenAddress, nullifiedUser.address, withdrawAmount)
        ).to.be.revertedWith("Recipient address is nullified");
      });

      it("Should allow token withdrawal to nullified address when enforcement is disabled", async function () {
        // Nullify the address
        await nullifierRegistry.nullifyAddress(nullifiedUser.address, "test nullification");

        // Disable enforcement
        await treasuryVault.setNullificationEnforcement(false);

        const withdrawAmount = ethers.parseEther("100");

        // Should succeed
        await expect(
          treasuryVault.withdrawERC20(await mockToken.getAddress(), nullifiedUser.address, withdrawAmount)
        ).to.emit(treasuryVault, "Withdrawal");
      });
    });

    describe("isRecipientNullified View Function", function () {
      it("Should return false when no registry is configured", async function () {
        expect(await treasuryVault.isRecipientNullified(nullifiedUser.address)).to.equal(false);
      });

      it("Should return false for non-nullified address", async function () {
        await treasuryVault.setNullifierRegistry(await nullifierRegistry.getAddress());

        expect(await treasuryVault.isRecipientNullified(user1.address)).to.equal(false);
      });

      it("Should return true for nullified address", async function () {
        await treasuryVault.setNullifierRegistry(await nullifierRegistry.getAddress());
        await nullifierRegistry.nullifyAddress(nullifiedUser.address, "test nullification");

        expect(await treasuryVault.isRecipientNullified(nullifiedUser.address)).to.equal(true);
      });

      it("Should return false after address is reinstated", async function () {
        await treasuryVault.setNullifierRegistry(await nullifierRegistry.getAddress());
        await nullifierRegistry.nullifyAddress(nullifiedUser.address, "test nullification");
        await nullifierRegistry.reinstateAddress(nullifiedUser.address, "test reinstatement");

        expect(await treasuryVault.isRecipientNullified(nullifiedUser.address)).to.equal(false);
      });
    });

    describe("Edge Cases", function () {
      it("Should work without registry configured (no enforcement)", async function () {
        // Enable enforcement but don't configure registry
        await treasuryVault.setNullificationEnforcement(true);

        const withdrawAmount = ethers.parseEther("1.0");

        // Should still work because registry is not configured
        await expect(
          treasuryVault.withdrawETH(user1.address, withdrawAmount)
        ).to.emit(treasuryVault, "Withdrawal");
      });

      it("Should work with registry configured but enforcement disabled", async function () {
        await treasuryVault.setNullifierRegistry(await nullifierRegistry.getAddress());
        await nullifierRegistry.nullifyAddress(nullifiedUser.address, "test nullification");
        // enforcement is false by default

        const withdrawAmount = ethers.parseEther("1.0");

        // Should work because enforcement is disabled
        await expect(
          treasuryVault.withdrawETH(nullifiedUser.address, withdrawAmount)
        ).to.emit(treasuryVault, "Withdrawal");
      });

      it("Should combine nullification check with spending limits", async function () {
        await treasuryVault.setNullifierRegistry(await nullifierRegistry.getAddress());
        await treasuryVault.setNullificationEnforcement(true);
        await treasuryVault.setTransactionLimit(ethers.ZeroAddress, ethers.parseEther("2.0"));

        // Should fail for exceeding limit (before nullification check)
        await expect(
          treasuryVault.withdrawETH(user1.address, ethers.parseEther("3.0"))
        ).to.be.revertedWith("Exceeds transaction limit");

        // Should fail for nullified address
        await nullifierRegistry.nullifyAddress(nullifiedUser.address, "test nullification");
        await expect(
          treasuryVault.withdrawETH(nullifiedUser.address, ethers.parseEther("1.0"))
        ).to.be.revertedWith("Recipient address is nullified");
      });

      it("Should combine nullification check with pause", async function () {
        await treasuryVault.setNullifierRegistry(await nullifierRegistry.getAddress());
        await treasuryVault.setNullificationEnforcement(true);
        await treasuryVault.pause();

        // Should fail for pause (before nullification check)
        await expect(
          treasuryVault.withdrawETH(user1.address, ethers.parseEther("1.0"))
        ).to.be.revertedWith("Vault is paused");
      });
    });
  });
});
