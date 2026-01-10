const { ethers } = require("hardhat");

/**
 * Grant MARKET_MAKER_ROLE on the OLD TieredRoleManager
 *
 * This script is needed because:
 * - PaymentProcessor grants roles on the NEW RoleManagerCore
 * - But ConditionalMarketFactory checks roles on the OLD TieredRoleManager
 *
 * Run with: npx hardhat run scripts/grant-role-on-old-manager.js --network mordor
 */

const OLD_TIERED_ROLE_MANAGER = '0x3759B1F153193471Dd48401eE198F664f2d7FeB8';
const USER_ADDRESS = '0xB8594B2d60261C89E49B9D64C7165B2f33fFB90E';

// Minimal ABI for AccessControl
const ACCESS_CONTROL_ABI = [
  "function grantRole(bytes32 role, address account) external",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function getRoleAdmin(bytes32 role) view returns (bytes32)",
  "function MARKET_MAKER_ROLE() view returns (bytes32)",
  "function DEFAULT_ADMIN_ROLE() view returns (bytes32)"
];

async function main() {
  console.log("=".repeat(60));
  console.log("Grant MARKET_MAKER_ROLE on Old TieredRoleManager");
  console.log("=".repeat(60));

  const [signer] = await ethers.getSigners();
  console.log("\nSigner:", signer.address);

  const roleManager = new ethers.Contract(OLD_TIERED_ROLE_MANAGER, ACCESS_CONTROL_ABI, signer);

  const MARKET_MAKER_ROLE = await roleManager.MARKET_MAKER_ROLE();
  const DEFAULT_ADMIN_ROLE = await roleManager.DEFAULT_ADMIN_ROLE();

  console.log("\nRole hashes:");
  console.log("  MARKET_MAKER_ROLE:", MARKET_MAKER_ROLE);
  console.log("  DEFAULT_ADMIN_ROLE:", DEFAULT_ADMIN_ROLE);

  // Check if signer has admin role
  const isAdmin = await roleManager.hasRole(DEFAULT_ADMIN_ROLE, signer.address);
  console.log("\nSigner is DEFAULT_ADMIN:", isAdmin);

  if (!isAdmin) {
    console.error("\n❌ Signer does not have DEFAULT_ADMIN_ROLE. Cannot grant roles.");
    process.exit(1);
  }

  // Check current role status
  const hasRoleBefore = await roleManager.hasRole(MARKET_MAKER_ROLE, USER_ADDRESS);
  console.log("\nUser", USER_ADDRESS);
  console.log("  Has MARKET_MAKER_ROLE before:", hasRoleBefore);

  if (hasRoleBefore) {
    console.log("\n✅ User already has MARKET_MAKER_ROLE!");
    return;
  }

  // Grant the role
  console.log("\nGranting MARKET_MAKER_ROLE...");
  const tx = await roleManager.grantRole(MARKET_MAKER_ROLE, USER_ADDRESS);
  console.log("  Transaction:", tx.hash);
  await tx.wait();
  console.log("  ✅ Transaction confirmed");

  // Verify
  const hasRoleAfter = await roleManager.hasRole(MARKET_MAKER_ROLE, USER_ADDRESS);
  console.log("\n  Has MARKET_MAKER_ROLE after:", hasRoleAfter);

  if (hasRoleAfter) {
    console.log("\n✅ Successfully granted MARKET_MAKER_ROLE!");
  } else {
    console.error("\n❌ Failed to grant role");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
