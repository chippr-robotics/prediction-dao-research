const { ethers } = require('hardhat');

/**
 * Authorize PaymentProcessor to grant roles on TieredRoleManager
 *
 * After purchase, PaymentProcessor calls grantRoleFromExtension() on TieredRoleManager
 * This script ensures PaymentProcessor is authorized to do so
 */

const PAYMENT_PROCESSOR = '0xC6A3D457b0a0D9Fa4859F4211A4c9551F8Ce1F63';
const TIERED_ROLE_MANAGER = '0xA6F794292488C628f91A0475dDF8dE6cEF2706EF';

async function main() {
  const [signer] = await ethers.getSigners();

  console.log("=".repeat(70));
  console.log("Authorize PaymentProcessor on TieredRoleManager");
  console.log("=".repeat(70));
  console.log("\nSigner:", signer.address);

  const tieredRoleManager = await ethers.getContractAt(
    [
      'function authorizedExtensions(address) view returns (bool)',
      'function setAuthorizedExtension(address, bool) external',
      'function hasRole(bytes32, address) view returns (bool)',
    ],
    TIERED_ROLE_MANAGER,
    signer
  );

  // Check current authorization
  console.log("\n1. Current authorization status:");
  const isAuthorized = await tieredRoleManager.authorizedExtensions(PAYMENT_PROCESSOR);
  console.log("   PaymentProcessor authorized:", isAuthorized);

  if (isAuthorized) {
    console.log("\n✅ PaymentProcessor is already authorized!");
    return;
  }

  // Check if signer has admin role
  const DEFAULT_ADMIN = '0x0000000000000000000000000000000000000000000000000000000000000000';
  const signerHasAdmin = await tieredRoleManager.hasRole(DEFAULT_ADMIN, signer.address);
  console.log("   Signer has DEFAULT_ADMIN_ROLE:", signerHasAdmin);

  if (!signerHasAdmin) {
    console.log("\n❌ Signer does not have DEFAULT_ADMIN_ROLE on TieredRoleManager");
    console.log("   Cannot authorize PaymentProcessor");
    return;
  }

  // Authorize PaymentProcessor
  console.log("\n2. Authorizing PaymentProcessor...");
  const tx = await tieredRoleManager.setAuthorizedExtension(PAYMENT_PROCESSOR, true);
  console.log("   Transaction hash:", tx.hash);
  await tx.wait();
  console.log("   ✅ Transaction confirmed");

  // Verify
  const nowAuthorized = await tieredRoleManager.authorizedExtensions(PAYMENT_PROCESSOR);
  console.log("\n3. Verification:");
  console.log("   PaymentProcessor authorized:", nowAuthorized);

  if (nowAuthorized) {
    console.log("\n" + "=".repeat(70));
    console.log("✅ SUCCESS! PaymentProcessor can now grant roles after purchases");
    console.log("=".repeat(70));
  } else {
    console.log("\n❌ Authorization failed - please check manually");
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
