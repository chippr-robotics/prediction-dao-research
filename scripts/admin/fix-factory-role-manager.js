const hre = require("hardhat");
const { ethers } = require("hardhat");

/**
 * Fix the factory's roleManager to use the newer RoleManagerCore
 * that has the checkMarketCreationLimitFor function
 *
 * Run with: npx hardhat run scripts/fix-factory-role-manager.js --network mordor
 */

async function main() {
  console.log("=".repeat(60));
  console.log("Fix Factory RoleManager Configuration");
  console.log("=".repeat(60));
  console.log();

  // Addresses
  const FACTORY_ADDRESS = "0x20eEb76C5B98Da5a9504A65169C4791d4787ECdA";
  const OLD_ROLE_MANAGER = "0x888332df7621EC341131d85e2228f00407777dD7";
  const NEW_ROLE_MANAGER = "0x4BBEB3695d513Be15881977E89104315Ee85b5e5";
  const TEST_USER = "0xB8594B2d60261C89E49B9D64C7165B2f33fFB90E";

  // Get signer
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    console.error("No deployer signer available. Make sure PRIVATE_KEY is set.");
    process.exit(1);
  }
  console.log("Deployer account:", deployer.address);
  console.log();

  // Get factory contract
  const factory = await ethers.getContractAt("ConditionalMarketFactory", FACTORY_ADDRESS, deployer);

  // Check current configuration
  console.log("1. Current factory configuration:");
  const currentRM = await factory.roleManager();
  const owner = await factory.owner();
  console.log("   Current RoleManager:", currentRM);
  console.log("   Factory Owner:", owner);
  console.log();

  // Verify deployer is owner
  if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
    console.error("ERROR: Deployer is not the factory owner!");
    console.error("Only the owner can update the roleManager.");
    process.exit(1);
  }

  // Check if new RoleManager has checkMarketCreationLimitFor
  console.log("2. Verifying NEW RoleManager has checkMarketCreationLimitFor...");
  const rmAbi = [
    "function hasRole(bytes32 role, address account) view returns (bool)",
    "function MARKET_MAKER_ROLE() view returns (bytes32)",
    "function checkMarketCreationLimitFor(address user, bytes32 role) returns (bool)",
    "function grantRole(bytes32 role, address account)"
  ];

  const newRM = new ethers.Contract(NEW_ROLE_MANAGER, rmAbi, deployer);

  try {
    const MARKET_MAKER_ROLE = await newRM.MARKET_MAKER_ROLE();
    console.log("   MARKET_MAKER_ROLE:", MARKET_MAKER_ROLE);

    // Test checkMarketCreationLimitFor exists
    try {
      await newRM.checkMarketCreationLimitFor.staticCall(TEST_USER, MARKET_MAKER_ROLE);
      console.log("   checkMarketCreationLimitFor: EXISTS on new RoleManager");
    } catch (e) {
      if (e.message.includes("missing revert data")) {
        console.log("   ERROR: checkMarketCreationLimitFor does NOT exist on new RoleManager!");
        console.log("   This RoleManager won't work either. Need to deploy a newer version.");
        process.exit(1);
      }
      // Other errors are okay - function exists but might return false
      console.log("   checkMarketCreationLimitFor: EXISTS (returned error/false)");
    }

    // Check if test user has role on NEW RoleManager
    const hasRoleNew = await newRM.hasRole(MARKET_MAKER_ROLE, TEST_USER);
    console.log("   Test user has MARKET_MAKER_ROLE on NEW RoleManager:", hasRoleNew);

    if (!hasRoleNew) {
      console.log("\n3. Granting MARKET_MAKER_ROLE to test user on NEW RoleManager...");
      try {
        const grantTx = await newRM.grantRole(MARKET_MAKER_ROLE, TEST_USER);
        await grantTx.wait();
        console.log("   Role granted successfully!");
      } catch (e) {
        console.log("   Could not grant role (may need admin):", e.message);
        console.log("   The user may need to be granted the role separately.");
      }
    }

  } catch (e) {
    console.log("   ERROR accessing new RoleManager:", e.message);
    process.exit(1);
  }

  // Update factory to use new RoleManager
  console.log("\n4. Updating factory to use NEW RoleManager...");
  console.log("   Old RoleManager:", OLD_ROLE_MANAGER);
  console.log("   New RoleManager:", NEW_ROLE_MANAGER);

  try {
    const tx = await factory.setRoleManager(NEW_ROLE_MANAGER);
    console.log("   Transaction sent:", tx.hash);
    await tx.wait();
    console.log("   Transaction confirmed!");

    // Verify the change
    const updatedRM = await factory.roleManager();
    console.log("   Updated RoleManager:", updatedRM);
    console.log("   Update successful:", updatedRM.toLowerCase() === NEW_ROLE_MANAGER.toLowerCase());

  } catch (e) {
    console.log("   ERROR updating roleManager:", e.message);
    process.exit(1);
  }

  console.log("\n" + "=".repeat(60));
  console.log("Configuration Update Complete!");
  console.log("=".repeat(60));
  console.log();
  console.log("Factory:", FACTORY_ADDRESS);
  console.log("New RoleManager:", NEW_ROLE_MANAGER);
  console.log();
  console.log("Market creation should now work!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
