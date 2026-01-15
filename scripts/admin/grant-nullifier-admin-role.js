const { ethers } = require("hardhat");

/**
 * Grant NULLIFIER_ADMIN_ROLE to a user on NullifierRegistry
 *
 * This role allows the user to:
 * - Nullify markets (block them from being traded)
 * - Nullify addresses (block them from participating)
 * - Reinstate previously nullified markets/addresses
 *
 * Usage:
 *   FLOPPY_KEYSTORE_PASSWORD=password npx hardhat run scripts/admin/grant-nullifier-admin-role.js --network mordor
 */

// Update this with the deployed NullifierRegistry address
const CONTRACTS = {
  nullifierRegistry: null, // Must be set to deployed address before running
};

// User to grant NULLIFIER_ADMIN_ROLE to
const USER_ADDRESS = '0xb8596659FD9212dB17752DB6EB53ACA97f044967';

async function main() {
  console.log("=".repeat(60));
  console.log("Grant NULLIFIER_ADMIN_ROLE");
  console.log("=".repeat(60));

  if (!CONTRACTS.nullifierRegistry) {
    console.error("\nERROR: NullifierRegistry address not set!");
    console.error("Please set CONTRACTS.nullifierRegistry to the deployed address.");
    console.error("Example: const CONTRACTS = { nullifierRegistry: '0x...' };");
    process.exit(1);
  }
    console.log("Please update CONTRACTS.nullifierRegistry with the deployed address.");
    console.log("Deploy with: npx hardhat run scripts/deploy-nullifier-registry.js --network mordor");
    process.exit(1);
  }

  const [signer] = await ethers.getSigners();
  console.log("Signer address:", signer.address);
  console.log("User address:", USER_ADDRESS);

  // Connect to NullifierRegistry
  const nullifierRegistry = await ethers.getContractAt(
    "NullifierRegistry",
    CONTRACTS.nullifierRegistry
  );

  // Get role hash
  const NULLIFIER_ADMIN_ROLE = await nullifierRegistry.NULLIFIER_ADMIN_ROLE();
  const DEFAULT_ADMIN_ROLE = await nullifierRegistry.DEFAULT_ADMIN_ROLE();
  console.log("\nNULLIFIER_ADMIN_ROLE hash:", NULLIFIER_ADMIN_ROLE);
  console.log("DEFAULT_ADMIN_ROLE hash:", DEFAULT_ADMIN_ROLE);

  // Check if signer has admin role
  const signerIsAdmin = await nullifierRegistry.hasRole(DEFAULT_ADMIN_ROLE, signer.address);
  console.log("\nSigner is DEFAULT_ADMIN:", signerIsAdmin);

  if (!signerIsAdmin) {
    console.error("\nERROR: Signer does not have DEFAULT_ADMIN_ROLE on NullifierRegistry");
    console.log("Please use the contract deployer or an existing admin to run this script.");
    process.exit(1);
  }

  // Check current role status
  const hasRole = await nullifierRegistry.hasRole(NULLIFIER_ADMIN_ROLE, USER_ADDRESS);
  console.log("User current hasRole(NULLIFIER_ADMIN_ROLE):", hasRole);

  if (hasRole) {
    console.log("\n User already has NULLIFIER_ADMIN_ROLE!");
    console.log("No action needed.");
    return;
  }

  // Grant role
  console.log("\n--- Granting NULLIFIER_ADMIN_ROLE ---");
  try {
    const tx = await nullifierRegistry.grantRole(NULLIFIER_ADMIN_ROLE, USER_ADDRESS);
    console.log("Transaction hash:", tx.hash);

    const receipt = await tx.wait();
    console.log("Transaction confirmed in block:", receipt.blockNumber);

    // Verify the role was granted
    const hasRoleNow = await nullifierRegistry.hasRole(NULLIFIER_ADMIN_ROLE, USER_ADDRESS);
    console.log("\nVerification - hasRole after grant:", hasRoleNow);

    if (hasRoleNow) {
      console.log("\n SUCCESS: NULLIFIER_ADMIN_ROLE granted!");
      console.log("User can now manage nullifications via the admin panel:");
      console.log("  - Nullify suspicious markets");
      console.log("  - Nullify suspicious addresses");
      console.log("  - Reinstate false positives");
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
