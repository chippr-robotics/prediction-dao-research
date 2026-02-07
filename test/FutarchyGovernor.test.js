import { expect } from "chai";
import hre from "hardhat";

describe("FutarchyGovernor", function () {
  let ethers;
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
    const connection = await hre.network.connect();
    ethers = connection.ethers;
    [owner, addr1] = await ethers.getSigners();
    
    // Deploy mock tokens
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    governanceToken = await MockERC20.deploy("Governance Token", "GOV", ethers.parseEther("1000000"));
    
    // Deploy mock collateral token for markets (required for CTF1155)
    const collateralToken = await MockERC20.deploy("Market Collateral", "MCOL", ethers.parseEther("10000000"));
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

    // Transfer ownership of marketFactory to futarchyGovernor so it can deploy markets
    await marketFactory.transferOwnership(await futarchyGovernor.getAddress());
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

  describe("Governance Proposal Creation", function () {
    let proposalId;

    beforeEach(async function () {
      // Create a welfare metric first
      await welfareRegistry.proposeMetric("Test Metric", "Test", 5000, 0);
      await welfareRegistry.activateMetric(0);

      // Submit a proposal to registry  
      const bondAmount = await proposalRegistry.bondAmount();
      const currentBlock = await ethers.provider.getBlock('latest');
      const futureDeadline = currentBlock.timestamp + (90 * 24 * 60 * 60);

      proposalId = await proposalRegistry.submitProposal.staticCall(
        "Test Proposal",
        "Test Description",
        ethers.parseEther("1000"),
        addr1.address,
        0, // welfareMetricId
        ethers.ZeroAddress, // native token
        0, // startDate
        futureDeadline,
        { value: bondAmount }
      );

      await proposalRegistry.submitProposal(
        "Test Proposal",
        "Test Description",
        ethers.parseEther("1000"),
        addr1.address,
        0,
        ethers.ZeroAddress,
        0,
        futureDeadline,
        { value: bondAmount }
      );
    });

    it("Should allow creating governance proposal", async function () {
      await expect(
        futarchyGovernor.createGovernanceProposal(
          proposalId,
          ethers.parseEther("100"),
          ethers.parseEther("50"),
          7 * 24 * 60 * 60
        )
      ).to.emit(futarchyGovernor, "GovernanceProposalCreated");
    });

    it("Should reject creation when paused", async function () {
      await futarchyGovernor.togglePause();

      await expect(
        futarchyGovernor.createGovernanceProposal(
          proposalId,
          ethers.parseEther("100"),
          ethers.parseEther("50"),
          7 * 24 * 60 * 60
        )
      ).to.be.revertedWith("System paused");
    });

    it("Should only allow owner to create governance proposal", async function () {
      await expect(
        futarchyGovernor.connect(addr1).createGovernanceProposal(
          proposalId,
          ethers.parseEther("100"),
          ethers.parseEther("50"),
          7 * 24 * 60 * 60
        )
      ).to.be.revertedWithCustomError(futarchyGovernor, "OwnableUnauthorizedAccount");
    });
  });

  describe("Governance Proposal Query", function () {
    let govProposalId;

    beforeEach(async function () {
      // Create welfare metric
      await welfareRegistry.proposeMetric("Test Metric", "Test", 5000, 0);
      await welfareRegistry.activateMetric(0);

      // Submit proposal
      const bondAmount = await proposalRegistry.bondAmount();
      const currentBlock = await ethers.provider.getBlock('latest');
      const futureDeadline = currentBlock.timestamp + (90 * 24 * 60 * 60);

      const proposalId = await proposalRegistry.submitProposal.staticCall(
        "Test Proposal",
        "Test Description",
        ethers.parseEther("1000"),
        addr1.address,
        0,
        ethers.ZeroAddress,
        0,
        futureDeadline,
        { value: bondAmount }
      );

      await proposalRegistry.submitProposal(
        "Test Proposal",
        "Test Description",
        ethers.parseEther("1000"),
        addr1.address,
        0,
        ethers.ZeroAddress,
        0,
        futureDeadline,
        { value: bondAmount }
      );

      // Create governance proposal
      govProposalId = await futarchyGovernor.governanceProposalCount();
      await futarchyGovernor.createGovernanceProposal(
        proposalId,
        ethers.parseEther("100"),
        ethers.parseEther("50"),
        7 * 24 * 60 * 60
      );
    });

    it("Should return governance proposal details", async function () {
      const [proposalId, marketId, phase, createdAt, executionTime, executed] = await futarchyGovernor.getGovernanceProposal(govProposalId);
      
      expect(executed).to.equal(false);
      expect(phase).to.equal(1); // MarketTrading phase
    });
  });

  describe("Emergency Withdraw", function () {
    it("Should allow owner to emergency withdraw", async function () {
      // Send some ETH to the contract
      await owner.sendTransaction({
        to: await futarchyGovernor.getAddress(),
        value: ethers.parseEther("1")
      });

      const ownerBalanceBefore = await ethers.provider.getBalance(owner.address);
      const tx = await futarchyGovernor.emergencyWithdraw();
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      const ownerBalanceAfter = await ethers.provider.getBalance(owner.address);

      expect(ownerBalanceAfter).to.be.closeTo(
        ownerBalanceBefore + ethers.parseEther("1") - gasUsed,
        ethers.parseEther("0.001")
      );
    });

    it("Should only allow owner to emergency withdraw", async function () {
      await expect(
        futarchyGovernor.connect(addr1).emergencyWithdraw()
      ).to.be.revertedWithCustomError(futarchyGovernor, "OwnableUnauthorizedAccount");
    });
  });

  describe("Receive ETH", function () {
    it("Should accept ETH transfers", async function () {
      const amount = ethers.parseEther("1");
      
      await owner.sendTransaction({
        to: await futarchyGovernor.getAddress(),
        value: amount
      });

      const balance = await ethers.provider.getBalance(await futarchyGovernor.getAddress());
      expect(balance).to.equal(amount);
    });
  });
});
