const hre = require("hardhat");
const { ethers } = hre;
const { getAddress, requireAddress, ROLE_HASHES, printAddresses } = require("./lib/addresses");

/**
 * Check RoleManager Configuration
 *
 * Diagnostic script to verify TieredRoleManager state and permissions.
 *
 * Usage:
 *   npx hardhat run scripts/admin/check-role-manager.js --network mordor
 */

async function main() {
  console.log("=".repeat(60));
  console.log("Checking RoleManager Configuration");
  console.log("=".repeat(60));

  const network = await ethers.provider.getNetwork();
  console.log(`\nNetwork: ${network.name || "unknown"} (Chain ID: ${network.chainId})`);

  // Print loaded addresses
  printAddresses();

  // Get addresses from shared config
  const tieredRoleManagerAddress = requireAddress("tieredRoleManager");
  const friendGroupMarketFactoryAddress = getAddress("friendGroupMarketFactory");

  console.log("\n--- Contract Addresses ---");
  console.log("TieredRoleManager:", tieredRoleManagerAddress);
  console.log("FriendGroupMarketFactory:", friendGroupMarketFactoryAddress || "not found");

  // Connect to TieredRoleManager
  const roleManager = await ethers.getContractAt("TieredRoleManager", tieredRoleManagerAddress);

  const [signer] = await ethers.getSigners();
  const signerAddr = await signer.getAddress();
  console.log("\nSigner:", signerAddr);

  // Role hashes
  const MARKET_MAKER_ROLE = ROLE_HASHES.MARKET_MAKER_ROLE;
  const FRIEND_MARKET_ROLE = ROLE_HASHES.FRIEND_MARKET_ROLE;
  const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;

  console.log("\n--- Role Hashes ---");
  console.log("DEFAULT_ADMIN_ROLE:", DEFAULT_ADMIN_ROLE);
  console.log("MARKET_MAKER_ROLE:", MARKET_MAKER_ROLE);
  console.log("FRIEND_MARKET_ROLE:", FRIEND_MARKET_ROLE);

  // Check the role admin for MARKET_MAKER_ROLE
  console.log("\n--- Role Admin Configuration ---");
  try {
    const marketMakerAdmin = await roleManager.getRoleAdmin(MARKET_MAKER_ROLE);
    console.log("MARKET_MAKER_ROLE admin:", marketMakerAdmin);

    const friendMarketAdmin = await roleManager.getRoleAdmin(FRIEND_MARKET_ROLE);
    console.log("FRIEND_MARKET_ROLE admin:", friendMarketAdmin);
  } catch (e) {
    console.log("Error getting role admin:", e.message);
  }

  // Check signer permissions
  console.log("\n--- Signer Permissions ---");
  const hasDefaultAdmin = await roleManager.hasRole(DEFAULT_ADMIN_ROLE, signerAddr);
  console.log("Has DEFAULT_ADMIN_ROLE:", hasDefaultAdmin);

  const hasMarketMaker = await roleManager.hasRole(MARKET_MAKER_ROLE, signerAddr);
  console.log("Has MARKET_MAKER_ROLE:", hasMarketMaker);

  const hasFriendMarket = await roleManager.hasRole(FRIEND_MARKET_ROLE, signerAddr);
  console.log("Has FRIEND_MARKET_ROLE:", hasFriendMarket);

  // Check if FriendGroupMarketFactory has MARKET_MAKER_ROLE
  if (friendGroupMarketFactoryAddress) {
    console.log("\n--- FriendGroupMarketFactory Permissions ---");
    const factoryHasMarketMaker = await roleManager.hasRole(MARKET_MAKER_ROLE, friendGroupMarketFactoryAddress);
    console.log("Factory has MARKET_MAKER_ROLE:", factoryHasMarketMaker);

    const factoryHasFriendMarket = await roleManager.hasRole(FRIEND_MARKET_ROLE, friendGroupMarketFactoryAddress);
    console.log("Factory has FRIEND_MARKET_ROLE:", factoryHasFriendMarket);
  }

  // Check the role metadata if available
  console.log("\n--- Role Metadata ---");
  try {
    const marketMakerMetadata = await roleManager.roleMetadata(MARKET_MAKER_ROLE);
    console.log("MARKET_MAKER_ROLE metadata:");
    console.log("  Name:", marketMakerMetadata.name);
    console.log("  Is premium:", marketMakerMetadata.isPremium);
    console.log("  Is active:", marketMakerMetadata.isActive);
    console.log("  Max members:", marketMakerMetadata.maxMembers?.toString() || "N/A");
    console.log("  Current members:", marketMakerMetadata.currentMembers?.toString() || "N/A");
  } catch (e) {
    console.log("MARKET_MAKER_ROLE metadata not available (may be older contract version)");
  }

  try {
    const friendMarketMetadata = await roleManager.roleMetadata(FRIEND_MARKET_ROLE);
    console.log("\nFRIEND_MARKET_ROLE metadata:");
    console.log("  Name:", friendMarketMetadata.name);
    console.log("  Is premium:", friendMarketMetadata.isPremium);
    console.log("  Is active:", friendMarketMetadata.isActive);
  } catch (e) {
    console.log("FRIEND_MARKET_ROLE metadata not available");
  }

  console.log("\n" + "=".repeat(60));
  console.log("Check complete");
  console.log("=".repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
