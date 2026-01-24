const { ethers } = require('hardhat');

/**
 * Fix PaymentProcessor to point to the correct TieredRoleManager
 */

const PAYMENT_PROCESSOR = '0xC6A3D457b0a0D9Fa4859F4211A4c9551F8Ce1F63';
const CORRECT_ROLE_MANAGER = '0xA6F794292488C628f91A0475dDF8dE6cEF2706EF';

async function main() {
  const [signer] = await ethers.getSigners();

  console.log("=".repeat(70));
  console.log("Fixing PaymentProcessor RoleManagerCore Reference");
  console.log("=".repeat(70));
  console.log("\nSigner:", signer.address);

  const paymentProcessor = await ethers.getContractAt(
    [
      'function roleManagerCore() view returns (address)',
      'function setRoleManagerCore(address) external',
      'function owner() view returns (address)',
    ],
    PAYMENT_PROCESSOR,
    signer
  );

  // Check current configuration
  console.log("\n1. Current configuration:");
  const currentRoleMgr = await paymentProcessor.roleManagerCore();
  console.log("   roleManagerCore:", currentRoleMgr);
  console.log("   Should be:      ", CORRECT_ROLE_MANAGER);

  if (currentRoleMgr.toLowerCase() === CORRECT_ROLE_MANAGER.toLowerCase()) {
    console.log("\n✅ Already pointing to correct TieredRoleManager");
    return;
  }

  // Check ownership
  const owner = await paymentProcessor.owner();
  console.log("   Owner:", owner);
  console.log("   Signer is owner:", owner.toLowerCase() === signer.address.toLowerCase());

  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    console.log("\n❌ Signer is not the owner, cannot update");
    return;
  }

  // Update
  console.log("\n2. Updating roleManagerCore...");
  const tx = await paymentProcessor.setRoleManagerCore(CORRECT_ROLE_MANAGER);
  await tx.wait();
  console.log("   ✅ Transaction confirmed");

  // Verify
  const newRoleMgr = await paymentProcessor.roleManagerCore();
  console.log("\n3. Verification:");
  console.log("   New roleManagerCore:", newRoleMgr);
  console.log("   Match:", newRoleMgr.toLowerCase() === CORRECT_ROLE_MANAGER.toLowerCase());

  console.log("\n" + "=".repeat(70));
  console.log("Done! PaymentProcessor now points to correct TieredRoleManager");
  console.log("=".repeat(70));
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
