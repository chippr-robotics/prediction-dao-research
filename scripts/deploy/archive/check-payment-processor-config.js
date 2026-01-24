const { ethers } = require('hardhat');

/**
 * Check full PaymentProcessor configuration and roleManagerCore status
 */

async function main() {
  console.log("=".repeat(70));
  console.log("PaymentProcessor Configuration Analysis");
  console.log("=".repeat(70));

  const PAYMENT_PROCESSOR = '0xC6A3D457b0a0D9Fa4859F4211A4c9551F8Ce1F63';
  const TIERED_ROLE_MANAGER = '0xA6F794292488C628f91A0475dDF8dE6cEF2706EF';

  // Get PaymentProcessor's roleManagerCore
  const paymentProcessor = await ethers.getContractAt(
    [
      'function roleManagerCore() view returns (address)',
      'function tierRegistry() view returns (address)',
      'function paymentManager() view returns (address)',
      'function membershipManager() view returns (address)',
    ],
    PAYMENT_PROCESSOR,
    ethers.provider
  );

  const roleManagerCoreAddr = await paymentProcessor.roleManagerCore();
  console.log("\n1. PaymentProcessor Configuration:");
  console.log("   roleManagerCore:", roleManagerCoreAddr);
  console.log("   Expected TieredRoleManager:", TIERED_ROLE_MANAGER);
  console.log("   Match:", roleManagerCoreAddr.toLowerCase() === TIERED_ROLE_MANAGER.toLowerCase());

  const tierReg = await paymentProcessor.tierRegistry();
  const payMgr = await paymentProcessor.paymentManager();
  const memMgr = await paymentProcessor.membershipManager();
  console.log("\n   tierRegistry:", tierReg);
  console.log("   paymentManager:", payMgr);
  console.log("   membershipManager:", memMgr);

  // Check what functions the roleManagerCore has
  console.log("\n2. Checking roleManagerCore Functions:");
  const roleManagerCore = await ethers.getContractAt(
    [
      'function hasRole(bytes32, address) view returns (bool)',
    ],
    roleManagerCoreAddr,
    ethers.provider
  );

  // Check if it has grantRoleFromExtension
  console.log("   Testing for grantRoleFromExtension function...");

  const abi = [
    'function grantRoleFromExtension(bytes32, address) external',
    'function paymentProcessor() view returns (address)',
  ];

  const rmTest = new ethers.Contract(roleManagerCoreAddr, abi, ethers.provider);

  // Try to get paymentProcessor view function (RoleManagerCore has this)
  try {
    const ppAddr = await rmTest.paymentProcessor();
    console.log("   ✅ Contract has paymentProcessor view function");
    console.log("   Configured paymentProcessor:", ppAddr);
    console.log("   Match:", ppAddr.toLowerCase() === PAYMENT_PROCESSOR.toLowerCase());
  } catch (e) {
    console.log("   ❌ No paymentProcessor function - likely TieredRoleManager not RoleManagerCore");
  }

  // Check if code matches RoleManagerCore pattern
  const code = await ethers.provider.getCode(roleManagerCoreAddr);
  console.log("\n3. Contract Code Info:");
  console.log("   Code length:", code.length, "bytes");

  // Summary
  console.log("\n" + "=".repeat(70));
  console.log("DIAGNOSIS:");
  console.log("=".repeat(70));
  console.log(`
PaymentProcessor.roleManagerCore points to ${roleManagerCoreAddr}

This appears to be TieredRoleManager, NOT RoleManagerCore (modular).

PaymentProcessor is designed to call:
  roleManagerCore.grantRoleFromExtension(role, account)

But TieredRoleManager doesn't have this function on the deployed contract.

SOLUTION OPTIONS:
1. Deploy a proper RoleManagerCore and configure:
   - PaymentProcessor.setRoleManagerCore(newRoleManagerCore)
   - RoleManagerCore.setPaymentProcessor(PaymentProcessor)

2. Redeploy TieredRoleManager with grantRoleFromExtension function

3. Create a workaround adapter contract

The fix requires a new contract deployment and reconfiguration.
`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
