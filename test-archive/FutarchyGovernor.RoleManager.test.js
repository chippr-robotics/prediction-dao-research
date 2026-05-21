const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FutarchyGovernor - Role Manager Configuration", function () {
  let futarchyGovernor;
  let welfareRegistry;
  let proposalRegistry;
  let marketFactory;
  let privacyCoordinator;
  let oracleResolver;
  let ragequitModule;
  let roleManager;
  let governanceToken;
  let collateralToken;
  let owner;
  let addr1;

  beforeEach(async function () {
    [owner, addr1] = await ethers.getSigners();

    // Deploy mock tokens
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    governanceToken = await MockERC20.deploy("Governance Token", "GOV", ethers.parseEther("1000000"));

    // Deploy mock collateral token for markets (required for CTF1155)
    collateralToken = await MockERC20.deploy("Market Collateral", "MCOL", ethers.parseEther("10000000"));
    await collateralToken.waitForDeployment();

    // Deploy dependencies
    const WelfareMetricRegistry = await ethers.getContractFactory("WelfareMetricRegistry");
    welfareRegistry = await WelfareMetricRegistry.deploy();
    await welfareRegistry.initialize(owner.address);

    const ProposalRegistry = await ethers.getContractFactory("ProposalRegistry");
    proposalRegistry = await ProposalRegistry.deploy();
    await proposalRegistry.initialize(owner.address);

    // Deploy CTF1155 (required for ConditionalMarketFactory)
    const CTF1155 = await ethers.getContractFactory("CTF1155");
    const ctf1155 = await CTF1155.deploy();
    await ctf1155.waitForDeployment();

    const ConditionalMarketFactory = await ethers.getContractFactory("ConditionalMarketFactory");
    marketFactory = await ConditionalMarketFactory.deploy();
    await marketFactory.initialize(owner.address);

    // Set CTF1155 in market factory (required for market creation)
    await marketFactory.setCTF1155(await ctf1155.getAddress());

    const PrivacyCoordinator = await ethers.getContractFactory("PrivacyCoordinator");
    privacyCoordinator = await PrivacyCoordinator.deploy();
    await privacyCoordinator.initialize(owner.address);

    const OracleResolver = await ethers.getContractFactory("OracleResolver");
    oracleResolver = await OracleResolver.deploy();
    await oracleResolver.initialize(owner.address);

    const RagequitModule = await ethers.getContractFactory("RagequitModule");
    ragequitModule = await RagequitModule.deploy();
    await ragequitModule.initialize(
      owner.address,
      await governanceToken.getAddress(),
      addr1.address
    );

    // Deploy TieredRoleManager for testing
    const TieredRoleManager = await ethers.getContractFactory("TieredRoleManager");
    roleManager = await TieredRoleManager.deploy();
    await roleManager.waitForDeployment();
    // Initialize role metadata (TieredRoleManager auto-initializes admin on deploy)
    await roleManager.initializeRoleMetadata();

    // Deploy FutarchyGovernor
    const FutarchyGovernor = await ethers.getContractFactory("FutarchyGovernor");
    futarchyGovernor = await FutarchyGovernor.deploy();
    await futarchyGovernor.initialize(
      owner.address,
      await welfareRegistry.getAddress(),
      await proposalRegistry.getAddress(),
      await marketFactory.getAddress(),
      await privacyCoordinator.getAddress(),
      await oracleResolver.getAddress(),
      await ragequitModule.getAddress(),
      addr1.address
    );

    // Set collateral token for markets (required for CTF1155)
    await futarchyGovernor.setMarketCollateralToken(await collateralToken.getAddress());

    // Transfer ownership of marketFactory to futarchyGovernor so it can call setRoleManager
    await marketFactory.transferOwnership(await futarchyGovernor.getAddress());
  });

  describe("configureMarketFactoryRoleManager", function () {
    it("Should allow owner to configure role manager on market factory", async function () {
      const roleManagerAddress = await roleManager.getAddress();

      // Call should succeed without reverting
      await expect(
        futarchyGovernor.configureMarketFactoryRoleManager(roleManagerAddress)
      ).to.not.be.reverted;

      // Verify roleManager is set on marketFactory
      expect(await marketFactory.roleManager()).to.equal(roleManagerAddress);
    });

    it("Should reject non-owner calls with OwnableUnauthorizedAccount", async function () {
      const roleManagerAddress = await roleManager.getAddress();

      await expect(
        futarchyGovernor.connect(addr1).configureMarketFactoryRoleManager(roleManagerAddress)
      ).to.be.revertedWithCustomError(futarchyGovernor, "OwnableUnauthorizedAccount");
    });

    it("Should reject zero address with 'Invalid role manager address'", async function () {
      await expect(
        futarchyGovernor.configureMarketFactoryRoleManager(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid role manager address");
    });

    it("Should verify roleManager is correctly set on marketFactory after call", async function () {
      const roleManagerAddress = await roleManager.getAddress();

      // Before: roleManager should be zero address
      expect(await marketFactory.roleManager()).to.equal(ethers.ZeroAddress);

      // Configure role manager
      await futarchyGovernor.configureMarketFactoryRoleManager(roleManagerAddress);

      // After: roleManager should be the TieredRoleManager address
      expect(await marketFactory.roleManager()).to.equal(roleManagerAddress);
    });
  });
});
