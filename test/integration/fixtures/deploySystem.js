const { ethers } = require("hardhat");

/**
 * Comprehensive deployment fixture for integration tests
 * Deploys and configures the entire Prediction DAO system
 * 
 * @returns {Object} System contracts, test accounts, and constants
 */
async function deploySystemFixture() {
  // Get signers for different roles
  const [
    owner,
    guardian,
    proposer1,
    proposer2,
    trader1,
    trader2,
    trader3,
    challenger,
    reporter
  ] = await ethers.getSigners();

  // Deploy mock governance token
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const governanceToken = await MockERC20.deploy(
    "Governance Token",
    "GOV",
    ethers.parseEther("1000000")
  );
  await governanceToken.waitForDeployment();

  // Distribute tokens to test accounts
  await governanceToken.transfer(proposer1.address, ethers.parseEther("10000"));
  await governanceToken.transfer(proposer2.address, ethers.parseEther("10000"));
  await governanceToken.transfer(trader1.address, ethers.parseEther("5000"));
  await governanceToken.transfer(trader2.address, ethers.parseEther("5000"));
  await governanceToken.transfer(trader3.address, ethers.parseEther("5000"));

  // Deploy WelfareMetricRegistry
  const WelfareMetricRegistry = await ethers.getContractFactory("WelfareMetricRegistry");
  const welfareRegistry = await WelfareMetricRegistry.deploy();
  await welfareRegistry.waitForDeployment();
  await welfareRegistry.initialize(owner.address);

  // Deploy ProposalRegistry
  const ProposalRegistry = await ethers.getContractFactory("ProposalRegistry");
  const proposalRegistry = await ProposalRegistry.deploy();
  await proposalRegistry.waitForDeployment();
  await proposalRegistry.initialize(owner.address);

  // Deploy ConditionalMarketFactory
  const ConditionalMarketFactory = await ethers.getContractFactory("ConditionalMarketFactory");
  const marketFactory = await ConditionalMarketFactory.deploy();
  await marketFactory.waitForDeployment();
  await marketFactory.initialize(owner.address);

  // Deploy PrivacyCoordinator
  const PrivacyCoordinator = await ethers.getContractFactory("PrivacyCoordinator");
  const privacyCoordinator = await PrivacyCoordinator.deploy();
  await privacyCoordinator.waitForDeployment();
  await privacyCoordinator.initialize(owner.address);

  // Deploy OracleResolver
  const OracleResolver = await ethers.getContractFactory("OracleResolver");
  const oracleResolver = await OracleResolver.deploy();
  await oracleResolver.waitForDeployment();
  await oracleResolver.initialize(owner.address);

  // Deploy RagequitModule
  const RagequitModule = await ethers.getContractFactory("RagequitModule");
  const ragequitModule = await RagequitModule.deploy();
  await ragequitModule.waitForDeployment();
  await ragequitModule.initialize(
    owner.address,
    await governanceToken.getAddress(),
    owner.address // Treasury vault (using owner as placeholder)
  );

  // Deploy FutarchyGovernor
  const FutarchyGovernor = await ethers.getContractFactory("FutarchyGovernor");
  const futarchyGovernor = await FutarchyGovernor.deploy();
  await futarchyGovernor.waitForDeployment();
  await futarchyGovernor.initialize(
    owner.address,
    await welfareRegistry.getAddress(),
    await proposalRegistry.getAddress(),
    await marketFactory.getAddress(),
    await privacyCoordinator.getAddress(),
    await oracleResolver.getAddress(),
    await ragequitModule.getAddress(),
    owner.address // Treasury vault (using owner as placeholder)
  );

  // Setup initial welfare metrics before transferring ownership
  
  // Metric 0: Treasury Value - 50% weight
  await welfareRegistry.connect(owner).proposeMetric(
    "Treasury Value",
    "TWAP of total treasury holdings in USD",
    5000, // 50% weight
    0 // Governance category
  );
  await welfareRegistry.connect(owner).activateMetric(0);

  // Metric 1: Network Activity - 30% weight
  await welfareRegistry.connect(owner).proposeMetric(
    "Network Activity",
    "Composite index of transactions and active addresses",
    3000, // 30% weight
    0 // Governance category
  );
  await welfareRegistry.connect(owner).activateMetric(1);
  
  // Note: Ownership NOT transferred to FutarchyGovernor in fixture
  // This allows tests to use the owner account directly for simpler setup
  // Individual tests can transfer ownership if needed for specific scenarios

  return {
    contracts: {
      governanceToken,
      welfareRegistry,
      proposalRegistry,
      marketFactory,
      privacyCoordinator,
      oracleResolver,
      ragequitModule,
      futarchyGovernor
    },
    accounts: {
      owner,
      guardian,
      proposer1,
      proposer2,
      trader1,
      trader2,
      trader3,
      challenger,
      reporter
    },
    constants: {
      BOND_AMOUNT: ethers.parseEther("50"),
      FUNDING_AMOUNT: ethers.parseEther("1000"),
      TRADE_AMOUNT: ethers.parseEther("100"),
      ORACLE_BOND: ethers.parseEther("100"),
      CHALLENGE_BOND: ethers.parseEther("150")
    }
  };
}

module.exports = { deploySystemFixture };
