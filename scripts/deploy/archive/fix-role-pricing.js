const hre = require("hardhat");
const { ethers } = require("hardhat");
// Note: hardhat automatically loads .env file

/**
 * Fix Role Pricing Configuration
 *
 * This script:
 * 1. Configures missing role prices in MembershipPaymentManager (TOKENMINT, CLEARPATH_USER)
 * 2. Adds tier metadata to TierRegistry for these roles
 * 3. Grants admin roles to specified accounts
 *
 * Prerequisites:
 * 1. Mount floppy: npm run floppy:mount
 * 2. Set password: export FLOPPY_KEYSTORE_PASSWORD=password
 *
 * Run with: npx hardhat run scripts/deploy/fix-role-pricing.js --network mordor
 */

// Contract addresses from contracts.js
const CONTRACTS = {
  tierRegistry: '0x4eb93BaF14f668F8f67922121A3b9FC3FB5b8A0d',
  membershipPaymentManager: '0xA61C3a81e25E8E5E7A6A7EceBEd7e1BF58533e28',
  tieredRoleManager: '0xA6F794292488C628f91A0475dDF8dE6cEF2706EF',
  paymentProcessor: '0xC6A3D457b0a0D9Fa4859F4211A4c9551F8Ce1F63',
};

const USC_ADDRESS = '0xDE093684c796204224BC081f937aa059D903c52a';

// Role hashes
const ROLE_HASHES = {
  TOKENMINT: ethers.keccak256(ethers.toUtf8Bytes("TOKENMINT_ROLE")),
  CLEARPATH_USER: ethers.keccak256(ethers.toUtf8Bytes("CLEARPATH_USER_ROLE")),
  MARKET_MAKER: ethers.keccak256(ethers.toUtf8Bytes("MARKET_MAKER_ROLE")),
  FRIEND_MARKET: ethers.keccak256(ethers.toUtf8Bytes("FRIEND_MARKET_ROLE")),
  DEFAULT_ADMIN: '0x0000000000000000000000000000000000000000000000000000000000000000',
  OPERATIONS_ADMIN: ethers.keccak256(ethers.toUtf8Bytes("OPERATIONS_ADMIN_ROLE")),
};

// Membership tiers
const MembershipTier = { NONE: 0, BRONZE: 1, SILVER: 2, GOLD: 3, PLATINUM: 4 };

// Admin accounts to grant roles to - loaded from .env
// ADMIN and FLOPPY addresses from .env file
const ADMIN_ACCOUNTS = [
  process.env.ADMIN,   // 0x52502d049571C7893447b86c4d8B38e6184bF6e1
  process.env.FLOPPY,  // Floppy deployer address
].filter(addr => addr && addr.length === 42); // Filter out invalid/missing addresses

// Tier prices in USC (6 decimals) - matching useTierPrices.js fallback values
const TIER_PRICES = {
  TOKENMINT: {
    BRONZE: ethers.parseUnits("100", 6),
    SILVER: ethers.parseUnits("150", 6),
    GOLD: ethers.parseUnits("300", 6),
    PLATINUM: ethers.parseUnits("500", 6),
  },
  CLEARPATH_USER: {
    BRONZE: ethers.parseUnits("100", 6),
    SILVER: ethers.parseUnits("150", 6),
    GOLD: ethers.parseUnits("300", 6),
    PLATINUM: ethers.parseUnits("500", 6),
  },
  FRIEND_MARKET: {
    BRONZE: ethers.parseUnits("50", 6),
    SILVER: ethers.parseUnits("100", 6),
    GOLD: ethers.parseUnits("250", 6),
    PLATINUM: ethers.parseUnits("500", 6),
  },
  MARKET_MAKER: {
    BRONZE: ethers.parseUnits("100", 6),
    SILVER: ethers.parseUnits("100", 6),
    GOLD: ethers.parseUnits("250", 6),
    PLATINUM: ethers.parseUnits("500", 6),
  },
};

// MembershipPaymentManager ABI (minimal)
const MEMBERSHIP_PAYMENT_MANAGER_ABI = [
  "function setRolePrice(bytes32 role, address token, uint256 price) external",
  "function getRolePrice(bytes32 role, address token) external view returns (uint256)",
  "function addPaymentToken(address token, string symbol, uint8 decimals) external",
  "function paymentTokens(address token) external view returns (address tokenAddress, bool isActive, uint8 decimals, string symbol)",
  "function hasRole(bytes32 role, address account) external view returns (bool)",
];

// TierRegistry ABI (minimal)
const TIER_REGISTRY_ABI = [
  "function setTierMetadata(bytes32 role, uint8 tier, string name, string description, uint256 price, tuple(uint256 dailyBetLimit, uint256 weeklyBetLimit, uint256 monthlyMarketCreation, uint256 maxPositionSize, uint256 maxConcurrentMarkets, uint256 withdrawalLimit, bool canCreatePrivateMarkets, bool canUseAdvancedFeatures, uint256 feeDiscount) limits, bool isActive) external",
  "function getTierPrice(bytes32 role, uint8 tier) external view returns (uint256)",
  "function isTierActive(bytes32 role, uint8 tier) external view returns (bool)",
  "function owner() external view returns (address)",
];

// TieredRoleManager ABI (minimal)
const TIERED_ROLE_MANAGER_ABI = [
  "function grantRole(bytes32 role, address account) external",
  "function hasRole(bytes32 role, address account) external view returns (bool)",
  "function getRoleAdmin(bytes32 role) external view returns (bytes32)",
];

async function main() {
  console.log("=".repeat(70));
  console.log("Fix Role Pricing Configuration");
  console.log("=".repeat(70));

  const signers = await ethers.getSigners();
  const deployer = signers[0];
  if (!deployer) {
    console.error("No deployer signer available. Make sure PRIVATE_KEY is set in .env");
    process.exit(1);
  }
  console.log("\nDeployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETC");

  // Connect to contracts
  const tierRegistry = new ethers.Contract(CONTRACTS.tierRegistry, TIER_REGISTRY_ABI, deployer);
  const paymentManager = new ethers.Contract(CONTRACTS.membershipPaymentManager, MEMBERSHIP_PAYMENT_MANAGER_ABI, deployer);
  const roleManager = new ethers.Contract(CONTRACTS.tieredRoleManager, TIERED_ROLE_MANAGER_ABI, deployer);

  // ========== 1. Check USC Payment Token ==========
  console.log("\n" + "=".repeat(50));
  console.log("1. Checking USC Payment Token...");
  console.log("=".repeat(50));

  try {
    const uscToken = await paymentManager.paymentTokens(USC_ADDRESS);
    if (!uscToken.isActive) {
      console.log("   USC not active, adding...");
      const tx = await paymentManager.addPaymentToken(USC_ADDRESS, "USC", 6);
      await tx.wait();
      console.log("   ✅ USC added as payment token");
    } else {
      console.log("   ✅ USC already active");
    }
  } catch (e) {
    console.log("   Adding USC as payment token...");
    try {
      const tx = await paymentManager.addPaymentToken(USC_ADDRESS, "USC", 6);
      await tx.wait();
      console.log("   ✅ USC added as payment token");
    } catch (addError) {
      console.log("   ⚠️  Could not add USC:", addError.message);
    }
  }

  // ========== 2. Configure Role Prices in MembershipPaymentManager ==========
  console.log("\n" + "=".repeat(50));
  console.log("2. Configuring Role Prices in MembershipPaymentManager...");
  console.log("=".repeat(50));

  const rolesToConfigure = ['TOKENMINT', 'CLEARPATH_USER', 'MARKET_MAKER', 'FRIEND_MARKET'];

  for (const roleName of rolesToConfigure) {
    const roleHash = ROLE_HASHES[roleName];
    const bronzePrice = TIER_PRICES[roleName].BRONZE;

    console.log(`\n   Checking ${roleName}...`);
    console.log(`   Role hash: ${roleHash}`);

    try {
      const currentPrice = await paymentManager.getRolePrice(roleHash, USC_ADDRESS);
      console.log(`   Current price: ${ethers.formatUnits(currentPrice, 6)} USC`);

      if (currentPrice === 0n) {
        console.log(`   Setting price to ${ethers.formatUnits(bronzePrice, 6)} USC...`);
        const tx = await paymentManager.setRolePrice(roleHash, USC_ADDRESS, bronzePrice);
        await tx.wait();
        console.log(`   ✅ ${roleName} price set`);
      } else {
        console.log(`   ✅ ${roleName} price already configured`);
      }
    } catch (e) {
      console.log(`   ⚠️  Error checking ${roleName}:`, e.message);
      // Try to set anyway
      try {
        console.log(`   Attempting to set ${roleName} price...`);
        const tx = await paymentManager.setRolePrice(roleHash, USC_ADDRESS, bronzePrice);
        await tx.wait();
        console.log(`   ✅ ${roleName} price set`);
      } catch (setError) {
        console.log(`   ❌ Could not set ${roleName} price:`, setError.message);
      }
    }
  }

  // ========== 3. Configure Tier Metadata in TierRegistry ==========
  console.log("\n" + "=".repeat(50));
  console.log("3. Configuring Tier Metadata in TierRegistry...");
  console.log("=".repeat(50));

  const defaultLimits = {
    dailyBetLimit: ethers.parseUnits("10000", 6),
    weeklyBetLimit: ethers.parseUnits("50000", 6),
    monthlyMarketCreation: 10,
    maxPositionSize: ethers.parseUnits("5000", 6),
    maxConcurrentMarkets: 5,
    withdrawalLimit: ethers.parseUnits("10000", 6),
    canCreatePrivateMarkets: true,
    canUseAdvancedFeatures: false,
    feeDiscount: 0,
  };

  // Check TierRegistry owner
  const tierRegistryOwner = await tierRegistry.owner();
  console.log(`   TierRegistry owner: ${tierRegistryOwner}`);
  console.log(`   Deployer is owner: ${tierRegistryOwner.toLowerCase() === deployer.address.toLowerCase()}`);

  if (tierRegistryOwner.toLowerCase() !== deployer.address.toLowerCase()) {
    console.log("   ⚠️  Deployer is not TierRegistry owner, skipping tier metadata configuration");
  } else {
    for (const roleName of ['TOKENMINT', 'CLEARPATH_USER']) {
      const roleHash = ROLE_HASHES[roleName];

      console.log(`\n   Checking ${roleName} tier metadata...`);

      for (const [tierName, tierId] of Object.entries(MembershipTier)) {
        if (tierId === 0) continue; // Skip NONE

        try {
          const isActive = await tierRegistry.isTierActive(roleHash, tierId);
          const price = await tierRegistry.getTierPrice(roleHash, tierId);

          if (!isActive || price === 0n) {
            const tierPrice = TIER_PRICES[roleName][tierName];
            console.log(`   Setting ${roleName} ${tierName} tier (${tierId})...`);

            const tx = await tierRegistry.setTierMetadata(
              roleHash,
              tierId,
              `${tierName} ${roleName.replace('_', ' ')}`,
              `${tierName} tier access to ${roleName.replace('_', ' ')}`,
              tierPrice,
              defaultLimits,
              true
            );
            await tx.wait();
            console.log(`   ✅ ${roleName} ${tierName} configured`);
          } else {
            console.log(`   ✅ ${roleName} ${tierName} already configured (price: ${ethers.formatUnits(price, 6)} USC)`);
          }
        } catch (e) {
          console.log(`   ⚠️  Error with ${roleName} ${tierName}:`, e.message);
        }
      }
    }
  }

  // ========== 4. Grant Admin Roles ==========
  console.log("\n" + "=".repeat(50));
  console.log("4. Granting Admin Roles...");
  console.log("=".repeat(50));

  // Check if deployer has admin role
  const deployerIsAdmin = await roleManager.hasRole(ROLE_HASHES.DEFAULT_ADMIN, deployer.address);
  console.log(`   Deployer has DEFAULT_ADMIN_ROLE: ${deployerIsAdmin}`);

  if (ADMIN_ACCOUNTS.length === 0) {
    console.log("   No admin accounts specified in ADMIN_ACCOUNTS array.");
    console.log("   To grant admin roles, add addresses to the ADMIN_ACCOUNTS array and re-run.");
  } else if (!deployerIsAdmin) {
    console.log("   ⚠️  Deployer does not have admin role, cannot grant roles to others");
  } else {
    for (const adminAddress of ADMIN_ACCOUNTS) {
      if (!adminAddress) continue;

      console.log(`\n   Checking admin status for ${adminAddress}...`);

      const hasDefaultAdmin = await roleManager.hasRole(ROLE_HASHES.DEFAULT_ADMIN, adminAddress);
      const hasOpsAdmin = await roleManager.hasRole(ROLE_HASHES.OPERATIONS_ADMIN, adminAddress);

      console.log(`   Has DEFAULT_ADMIN_ROLE: ${hasDefaultAdmin}`);
      console.log(`   Has OPERATIONS_ADMIN_ROLE: ${hasOpsAdmin}`);

      if (!hasDefaultAdmin) {
        try {
          console.log(`   Granting DEFAULT_ADMIN_ROLE to ${adminAddress}...`);
          const tx = await roleManager.grantRole(ROLE_HASHES.DEFAULT_ADMIN, adminAddress);
          await tx.wait();
          console.log(`   ✅ DEFAULT_ADMIN_ROLE granted`);
        } catch (e) {
          console.log(`   ❌ Could not grant DEFAULT_ADMIN_ROLE:`, e.message);
        }
      }

      if (!hasOpsAdmin) {
        try {
          console.log(`   Granting OPERATIONS_ADMIN_ROLE to ${adminAddress}...`);
          const tx = await roleManager.grantRole(ROLE_HASHES.OPERATIONS_ADMIN, adminAddress);
          await tx.wait();
          console.log(`   ✅ OPERATIONS_ADMIN_ROLE granted`);
        } catch (e) {
          console.log(`   ❌ Could not grant OPERATIONS_ADMIN_ROLE:`, e.message);
        }
      }
    }
  }

  // ========== 5. Verification ==========
  console.log("\n" + "=".repeat(50));
  console.log("5. Verification...");
  console.log("=".repeat(50));

  for (const roleName of rolesToConfigure) {
    const roleHash = ROLE_HASHES[roleName];
    try {
      const price = await paymentManager.getRolePrice(roleHash, USC_ADDRESS);
      console.log(`   ${roleName}: ${ethers.formatUnits(price, 6)} USC`);
    } catch (e) {
      console.log(`   ${roleName}: Error reading price - ${e.message}`);
    }
  }

  console.log("\n" + "=".repeat(70));
  console.log("Fix Complete!");
  console.log("=".repeat(70));
  console.log("\nNext steps:");
  console.log("1. If admin accounts need roles, add addresses to ADMIN_ACCOUNTS array and re-run");
  console.log("2. Test role purchases in the frontend");
  console.log("3. Test admin panel access with ADMIN/FLOPPY accounts");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
