const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Deploy a new ConditionalMarketFactory with the correct TieredRoleManager
 *
 * Problem: The original ConditionalMarketFactory was deployed with an old
 * RoleManagerCore (0x3759B1F...) that has a broken checkMarketCreationLimitFor.
 * The roleManager is immutable once set.
 *
 * Solution: Deploy a new ConditionalMarketFactory and configure it with the
 * proper TieredRoleManager (0xA6F794...).
 *
 * Usage:
 *   npx hardhat run scripts/deploy-new-conditional-market-factory.js --network mordor
 */

const SINGLETON_FACTORY_ADDRESS = "0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7";

const CONTRACTS = {
  // The TieredRoleManager that works properly
  tieredRoleManager: '0xA6F794292488C628f91A0475dDF8dE6cEF2706EF',
  // FriendGroupMarketFactory that needs to use the new market factory
  friendGroupMarketFactory: '0x8cFE477e267bB36925047df8A6E30348f82b0085',
};

function generateSalt(identifier) {
  return ethers.id(identifier);
}

async function deployDeterministic(contractName, constructorArgs, salt, deployer) {
  console.log(`\nDeploying ${contractName} deterministically...`);

  const ContractFactory = await ethers.getContractFactory(contractName, deployer);
  const deployTx = await ContractFactory.getDeployTransaction(...constructorArgs);
  const deploymentData = deployTx?.data;

  if (!deploymentData) {
    throw new Error(`Failed to build initCode for ${contractName}`);
  }

  // Compute deterministic address
  const initCodeHash = ethers.keccak256(deploymentData);
  const deterministicAddress = ethers.getCreate2Address(
    SINGLETON_FACTORY_ADDRESS,
    salt,
    initCodeHash
  );

  console.log(`  Predicted address: ${deterministicAddress}`);

  // Check if contract is already deployed
  const existingCode = await ethers.provider.getCode(deterministicAddress);
  if (existingCode !== "0x") {
    console.log(`  ✓ Contract already deployed at this address`);
    return {
      address: deterministicAddress,
      contract: ContractFactory.attach(deterministicAddress),
      alreadyDeployed: true
    };
  }

  console.log(`  Deploying via Safe Singleton Factory...`);
  const txData = ethers.concat([salt, deploymentData]);

  // Estimate gas
  let gasLimit;
  try {
    const estimatedGas = await ethers.provider.estimateGas({
      from: deployer.address,
      to: SINGLETON_FACTORY_ADDRESS,
      data: txData,
    });
    gasLimit = (estimatedGas * 120n) / 100n; // 20% buffer
    console.log(`  Estimated gas: ${estimatedGas.toString()} (using ${gasLimit.toString()})`);
  } catch (error) {
    gasLimit = 5000000n;
    console.warn(`  Gas estimation failed, using default: ${gasLimit}`);
  }

  const tx = await deployer.sendTransaction({
    to: SINGLETON_FACTORY_ADDRESS,
    data: txData,
    gasLimit,
  });

  const receipt = await tx.wait();
  if (receipt && receipt.status === 0) {
    throw new Error(`Deployment transaction reverted: ${receipt.hash}`);
  }

  console.log(`  ✓ Deployed in tx: ${receipt.hash}`);
  console.log(`  ✓ Gas used: ${receipt.gasUsed.toString()}`);

  // Verify the deployment
  const deployedCode = await ethers.provider.getCode(deterministicAddress);
  if (deployedCode === "0x") {
    throw new Error("Deployment failed - no code at expected address");
  }

  return {
    address: deterministicAddress,
    contract: ContractFactory.attach(deterministicAddress),
    alreadyDeployed: false
  };
}

async function main() {
  console.log("=".repeat(60));
  console.log("Deploy New ConditionalMarketFactory");
  console.log("=".repeat(60));

  const network = await ethers.provider.getNetwork();
  console.log(`\nNetwork: ${hre.network.name} (Chain ID: ${network.chainId})`);

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETC");

  // Deploy new ConditionalMarketFactory
  const saltPrefix = "FairWinsDAO-v1.0-";
  const newSalt = generateSalt(saltPrefix + "ConditionalMarketFactory-v2-fixed");

  const marketFactory = await deployDeterministic(
    "ConditionalMarketFactory",
    [],
    newSalt,
    deployer
  );

  // Initialize if not already deployed
  if (!marketFactory.alreadyDeployed) {
    console.log("\nInitializing ConditionalMarketFactory...");
    try {
      const tx = await marketFactory.contract.initialize(deployer.address);
      await tx.wait();
      console.log("  ✓ Initialized");
    } catch (e) {
      console.log("  Already initialized or failed:", e.message.slice(0, 100));
    }
  }

  // Set the roleManager to the correct TieredRoleManager
  console.log("\nSetting roleManager to TieredRoleManager...");
  try {
    const currentRM = await marketFactory.contract.roleManager();
    console.log("  Current roleManager:", currentRM);

    if (currentRM === ethers.ZeroAddress) {
      const tx = await marketFactory.contract.setRoleManager(CONTRACTS.tieredRoleManager);
      await tx.wait();
      console.log("  ✓ RoleManager set to:", CONTRACTS.tieredRoleManager);
    } else if (currentRM.toLowerCase() === CONTRACTS.tieredRoleManager.toLowerCase()) {
      console.log("  ✓ RoleManager already set correctly");
    } else {
      console.log("  ⚠️  RoleManager already set to a different address:", currentRM);
    }
  } catch (e) {
    console.log("  Failed to set roleManager:", e.message.slice(0, 100));
  }

  // Grant MARKET_MAKER_ROLE to FriendGroupMarketFactory on TieredRoleManager
  console.log("\nGranting MARKET_MAKER_ROLE to FriendGroupMarketFactory...");
  const tieredRoleManager = await ethers.getContractAt("TieredRoleManager", CONTRACTS.tieredRoleManager);

  try {
    const marketMakerRole = await tieredRoleManager.MARKET_MAKER_ROLE();
    console.log("  MARKET_MAKER_ROLE:", marketMakerRole);

    const hasRole = await tieredRoleManager.hasRole(marketMakerRole, CONTRACTS.friendGroupMarketFactory);
    console.log("  FriendGroupMarketFactory hasRole:", hasRole);

    if (!hasRole) {
      // Grant PLATINUM tier for 100 years
      const PLATINUM = 4;
      const DURATION = 100 * 365 * 24 * 60 * 60;
      const tx = await tieredRoleManager.grantTier(
        CONTRACTS.friendGroupMarketFactory,
        marketMakerRole,
        PLATINUM,
        DURATION
      );
      await tx.wait();
      console.log("  ✓ PLATINUM tier granted");
    } else {
      console.log("  ✓ Already has role");
    }
  } catch (e) {
    console.log("  Failed:", e.message.slice(0, 200));
  }

  // Update FriendGroupMarketFactory to use new ConditionalMarketFactory
  console.log("\nUpdating FriendGroupMarketFactory to use new ConditionalMarketFactory...");
  const friendGroupFactory = await ethers.getContractAt(
    "FriendGroupMarketFactory",
    CONTRACTS.friendGroupMarketFactory
  );

  try {
    const currentMF = await friendGroupFactory.marketFactory();
    console.log("  Current marketFactory:", currentMF);

    if (currentMF.toLowerCase() !== marketFactory.address.toLowerCase()) {
      const tx = await friendGroupFactory.updateMarketFactory(marketFactory.address);
      await tx.wait();
      console.log("  ✓ Updated to:", marketFactory.address);
    } else {
      console.log("  ✓ Already using the new marketFactory");
    }
  } catch (e) {
    console.log("  Failed:", e.message.slice(0, 200));
  }

  // Verify the new marketFactory has working checkMarketCreationLimitFor
  console.log("\n--- Verification ---");
  try {
    const rm = await ethers.getContractAt("TieredRoleManager", CONTRACTS.tieredRoleManager);
    const marketMakerRole = await rm.MARKET_MAKER_ROLE();

    // Test checkMarketCreationLimitFor via staticCall
    const result = await rm.checkMarketCreationLimitFor.staticCall(
      CONTRACTS.friendGroupMarketFactory,
      marketMakerRole
    );
    console.log("checkMarketCreationLimitFor result:", result);

    if (result) {
      console.log("\n✅ SUCCESS: FriendGroupMarketFactory can now create markets!");
    } else {
      console.log("\n⚠️  checkMarketCreationLimitFor returned false - check tier limits");
    }
  } catch (e) {
    console.log("Verification failed:", e.message);
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("Summary");
  console.log("=".repeat(60));
  console.log("New ConditionalMarketFactory:", marketFactory.address);
  console.log("TieredRoleManager:", CONTRACTS.tieredRoleManager);
  console.log("FriendGroupMarketFactory:", CONTRACTS.friendGroupMarketFactory);

  // Save deployment info
  const deploymentInfo = {
    network: hre.network.name,
    chainId: Number(network.chainId),
    newConditionalMarketFactory: marketFactory.address,
    tieredRoleManager: CONTRACTS.tieredRoleManager,
    friendGroupMarketFactory: CONTRACTS.friendGroupMarketFactory,
    timestamp: new Date().toISOString()
  };

  const deploymentsDir = path.join(process.cwd(), "deployments");
  if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir, { recursive: true });
  const outPath = path.join(deploymentsDir, "mordor-new-conditional-market-factory.json");
  fs.writeFileSync(outPath, JSON.stringify(deploymentInfo, null, 2));
  console.log("\nDeployment info saved to:", outPath);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
