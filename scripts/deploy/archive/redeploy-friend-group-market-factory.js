const hre = require("hardhat");
const { ethers } = require("hardhat");

/**
 * Redeploy FriendGroupMarketFactory with current source code
 *
 * The existing deployment has an issue with acceptMarket failing during
 * ERC20 safeTransferFrom. This script deploys a fresh contract with
 * the current source code.
 *
 * Usage:
 *   npx hardhat run scripts/redeploy-friend-group-market-factory.js --network mordor
 */

// Constructor arguments from existing deployment
const CONSTRUCTOR_ARGS = {
  marketFactory: "0x37b9086Cc0d03C8a1030cC50256593B8D0d369Ac",
  ragequitModule: "0x1D30f1DBF2f7B9C050F5de8b98Dc63C54Bfff1e7",
  tieredRoleManager: "0xA6F794292488C628f91A0475dDF8dE6cEF2706EF",
  paymentManager: "0xA61C3a81e25E8E5E7A6A7EceBEd7e1BF58533e28",
  owner: "0x52502d049571C7893447b86c4d8B38e6184bF6e1"
};

// Configuration to apply after deployment
const CONFIG = {
  defaultCollateralToken: "0xDE093684c796204224BC081f937aa059D903c52a", // USC
  acceptedPaymentTokens: [
    "0xDE093684c796204224BC081f937aa059D903c52a", // USC
    "0x0000000000000000000000000000000000000000"  // Native ETC
  ]
};

// Old roleManager that ConditionalMarketFactory uses
const OLD_ROLE_MANAGER = "0x3759B1F153193471Dd48401eE198F664f2d7FeB8";

async function main() {
  console.log("=".repeat(60));
  console.log("Redeploy FriendGroupMarketFactory");
  console.log("=".repeat(60));

  const network = await ethers.provider.getNetwork();
  console.log(`\nNetwork: ${hre.network.name} (Chain ID: ${network.chainId})`);

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETC");

  // Verify deployer is the expected owner
  if (deployer.address.toLowerCase() !== CONSTRUCTOR_ARGS.owner.toLowerCase()) {
    console.warn("\n⚠️  WARNING: Deployer is not the expected owner!");
    console.warn("Expected:", CONSTRUCTOR_ARGS.owner);
    console.warn("Actual:", deployer.address);
  }

  console.log("\n--- Constructor Arguments ---");
  console.log("marketFactory:", CONSTRUCTOR_ARGS.marketFactory);
  console.log("ragequitModule:", CONSTRUCTOR_ARGS.ragequitModule);
  console.log("tieredRoleManager:", CONSTRUCTOR_ARGS.tieredRoleManager);
  console.log("paymentManager:", CONSTRUCTOR_ARGS.paymentManager);
  console.log("owner:", CONSTRUCTOR_ARGS.owner);

  // Deploy FriendGroupMarketFactory
  console.log("\n--- Deploying FriendGroupMarketFactory ---");
  const FriendGroupMarketFactory = await ethers.getContractFactory("FriendGroupMarketFactory");

  const factory = await FriendGroupMarketFactory.deploy(
    CONSTRUCTOR_ARGS.marketFactory,
    CONSTRUCTOR_ARGS.ragequitModule,
    CONSTRUCTOR_ARGS.tieredRoleManager,
    CONSTRUCTOR_ARGS.paymentManager,
    CONSTRUCTOR_ARGS.owner
  );

  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("✅ Deployed at:", factoryAddress);

  // Get deployment transaction
  const deployTx = factory.deploymentTransaction();
  console.log("Transaction hash:", deployTx.hash);
  console.log("Gas used:", (await deployTx.wait()).gasUsed.toString());

  // Configure the factory
  console.log("\n--- Configuring Factory ---");

  // Set default collateral token
  console.log("Setting defaultCollateralToken to USC...");
  let tx = await factory.setDefaultCollateralToken(CONFIG.defaultCollateralToken);
  await tx.wait();
  console.log("✅ Set defaultCollateralToken");

  // Accept payment tokens
  for (const token of CONFIG.acceptedPaymentTokens) {
    const tokenName = token === ethers.ZeroAddress ? "Native ETC" : "USC";
    console.log(`Accepting ${tokenName} as payment token...`);
    tx = await factory.addAcceptedPaymentToken(token, true);
    await tx.wait();
    console.log(`✅ Accepted ${tokenName}`);
  }

  // Grant MARKET_MAKER_ROLE on old roleManager
  console.log("\n--- Granting MARKET_MAKER_ROLE on Old RoleManager ---");
  console.log("Old RoleManager:", OLD_ROLE_MANAGER);

  // We need to grant the role chain: CORE_SYSTEM_ADMIN -> OPERATIONS_ADMIN -> MARKET_MAKER
  const roleManagerABI = [
    "function hasRole(bytes32,address) view returns (bool)",
    "function grantRole(bytes32,address)",
    "function MARKET_MAKER_ROLE() view returns (bytes32)"
  ];
  const roleManager = new ethers.Contract(OLD_ROLE_MANAGER, roleManagerABI, deployer);

  const marketMakerRole = await roleManager.MARKET_MAKER_ROLE();
  console.log("MARKET_MAKER_ROLE hash:", marketMakerRole);

  // Check if deployer can grant the role
  const hasRole = await roleManager.hasRole(marketMakerRole, factoryAddress);
  if (hasRole) {
    console.log("✅ Factory already has MARKET_MAKER_ROLE");
  } else {
    console.log("Granting MARKET_MAKER_ROLE to factory...");
    try {
      tx = await roleManager.grantRole(marketMakerRole, factoryAddress);
      await tx.wait();
      console.log("✅ Granted MARKET_MAKER_ROLE");
    } catch (e) {
      console.log("⚠️  Could not grant role directly. May need intermediate roles.");
      console.log("Error:", e.message);

      // Try the role chain approach
      console.log("\nAttempting role chain grant...");
      const coreSystemAdminRole = "0xe7bd0d3c30e5dc4f194a80201a7eae1f203bf4438a260432508aa72b9b8d4da7";
      const operationsAdminRole = "0x97f26487fe4137062ca54dd661184993941f49df944d5ef6ead173552c37e74e";

      try {
        // Check if we have CORE_SYSTEM_ADMIN_ROLE
        const hasCoreAdmin = await roleManager.hasRole(coreSystemAdminRole, deployer.address);
        if (!hasCoreAdmin) {
          console.log("Granting CORE_SYSTEM_ADMIN_ROLE...");
          tx = await roleManager.grantRole(coreSystemAdminRole, deployer.address);
          await tx.wait();
        }

        // Check if we have OPERATIONS_ADMIN_ROLE
        const hasOpsAdmin = await roleManager.hasRole(operationsAdminRole, deployer.address);
        if (!hasOpsAdmin) {
          console.log("Granting OPERATIONS_ADMIN_ROLE...");
          tx = await roleManager.grantRole(operationsAdminRole, deployer.address);
          await tx.wait();
        }

        // Now grant MARKET_MAKER_ROLE to factory
        console.log("Granting MARKET_MAKER_ROLE to factory...");
        tx = await roleManager.grantRole(marketMakerRole, factoryAddress);
        await tx.wait();
        console.log("✅ Granted MARKET_MAKER_ROLE via role chain");
      } catch (e2) {
        console.log("❌ Failed to grant role:", e2.message);
      }
    }
  }

  // Verify deployment
  console.log("\n--- Verification ---");
  const verifyFactory = await ethers.getContractAt("FriendGroupMarketFactory", factoryAddress);
  console.log("marketFactory:", await verifyFactory.marketFactory());
  console.log("tieredRoleManager:", await verifyFactory.tieredRoleManager());
  console.log("defaultCollateralToken:", await verifyFactory.defaultCollateralToken());
  console.log("friendMarketCount:", (await verifyFactory.friendMarketCount()).toString());

  // Check role on old roleManager
  const factoryHasRole = await roleManager.hasRole(marketMakerRole, factoryAddress);
  console.log("Factory has MARKET_MAKER_ROLE:", factoryHasRole);

  console.log("\n" + "=".repeat(60));
  console.log("DEPLOYMENT SUMMARY");
  console.log("=".repeat(60));
  console.log("New FriendGroupMarketFactory:", factoryAddress);
  console.log("\n⚠️  IMPORTANT: Update frontend/src/constants/contracts.js with new address!");
  console.log("=".repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
