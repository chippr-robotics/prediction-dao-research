const { ethers } = require('hardhat');

/**
 * Check if PaymentProcessor is authorized to grant roles on RoleManagerCore
 */

const CONTRACTS = {
  paymentProcessor: '0xC6A3D457b0a0D9Fa4859F4211A4c9551F8Ce1F63',
  tieredRoleManager: '0xA6F794292488C628f91A0475dDF8dE6cEF2706EF',
  tierRegistry: '0x4eb93BaF14f668F8f67922121A3b9FC3FB5b8A0d',
};

const TOKENMINT_ROLE = ethers.keccak256(ethers.toUtf8Bytes("TOKENMINT_ROLE"));

// Tester address - replace with actual tester address if known
const TESTER_ADDRESS = process.env.TESTER_ADDRESS || '0x0000000000000000000000000000000000000000';

async function main() {
  console.log("=".repeat(70));
  console.log("Checking Role Grant Authorization");
  console.log("=".repeat(70));

  // 1. Check if PaymentProcessor has admin role to grant roles
  console.log("\n1. Checking PaymentProcessor permissions on TieredRoleManager...");

  const roleManager = await ethers.getContractAt(
    [
      'function hasRole(bytes32, address) view returns (bool)',
      'function getRoleAdmin(bytes32) view returns (bytes32)',
      'function authorizedExtensions(address) view returns (bool)',
    ],
    CONTRACTS.tieredRoleManager
  );

  const DEFAULT_ADMIN = '0x0000000000000000000000000000000000000000000000000000000000000000';

  // Check if PaymentProcessor has DEFAULT_ADMIN_ROLE
  try {
    const ppHasAdmin = await roleManager.hasRole(DEFAULT_ADMIN, CONTRACTS.paymentProcessor);
    console.log("   PaymentProcessor has DEFAULT_ADMIN_ROLE:", ppHasAdmin);
  } catch (e) {
    console.log("   Error checking DEFAULT_ADMIN_ROLE:", e.message);
  }

  // Check if PaymentProcessor is authorized extension
  try {
    const ppIsExtension = await roleManager.authorizedExtensions(CONTRACTS.paymentProcessor);
    console.log("   PaymentProcessor is authorized extension:", ppIsExtension);
  } catch (e) {
    console.log("   No authorizedExtensions function or error:", e.message);
  }

  // Check what role admin manages TOKENMINT
  try {
    const tokenmintAdmin = await roleManager.getRoleAdmin(TOKENMINT_ROLE);
    console.log("   TOKENMINT_ROLE admin:", tokenmintAdmin);
    console.log("   Is DEFAULT_ADMIN:", tokenmintAdmin === DEFAULT_ADMIN);
  } catch (e) {
    console.log("   Error getting role admin:", e.message);
  }

  // 2. Check TierRegistry for tester's tier
  console.log("\n2. Checking TierRegistry for tester's tier...");

  if (TESTER_ADDRESS !== '0x0000000000000000000000000000000000000000') {
    const tierRegistry = await ethers.getContractAt(
      ['function getUserTier(address, bytes32) view returns (uint8)'],
      CONTRACTS.tierRegistry
    );

    try {
      const tier = await tierRegistry.getUserTier(TESTER_ADDRESS, TOKENMINT_ROLE);
      console.log(`   Tester ${TESTER_ADDRESS} TOKENMINT tier:`, tier);
    } catch (e) {
      console.log("   Error:", e.message);
    }
  } else {
    console.log("   Set TESTER_ADDRESS env var to check a specific user's tier");
  }

  // 3. Check RoleManagerCore configuration on PaymentProcessor
  console.log("\n3. Checking PaymentProcessor's roleManagerCore...");

  const paymentProcessor = await ethers.getContractAt(
    ['function roleManagerCore() view returns (address)'],
    CONTRACTS.paymentProcessor
  );

  const configuredRoleMgr = await paymentProcessor.roleManagerCore();
  console.log("   PaymentProcessor.roleManagerCore:", configuredRoleMgr);
  console.log("   Expected TieredRoleManager:      ", CONTRACTS.tieredRoleManager);
  console.log("   Match:", configuredRoleMgr.toLowerCase() === CONTRACTS.tieredRoleManager.toLowerCase());

  console.log("\n" + "=".repeat(70));
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
