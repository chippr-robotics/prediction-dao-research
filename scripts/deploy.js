const hre = require("hardhat");

async function main() {
  console.log("Starting deployment...\n");

  // Get deployer account
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());
  console.log();

  // Deploy WelfareMetricRegistry
  console.log("Deploying WelfareMetricRegistry...");
  const WelfareMetricRegistry = await hre.ethers.getContractFactory("WelfareMetricRegistry");
  const welfareRegistry = await WelfareMetricRegistry.deploy();
  await welfareRegistry.waitForDeployment();
  console.log("WelfareMetricRegistry deployed to:", await welfareRegistry.getAddress());

  // Deploy ProposalRegistry
  console.log("\nDeploying ProposalRegistry...");
  const ProposalRegistry = await hre.ethers.getContractFactory("ProposalRegistry");
  const proposalRegistry = await ProposalRegistry.deploy();
  await proposalRegistry.waitForDeployment();
  console.log("ProposalRegistry deployed to:", await proposalRegistry.getAddress());

  // Deploy ConditionalMarketFactory
  console.log("\nDeploying ConditionalMarketFactory...");
  const ConditionalMarketFactory = await hre.ethers.getContractFactory("ConditionalMarketFactory");
  const marketFactory = await ConditionalMarketFactory.deploy();
  await marketFactory.waitForDeployment();
  console.log("ConditionalMarketFactory deployed to:", await marketFactory.getAddress());

  // Deploy PrivacyCoordinator
  console.log("\nDeploying PrivacyCoordinator...");
  const PrivacyCoordinator = await hre.ethers.getContractFactory("PrivacyCoordinator");
  const privacyCoordinator = await PrivacyCoordinator.deploy();
  await privacyCoordinator.waitForDeployment();
  console.log("PrivacyCoordinator deployed to:", await privacyCoordinator.getAddress());

  // Deploy OracleResolver
  console.log("\nDeploying OracleResolver...");
  const OracleResolver = await hre.ethers.getContractFactory("OracleResolver");
  const oracleResolver = await OracleResolver.deploy();
  await oracleResolver.waitForDeployment();
  console.log("OracleResolver deployed to:", await oracleResolver.getAddress());

  // Deploy mock governance token (for RagequitModule)
  console.log("\nDeploying mock governance token...");
  // In production, this would be the actual governance token address
  const mockGovernanceToken = deployer.address; // Using deployer address as placeholder

  // Deploy RagequitModule
  console.log("\nDeploying RagequitModule...");
  const RagequitModule = await hre.ethers.getContractFactory("RagequitModule");
  const ragequitModule = await RagequitModule.deploy(
    mockGovernanceToken,
    deployer.address // Using deployer as treasury vault placeholder
  );
  await ragequitModule.waitForDeployment();
  console.log("RagequitModule deployed to:", await ragequitModule.getAddress());

  // Deploy FutarchyGovernor
  console.log("\nDeploying FutarchyGovernor...");
  const FutarchyGovernor = await hre.ethers.getContractFactory("FutarchyGovernor");
  const futarchyGovernor = await FutarchyGovernor.deploy(
    await welfareRegistry.getAddress(),
    await proposalRegistry.getAddress(),
    await marketFactory.getAddress(),
    await privacyCoordinator.getAddress(),
    await oracleResolver.getAddress(),
    await ragequitModule.getAddress(),
    deployer.address // Using deployer as treasury vault placeholder
  );
  await futarchyGovernor.waitForDeployment();
  console.log("FutarchyGovernor deployed to:", await futarchyGovernor.getAddress());

  // Setup initial configuration
  console.log("\n\nSetting up initial configuration...");

  // Transfer ownership of components to FutarchyGovernor
  console.log("Transferring ownership to FutarchyGovernor...");
  await welfareRegistry.transferOwnership(await futarchyGovernor.getAddress());
  await proposalRegistry.transferOwnership(await futarchyGovernor.getAddress());
  await marketFactory.transferOwnership(await futarchyGovernor.getAddress());
  await oracleResolver.transferOwnership(await futarchyGovernor.getAddress());
  await ragequitModule.transferOwnership(await futarchyGovernor.getAddress());

  // Privacy coordinator keeps deployer as owner for coordinator role
  console.log("Keeping PrivacyCoordinator coordinator as deployer...");

  console.log("\n\nDeployment Summary:");
  console.log("====================");
  console.log("WelfareMetricRegistry:", await welfareRegistry.getAddress());
  console.log("ProposalRegistry:", await proposalRegistry.getAddress());
  console.log("ConditionalMarketFactory:", await marketFactory.getAddress());
  console.log("PrivacyCoordinator:", await privacyCoordinator.getAddress());
  console.log("OracleResolver:", await oracleResolver.getAddress());
  console.log("RagequitModule:", await ragequitModule.getAddress());
  console.log("FutarchyGovernor:", await futarchyGovernor.getAddress());
  console.log("\nDeployment completed successfully!");

  // Save deployment addresses
  const deploymentInfo = {
    network: hre.network.name,
    deployer: deployer.address,
    contracts: {
      welfareRegistry: await welfareRegistry.getAddress(),
      proposalRegistry: await proposalRegistry.getAddress(),
      marketFactory: await marketFactory.getAddress(),
      privacyCoordinator: await privacyCoordinator.getAddress(),
      oracleResolver: await oracleResolver.getAddress(),
      ragequitModule: await ragequitModule.getAddress(),
      futarchyGovernor: await futarchyGovernor.getAddress()
    },
    timestamp: new Date().toISOString()
  };

  console.log("\nDeployment info:", JSON.stringify(deploymentInfo, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
