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
    ragequitModule = await RagequitModule.deploy(
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
      await expect(
        RagequitModule.deploy(ethers.ZeroAddress, treasuryVault.address)
      ).to.be.revertedWith("Invalid token");
    });

    it("Should reject zero vault address", async function () {
      const RagequitModule = await ethers.getContractFactory("RagequitModule");
      await expect(
        RagequitModule.deploy(await governanceToken.getAddress(), ethers.ZeroAddress)
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
});
