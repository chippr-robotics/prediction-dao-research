/**
 * Verify ConditionalMarketFactory Configuration
 *
 * This script checks the factory's configuration:
 * 1. CTF1155 address
 * 2. RoleManager address
 * 3. Whether a user has the MARKET_MAKER_ROLE
 *
 * Usage:
 *   npx hardhat run scripts/verify-factory-config.js --network mordor
 *
 * Set USER_ADDRESS environment variable to check a specific user's role.
 */

const hre = require("hardhat");

// Deployed contract addresses
const DEPLOYED_CONTRACTS = {
  tieredRoleManager: '0x3759B1F153193471Dd48401eE198F664f2d7FeB8',
  marketFactory: '0x37b9086Cc0d03C8a1030cC50256593B8D0d369Ac',
  ctf1155: '0xE56d9034591C6A6A5C023883354FAeB435E3b441'
};

// Address to check (set via env or use default)
const USER_ADDRESS = process.env.USER_ADDRESS || '0xB8594B2d60261C89E49B9D64C7165B2f33fFB90E';

async function main() {
  console.log("=".repeat(60));
  console.log("ConditionalMarketFactory Configuration Verification");
  console.log("=".repeat(60));
  console.log();

  // Get deployer account
  const [deployer] = await hre.ethers.getSigners();
  console.log("Checking as account:", deployer.address);
  console.log("Target user to check:", USER_ADDRESS);
  console.log();

  // Connect to MarketFactory
  console.log("--- Market Factory Configuration ---");
  console.log("Expected factory address:", DEPLOYED_CONTRACTS.marketFactory);

  const marketFactory = await hre.ethers.getContractAt(
    "ConditionalMarketFactory",
    DEPLOYED_CONTRACTS.marketFactory
  );

  // Get current configuration
  const [owner, ctf1155, roleManager] = await Promise.all([
    marketFactory.owner(),
    marketFactory.ctf1155(),
    marketFactory.roleManager()
  ]);

  console.log();
  console.log("Owner:", owner);
  console.log("CTF1155 on factory:", ctf1155);
  console.log("Expected CTF1155:", DEPLOYED_CONTRACTS.ctf1155);
  console.log("CTF1155 match:", ctf1155.toLowerCase() === DEPLOYED_CONTRACTS.ctf1155.toLowerCase() ? "✓ YES" : "✗ NO");
  console.log();
  console.log("RoleManager on factory:", roleManager);
  console.log("Expected RoleManager:", DEPLOYED_CONTRACTS.tieredRoleManager);
  console.log("RoleManager match:", roleManager.toLowerCase() === DEPLOYED_CONTRACTS.tieredRoleManager.toLowerCase() ? "✓ YES" : "✗ NO");

  // Check if roleManager is ZeroAddress
  if (roleManager === hre.ethers.ZeroAddress) {
    console.log();
    console.log("⚠️  WARNING: RoleManager is not configured on the factory!");
    console.log("Run this to fix:");
    console.log(`  npx hardhat run scripts/deploy-ctf1155-and-configure.js --network mordor`);
    console.log("Or call: marketFactory.setRoleManager('${DEPLOYED_CONTRACTS.tieredRoleManager}')");
  }

  // Check CTF1155
  if (ctf1155 === hre.ethers.ZeroAddress) {
    console.log();
    console.log("⚠️  WARNING: CTF1155 is not configured on the factory!");
    console.log("Run this to fix:");
    console.log(`  npx hardhat run scripts/deploy-ctf1155-and-configure.js --network mordor`);
  }

  // Check user's role on the roleManager
  console.log();
  console.log("--- User Role Check ---");
  console.log("Checking user:", USER_ADDRESS);

  if (roleManager !== hre.ethers.ZeroAddress) {
    const roleManagerContract = await hre.ethers.getContractAt(
      "TieredRoleManager",
      roleManager
    );

    try {
      const MARKET_MAKER_ROLE = await roleManagerContract.MARKET_MAKER_ROLE();
      console.log("MARKET_MAKER_ROLE hash:", MARKET_MAKER_ROLE);

      const hasRole = await roleManagerContract.hasRole(MARKET_MAKER_ROLE, USER_ADDRESS);
      console.log("User has MARKET_MAKER_ROLE:", hasRole ? "✓ YES" : "✗ NO");

      // Also check if user is owner
      const isOwner = USER_ADDRESS.toLowerCase() === owner.toLowerCase();
      console.log("User is factory owner:", isOwner ? "✓ YES" : "✗ NO");

      if (!hasRole && !isOwner) {
        console.log();
        console.log("⚠️  User cannot create markets (not owner, no MARKET_MAKER_ROLE)");
        console.log("To grant the role, run:");
        console.log(`  USER_ADDRESS=${USER_ADDRESS} npx hardhat run scripts/grant-market-maker-role.js --network mordor`);
      } else {
        console.log();
        console.log("✓ User should be able to create markets");
      }
    } catch (error) {
      console.error("Error checking role:", error.message);

      // Try checking with the expected roleManager if factory has wrong one
      if (roleManager.toLowerCase() !== DEPLOYED_CONTRACTS.tieredRoleManager.toLowerCase()) {
        console.log();
        console.log("Trying with expected roleManager...");
        const expectedRoleManager = await hre.ethers.getContractAt(
          "TieredRoleManager",
          DEPLOYED_CONTRACTS.tieredRoleManager
        );

        try {
          const MARKET_MAKER_ROLE = await expectedRoleManager.MARKET_MAKER_ROLE();
          const hasRole = await expectedRoleManager.hasRole(MARKET_MAKER_ROLE, USER_ADDRESS);
          console.log("User has MARKET_MAKER_ROLE on expected roleManager:", hasRole ? "✓ YES" : "✗ NO");

          if (hasRole) {
            console.log();
            console.log("⚠️  User has role on expected roleManager, but factory is configured with different address!");
            console.log("To fix, the factory owner needs to call:");
            console.log(`  marketFactory.setRoleManager('${DEPLOYED_CONTRACTS.tieredRoleManager}')`);
          }
        } catch (e) {
          console.error("Error checking expected roleManager:", e.message);
        }
      }
    }
  } else {
    console.log("Cannot check user role - roleManager not configured");
  }

  console.log();
  console.log("=".repeat(60));
}

main()
  .then(() => {
    console.log("Verification complete!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Verification failed!");
    console.error(error);
    process.exit(1);
  });
