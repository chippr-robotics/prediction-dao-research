const { ethers } = require("hardhat");

/**
 * Configure Legacy Role Manager Integration
 *
 * This script:
 * 1. Grants PaymentProcessor the admin role on OLD TieredRoleManager
 *    (so it can call grantRole for MARKET_MAKER_ROLE)
 * 2. Configures PaymentProcessor to use the legacy role manager
 * 3. Grants the current user the MARKET_MAKER_ROLE on old system (if they purchased)
 *
 * Run with: npx hardhat run scripts/configure-legacy-role-manager.js --network mordor
 */

const OLD_TIERED_ROLE_MANAGER = '0x3759B1F153193471Dd48401eE198F664f2d7FeB8';
const PAYMENT_PROCESSOR = '0xC6A3D457b0a0D9Fa4859F4211A4c9551F8Ce1F63';
const USER_TO_GRANT = '0xB8594B2d60261C89E49B9D64C7165B2f33fFB90E';

const ROLE_MANAGER_ABI = [
  "function grantRole(bytes32 role, address account) external",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function getRoleAdmin(bytes32 role) view returns (bytes32)",
  "function MARKET_MAKER_ROLE() view returns (bytes32)",
  "function DEFAULT_ADMIN_ROLE() view returns (bytes32)",
  "function OPERATIONS_ADMIN_ROLE() view returns (bytes32)"
];

const PAYMENT_PROCESSOR_ABI = [
  "function setLegacyRoleManager(address _legacyRoleManager) external",
  "function legacyRoleManager() view returns (address)",
  "function owner() view returns (address)"
];

async function main() {
  console.log("=".repeat(70));
  console.log("Configure Legacy Role Manager Integration");
  console.log("=".repeat(70));

  const signers = await ethers.getSigners();
  const deployer = signers[0];
  if (!deployer) {
    console.error("No deployer signer available. Make sure PRIVATE_KEY is set.");
    process.exit(1);
  }
  console.log("\nDeployer:", deployer.address);

  const roleManager = new ethers.Contract(OLD_TIERED_ROLE_MANAGER, ROLE_MANAGER_ABI, deployer);
  const paymentProcessor = new ethers.Contract(PAYMENT_PROCESSOR, PAYMENT_PROCESSOR_ABI, deployer);

  // Get role hashes
  const MARKET_MAKER_ROLE = await roleManager.MARKET_MAKER_ROLE();
  const DEFAULT_ADMIN_ROLE = await roleManager.DEFAULT_ADMIN_ROLE();
  const OPERATIONS_ADMIN_ROLE = await roleManager.OPERATIONS_ADMIN_ROLE();

  console.log("\nRole hashes:");
  console.log("  MARKET_MAKER_ROLE:", MARKET_MAKER_ROLE);
  console.log("  DEFAULT_ADMIN_ROLE:", DEFAULT_ADMIN_ROLE);
  console.log("  OPERATIONS_ADMIN_ROLE:", OPERATIONS_ADMIN_ROLE);

  // Check who is the admin for MARKET_MAKER_ROLE
  const roleAdmin = await roleManager.getRoleAdmin(MARKET_MAKER_ROLE);
  console.log("\n  Admin role for MARKET_MAKER_ROLE:", roleAdmin);
  console.log("  (This is the role needed to grant MARKET_MAKER_ROLE)");

  // Check if deployer is admin
  const isDeployerAdmin = await roleManager.hasRole(DEFAULT_ADMIN_ROLE, deployer.address);
  console.log("\n  Deployer has DEFAULT_ADMIN_ROLE:", isDeployerAdmin);

  // Check if deployer has the role admin
  const deployerHasRoleAdmin = await roleManager.hasRole(roleAdmin, deployer.address);
  console.log("  Deployer has role admin for MARKET_MAKER:", deployerHasRoleAdmin);

  // ========== Step 1: Grant PaymentProcessor the role admin ==========
  console.log("\n" + "=".repeat(50));
  console.log("Step 1: Grant PaymentProcessor role admin capability");
  console.log("=".repeat(50));

  const ppHasRoleAdmin = await roleManager.hasRole(roleAdmin, PAYMENT_PROCESSOR);
  console.log("  PaymentProcessor has role admin:", ppHasRoleAdmin);

  if (!ppHasRoleAdmin) {
    if (!deployerHasRoleAdmin) {
      console.error("\n❌ Deployer cannot grant role admin - doesn't have it!");
      console.log("   The OPERATIONS_ADMIN_ROLE needs to be granted first.");
      // Try granting OPERATIONS_ADMIN_ROLE if deployer is DEFAULT_ADMIN
      if (isDeployerAdmin) {
        console.log("\n   Trying to grant OPERATIONS_ADMIN_ROLE to PaymentProcessor...");
        let tx = await roleManager.grantRole(OPERATIONS_ADMIN_ROLE, PAYMENT_PROCESSOR);
        await tx.wait();
        console.log("   ✅ OPERATIONS_ADMIN_ROLE granted to PaymentProcessor");
      }
    } else {
      console.log("  Granting role admin to PaymentProcessor...");
      const tx = await roleManager.grantRole(roleAdmin, PAYMENT_PROCESSOR);
      await tx.wait();
      console.log("  ✅ Role admin granted to PaymentProcessor");
    }
  } else {
    console.log("  ✅ PaymentProcessor already has role admin");
  }

  // ========== Step 2: Configure PaymentProcessor with legacy manager ==========
  console.log("\n" + "=".repeat(50));
  console.log("Step 2: Configure PaymentProcessor with legacy manager");
  console.log("=".repeat(50));

  // Check if PaymentProcessor owner is deployer
  const ppOwner = await paymentProcessor.owner();
  console.log("  PaymentProcessor owner:", ppOwner);
  console.log("  Deployer is owner:", ppOwner === deployer.address);

  const currentLegacy = await paymentProcessor.legacyRoleManager();
  console.log("  Current legacyRoleManager:", currentLegacy);

  if (currentLegacy === ethers.ZeroAddress) {
    if (ppOwner === deployer.address) {
      console.log("  Setting legacyRoleManager...");
      const tx = await paymentProcessor.setLegacyRoleManager(OLD_TIERED_ROLE_MANAGER);
      await tx.wait();
      console.log("  ✅ legacyRoleManager set to:", OLD_TIERED_ROLE_MANAGER);
    } else {
      console.log("  ⚠️  Deployer is not owner - cannot set legacyRoleManager");
    }
  } else {
    console.log("  ✅ legacyRoleManager already configured");
  }

  // ========== Step 3: Grant user the role directly (immediate fix) ==========
  console.log("\n" + "=".repeat(50));
  console.log("Step 3: Grant user MARKET_MAKER_ROLE (immediate fix)");
  console.log("=".repeat(50));

  const userHasRole = await roleManager.hasRole(MARKET_MAKER_ROLE, USER_TO_GRANT);
  console.log("  User", USER_TO_GRANT);
  console.log("  Has MARKET_MAKER_ROLE:", userHasRole);

  if (!userHasRole && deployerHasRoleAdmin) {
    console.log("  Granting MARKET_MAKER_ROLE...");
    const tx = await roleManager.grantRole(MARKET_MAKER_ROLE, USER_TO_GRANT);
    await tx.wait();
    console.log("  ✅ MARKET_MAKER_ROLE granted");
  } else if (userHasRole) {
    console.log("  ✅ User already has MARKET_MAKER_ROLE");
  }

  // ========== Summary ==========
  console.log("\n" + "=".repeat(70));
  console.log("Configuration Complete");
  console.log("=".repeat(70));

  // Verify final state
  const ppHasRoleAdminFinal = await roleManager.hasRole(roleAdmin, PAYMENT_PROCESSOR);
  const legacyFinal = await paymentProcessor.legacyRoleManager();
  const userHasRoleFinal = await roleManager.hasRole(MARKET_MAKER_ROLE, USER_TO_GRANT);

  console.log("\nFinal State:");
  console.log("  PaymentProcessor has role admin:", ppHasRoleAdminFinal);
  console.log("  PaymentProcessor.legacyRoleManager:", legacyFinal);
  console.log("  User has MARKET_MAKER_ROLE:", userHasRoleFinal);

  if (ppHasRoleAdminFinal && legacyFinal !== ethers.ZeroAddress && userHasRoleFinal) {
    console.log("\n✅ All configuration complete! Future purchases will grant roles on both systems.");
  } else {
    console.log("\n⚠️  Some configuration incomplete. Check output above.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
