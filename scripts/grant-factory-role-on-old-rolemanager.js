const hre = require("hardhat");
const { ethers } = require("hardhat");

/**
 * Grant MARKET_MAKER_ROLE to FriendGroupMarketFactory on the OLD RoleManager
 *
 * The ConditionalMarketFactory uses an old roleManager (0x3759B1F...) that cannot be changed.
 * This script grants MARKET_MAKER_ROLE to FriendGroupMarketFactory on that old roleManager
 * so it can call ConditionalMarketFactory.deployMarketPair() when friend markets activate.
 *
 * Usage:
 *   npx hardhat run scripts/grant-factory-role-on-old-rolemanager.js --network mordor
 */

const CONTRACTS = {
  // This is the roleManager that ConditionalMarketFactory uses
  oldRoleManager: '0x3759B1F153193471Dd48401eE198F664f2d7FeB8',
  friendGroupMarketFactory: '0xE363e722039489a3Bb91B6b6420515C7aE1B91D3',
};

async function main() {
  console.log("=".repeat(60));
  console.log("Grant MARKET_MAKER_ROLE on Old RoleManager");
  console.log("=".repeat(60));

  const [signer] = await ethers.getSigners();
  console.log("Signer address:", signer.address);

  // Try to connect to the old roleManager - we need to figure out what type it is
  console.log("\nOld RoleManager:", CONTRACTS.oldRoleManager);
  console.log("FriendGroupMarketFactory:", CONTRACTS.friendGroupMarketFactory);

  // Try different ABIs to interact with the old roleManager
  const roleManagerABI = [
    "function MARKET_MAKER_ROLE() view returns (bytes32)",
    "function hasRole(bytes32 role, address account) view returns (bool)",
    "function grantRole(bytes32 role, address account)",
    "function getRoleAdmin(bytes32 role) view returns (bytes32)",
    "function DEFAULT_ADMIN_ROLE() view returns (bytes32)",
    // TieredRoleManager specific
    "function grantTier(address user, bytes32 role, uint8 tier, uint256 durationSeconds)",
    // MinimalRoleManager specific
    "function grantRoleWithExpiry(bytes32 role, address account, uint256 expiry)",
  ];

  const roleManager = new ethers.Contract(
    CONTRACTS.oldRoleManager,
    roleManagerABI,
    signer
  );

  // Get MARKET_MAKER_ROLE hash
  let marketMakerRole;
  try {
    marketMakerRole = await roleManager.MARKET_MAKER_ROLE();
    console.log("\nMARKET_MAKER_ROLE hash:", marketMakerRole);
  } catch (e) {
    // Fall back to computing the hash
    marketMakerRole = ethers.keccak256(ethers.toUtf8Bytes("MARKET_MAKER_ROLE"));
    console.log("\nMARKET_MAKER_ROLE hash (computed):", marketMakerRole);
  }

  // Check current role status
  const hasRole = await roleManager.hasRole(marketMakerRole, CONTRACTS.friendGroupMarketFactory);
  console.log("FriendGroupMarketFactory hasRole:", hasRole);

  if (hasRole) {
    console.log("\n✅ FriendGroupMarketFactory already has MARKET_MAKER_ROLE on old roleManager!");
    return;
  }

  // Check admin role
  let adminRole;
  try {
    adminRole = await roleManager.DEFAULT_ADMIN_ROLE();
  } catch (e) {
    adminRole = ethers.ZeroHash;
  }

  const isAdmin = await roleManager.hasRole(adminRole, signer.address);
  console.log("\nSigner is admin:", isAdmin);

  if (!isAdmin) {
    console.error("\n❌ ERROR: Signer does not have admin role on old roleManager");
    console.log("Please use an admin account to run this script.");
    process.exit(1);
  }

  // Try to grant the role
  console.log("\n--- Granting MARKET_MAKER_ROLE ---");

  try {
    // First try grantTier (TieredRoleManager style)
    console.log("Trying grantTier...");
    const indefiniteDuration = 100 * 365 * 24 * 60 * 60; // 100 years
    const tx = await roleManager.grantTier(
      CONTRACTS.friendGroupMarketFactory,
      marketMakerRole,
      4, // PLATINUM tier
      indefiniteDuration
    );
    console.log("Transaction hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("Transaction confirmed in block:", receipt.blockNumber);
  } catch (e1) {
    console.log("grantTier failed:", e1.message);

    try {
      // Try grantRoleWithExpiry (MinimalRoleManager style)
      console.log("\nTrying grantRoleWithExpiry...");
      const expiry = Math.floor(Date.now() / 1000) + (100 * 365 * 24 * 60 * 60); // 100 years
      const tx = await roleManager.grantRoleWithExpiry(
        marketMakerRole,
        CONTRACTS.friendGroupMarketFactory,
        expiry
      );
      console.log("Transaction hash:", tx.hash);
      const receipt = await tx.wait();
      console.log("Transaction confirmed in block:", receipt.blockNumber);
    } catch (e2) {
      console.log("grantRoleWithExpiry failed:", e2.message);

      try {
        // Try standard grantRole (AccessControl style)
        console.log("\nTrying grantRole...");
        const tx = await roleManager.grantRole(
          marketMakerRole,
          CONTRACTS.friendGroupMarketFactory
        );
        console.log("Transaction hash:", tx.hash);
        const receipt = await tx.wait();
        console.log("Transaction confirmed in block:", receipt.blockNumber);
      } catch (e3) {
        console.error("\nAll grant methods failed!");
        console.error("grantRole error:", e3.message);
        process.exit(1);
      }
    }
  }

  // Verify
  const hasRoleNow = await roleManager.hasRole(marketMakerRole, CONTRACTS.friendGroupMarketFactory);
  console.log("\nVerification - hasRole after grant:", hasRoleNow);

  if (hasRoleNow) {
    console.log("\n✅ SUCCESS: MARKET_MAKER_ROLE granted to FriendGroupMarketFactory!");
  } else {
    console.log("\n❌ FAILED: Role was not granted. Please check contract state.");
  }

  console.log("\n" + "=".repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
