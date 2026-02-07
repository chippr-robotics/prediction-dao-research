/**
 * Comprehensive deployment fixture for integration tests
 * Deploys and configures the entire Prediction DAO system
 *
 * @param {Object} connection - Network connection passed by loadFixture (Hardhat 3 pattern)
 * @returns {Object} System contracts, test accounts, and constants
 */
export async function deploySystemFixture(connection) {
  // Get ethers and networkHelpers from connection (Hardhat 3 pattern)
  const { ethers, networkHelpers } = connection;
  const time = networkHelpers.time;

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

  // Deploy mock collateral token for markets (required for CTF1155)
  const collateralToken = await MockERC20.deploy(
    "Market Collateral",
    "MCOL",
    ethers.parseEther("10000000")
  );
  await collateralToken.waitForDeployment();

  // Distribute tokens to test accounts
  await governanceToken.transfer(proposer1.address, ethers.parseEther("10000"));
  await governanceToken.transfer(proposer2.address, ethers.parseEther("10000"));
  await governanceToken.transfer(trader1.address, ethers.parseEther("5000"));
  await governanceToken.transfer(trader2.address, ethers.parseEther("5000"));
  await governanceToken.transfer(trader3.address, ethers.parseEther("5000"));
  
  // Distribute collateral tokens for trading
  await collateralToken.transfer(proposer1.address, ethers.parseEther("50000"));
  await collateralToken.transfer(proposer2.address, ethers.parseEther("50000"));
  await collateralToken.transfer(trader1.address, ethers.parseEther("50000"));
  await collateralToken.transfer(trader2.address, ethers.parseEther("50000"));
  await collateralToken.transfer(trader3.address, ethers.parseEther("50000"));

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

  // Deploy CTF1155 (required for ConditionalMarketFactory)
  const CTF1155 = await ethers.getContractFactory("CTF1155");
  const ctf1155 = await CTF1155.deploy();
  await ctf1155.waitForDeployment();

  // Deploy ConditionalMarketFactory
  const ConditionalMarketFactory = await ethers.getContractFactory("ConditionalMarketFactory");
  const marketFactory = await ConditionalMarketFactory.deploy();
  await marketFactory.waitForDeployment();
  await marketFactory.initialize(owner.address);
  
  // Set CTF1155 in market factory (required for market creation)
  await marketFactory.setCTF1155(await ctf1155.getAddress());

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
  
  // Add reporter as designated reporter before transferring ownership
  await oracleResolver.connect(owner).addDesignatedReporter(reporter.address);

  // Deploy RagequitModule
  const RagequitModule = await ethers.getContractFactory("RagequitModule");
  const ragequitModule = await RagequitModule.deploy();
  await ragequitModule.waitForDeployment();
  
  // Deploy TreasuryVault for the DAO
  const TreasuryVault = await ethers.getContractFactory("TreasuryVault");
  const treasuryVault = await TreasuryVault.deploy();
  await treasuryVault.waitForDeployment();
  await treasuryVault.initialize(owner.address);
  
  // Initialize RagequitModule with TreasuryVault
  await ragequitModule.initialize(
    owner.address,
    await governanceToken.getAddress(),
    await treasuryVault.getAddress() // Use actual TreasuryVault instead of owner address
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
    await treasuryVault.getAddress() // Use actual TreasuryVault instead of owner address
  );
  
  // Authorize FutarchyGovernor to spend from TreasuryVault
  await treasuryVault.authorizeSpender(await futarchyGovernor.getAddress());
  
  // Set collateral token for markets (required for CTF1155)
  await futarchyGovernor.setMarketCollateralToken(await collateralToken.getAddress());

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
  
  // Note: FutarchyGovernor currently executes from its own balance, not from the vault
  // Fund both TreasuryVault and FutarchyGovernor for testing
  await owner.sendTransaction({
    to: await treasuryVault.getAddress(),
    value: ethers.parseEther("5000") // 5,000 ETH for vault (for future integration)
  });
  
  await owner.sendTransaction({
    to: await futarchyGovernor.getAddress(),
    value: ethers.parseEther("5000") // 5,000 ETH for direct execution
  });
  
  // Transfer ownership of key contracts to FutarchyGovernor
  // This allows the governor to coordinate market creation and resolution
  await marketFactory.connect(owner).transferOwnership(await futarchyGovernor.getAddress());
  
  // Grant FutarchyGovernor permission to manage proposal bonds and ragequit
  // (Contracts remain owned by owner for direct test access)
  await proposalRegistry.connect(owner).setGovernor(await futarchyGovernor.getAddress());
  await ragequitModule.connect(owner).setGovernor(await futarchyGovernor.getAddress());
  
  // Note: ProposalRegistry, RagequitModule, and OracleResolver remain under owner control
  // This allows tests to use the owner account directly for simpler setup
  // Individual tests can transfer ownership if needed for specific scenarios

  return {
    contracts: {
      governanceToken,
      collateralToken,
      welfareRegistry,
      proposalRegistry,
      marketFactory,
      ctf1155,
      privacyCoordinator,
      oracleResolver,
      ragequitModule,
      futarchyGovernor,
      treasuryVault
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
    },
    time,
    ethers
  };
}

