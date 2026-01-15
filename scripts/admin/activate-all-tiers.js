const hre = require("hardhat");
const { ethers } = require("hardhat");

/**
 * Activate all membership tiers (Silver, Gold, Platinum) in TierRegistry
 *
 * The TierRegistry stores tier metadata including whether each tier is active.
 * When a user tries to upgrade to a tier, PaymentProcessor checks isTierActive().
 *
 * This script activates all tiers for all roles so users can upgrade.
 *
 * Usage:
 *   npx hardhat run scripts/admin/activate-all-tiers.js --network mordor
 */

// Contract addresses
const CONTRACTS = {
  tierRegistry: '0x4eb93BaF14f668F8f67922121A3b9FC3FB5b8A0d',
};

// Role hashes - All purchasable/tiered roles
const ROLES = {
  // Core premium roles
  MARKET_MAKER_ROLE: ethers.keccak256(ethers.toUtf8Bytes("MARKET_MAKER_ROLE")),
  FRIEND_MARKET_ROLE: ethers.keccak256(ethers.toUtf8Bytes("FRIEND_MARKET_ROLE")),
  CLEARPATH_USER_ROLE: ethers.keccak256(ethers.toUtf8Bytes("CLEARPATH_USER_ROLE")),
  TOKENMINT_ROLE: ethers.keccak256(ethers.toUtf8Bytes("TOKENMINT_ROLE")),
  // Observer/governance role
  OVERSIGHT_COMMITTEE_ROLE: ethers.keccak256(ethers.toUtf8Bytes("OVERSIGHT_COMMITTEE_ROLE")),
};

// Tier names for display
const TIER_NAMES = ['NONE', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM'];

// Tiers to activate (1=Bronze should already be active from deployment)
const TIERS_TO_ACTIVATE = [1, 2, 3, 4]; // Bronze, Silver, Gold, Platinum

// Default tier configuration
const DEFAULT_LIMITS = {
  dailyBetLimit: ethers.parseEther("1000"),
  weeklyBetLimit: ethers.parseEther("5000"),
  monthlyMarketCreation: 100,
  maxPositionSize: ethers.parseEther("500"),
  maxConcurrentMarkets: 10,
  withdrawalLimit: ethers.parseEther("10000"),
  canCreatePrivateMarkets: true,
  canUseAdvancedFeatures: true,
  feeDiscount: 0
};

// Tier-specific limits
const TIER_LIMITS = {
  1: { // Bronze
    ...DEFAULT_LIMITS,
    monthlyMarketCreation: 5,
    maxConcurrentMarkets: 2,
    feeDiscount: 0
  },
  2: { // Silver
    ...DEFAULT_LIMITS,
    monthlyMarketCreation: 15,
    maxConcurrentMarkets: 5,
    feeDiscount: 500 // 5%
  },
  3: { // Gold
    ...DEFAULT_LIMITS,
    monthlyMarketCreation: 50,
    maxConcurrentMarkets: 15,
    feeDiscount: 1000 // 10%
  },
  4: { // Platinum
    ...DEFAULT_LIMITS,
    monthlyMarketCreation: 200,
    maxConcurrentMarkets: 50,
    feeDiscount: 2000 // 20%
  }
};

// Tier prices (in USC with 6 decimals)
const TIER_PRICES = {
  1: ethers.parseUnits("25", 6),   // Bronze: 25 USC
  2: ethers.parseUnits("100", 6),  // Silver: 100 USC
  3: ethers.parseUnits("250", 6),  // Gold: 250 USC
  4: ethers.parseUnits("500", 6),  // Platinum: 500 USC
};

async function main() {
  console.log("=".repeat(60));
  console.log("Activate All Tiers in TierRegistry");
  console.log("=".repeat(60));

  const [deployer] = await ethers.getSigners();
  console.log("\nDeployer:", deployer.address);

  // Connect to TierRegistry
  const tierRegistry = await ethers.getContractAt("TierRegistry", CONTRACTS.tierRegistry);
  console.log("TierRegistry:", CONTRACTS.tierRegistry);

  // Check owner
  const owner = await tierRegistry.owner();
  console.log("TierRegistry owner:", owner);

  if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
    console.error("\n❌ ERROR: Deployer is not the owner of TierRegistry");
    console.log("Only the owner can activate tiers");
    process.exit(1);
  }

  // Process each role
  for (const [roleName, roleHash] of Object.entries(ROLES)) {
    console.log("\n" + "-".repeat(50));
    console.log(`Processing role: ${roleName}`);
    console.log(`Role hash: ${roleHash}`);

    // Check and configure each tier
    for (const tier of TIERS_TO_ACTIVATE) {
      const tierName = TIER_NAMES[tier];
      console.log(`\n  Checking ${tierName} tier (${tier})...`);

      try {
        // Check current state
        const isActive = await tierRegistry.isTierActive(roleHash, tier);
        const currentPrice = await tierRegistry.getTierPrice(roleHash, tier);

        console.log(`    Currently active: ${isActive}`);
        console.log(`    Current price: ${ethers.formatUnits(currentPrice, 6)} USC`);

        if (!isActive || currentPrice === 0n) {
          console.log(`    Configuring ${tierName} tier...`);

          const limits = TIER_LIMITS[tier];
          const price = TIER_PRICES[tier];

          // Set full tier metadata including activation
          const tx = await tierRegistry.setTierMetadata(
            roleHash,
            tier,
            tierName,                           // name
            `${tierName} membership tier`,      // description
            price,                              // price
            [
              limits.dailyBetLimit,
              limits.weeklyBetLimit,
              limits.monthlyMarketCreation,
              limits.maxPositionSize,
              limits.maxConcurrentMarkets,
              limits.withdrawalLimit,
              limits.canCreatePrivateMarkets,
              limits.canUseAdvancedFeatures,
              limits.feeDiscount
            ],
            true                                // isActive
          );

          console.log(`    Transaction sent: ${tx.hash}`);
          await tx.wait();
          console.log(`    ✅ ${tierName} tier activated for ${roleName}`);
        } else {
          console.log(`    ✅ ${tierName} tier already active`);
        }
      } catch (error) {
        console.error(`    ❌ Error configuring ${tierName}:`, error.message);
      }
    }
  }

  // Verification
  console.log("\n" + "=".repeat(60));
  console.log("Verification - Checking all tiers...");
  console.log("=".repeat(60));

  for (const [roleName, roleHash] of Object.entries(ROLES)) {
    console.log(`\n${roleName}:`);
    for (const tier of TIERS_TO_ACTIVATE) {
      const isActive = await tierRegistry.isTierActive(roleHash, tier);
      const price = await tierRegistry.getTierPrice(roleHash, tier);
      const status = isActive ? "✅" : "❌";
      console.log(`  ${TIER_NAMES[tier]}: ${status} active, price: ${ethers.formatUnits(price, 6)} USC`);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("Done! All tiers should now be purchasable.");
  console.log("=".repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
