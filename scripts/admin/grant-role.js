/**
 * Consolidated Role Grant Script
 *
 * Grant any role to a user or contract address on TieredRoleManager.
 * Replaces multiple individual role grant scripts with a single configurable script.
 *
 * Usage:
 *   ROLE=MARKET_MAKER USER=0x123... npx hardhat run scripts/admin/grant-role.js --network mordor
 *   ROLE=FRIEND_MARKET USER=0x456... TIER=SILVER npx hardhat run scripts/admin/grant-role.js --network mordor
 *   ROLE=DEFAULT_ADMIN USER=0x789... npx hardhat run scripts/admin/grant-role.js --network mordor
 *
 * Environment Variables:
 *   ROLE     - Role to grant (MARKET_MAKER, FRIEND_MARKET, DEFAULT_ADMIN, NULLIFIER_ADMIN, etc.)
 *   USER     - Address to receive the role
 *   TIER     - Optional tier level (BRONZE, SILVER, GOLD, PLATINUM). Default: PLATINUM
 *   DURATION - Optional duration in seconds. Default: 100 years
 */

const { ethers } = require("hardhat");
const { requireAddress, getRoleHash, MembershipTier } = require("./lib/addresses");

// =============================================================================
// CONFIGURATION
// =============================================================================

// Parse role name from environment
function getRoleName() {
  const role = process.env.ROLE;
  if (!role) {
    console.error("Error: ROLE environment variable required");
    console.log("\nSupported roles:");
    console.log("  - MARKET_MAKER     (create public markets)");
    console.log("  - FRIEND_MARKET    (create friend group markets)");
    console.log("  - DEFAULT_ADMIN    (admin panel access)");
    console.log("  - NULLIFIER_ADMIN  (nullify markets)");
    console.log("  - OPERATIONS_ADMIN (operations access)");
    console.log("\nExample:");
    console.log("  ROLE=MARKET_MAKER USER=0x123... npx hardhat run scripts/admin/grant-role.js --network mordor");
    process.exit(1);
  }
  return role.toUpperCase();
}

// Parse user address from environment
function getUserAddress() {
  const user = process.env.USER;
  if (!user || !ethers.isAddress(user)) {
    console.error("Error: Valid USER address required");
    console.log("\nExample:");
    console.log("  ROLE=MARKET_MAKER USER=0x123... npx hardhat run scripts/admin/grant-role.js --network mordor");
    process.exit(1);
  }
  return user;
}

// Parse tier from environment
function getTier() {
  const tierName = (process.env.TIER || "PLATINUM").toUpperCase();
  const tier = MembershipTier[tierName];
  if (tier === undefined) {
    console.error(`Error: Invalid tier '${tierName}'`);
    console.log("Valid tiers: NONE, BRONZE, SILVER, GOLD, PLATINUM");
    process.exit(1);
  }
  return { name: tierName, value: tier };
}

// Parse duration from environment
function getDuration() {
  if (process.env.DURATION) {
    return parseInt(process.env.DURATION, 10);
  }
  // Default: 100 years
  return 100 * 365 * 24 * 60 * 60;
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const roleName = getRoleName();
  const userAddress = getUserAddress();
  const tier = getTier();
  const duration = getDuration();

  console.log("=".repeat(60));
  console.log(`Grant ${roleName}_ROLE`);
  console.log("=".repeat(60));

  const network = await ethers.provider.getNetwork();
  console.log(`\nNetwork: ${network.name || "unknown"} (Chain ID: ${network.chainId})`);

  const [signer] = await ethers.getSigners();
  console.log("Admin address:", signer.address);
  console.log("Target user:", userAddress);
  console.log("Tier:", tier.name);
  console.log("Duration:", `${Math.floor(duration / 86400)} days`);

  // Get contract address
  const tieredRoleManagerAddress = requireAddress("tieredRoleManager");
  console.log("\nTieredRoleManager:", tieredRoleManagerAddress);

  // Connect to contract
  const tieredRoleManager = await ethers.getContractAt(
    "TieredRoleManager",
    tieredRoleManagerAddress
  );

  // Verify signer is admin
  const adminRoleHash = ethers.ZeroHash; // DEFAULT_ADMIN_ROLE is 0x0
  const isAdmin = await tieredRoleManager.hasRole(adminRoleHash, signer.address);
  console.log("\nSigner is admin:", isAdmin);

  if (!isAdmin) {
    console.error("\nError: Signer is not admin on TieredRoleManager");
    console.log("Make sure you're using the admin floppy disk or correct wallet");
    process.exit(1);
  }

  // Get role hash
  let roleHash;
  if (roleName === "DEFAULT_ADMIN") {
    roleHash = ethers.ZeroHash;
  } else {
    roleHash = getRoleHash(roleName);
  }
  console.log(`${roleName}_ROLE hash:`, roleHash);

  // Check current status
  const hasRole = await tieredRoleManager.hasRole(roleHash, userAddress);
  console.log("User already has role:", hasRole);

  if (hasRole) {
    // Get current tier info
    try {
      const memberInfo = await tieredRoleManager.getMemberInfo(userAddress, roleHash);
      console.log("\nCurrent membership info:");
      console.log("  Tier:", memberInfo.tier?.toString() || "N/A");
      console.log("  Expiry:", memberInfo.expiry ? new Date(Number(memberInfo.expiry) * 1000).toISOString() : "N/A");
    } catch (e) {
      // Contract may not have getMemberInfo
    }

    console.log("\nUser already has this role. Skipping grant.");
    console.log("Use FORCE=true to re-grant with new tier/duration.");

    if (process.env.FORCE !== "true") {
      return;
    }
    console.log("\nFORCE=true detected, re-granting role...");
  }

  // Grant role with tier
  console.log("\n--- Granting Role ---");

  try {
    // For DEFAULT_ADMIN_ROLE, use standard AccessControl grantRole
    if (roleName === "DEFAULT_ADMIN") {
      const tx = await tieredRoleManager.grantRole(roleHash, userAddress);
      console.log("Tx:", tx.hash);
      await tx.wait();
      console.log("Confirmed!");
    } else {
      // For tiered roles, use grantTier
      const tx = await tieredRoleManager.grantTier(
        userAddress,
        roleHash,
        tier.value,
        duration
      );
      console.log("Tx:", tx.hash);
      await tx.wait();
      console.log("Confirmed!");
    }

    // Verify
    const hasRoleNow = await tieredRoleManager.hasRole(roleHash, userAddress);
    console.log("\nVerification - hasRole:", hasRoleNow);

    if (hasRoleNow) {
      console.log("\n" + "=".repeat(60));
      console.log(`SUCCESS: ${roleName}_ROLE granted to ${userAddress}`);
      console.log("=".repeat(60));

      // Role-specific next steps
      switch (roleName) {
        case "MARKET_MAKER":
          console.log("\nUser can now create public prediction markets!");
          break;
        case "FRIEND_MARKET":
          console.log("\nUser can now create friend group markets!");
          break;
        case "DEFAULT_ADMIN":
          console.log("\nUser now has admin access to the system!");
          break;
        case "NULLIFIER_ADMIN":
          console.log("\nUser can now nullify markets in the NullifierRegistry!");
          break;
        default:
          console.log(`\nUser now has ${roleName} role!`);
      }
    } else {
      console.log("\nFAILED: Role was not granted");
      process.exit(1);
    }
  } catch (err) {
    console.error("\nError granting role:", err.message);
    if (err.message.includes("missing role")) {
      console.log("\nThe signer may not have permission to grant this role.");
    }
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
