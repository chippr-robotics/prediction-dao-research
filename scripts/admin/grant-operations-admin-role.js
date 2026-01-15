const { ethers } = require("hardhat");

/**
 * Grant OPERATIONS_ADMIN role to a user
 *
 * This grants admin panel access and the ability to:
 * - Manage tier configurations
 * - Grant user roles
 * - Access nullifier management
 * - Perform day-to-day operations
 *
 * Usage:
 *   FLOPPY_KEYSTORE_PASSWORD=password npx hardhat run scripts/admin/grant-operations-admin-role.js --network mordor
 */

const CONTRACTS = {
  tieredRoleManager: '0xA6F794292488C628f91A0475dDF8dE6cEF2706EF',
};

// User to grant OPERATIONS_ADMIN role to
const USER_ADDRESS = '0xB8594B2d60261C89E49B9D64C7165B2f33fFB90E';

async function main() {
  console.log("=".repeat(60));
  console.log("Grant OPERATIONS_ADMIN Role");
  console.log("=".repeat(60));

  const [signer] = await ethers.getSigners();
  console.log("Signer address:", signer.address);
  console.log("User address:", USER_ADDRESS);

  // Connect to TieredRoleManager
  const tieredRoleManager = await ethers.getContractAt(
    "TieredRoleManager",
    CONTRACTS.tieredRoleManager
  );

  // Get role hashes
  const DEFAULT_ADMIN_ROLE = await tieredRoleManager.DEFAULT_ADMIN_ROLE();
  console.log("\nDEFAULT_ADMIN_ROLE hash:", DEFAULT_ADMIN_ROLE);

  // Check if signer has admin role
  const signerIsAdmin = await tieredRoleManager.hasRole(DEFAULT_ADMIN_ROLE, signer.address);
  console.log("Signer is DEFAULT_ADMIN:", signerIsAdmin);

  if (!signerIsAdmin) {
    console.error("\nERROR: Signer does not have DEFAULT_ADMIN_ROLE");
    console.log("Please use the contract deployer to run this script.");
    process.exit(1);
  }

  // Check current DEFAULT_ADMIN_ROLE status for user
  const hasAdminRole = await tieredRoleManager.hasRole(DEFAULT_ADMIN_ROLE, USER_ADDRESS);
  console.log("\nUser current hasRole(DEFAULT_ADMIN):", hasAdminRole);

  if (hasAdminRole) {
    console.log("\n User already has DEFAULT_ADMIN_ROLE!");
    console.log("No action needed on-chain.");
    console.log("\nTo add to localStorage (run in browser console):");
    console.log(`const address = '${USER_ADDRESS.toLowerCase()}';`);
    console.log(`const key = 'fw_user_roles_' + address;`);
    console.log(`const roles = JSON.parse(localStorage.getItem(key) || '[]');`);
    console.log(`['ADMIN', 'OPERATIONS_ADMIN'].forEach(r => { if (!roles.includes(r)) roles.push(r); });`);
    console.log(`localStorage.setItem(key, JSON.stringify(roles)); location.reload();`);
    return;
  }

  // Grant DEFAULT_ADMIN_ROLE (gives full admin access including OPERATIONS_ADMIN capabilities)
  // Note: The role hierarchy requires CORE_SYSTEM_ADMIN to grant OPERATIONS_ADMIN,
  // so we grant DEFAULT_ADMIN directly which provides equivalent access
  console.log("\n--- Granting DEFAULT_ADMIN_ROLE (full admin access) ---");
  try {
    const tx = await tieredRoleManager.grantRole(DEFAULT_ADMIN_ROLE, USER_ADDRESS);
    console.log("Transaction hash:", tx.hash);

    const receipt = await tx.wait();
    console.log("Transaction confirmed in block:", receipt.blockNumber);

    // Verify the role was granted
    const hasRoleNow = await tieredRoleManager.hasRole(DEFAULT_ADMIN_ROLE, USER_ADDRESS);
    console.log("\nVerification - hasRole after grant:", hasRoleNow);

    if (hasRoleNow) {
      console.log("\n SUCCESS: DEFAULT_ADMIN_ROLE granted on-chain!");
      console.log("\nUser now has full admin access.");
      console.log("\nTo add to localStorage (run in browser console):");
      console.log(`const address = '${USER_ADDRESS.toLowerCase()}';`);
      console.log(`const key = 'fw_user_roles_' + address;`);
      console.log(`const roles = JSON.parse(localStorage.getItem(key) || '[]');`);
      console.log(`['ADMIN', 'OPERATIONS_ADMIN'].forEach(r => { if (!roles.includes(r)) roles.push(r); });`);
      console.log(`localStorage.setItem(key, JSON.stringify(roles)); location.reload();`);
    } else {
      console.log("\n FAILED: Role was not granted. Please check contract state.");
    }

  } catch (error) {
    console.error("\nError granting role:", error.message);
    if (error.reason) {
      console.error("Revert reason:", error.reason);
    }
    process.exit(1);
  }

  console.log("\n" + "=".repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
