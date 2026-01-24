const hre = require("hardhat");

async function main() {
  console.log("Starting factory deployment script...\n");

  // Get deployer account
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());
  console.log();

  try {
    // Deploy DAO component implementations (used as EIP-1167 clone targets)
    console.log("Deploying DAO component implementations...");
    const WelfareMetricRegistry = await hre.ethers.getContractFactory("WelfareMetricRegistry");
    const welfareRegistryImpl = await WelfareMetricRegistry.deploy();
    await welfareRegistryImpl.waitForDeployment();

    const ProposalRegistry = await hre.ethers.getContractFactory("ProposalRegistry");
    const proposalRegistryImpl = await ProposalRegistry.deploy();
    await proposalRegistryImpl.waitForDeployment();

    const ConditionalMarketFactory = await hre.ethers.getContractFactory("ConditionalMarketFactory");
    const marketFactoryImpl = await ConditionalMarketFactory.deploy();
    await marketFactoryImpl.waitForDeployment();

    const PrivacyCoordinator = await hre.ethers.getContractFactory("PrivacyCoordinator");
    const privacyCoordinatorImpl = await PrivacyCoordinator.deploy();
    await privacyCoordinatorImpl.waitForDeployment();

    const OracleResolver = await hre.ethers.getContractFactory("OracleResolver");
    const oracleResolverImpl = await OracleResolver.deploy();
    await oracleResolverImpl.waitForDeployment();

    const RagequitModule = await hre.ethers.getContractFactory("RagequitModule");
    const ragequitModuleImpl = await RagequitModule.deploy();
    await ragequitModuleImpl.waitForDeployment();

    const FutarchyGovernor = await hre.ethers.getContractFactory("FutarchyGovernor");
    const futarchyGovernorImpl = await FutarchyGovernor.deploy();
    await futarchyGovernorImpl.waitForDeployment();

    // Deploy DAOFactory
    console.log("Deploying DAOFactory...");
    const DAOFactory = await hre.ethers.getContractFactory("DAOFactory");
    const daoFactory = await DAOFactory.deploy(
      await welfareRegistryImpl.getAddress(),
      await proposalRegistryImpl.getAddress(),
      await marketFactoryImpl.getAddress(),
      await privacyCoordinatorImpl.getAddress(),
      await oracleResolverImpl.getAddress(),
      await ragequitModuleImpl.getAddress(),
      await futarchyGovernorImpl.getAddress()
    );
    await daoFactory.waitForDeployment();
    console.log("DAOFactory deployed to:", await daoFactory.getAddress());

    console.log("\n\nFactory Deployment Summary:");
    console.log("============================");
    console.log("DAOFactory:", await daoFactory.getAddress());
    
    // Save deployment info
    const deploymentInfo = {
      network: hre.network.name,
      deployer: deployer.address,
      factoryAddress: await daoFactory.getAddress(),
      timestamp: new Date().toISOString()
    };

    console.log("\nDeployment info:", JSON.stringify(deploymentInfo, null, 2));
    console.log("\nTo create a DAO, call:");
    console.log("daoFactory.createDAO(name, description, treasuryVault, [adminAddresses])");

  } catch (error) {
    console.error("\nDeployment failed!");
    console.error("Error:", error.message);
    
    if (error.message.includes("code is too large")) {
      console.log("\nNote: DAOFactory contract exceeds the 24KB size limit.");
      console.log("Consider using the manual deployment script (scripts/deploy.js) instead,");
      console.log("which deploys individual DAO components separately.");
    }
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
