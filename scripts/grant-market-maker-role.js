/**
 * Grant MARKET_MAKER_ROLE to a user
 *
 * This script grants the MARKET_MAKER_ROLE to a specified address,
 * allowing them to create prediction markets.
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

  // Get MARKET_MAKER_ROLE hash
  const MARKET_MAKER_ROLE = await roleManager.MARKET_MAKER_ROLE();
  console.log("MARKET_MAKER_ROLE hash:", MARKET_MAKER_ROLE);

  // Check if user already has the role
  const hasRole = await roleManager.hasRole(MARKET_MAKER_ROLE, USER_ADDRESS);
  console.log("User already has role:", hasRole);

  if (hasRole) {
    console.log("\nUser already has MARKET_MAKER_ROLE. No action needed.");
    return;
  }

  // Check if deployer is admin
  const DEFAULT_ADMIN_ROLE = await roleManager.DEFAULT_ADMIN_ROLE();
  const isAdmin = await roleManager.hasRole(DEFAULT_ADMIN_ROLE, deployer.address);
  console.log("Deployer is admin:", isAdmin);

  if (!isAdmin) {
    console.error("\nERROR: Deployer does not have DEFAULT_ADMIN_ROLE!");
    console.error("Only an admin can grant roles.");
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
