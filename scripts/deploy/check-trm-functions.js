const { ethers } = require('hardhat');

/**
 * Check if TieredRoleManager has the authorizedExtensions function
 * (Read-only - no signer needed)
 */

async function main() {
  const TIERED_ROLE_MANAGER = '0xA6F794292488C628f91A0475dDF8dE6cEF2706EF';
  const PAYMENT_PROCESSOR = '0xC6A3D457b0a0D9Fa4859F4211A4c9551F8Ce1F63';

  console.log("=".repeat(70));
  console.log("Checking TieredRoleManager Functions");
  console.log("=".repeat(70));

  // Check contract code exists
  const code = await ethers.provider.getCode(TIERED_ROLE_MANAGER);
  console.log("\nContract code length:", code.length, "bytes");
  console.log("Contract deployed:", code.length > 2 ? "Yes" : "No");

  // Try calling authorizedExtensions
  const contract = new ethers.Contract(
    TIERED_ROLE_MANAGER,
    [
      'function authorizedExtensions(address) view returns (bool)',
    ],
    ethers.provider
  );

  console.log("\nChecking authorizedExtensions function:");
  try {
    const isAuthorized = await contract.authorizedExtensions(PAYMENT_PROCESSOR);
    console.log("  ✅ Function exists on deployed contract");
    console.log("  PaymentProcessor authorized:", isAuthorized);
  } catch (e) {
    console.log("  ❌ Function call FAILED");
    console.log("  Error:", e.message);
    console.log("\n  This likely means the deployed contract doesn't have");
    console.log("  authorizedExtensions/grantRoleFromExtension functions.");
    console.log("  The contract may need to be redeployed.");
  }

  console.log("\n" + "=".repeat(70));
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
