const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FutarchyGovernor", function () {
  let futarchyGovernor;
  let welfareRegistry;
  let proposalRegistry;
  let marketFactory;
  let privacyCoordinator;
  let oracleResolver;
  let ragequitModule;
  let governanceToken;
  let owner;
  let addr1;

  beforeEach(async function () {
    [owner, addr1] = await ethers.getSigners();
    
    // Deploy mock governance token
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    governanceToken = await MockERC20.deploy("Governance Token", "GOV", ethers.parseEther("1000000"));
    
    // Deploy dependencies
    const WelfareMetricRegistry = await ethers.getContractFactory("WelfareMetricRegistry");
    welfareRegistry = await WelfareMetricRegistry.deploy();
    
    const ProposalRegistry = await ethers.getContractFactory("ProposalRegistry");
    proposalRegistry = await ProposalRegistry.deploy();
    
    const ConditionalMarketFactory = await ethers.getContractFactory("ConditionalMarketFactory");
    marketFactory = await ConditionalMarketFactory.deploy();
    
    const PrivacyCoordinator = await ethers.getContractFactory("PrivacyCoordinator");
    privacyCoordinator = await PrivacyCoordinator.deploy();
    
    const OracleResolver = await ethers.getContractFactory("OracleResolver");
    oracleResolver = await OracleResolver.deploy();
    
    const RagequitModule = await ethers.getContractFactory("RagequitModule");
    ragequitModule = await RagequitModule.deploy(
      await governanceToken.getAddress(),
      addr1.address
    );
    
    // Deploy FutarchyGovernor
    const FutarchyGovernor = await ethers.getContractFactory("FutarchyGovernor");
    futarchyGovernor = await FutarchyGovernor.deploy(
      await welfareRegistry.getAddress(),
      await proposalRegistry.getAddress(),
      await marketFactory.getAddress(),
      await privacyCoordinator.getAddress(),
      await oracleResolver.getAddress(),
      await ragequitModule.getAddress(),
      addr1.address
    );
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await futarchyGovernor.owner()).to.equal(owner.address);
    });

    it("Should set correct welfare registry", async function () {
      expect(await futarchyGovernor.welfareRegistry()).to.equal(await welfareRegistry.getAddress());
    });

    it("Should set correct proposal registry", async function () {
      expect(await futarchyGovernor.proposalRegistry()).to.equal(await proposalRegistry.getAddress());
    });

    it("Should set correct market factory", async function () {
      expect(await futarchyGovernor.marketFactory()).to.equal(await marketFactory.getAddress());
    });

    it("Should initialize as not paused", async function () {
      expect(await futarchyGovernor.paused()).to.equal(false);
    });

    it("Should set correct minimum timelock", async function () {
      expect(await futarchyGovernor.MIN_TIMELOCK()).to.equal(2 * 24 * 60 * 60); // 2 days
    });
  });

  describe("Emergency Pause", function () {
    it("Should allow owner to toggle pause", async function () {
      await expect(
        futarchyGovernor.togglePause()
      ).to.emit(futarchyGovernor, "EmergencyPauseToggled")
        .withArgs(true);
      
      expect(await futarchyGovernor.paused()).to.equal(true);
    });

    it("Should only allow guardians to toggle pause", async function () {
      await expect(
        futarchyGovernor.connect(addr1).togglePause()
      ).to.be.revertedWith("Not guardian");
    });
  });

  describe("Guardian Management", function () {
    it("Should allow owner to add guardian", async function () {
      await expect(
        futarchyGovernor.updateGuardian(addr1.address, true)
      ).to.emit(futarchyGovernor, "GuardianUpdated")
        .withArgs(addr1.address, true);
      
      expect(await futarchyGovernor.guardians(addr1.address)).to.equal(true);
    });

    it("Should allow owner to remove guardian", async function () {
      await futarchyGovernor.updateGuardian(addr1.address, true);
      
      await expect(
        futarchyGovernor.updateGuardian(addr1.address, false)
      ).to.emit(futarchyGovernor, "GuardianUpdated")
        .withArgs(addr1.address, false);
      
      expect(await futarchyGovernor.guardians(addr1.address)).to.equal(false);
    });

    it("Should only allow owner to manage guardians", async function () {
      await expect(
        futarchyGovernor.connect(addr1).updateGuardian(addr1.address, true)
      ).to.be.revertedWithCustomError(futarchyGovernor, "OwnableUnauthorizedAccount");
    });
  });
});
