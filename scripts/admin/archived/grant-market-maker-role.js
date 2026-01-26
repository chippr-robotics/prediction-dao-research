/**
 * Grant MARKET_MAKER_ROLE to a user
 *
 * This script grants the MARKET_MAKER_ROLE to a specified address.
 *
 * IMPORTANT: The TieredRoleManager has a role hierarchy for separation of powers:
 *   DEFAULT_ADMIN_ROLE -> CORE_SYSTEM_ADMIN_ROLE -> OPERATIONS_ADMIN_ROLE -> MARKET_MAKER_ROLE
 *
 * This script must be run by an account with OPERATIONS_ADMIN_ROLE.
 *
 * Alternative: Users can purchase premium roles via purchaseRole() or purchaseRoleWithToken()
 *
 * Usage:
 *   npx hardhat run scripts/grant-market-maker-role.js --network mordor
 *
 * Set the USER_ADDRESS environment variable or edit the script directly.
 */

const hre = require("hardhat");

// Deployed contract address
const ROLE_MANAGER_ADDRESS = '0x3759B1F153193471Dd48401eE198F664f2d7FeB8';

// Address to grant role to (set via env or edit here)
const USER_ADDRESS = process.env.USER_ADDRESS || '0xB8594B2d60261C89E49B9D64C7165B2f33fFB90E';

async function main() {
  console.log("=".repeat(60));
  console.log("Grant MARKET_MAKER_ROLE");
  console.log("=".repeat(60));
  console.log();

  // Get deployer account
  const [deployer] = await hre.ethers.getSigners();
  console.log("Caller account:", deployer.address);
  console.log("Target user:", USER_ADDRESS);
  console.log();

  // Connect to RoleManager
  const roleManager = await hre.ethers.getContractAt(
    "TieredRoleManager",
    ROLE_MANAGER_ADDRESS
  );

  // Get role hashes
  const OPERATIONS_ADMIN_ROLE = await roleManager.OPERATIONS_ADMIN_ROLE();
  const MARKET_MAKER_ROLE = await roleManager.MARKET_MAKER_ROLE();

  console.log("MARKET_MAKER_ROLE hash:", MARKET_MAKER_ROLE);

  // Check if user already has the role
  const userHasRole = await roleManager.hasRole(MARKET_MAKER_ROLE, USER_ADDRESS);
  console.log("User already has role:", userHasRole);

  if (userHasRole) {
    console.log("\nUser already has MARKET_MAKER_ROLE. No action needed.");
    return;
  }

  // Check if caller has OPERATIONS_ADMIN_ROLE (required to grant MARKET_MAKER_ROLE)
  const hasOpsAdmin = await roleManager.hasRole(OPERATIONS_ADMIN_ROLE, deployer.address);
  console.log("Caller has OPERATIONS_ADMIN_ROLE:", hasOpsAdmin);

  if (!hasOpsAdmin) {
    console.log();
    console.log("=".repeat(60));
    console.log("ERROR: Cannot grant MARKET_MAKER_ROLE");
    console.log("=".repeat(60));
    console.log();
    console.log("The TieredRoleManager uses a role hierarchy for separation of powers:");
    console.log("  DEFAULT_ADMIN_ROLE");
    console.log("    └─> CORE_SYSTEM_ADMIN_ROLE");
    console.log("          └─> OPERATIONS_ADMIN_ROLE");
    console.log("                └─> MARKET_MAKER_ROLE");
    console.log();
    console.log("To grant MARKET_MAKER_ROLE, you must have OPERATIONS_ADMIN_ROLE.");
    console.log();
    console.log("Options:");
    console.log("1. Have an OPERATIONS_ADMIN run this script");
    console.log("2. User purchases the role via purchaseRole() or purchaseRoleWithToken()");
    console.log("3. Set up proper admin hierarchy through governance");
    console.log();
    process.exit(1);
  }

  // Grant the role
  console.log("\nGranting MARKET_MAKER_ROLE to", USER_ADDRESS, "...");
  const tx = await roleManager.grantRole(MARKET_MAKER_ROLE, USER_ADDRESS);
  await tx.wait();
  console.log("Transaction hash:", tx.hash);

  // Verify
  const hasRoleNow = await roleManager.hasRole(MARKET_MAKER_ROLE, USER_ADDRESS);
  console.log("\nRole granted successfully:", hasRoleNow);
}

main()
  .then(() => {
    console.log("\nScript completed!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Script failed!");
    console.error(error);
    process.exit(1);
  });
