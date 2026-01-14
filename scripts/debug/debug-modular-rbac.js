const hre = require("hardhat");
const { ethers } = require("hardhat");

/**
 * Debug script to check modular RBAC configuration
 */

const CONTRACTS = {
  roleManagerCore: '0x888332df7621EC341131d85e2228f00407777dD7',
  paymentProcessor: '0xC6A3D457b0a0D9Fa4859F4211A4c9551F8Ce1F63',
  tierRegistry: '0x31405f0359703109C424d31A86bd7CEF08836A12',
  membershipPaymentManager: '0xF06413E0968a356Fe231C005cd0549900EF442c2',
};

async function main() {
  console.log("=".repeat(60));
  console.log("Debug Modular RBAC Configuration");
  console.log("=".repeat(60));

  const signers = await ethers.getSigners();
  const deployer = signers[0];
  console.log("\nQuerying with:", deployer ? deployer.address : "unknown");

  // Check RoleManagerCore
  console.log("\n--- RoleManagerCore (0x888332df7621EC341131d85e2228f00407777dD7) ---");
  const roleManagerCore = await ethers.getContractAt("RoleManagerCore", CONTRACTS.roleManagerCore);

  const extensions = await roleManagerCore.getExtensions();
  console.log("  tierRegistry:       ", extensions._tierRegistry);
  console.log("  paymentProcessor:   ", extensions._paymentProcessor);
  console.log("  usageTracker:       ", extensions._usageTracker);
  console.log("  membershipManager:  ", extensions._membershipManager);

  if (deployer) {
    const hasAdminRole = await roleManagerCore.hasRole(ethers.ZeroHash, deployer.address);
    console.log("  Deployer has DEFAULT_ADMIN_ROLE:", hasAdminRole);
  }

  // Check PaymentProcessor
  console.log("\n--- PaymentProcessor (0xC6A3D457b0a0D9Fa4859F4211A4c9551F8Ce1F63) ---");
  const paymentProcessor = await ethers.getContractAt("PaymentProcessor", CONTRACTS.paymentProcessor);

  const ppRoleManagerCore = await paymentProcessor.roleManagerCore();
  const ppTierRegistry = await paymentProcessor.tierRegistry();
  const ppMembershipManager = await paymentProcessor.membershipManager();
  const ppPaymentManager = await paymentProcessor.paymentManager();
  const ppOwner = await paymentProcessor.owner();

  console.log("  roleManagerCore:    ", ppRoleManagerCore);
  console.log("  tierRegistry:       ", ppTierRegistry);
  console.log("  membershipManager:  ", ppMembershipManager);
  console.log("  paymentManager:     ", ppPaymentManager);
  console.log("  owner:              ", ppOwner);

  // Check TierRegistry
  console.log("\n--- TierRegistry (0x31405f0359703109C424d31A86bd7CEF08836A12) ---");
  const tierRegistry = await ethers.getContractAt("TierRegistry", CONTRACTS.tierRegistry);

  const trOwner = await tierRegistry.owner();
  const trRoleManagerCore = await tierRegistry.roleManagerCore();
  const ppAuthorized = await tierRegistry.authorizedExtensions(CONTRACTS.paymentProcessor);

  console.log("  owner:              ", trOwner);
  console.log("  roleManagerCore:    ", trRoleManagerCore);
  console.log("  PaymentProcessor authorized:", ppAuthorized);

  // Check tier status
  const MARKET_MAKER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MARKET_MAKER_ROLE"));
  const tier1Active = await tierRegistry.isTierActive(MARKET_MAKER_ROLE, 1);
  console.log("  MARKET_MAKER tier 1 active:", tier1Active);

  // Check MembershipPaymentManager
  console.log("\n--- MembershipPaymentManager (0xF06413E0968a356Fe231C005cd0549900EF442c2) ---");
  const paymentManager = await ethers.getContractAt("MembershipPaymentManager", CONTRACTS.membershipPaymentManager);

  const uscToken = await paymentManager.paymentTokens("0xDE093684c796204224BC081f937aa059D903c52a");
  console.log("  USC token active:", uscToken.isActive);
  console.log("  USC token symbol:", uscToken.symbol);

  const mmPrice = await paymentManager.getRolePrice(MARKET_MAKER_ROLE, "0xDE093684c796204224BC081f937aa059D903c52a");
  console.log("  MARKET_MAKER USC price:", ethers.formatUnits(mmPrice, 6), "USC");

  const treasury = await paymentManager.treasury();
  console.log("  Treasury:", treasury);

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("Issues Found:");
  console.log("=".repeat(60));

  if (extensions._paymentProcessor === ethers.ZeroAddress) {
    console.log("❌ RoleManagerCore.paymentProcessor is NOT SET!");
    console.log("   PaymentProcessor can't call grantRoleFromExtension()");
    console.log("   Fix: Need to call roleManagerCore.setPaymentProcessor()");
  }

  if (extensions._tierRegistry !== CONTRACTS.tierRegistry) {
    console.log("❌ RoleManagerCore.tierRegistry points to wrong address!");
    console.log("   Expected:", CONTRACTS.tierRegistry);
    console.log("   Actual:  ", extensions._tierRegistry);
  }

  if (!ppAuthorized) {
    console.log("❌ TierRegistry has NOT authorized PaymentProcessor!");
  }

  if (!tier1Active) {
    console.log("❌ TierRegistry MARKET_MAKER tier 1 is NOT active!");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
