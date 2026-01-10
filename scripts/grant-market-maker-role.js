/**
 * Grant MARKET_MAKER_ROLE to a user
 *
 * This script grants the MARKET_MAKER_ROLE to a specified address,
 * allowing them to create prediction markets.
 *
 * The TieredRoleManager has a role hierarchy:
 *   DEFAULT_ADMIN_ROLE -> CORE_SYSTEM_ADMIN_ROLE -> OPERATIONS_ADMIN_ROLE -> MARKET_MAKER_ROLE
 *
 * To grant MARKET_MAKER_ROLE, the caller must have OPERATIONS_ADMIN_ROLE.
 * This script will grant intermediate roles to the deployer if needed.
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
  console.log("Admin account:", deployer.address);
  console.log("Target user:", USER_ADDRESS);
  console.log();

  // Connect to RoleManager
  const roleManager = await hre.ethers.getContractAt(
    "TieredRoleManager",
    ROLE_MANAGER_ADDRESS
  );

  // Get role hashes
  const DEFAULT_ADMIN_ROLE = await roleManager.DEFAULT_ADMIN_ROLE();
  const CORE_SYSTEM_ADMIN_ROLE = await roleManager.CORE_SYSTEM_ADMIN_ROLE();
  const OPERATIONS_ADMIN_ROLE = await roleManager.OPERATIONS_ADMIN_ROLE();
  const MARKET_MAKER_ROLE = await roleManager.MARKET_MAKER_ROLE();

  console.log("Role hashes:");
  console.log("  DEFAULT_ADMIN_ROLE:", DEFAULT_ADMIN_ROLE);
  console.log("  CORE_SYSTEM_ADMIN_ROLE:", CORE_SYSTEM_ADMIN_ROLE);
  console.log("  OPERATIONS_ADMIN_ROLE:", OPERATIONS_ADMIN_ROLE);
  console.log("  MARKET_MAKER_ROLE:", MARKET_MAKER_ROLE);
  console.log();

  // Check deployer's current roles
  const hasDefaultAdmin = await roleManager.hasRole(DEFAULT_ADMIN_ROLE, deployer.address);
  let hasCoreSystemAdmin = await roleManager.hasRole(CORE_SYSTEM_ADMIN_ROLE, deployer.address);
  let hasOperationsAdmin = await roleManager.hasRole(OPERATIONS_ADMIN_ROLE, deployer.address);

  console.log("Deployer roles:");
  console.log("  DEFAULT_ADMIN_ROLE:", hasDefaultAdmin);
  console.log("  CORE_SYSTEM_ADMIN_ROLE:", hasCoreSystemAdmin);
  console.log("  OPERATIONS_ADMIN_ROLE:", hasOperationsAdmin);
  console.log();

  if (!hasDefaultAdmin) {
    console.error("ERROR: Deployer does not have DEFAULT_ADMIN_ROLE!");
    console.error("Only the contract owner can run this script.");
    process.exit(1);
  }

  // Check if user already has the role
  const userHasRole = await roleManager.hasRole(MARKET_MAKER_ROLE, USER_ADDRESS);
  console.log("User already has MARKET_MAKER_ROLE:", userHasRole);

  if (userHasRole) {
    console.log("\nUser already has MARKET_MAKER_ROLE. No action needed.");
    return;
  }

  // Step 1: Grant CORE_SYSTEM_ADMIN_ROLE to deployer if needed
  // (DEFAULT_ADMIN_ROLE is admin for CORE_SYSTEM_ADMIN_ROLE)
  if (!hasCoreSystemAdmin) {
    console.log("\nStep 1: Granting CORE_SYSTEM_ADMIN_ROLE to deployer...");
    const tx1 = await roleManager.grantRole(CORE_SYSTEM_ADMIN_ROLE, deployer.address);
    await tx1.wait();
    console.log("  Transaction:", tx1.hash);
    hasCoreSystemAdmin = true;
  } else {
    console.log("\nStep 1: Deployer already has CORE_SYSTEM_ADMIN_ROLE");
  }

  // Step 2: Grant OPERATIONS_ADMIN_ROLE to deployer if needed
  // (CORE_SYSTEM_ADMIN_ROLE is admin for OPERATIONS_ADMIN_ROLE)
  if (!hasOperationsAdmin) {
    console.log("\nStep 2: Granting OPERATIONS_ADMIN_ROLE to deployer...");
    const tx2 = await roleManager.grantRole(OPERATIONS_ADMIN_ROLE, deployer.address);
    await tx2.wait();
    console.log("  Transaction:", tx2.hash);
    hasOperationsAdmin = true;
  } else {
    console.log("\nStep 2: Deployer already has OPERATIONS_ADMIN_ROLE");
  }

  // Step 3: Grant MARKET_MAKER_ROLE to user
  // (OPERATIONS_ADMIN_ROLE is admin for MARKET_MAKER_ROLE)
  console.log("\nStep 3: Granting MARKET_MAKER_ROLE to", USER_ADDRESS, "...");
  const tx3 = await roleManager.grantRole(MARKET_MAKER_ROLE, USER_ADDRESS);
  await tx3.wait();
  console.log("  Transaction:", tx3.hash);

  // Verify
  const hasRoleNow = await roleManager.hasRole(MARKET_MAKER_ROLE, USER_ADDRESS);
  console.log("\n" + "=".repeat(60));
  console.log("MARKET_MAKER_ROLE granted successfully:", hasRoleNow);
  console.log("=".repeat(60));
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
