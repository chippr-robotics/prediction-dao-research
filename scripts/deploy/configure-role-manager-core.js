const { ethers } = require('hardhat');

/**
 * Configure the newly deployed RoleManagerCore and update PaymentProcessor
 */

const ROLE_MANAGER_CORE = '0x147284A99d4857fCb610eA7B11aF0483FE590cE0';
const PAYMENT_PROCESSOR = '0xC6A3D457b0a0D9Fa4859F4211A4c9551F8Ce1F63';
const TIER_REGISTRY = '0x4eb93BaF14f668F8f67922121A3b9FC3FB5b8A0d';
const MEMBERSHIP_MANAGER = '0x6698C2ba129D18C1930e19C586f7Da6aB30b86D6';

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("=".repeat(70));
  console.log("Configuring RoleManagerCore");
  console.log("=".repeat(70));
  console.log("\nDeployer:", deployer.address);
  console.log("RoleManagerCore:", ROLE_MANAGER_CORE);

  const roleManagerCore = await ethers.getContractAt(
    [
      'function setAllExtensions(address, address, address, address) external',
      'function getExtensions() view returns (address, address, address, address)',
      'function hasRole(bytes32, address) view returns (bool)',
      'function paymentProcessor() view returns (address)',
    ],
    ROLE_MANAGER_CORE,
    deployer
  );

  // Check current extensions
  console.log("\n1. Checking current extensions...");
  try {
    const ext = await roleManagerCore.getExtensions();
    console.log("   tierRegistry:", ext[0]);
    console.log("   paymentProcessor:", ext[1]);
    console.log("   usageTracker:", ext[2]);
    console.log("   membershipManager:", ext[3]);

    const needsConfig = ext[1] === ethers.ZeroAddress;
    if (!needsConfig) {
      console.log("\n   Extensions already configured!");
    }
  } catch (e) {
    console.log("   Error reading extensions:", e.message);
  }

  // Set extensions
  console.log("\n2. Setting extensions on RoleManagerCore...");
  try {
    const tx1 = await roleManagerCore.setAllExtensions(
      TIER_REGISTRY,
      PAYMENT_PROCESSOR,
      ethers.ZeroAddress,
      MEMBERSHIP_MANAGER
    );
    console.log("   Transaction:", tx1.hash);
    await tx1.wait();
    console.log("   ✅ Extensions set");
  } catch (e) {
    console.log("   Error:", e.message);
    if (e.message.includes("already")) {
      console.log("   (May already be configured)");
    }
  }

  // Verify extensions
  console.log("\n3. Verifying extensions...");
  const ext = await roleManagerCore.getExtensions();
  console.log("   tierRegistry:", ext[0]);
  console.log("   paymentProcessor:", ext[1]);
  console.log("   usageTracker:", ext[2]);
  console.log("   membershipManager:", ext[3]);

  // Update PaymentProcessor
  console.log("\n4. Updating PaymentProcessor.roleManagerCore...");
  const paymentProcessor = await ethers.getContractAt(
    [
      'function setRoleManagerCore(address) external',
      'function roleManagerCore() view returns (address)',
      'function owner() view returns (address)',
    ],
    PAYMENT_PROCESSOR,
    deployer
  );

  const currentRoleMgr = await paymentProcessor.roleManagerCore();
  console.log("   Current roleManagerCore:", currentRoleMgr);

  if (currentRoleMgr.toLowerCase() === ROLE_MANAGER_CORE.toLowerCase()) {
    console.log("   ✅ Already pointing to new RoleManagerCore");
  } else {
    const owner = await paymentProcessor.owner();
    console.log("   PaymentProcessor owner:", owner);

    if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
      console.log("   ⚠️  Deployer is not owner, cannot update");
    } else {
      const tx2 = await paymentProcessor.setRoleManagerCore(ROLE_MANAGER_CORE);
      console.log("   Transaction:", tx2.hash);
      await tx2.wait();
      console.log("   ✅ PaymentProcessor updated");
    }
  }

  // Final verification
  console.log("\n5. Final verification...");
  const finalRoleMgr = await paymentProcessor.roleManagerCore();
  console.log("   PaymentProcessor.roleManagerCore:", finalRoleMgr);
  console.log("   Match:", finalRoleMgr.toLowerCase() === ROLE_MANAGER_CORE.toLowerCase());

  console.log("\n" + "=".repeat(70));
  console.log("CONFIGURATION COMPLETE");
  console.log("=".repeat(70));
  console.log("\nUpdate frontend/src/config/contracts.js:");
  console.log(`  roleManagerCore: '${ROLE_MANAGER_CORE}',`);
  console.log("\nRole granting after purchase should now work!");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
