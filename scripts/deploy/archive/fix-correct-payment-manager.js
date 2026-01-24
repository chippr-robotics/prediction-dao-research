const { ethers } = require('hardhat');

/**
 * Fix Role Pricing on the CORRECT MembershipPaymentManager
 *
 * The PaymentProcessor is using 0x8b09cbC2275398C00D43854393e09D40334a1B81
 * NOT 0xA61C3a81e25E8E5E7A6A7EceBEd7e1BF58533e28 as listed in contracts.js
 */

// The ACTUAL MembershipPaymentManager used by PaymentProcessor
const MEMBERSHIP_PAYMENT_MANAGER = '0x8b09cbC2275398C00D43854393e09D40334a1B81';
const USC_ADDRESS = '0xDE093684c796204224BC081f937aa059D903c52a';

// Role hashes
const ROLE_HASHES = {
  TOKENMINT: ethers.keccak256(ethers.toUtf8Bytes("TOKENMINT_ROLE")),
  CLEARPATH_USER: ethers.keccak256(ethers.toUtf8Bytes("CLEARPATH_USER_ROLE")),
  MARKET_MAKER: ethers.keccak256(ethers.toUtf8Bytes("MARKET_MAKER_ROLE")),
  FRIEND_MARKET: ethers.keccak256(ethers.toUtf8Bytes("FRIEND_MARKET_ROLE")),
};

// Tier prices in USC (6 decimals)
const TIER_PRICES = {
  TOKENMINT: ethers.parseUnits("25", 6),      // Match TierRegistry Bronze price
  CLEARPATH_USER: ethers.parseUnits("25", 6), // Match TierRegistry Bronze price
  MARKET_MAKER: ethers.parseUnits("100", 6),
  FRIEND_MARKET: ethers.parseUnits("50", 6),
};

const MEMBERSHIP_PAYMENT_MANAGER_ABI = [
  "function setRolePrice(bytes32 role, address token, uint256 price) external",
  "function getRolePrice(bytes32 role, address token) external view returns (uint256)",
  "function addPaymentToken(address token, string symbol, uint8 decimals) external",
  "function paymentTokens(address token) external view returns (address tokenAddress, bool isActive, uint8 decimals, string symbol)",
  "function hasRole(bytes32 role, address account) external view returns (bool)",
  "function owner() external view returns (address)",
];

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("=".repeat(70));
  console.log("Fix Role Pricing on CORRECT MembershipPaymentManager");
  console.log("=".repeat(70));
  console.log("\nSigner:", signer.address);
  console.log("Target MembershipPaymentManager:", MEMBERSHIP_PAYMENT_MANAGER);

  const paymentManager = new ethers.Contract(
    MEMBERSHIP_PAYMENT_MANAGER,
    MEMBERSHIP_PAYMENT_MANAGER_ABI,
    signer
  );

  // Check ownership/permissions
  console.log("\n1. Checking permissions...");
  try {
    const owner = await paymentManager.owner();
    console.log("   Owner:", owner);
    console.log("   Signer is owner:", owner.toLowerCase() === signer.address.toLowerCase());
  } catch (e) {
    console.log("   No owner() function - checking roles...");
    const DEFAULT_ADMIN = '0x0000000000000000000000000000000000000000000000000000000000000000';
    const PRICING_ADMIN = ethers.keccak256(ethers.toUtf8Bytes("PRICING_ADMIN_ROLE"));
    try {
      const hasAdmin = await paymentManager.hasRole(DEFAULT_ADMIN, signer.address);
      const hasPricing = await paymentManager.hasRole(PRICING_ADMIN, signer.address);
      console.log("   Has DEFAULT_ADMIN_ROLE:", hasAdmin);
      console.log("   Has PRICING_ADMIN_ROLE:", hasPricing);
    } catch (e2) {
      console.log("   Could not check roles:", e2.message);
    }
  }

  // Check USC token
  console.log("\n2. Checking USC payment token...");
  try {
    const uscInfo = await paymentManager.paymentTokens(USC_ADDRESS);
    console.log("   USC active:", uscInfo.isActive || uscInfo[1]);
    if (!uscInfo.isActive && !uscInfo[1]) {
      console.log("   Adding USC as payment token...");
      const tx = await paymentManager.addPaymentToken(USC_ADDRESS, "USC", 6);
      await tx.wait();
      console.log("   ✅ USC added");
    }
  } catch (e) {
    console.log("   USC not found, adding...");
    try {
      const tx = await paymentManager.addPaymentToken(USC_ADDRESS, "USC", 6);
      await tx.wait();
      console.log("   ✅ USC added");
    } catch (addErr) {
      console.log("   ❌ Could not add USC:", addErr.reason || addErr.message);
    }
  }

  // Configure role prices
  console.log("\n3. Configuring role prices...");
  for (const [roleName, roleHash] of Object.entries(ROLE_HASHES)) {
    const price = TIER_PRICES[roleName];
    console.log(`\n   ${roleName}:`);
    console.log(`   Role hash: ${roleHash}`);
    console.log(`   Target price: ${ethers.formatUnits(price, 6)} USC`);

    try {
      const currentPrice = await paymentManager.getRolePrice(roleHash, USC_ADDRESS);
      console.log(`   Current price: ${ethers.formatUnits(currentPrice, 6)} USC`);

      if (currentPrice === 0n) {
        console.log(`   Setting price...`);
        const tx = await paymentManager.setRolePrice(roleHash, USC_ADDRESS, price);
        await tx.wait();
        console.log(`   ✅ Price set`);
      } else {
        console.log(`   ✅ Already configured`);
      }
    } catch (e) {
      console.log(`   Error reading: ${e.message}`);
      try {
        console.log(`   Attempting to set price...`);
        const tx = await paymentManager.setRolePrice(roleHash, USC_ADDRESS, price);
        await tx.wait();
        console.log(`   ✅ Price set`);
      } catch (setErr) {
        console.log(`   ❌ Failed: ${setErr.reason || setErr.message}`);
      }
    }
  }

  // Verify
  console.log("\n4. Verification...");
  for (const [roleName, roleHash] of Object.entries(ROLE_HASHES)) {
    try {
      const price = await paymentManager.getRolePrice(roleHash, USC_ADDRESS);
      console.log(`   ${roleName}: ${ethers.formatUnits(price, 6)} USC`);
    } catch (e) {
      console.log(`   ${roleName}: Error - ${e.message}`);
    }
  }

  console.log("\n" + "=".repeat(70));
  console.log("Done!");
  console.log("=".repeat(70));
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
