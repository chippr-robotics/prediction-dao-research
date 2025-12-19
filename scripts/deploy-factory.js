const hre = require("hardhat");

async function main() {
  console.log("Starting factory deployment script...\n");

  // Get deployer account
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());
  console.log();

  try {
    // Deploy DAOFactory
    console.log("Deploying DAOFactory...");
    const DAOFactory = await hre.ethers.getContractFactory("DAOFactory");
    const daoFactory = await DAOFactory.deploy();
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
