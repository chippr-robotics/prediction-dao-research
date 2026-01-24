const { ethers } = require('hardhat');

/**
 * Deploy RoleManagerCore (modular) and configure it with PaymentProcessor
 *
 * This fixes the role granting issue where PaymentProcessor calls
 * grantRoleFromExtension() which TieredRoleManager doesn't have.
 *
 * RoleManagerCore is the modular version that has this function.
 */

const PAYMENT_PROCESSOR = '0xC6A3D457b0a0D9Fa4859F4211A4c9551F8Ce1F63';
const TIER_REGISTRY = '0x4eb93BaF14f668F8f67922121A3b9FC3FB5b8A0d';
const MEMBERSHIP_MANAGER = '0x6698C2ba129D18C1930e19C586f7Da6aB30b86D6';

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("=".repeat(70));
  console.log("Deploying RoleManagerCore (Modular)");
  console.log("=".repeat(70));
  console.log("\nDeployer:", deployer.address);

  // 1. Deploy RoleManagerCore
  console.log("\n1. Deploying RoleManagerCore...");
  const RoleManagerCore = await ethers.getContractFactory("RoleManagerCore");
  const roleManagerCore = await RoleManagerCore.deploy();
  await roleManagerCore.waitForDeployment();
  const roleManagerCoreAddress = await roleManagerCore.getAddress();
  console.log("   ✅ RoleManagerCore deployed at:", roleManagerCoreAddress);

  // 2. Initialize with deployer as admin
  console.log("\n2. Initializing RoleManagerCore...");
  // Constructor already grants DEFAULT_ADMIN_ROLE to deployer for non-deterministic deploy

  // 3. Set extensions on RoleManagerCore
  console.log("\n3. Setting extensions on RoleManagerCore...");
  const tx1 = await roleManagerCore.setAllExtensions(
    TIER_REGISTRY,
    PAYMENT_PROCESSOR,
    ethers.ZeroAddress, // usageTracker not needed
    MEMBERSHIP_MANAGER
  );
  await tx1.wait();
  console.log("   ✅ Extensions set");

  // Verify extensions
  const extensions = await roleManagerCore.getExtensions();
  console.log("   tierRegistry:", extensions[0]);
  console.log("   paymentProcessor:", extensions[1]);
  console.log("   usageTracker:", extensions[2]);
  console.log("   membershipManager:", extensions[3]);

  // 4. Update PaymentProcessor to use new RoleManagerCore
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

  // Check ownership
  const owner = await paymentProcessor.owner();
  console.log("   PaymentProcessor owner:", owner);
  console.log("   Deployer is owner:", owner.toLowerCase() === deployer.address.toLowerCase());

  if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
    console.log("\n   ⚠️  Deployer is not PaymentProcessor owner");
    console.log("   Manual step required: Call PaymentProcessor.setRoleManagerCore(", roleManagerCoreAddress, ")");
  } else {
    const tx2 = await paymentProcessor.setRoleManagerCore(roleManagerCoreAddress);
    await tx2.wait();
    console.log("   ✅ PaymentProcessor updated");

    // Verify
    const newRoleMgr = await paymentProcessor.roleManagerCore();
    console.log("   New roleManagerCore:", newRoleMgr);
    console.log("   Match:", newRoleMgr.toLowerCase() === roleManagerCoreAddress.toLowerCase());
  }

  // 5. Summary
  console.log("\n" + "=".repeat(70));
  console.log("DEPLOYMENT COMPLETE");
  console.log("=".repeat(70));
  console.log("\nRoleManagerCore:", roleManagerCoreAddress);
  console.log("\nUpdate frontend/src/config/contracts.js:");
  console.log(`  roleManagerCore: '${roleManagerCoreAddress}',`);
  console.log("\nPaymentProcessor now calls grantRoleFromExtension on RoleManagerCore");
  console.log("Role granting after purchase should now work!");
  console.log("=".repeat(70));
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
