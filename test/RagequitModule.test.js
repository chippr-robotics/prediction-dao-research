const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RagequitModule", function () {
  let ragequitModule;
  let governanceToken;
  let treasuryVault;
  let owner;
  let user1;
  let user2;

  beforeEach(async function () {
    [owner, user1, user2, treasuryVault] = await ethers.getSigners();
    
    // Deploy mock ERC20 token
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    governanceToken = await MockERC20.deploy("Governance Token", "GOV", ethers.parseEther("1000000"));
    
    const RagequitModule = await ethers.getContractFactory("RagequitModule");
    ragequitModule = await RagequitModule.deploy();
    await ragequitModule.initialize(
      owner.address,
      await governanceToken.getAddress(),
      treasuryVault.address
    );
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await ragequitModule.owner()).to.equal(owner.address);
    });

    it("Should set correct governance token", async function () {
      expect(await ragequitModule.governanceToken()).to.equal(await governanceToken.getAddress());
    });

    it("Should set correct treasury vault", async function () {
      expect(await ragequitModule.treasuryVault()).to.equal(treasuryVault.address);
    });

    it("Should set correct ragequit window", async function () {
      expect(await ragequitModule.RAGEQUIT_WINDOW()).to.equal(7 * 24 * 60 * 60); // 7 days
    });

    it("Should reject zero token address", async function () {
      const RagequitModule = await ethers.getContractFactory("RagequitModule");
      const module = await RagequitModule.deploy();
      await expect(
        module.initialize(owner.address, ethers.ZeroAddress, treasuryVault.address)
      ).to.be.revertedWith("Invalid token");
    });

    it("Should reject zero vault address", async function () {
      const RagequitModule = await ethers.getContractFactory("RagequitModule");
      const module = await RagequitModule.deploy();
      await expect(
        module.initialize(owner.address, await governanceToken.getAddress(), ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid vault");
    });
  });

  describe("Ragequit Window Management", function () {
    it("Should allow owner to open ragequit window", async function () {
      const proposalId = 1;
      const snapshotTime = Math.floor(Date.now() / 1000);
      const executionTime = snapshotTime + (10 * 24 * 60 * 60); // 10 days later

      await expect(
        ragequitModule.openRagequitWindow(proposalId, snapshotTime, executionTime)
      ).to.emit(ragequitModule, "RagequitWindowOpened")
        .withArgs(proposalId, snapshotTime, executionTime);
    });

    it("Should reject invalid execution time", async function () {
      const proposalId = 1;
      const snapshotTime = Math.floor(Date.now() / 1000);
      const executionTime = snapshotTime - 1000; // Before snapshot

      await expect(
        ragequitModule.openRagequitWindow(proposalId, snapshotTime, executionTime)
      ).to.be.revertedWith("Invalid execution time");
    });

    it("Should reject duplicate window", async function () {
      const proposalId = 1;
      const snapshotTime = Math.floor(Date.now() / 1000);
      const executionTime = snapshotTime + (10 * 24 * 60 * 60);

      await ragequitModule.openRagequitWindow(proposalId, snapshotTime, executionTime);

      await expect(
        ragequitModule.openRagequitWindow(proposalId, snapshotTime, executionTime)
      ).to.be.revertedWith("Window already opened");
    });

    it("Should only allow owner to open window", async function () {
      const proposalId = 1;
      const snapshotTime = Math.floor(Date.now() / 1000);
      const executionTime = snapshotTime + (10 * 24 * 60 * 60);

      await expect(
        ragequitModule.connect(user1).openRagequitWindow(proposalId, snapshotTime, executionTime)
      ).to.be.revertedWithCustomError(ragequitModule, "OwnableUnauthorizedAccount");
    });
  });

  describe("Eligibility Management", function () {
    it("Should allow owner to set user as eligible", async function () {
      const proposalId = 1;
      
      await ragequitModule.setEligible(proposalId, user1.address);
      
      expect(await ragequitModule.eligibleToRagequit(proposalId, user1.address)).to.equal(true);
    });

    it("Should only allow owner to set eligibility", async function () {
      const proposalId = 1;
      
      await expect(
        ragequitModule.connect(user1).setEligible(proposalId, user2.address)
      ).to.be.revertedWithCustomError(ragequitModule, "OwnableUnauthorizedAccount");
    });
  });

  describe("Ragequit Execution", function () {
    beforeEach(async function () {
      const proposalId = 1;
      const snapshotTime = Math.floor(Date.now() / 1000) + 1;
      const executionTime = snapshotTime + (10 * 24 * 60 * 60);

      await ragequitModule.openRagequitWindow(proposalId, snapshotTime, executionTime);
      await ragequitModule.setEligible(proposalId, user1.address);

      // Give user1 some tokens
      await governanceToken.transfer(user1.address, ethers.parseEther("1000"));
      
      // Fund the treasury vault (for calculateTreasuryShare)
      await owner.sendTransaction({
        to: treasuryVault.address,
        value: ethers.parseEther("10")
      });
      
      // Fund the ragequit module with ETH (for actual payment)
      await owner.sendTransaction({
        to: await ragequitModule.getAddress(),
        value: ethers.parseEther("10")
      });
    });

    it("Should allow eligible user to ragequit", async function () {
      const proposalId = 1;
      const tokenAmount = ethers.parseEther("100");

      // Approve tokens
      await governanceToken.connect(user1).approve(await ragequitModule.getAddress(), tokenAmount);

      // Calculate expected treasury share - uses treasury vault balance, not module balance
      const totalSupply = await governanceToken.totalSupply();
      const treasuryBalance = await ethers.provider.getBalance(treasuryVault.address);
      const expectedShare = (treasuryBalance * tokenAmount) / totalSupply;

      await expect(
        ragequitModule.connect(user1).ragequit(proposalId, tokenAmount)
      ).to.emit(ragequitModule, "RagequitExecuted")
        .withArgs(user1.address, proposalId, tokenAmount, expectedShare);

      expect(await ragequitModule.hasRagequit(user1.address, proposalId)).to.equal(true);
    });

    it("Should reject ragequit if not eligible", async function () {
      const proposalId = 1;
      const tokenAmount = ethers.parseEther("100");

      await expect(
        ragequitModule.connect(user2).ragequit(proposalId, tokenAmount)
      ).to.be.revertedWith("Not eligible");
    });

    it("Should reject ragequit if already ragequit", async function () {
      const proposalId = 1;
      const tokenAmount = ethers.parseEther("100");

      await governanceToken.connect(user1).approve(await ragequitModule.getAddress(), tokenAmount * 2n);
      await ragequitModule.connect(user1).ragequit(proposalId, tokenAmount);

      await expect(
        ragequitModule.connect(user1).ragequit(proposalId, tokenAmount)
      ).to.be.revertedWith("Already ragequit");
    });

    it("Should reject ragequit with zero token amount", async function () {
      const proposalId = 1;

      await expect(
        ragequitModule.connect(user1).ragequit(proposalId, 0)
      ).to.be.revertedWith("Invalid token amount");
    });

    it("Should reject ragequit if window not opened", async function () {
      const proposalId = 2;
      const tokenAmount = ethers.parseEther("100");

      // Need to set eligibility first before window check
      await ragequitModule.setEligible(proposalId, user1.address);

      await expect(
        ragequitModule.connect(user1).ragequit(proposalId, tokenAmount)
      ).to.be.revertedWith("Window not opened");
    });

    it("Should reject ragequit if proposal executed", async function () {
      const proposalId = 1;
      const tokenAmount = ethers.parseEther("100");

      await ragequitModule.markProposalExecuted(proposalId);

      await expect(
        ragequitModule.connect(user1).ragequit(proposalId, tokenAmount)
      ).to.be.revertedWith("Proposal executed");
    });

    it("Should reject ragequit if window closed", async function () {
      const proposalId = 1;
      const tokenAmount = ethers.parseEther("100");

      // Fast forward past execution time
      await ethers.provider.send("evm_increaseTime", [11 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine");

      await expect(
        ragequitModule.connect(user1).ragequit(proposalId, tokenAmount)
      ).to.be.revertedWith("Window closed");
    });
  });

  describe("Treasury Share Calculation", function () {
    it("Should calculate correct treasury share", async function () {
      // Deploy fresh contracts for this test to avoid contamination
      const signers = await ethers.getSigners();
      const testOwner = signers[5];
      const testUser = signers[6];
      const testVault = signers[7];
      
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const testToken = await MockERC20.connect(testOwner).deploy("Test Token", "TEST", ethers.parseEther("1000000"));
      
      const RagequitModule = await ethers.getContractFactory("RagequitModule");
      const testModule = await RagequitModule.connect(testOwner).deploy(
        await testToken.getAddress(),
        testVault.address
      );
      
      // Fund the treasury vault with exactly 10 ETH
      await testOwner.sendTransaction({
        to: testVault.address,
        value: ethers.parseEther("10")
      });

      const tokenAmount = ethers.parseEther("100");
      const totalSupply = await testToken.totalSupply();
      const treasuryBalance = await ethers.provider.getBalance(testVault.address);
      
      const expectedShare = (treasuryBalance * tokenAmount) / totalSupply;
      const calculatedShare = await testModule.calculateTreasuryShare(testUser.address, tokenAmount);
      
      expect(calculatedShare).to.equal(expectedShare);
    });

    it("Should reject zero token amount", async function () {
      // Use a fresh deployment to avoid state contamination
      const signers = await ethers.getSigners();
      const testOwner = signers[8];
      const testUser = signers[9];
      const testVault = signers[10];
      
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const testToken = await MockERC20.connect(testOwner).deploy("Test Token", "TEST", ethers.parseEther("1000000"));
      
      const RagequitModule = await ethers.getContractFactory("RagequitModule");
      const testModule = await RagequitModule.connect(testOwner).deploy(
        await testToken.getAddress(),
        testVault.address
      );
      
      await expect(
        testModule.calculateTreasuryShare(testUser.address, 0)
      ).to.be.revertedWith("Invalid token amount");
    });

    it("Should handle zero treasury balance", async function () {
      // Deploy a new ragequit module with empty treasury
      const signers = await ethers.getSigners();
      const testOwner = signers[11];
      const testUser = signers[12];
      const emptyVault = signers[13];
      
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const testToken = await MockERC20.connect(testOwner).deploy("Test Token", "TEST", ethers.parseEther("1000000"));
      
      const RagequitModule = await ethers.getContractFactory("RagequitModule");
      const newRagequitModule = await RagequitModule.connect(testOwner).deploy(
        await testToken.getAddress(),
        emptyVault.address
      );

      const tokenAmount = ethers.parseEther("100");
      const treasuryBalance = await ethers.provider.getBalance(emptyVault.address);
      const totalSupply = await testToken.totalSupply();
      const expectedShare = (treasuryBalance * tokenAmount) / totalSupply;
      
      const share = await newRagequitModule.calculateTreasuryShare(testUser.address, tokenAmount);
      
      // With zero or minimal treasury balance, share should match calculation
      expect(share).to.equal(expectedShare);
    });
  });

  describe("Proposal Execution", function () {
    beforeEach(async function () {
      const proposalId = 1;
      const snapshotTime = Math.floor(Date.now() / 1000);
      const executionTime = snapshotTime + (10 * 24 * 60 * 60);

      await ragequitModule.openRagequitWindow(proposalId, snapshotTime, executionTime);
    });

    it("Should allow owner to mark proposal as executed", async function () {
      const proposalId = 1;

      await ragequitModule.markProposalExecuted(proposalId);

      const window = await ragequitModule.ragequitWindows(proposalId);
      expect(window.executed).to.equal(true);
    });

    it("Should reject marking non-existent proposal", async function () {
      const proposalId = 999;

      await expect(
        ragequitModule.markProposalExecuted(proposalId)
      ).to.be.revertedWith("Window not opened");
    });

    it("Should only allow owner to mark proposal as executed", async function () {
      const proposalId = 1;

      await expect(
        ragequitModule.connect(user1).markProposalExecuted(proposalId)
      ).to.be.revertedWithCustomError(ragequitModule, "OwnableUnauthorizedAccount");
    });
  });

  describe("Eligibility Checks", function () {
    beforeEach(async function () {
      const proposalId = 1;
      await ragequitModule.setEligible(proposalId, user1.address);
    });

    it("Should return true for eligible user", async function () {
      const proposalId = 1;
      expect(await ragequitModule.isEligible(proposalId, user1.address)).to.equal(true);
    });

    it("Should return false for non-eligible user", async function () {
      const proposalId = 1;
      expect(await ragequitModule.isEligible(proposalId, user2.address)).to.equal(false);
    });

    it("Should return false after ragequit", async function () {
      const proposalId = 2; // Use a different proposal ID to avoid conflicts
      
      // Open a new window with proper timing
      const currentTime = await ethers.provider.getBlock('latest').then(b => b.timestamp);
      const snapshotTime = currentTime + 1;
      const executionTime = snapshotTime + (10 * 24 * 60 * 60);

      await ragequitModule.openRagequitWindow(proposalId, snapshotTime, executionTime);
      await ragequitModule.setEligible(proposalId, user1.address);
      
      // Give user1 tokens and approve
      await governanceToken.transfer(user1.address, ethers.parseEther("1000"));
      await governanceToken.connect(user1).approve(await ragequitModule.getAddress(), ethers.parseEther("100"));
      
      // Fund treasury vault and module
      await owner.sendTransaction({
        to: treasuryVault.address,
        value: ethers.parseEther("10")
      });
      await owner.sendTransaction({
        to: await ragequitModule.getAddress(),
        value: ethers.parseEther("10")
      });

      await ragequitModule.connect(user1).ragequit(proposalId, ethers.parseEther("100"));

      expect(await ragequitModule.isEligible(proposalId, user1.address)).to.equal(false);
    });
  });

  describe("Ragequit Window Details", function () {
    it("Should return correct window details", async function () {
      const proposalId = 1;
      const currentBlock = await ethers.provider.getBlock('latest');
      const currentTime = currentBlock.timestamp;
      const snapshotTime = currentTime + 100;  // 100 seconds in the future
      const executionTime = snapshotTime + (10 * 24 * 60 * 60);

      await ragequitModule.openRagequitWindow(proposalId, snapshotTime, executionTime);

      const [snapshot, execution, executed, isOpen] = await ragequitModule.getRagequitWindow(proposalId);
      
      expect(snapshot).to.equal(snapshotTime);
      expect(execution).to.equal(executionTime);
      expect(executed).to.equal(false);
      // isOpen requires block.timestamp < executionTime, which should be true
      expect(isOpen).to.equal(true);
    });

    it("Should show window as closed after execution", async function () {
      const proposalId = 1;
      const snapshotTime = Math.floor(Date.now() / 1000);
      const executionTime = snapshotTime + (10 * 24 * 60 * 60);

      await ragequitModule.openRagequitWindow(proposalId, snapshotTime, executionTime);
      await ragequitModule.markProposalExecuted(proposalId);

      const [, , executed, isOpen] = await ragequitModule.getRagequitWindow(proposalId);
      
      expect(executed).to.equal(true);
      expect(isOpen).to.equal(false);
    });

    it("Should show window as closed after time expires", async function () {
      const proposalId = 1;
      const snapshotTime = Math.floor(Date.now() / 1000);
      const executionTime = snapshotTime + (10 * 24 * 60 * 60);

      await ragequitModule.openRagequitWindow(proposalId, snapshotTime, executionTime);

      // Fast forward past execution time
      await ethers.provider.send("evm_increaseTime", [11 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine");

      const [, , , isOpen] = await ragequitModule.getRagequitWindow(proposalId);
      expect(isOpen).to.equal(false);
    });

    it("Should return empty details for non-existent window", async function () {
      const proposalId = 999;
      const [snapshot, execution, executed, isOpen] = await ragequitModule.getRagequitWindow(proposalId);
      
      expect(snapshot).to.equal(0);
      expect(execution).to.equal(0);
      expect(executed).to.equal(false);
      expect(isOpen).to.equal(false);
    });
  });

  describe("Treasury Vault Management", function () {
    it("Should allow owner to update treasury vault", async function () {
      const newVault = user2.address;

      await ragequitModule.updateTreasuryVault(newVault);

      expect(await ragequitModule.treasuryVault()).to.equal(newVault);
    });

    it("Should reject zero address for treasury vault", async function () {
      await expect(
        ragequitModule.updateTreasuryVault(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid vault");
    });

    it("Should only allow owner to update treasury vault", async function () {
      const newVault = user2.address;

      await expect(
        ragequitModule.connect(user1).updateTreasuryVault(newVault)
      ).to.be.revertedWithCustomError(ragequitModule, "OwnableUnauthorizedAccount");
    });
  });

  describe("Emergency Withdraw", function () {
    it("Should allow owner to emergency withdraw", async function () {
      // Fund the module
      await owner.sendTransaction({
        to: await ragequitModule.getAddress(),
        value: ethers.parseEther("5")
      });

      const ownerBalanceBefore = await ethers.provider.getBalance(owner.address);
      
      const tx = await ragequitModule.emergencyWithdraw();
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;

      const ownerBalanceAfter = await ethers.provider.getBalance(owner.address);
      
      expect(ownerBalanceAfter).to.be.closeTo(
        ownerBalanceBefore + ethers.parseEther("5") - gasUsed,
        ethers.parseEther("0.001")
      );
    });

    it("Should only allow owner to emergency withdraw", async function () {
      await expect(
        ragequitModule.connect(user1).emergencyWithdraw()
      ).to.be.revertedWithCustomError(ragequitModule, "OwnableUnauthorizedAccount");
    });
  });

  describe("Receive ETH", function () {
    it("Should accept ETH transfers", async function () {
      const amount = ethers.parseEther("1");
      
      await owner.sendTransaction({
        to: await ragequitModule.getAddress(),
        value: amount
      });

      const balance = await ethers.provider.getBalance(await ragequitModule.getAddress());
      expect(balance).to.equal(amount);
    });
  });
});
