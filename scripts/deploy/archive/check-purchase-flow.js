const { ethers } = require('hardhat');

/**
 * Check the full purchase flow configuration
 * to diagnose why role isn't being granted after payment
 */

const CONTRACTS = {
  paymentProcessor: '0xC6A3D457b0a0D9Fa4859F4211A4c9551F8Ce1F63',
  tierRegistry: '0x4eb93BaF14f668F8f67922121A3b9FC3FB5b8A0d',
  membershipManager: '0x6698C2ba129D18C1930e19C586f7Da6aB30b86D6',
  membershipPaymentManager: '0x8b09cbC2275398C00D43854393e09D40334a1B81',
  tieredRoleManager: '0xA6F794292488C628f91A0475dDF8dE6cEF2706EF',
};

const TOKENMINT_ROLE = ethers.keccak256(ethers.toUtf8Bytes("TOKENMINT_ROLE"));

async function main() {
  console.log("=".repeat(70));
  console.log("Checking Purchase Flow Configuration");
  console.log("=".repeat(70));

  // 1. Check PaymentProcessor configuration
  console.log("\n1. PaymentProcessor Configuration:");
  const paymentProcessor = await ethers.getContractAt(
    [
      'function tierRegistry() view returns (address)',
      'function membershipManager() view returns (address)',
      'function paymentManager() view returns (address)',
      'function roleManagerCore() view returns (address)',
    ],
    CONTRACTS.paymentProcessor
  );

  const ppTierRegistry = await paymentProcessor.tierRegistry();
  const ppMembershipMgr = await paymentProcessor.membershipManager();
  const ppPaymentMgr = await paymentProcessor.paymentManager();
  const ppRoleMgr = await paymentProcessor.roleManagerCore();

  console.log("   tierRegistry:", ppTierRegistry);
  console.log("   Expected:    ", CONTRACTS.tierRegistry);
  console.log("   Match:", ppTierRegistry.toLowerCase() === CONTRACTS.tierRegistry.toLowerCase());

  console.log("\n   membershipManager:", ppMembershipMgr);
  console.log("   Expected:         ", CONTRACTS.membershipManager);
  console.log("   Match:", ppMembershipMgr.toLowerCase() === CONTRACTS.membershipManager.toLowerCase());

  console.log("\n   paymentManager:", ppPaymentMgr);
  console.log("   Expected:      ", CONTRACTS.membershipPaymentManager);
  console.log("   Match:", ppPaymentMgr.toLowerCase() === CONTRACTS.membershipPaymentManager.toLowerCase());

  // 2. Check TierRegistry authorization for PaymentProcessor
  console.log("\n2. TierRegistry Authorization:");
  const tierRegistry = await ethers.getContractAt(
    [
      'function authorizedExtensions(address) view returns (bool)',
      'function owner() view returns (address)',
    ],
    CONTRACTS.tierRegistry
  );

  const ppAuthorizedOnTierReg = await tierRegistry.authorizedExtensions(CONTRACTS.paymentProcessor);
  const tierRegOwner = await tierRegistry.owner();
  console.log("   PaymentProcessor authorized:", ppAuthorizedOnTierReg);
  console.log("   TierRegistry owner:", tierRegOwner);

  // 3. Check MembershipManager authorization for PaymentProcessor
  console.log("\n3. MembershipManager Authorization:");
  const membershipManager = await ethers.getContractAt(
    [
      'function authorizedExtensions(address) view returns (bool)',
      'function owner() view returns (address)',
    ],
    CONTRACTS.membershipManager
  );

  const ppAuthorizedOnMemMgr = await membershipManager.authorizedExtensions(CONTRACTS.paymentProcessor);
  const memMgrOwner = await membershipManager.owner();
  console.log("   PaymentProcessor authorized:", ppAuthorizedOnMemMgr);
  console.log("   MembershipManager owner:", memMgrOwner);

  // 4. Check if TOKENMINT tier is active in TierRegistry
  console.log("\n4. TOKENMINT Tier Configuration in TierRegistry:");
  const tierRegistryFull = await ethers.getContractAt(
    [
      'function isTierActive(bytes32, uint8) view returns (bool)',
      'function getTierPrice(bytes32, uint8) view returns (uint256)',
    ],
    CONTRACTS.tierRegistry
  );

  for (let tier = 1; tier <= 4; tier++) {
    try {
      const isActive = await tierRegistryFull.isTierActive(TOKENMINT_ROLE, tier);
      const price = await tierRegistryFull.getTierPrice(TOKENMINT_ROLE, tier);
      console.log(`   Tier ${tier}: active=${isActive}, price=${ethers.formatUnits(price, 6)} USC`);
    } catch (e) {
      console.log(`   Tier ${tier}: Error - ${e.message}`);
    }
  }

  // 5. Summary
  console.log("\n" + "=".repeat(70));
  console.log("Summary:");
  console.log("=".repeat(70));

  const issues = [];
  if (!ppAuthorizedOnTierReg) {
    issues.push("PaymentProcessor NOT authorized on TierRegistry");
  }
  if (!ppAuthorizedOnMemMgr) {
    issues.push("PaymentProcessor NOT authorized on MembershipManager");
  }
  if (ppTierRegistry.toLowerCase() !== CONTRACTS.tierRegistry.toLowerCase()) {
    issues.push("PaymentProcessor.tierRegistry mismatch");
  }
  if (ppMembershipMgr.toLowerCase() !== CONTRACTS.membershipManager.toLowerCase()) {
    issues.push("PaymentProcessor.membershipManager mismatch");
  }

  if (issues.length > 0) {
    console.log("\n❌ Issues found:");
    issues.forEach(issue => console.log("   - " + issue));
  } else {
    console.log("\n✅ All configuration looks correct");
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
