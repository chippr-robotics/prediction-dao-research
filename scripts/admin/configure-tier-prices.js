const { ethers } = require('hardhat');

/**
 * Configure tier prices in TieredRoleManager for native ETC purchases
 *
 * This script sets up tier pricing so users can purchase memberships with native ETC.
 * Prices are set in ETC (wei) and collected in the TieredRoleManager contract.
 *
 * Usage:
 *   FLOPPY_KEYSTORE_PASSWORD=password npx hardhat run scripts/admin/configure-tier-prices.js --network mordor
 */

const TIERED_ROLE_MANAGER_ADDRESS = '0xA6F794292488C628f91A0475dDF8dE6cEF2706EF';

// Role hashes
const ROLES = {
  FRIEND_MARKET_ROLE: ethers.keccak256(ethers.toUtf8Bytes('FRIEND_MARKET_ROLE')),
  MARKET_MAKER_ROLE: ethers.keccak256(ethers.toUtf8Bytes('MARKET_MAKER_ROLE')),
  CLEARPATH_USER_ROLE: ethers.keccak256(ethers.toUtf8Bytes('CLEARPATH_USER_ROLE')),
  TOKENMINT_ROLE: ethers.keccak256(ethers.toUtf8Bytes('TOKENMINT_ROLE')),
};

// MembershipTier enum: NONE=0, BRONZE=1, SILVER=2, GOLD=3, PLATINUM=4
const TIERS = {
  BRONZE: 1,
  SILVER: 2,
  GOLD: 3,
  PLATINUM: 4,
};

// Tier pricing configuration in ETC
// These prices are in native ETC for the Mordor testnet
const TIER_CONFIG = {
  [TIERS.BRONZE]: {
    name: 'Bronze',
    description: 'Basic membership tier with essential features',
    price: ethers.parseEther('0.05'), // 0.05 ETC
    limits: {
      dailyBetLimit: ethers.parseEther('100'),
      weeklyBetLimit: ethers.parseEther('500'),
      monthlyMarketCreation: 5,
      maxPositionSize: ethers.parseEther('10'),
      maxConcurrentMarkets: 2,
      withdrawalLimit: ethers.parseEther('50'),
      canCreatePrivateMarkets: true,
      canUseAdvancedFeatures: false,
      feeDiscount: 0,
    },
    isActive: true,
  },
  [TIERS.SILVER]: {
    name: 'Silver',
    description: 'Intermediate tier with enhanced limits',
    price: ethers.parseEther('0.1'), // 0.1 ETC
    limits: {
      dailyBetLimit: ethers.parseEther('500'),
      weeklyBetLimit: ethers.parseEther('2000'),
      monthlyMarketCreation: 15,
      maxPositionSize: ethers.parseEther('50'),
      maxConcurrentMarkets: 5,
      withdrawalLimit: ethers.parseEther('200'),
      canCreatePrivateMarkets: true,
      canUseAdvancedFeatures: true,
      feeDiscount: 500, // 5%
    },
    isActive: true,
  },
  [TIERS.GOLD]: {
    name: 'Gold',
    description: 'Advanced tier for power users',
    price: ethers.parseEther('0.25'), // 0.25 ETC
    limits: {
      dailyBetLimit: ethers.parseEther('2000'),
      weeklyBetLimit: ethers.parseEther('10000'),
      monthlyMarketCreation: 50,
      maxPositionSize: ethers.parseEther('200'),
      maxConcurrentMarkets: 15,
      withdrawalLimit: ethers.parseEther('1000'),
      canCreatePrivateMarkets: true,
      canUseAdvancedFeatures: true,
      feeDiscount: 1000, // 10%
    },
    isActive: true,
  },
  [TIERS.PLATINUM]: {
    name: 'Platinum',
    description: 'Premium tier with maximum benefits',
    price: ethers.parseEther('0.5'), // 0.5 ETC
    limits: {
      dailyBetLimit: ethers.parseEther('10000'),
      weeklyBetLimit: ethers.parseEther('50000'),
      monthlyMarketCreation: 200,
      maxPositionSize: ethers.parseEther('1000'),
      maxConcurrentMarkets: 50,
      withdrawalLimit: ethers.parseEther('5000'),
      canCreatePrivateMarkets: true,
      canUseAdvancedFeatures: true,
      feeDiscount: 2000, // 20%
    },
    isActive: true,
  },
};

async function main() {
  console.log('='.repeat(60));
  console.log('Configure Tier Prices in TieredRoleManager');
  console.log('='.repeat(60));

  const [signer] = await ethers.getSigners();
  console.log('\nSigner:', signer.address);

  // Get TieredRoleManager contract
  const tieredRoleManager = await ethers.getContractAt(
    'TieredRoleManager',
    TIERED_ROLE_MANAGER_ADDRESS
  );

  // Check if signer has admin role
  const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
  const hasAdminRole = await tieredRoleManager.hasRole(DEFAULT_ADMIN_ROLE, signer.address);

  if (!hasAdminRole) {
    console.error('\nERROR: Signer does not have DEFAULT_ADMIN_ROLE');
    console.log('Only admins can configure tier prices');
    process.exit(1);
  }

  console.log('\nConfiguring tiers for roles...');

  // Configure tiers for each role
  for (const [roleName, roleHash] of Object.entries(ROLES)) {
    console.log(`\n--- ${roleName} ---`);
    console.log(`Role hash: ${roleHash}`);

    for (const [tierNum, config] of Object.entries(TIER_CONFIG)) {
      const tier = parseInt(tierNum);
      console.log(`\n  Configuring ${config.name} tier (${tier})...`);

      try {
        // Check current configuration
        const currentMetadata = await tieredRoleManager.tierMetadata(roleHash, tier);
        console.log(`    Current price: ${ethers.formatEther(currentMetadata.price)} ETC`);
        console.log(`    Current active: ${currentMetadata.isActive}`);

        // Set tier metadata
        const limits = [
          config.limits.dailyBetLimit,
          config.limits.weeklyBetLimit,
          config.limits.monthlyMarketCreation,
          config.limits.maxPositionSize,
          config.limits.maxConcurrentMarkets,
          config.limits.withdrawalLimit,
          config.limits.canCreatePrivateMarkets,
          config.limits.canUseAdvancedFeatures,
          config.limits.feeDiscount,
        ];

        const tx = await tieredRoleManager.setTierMetadata(
          roleHash,
          tier,
          config.name,
          config.description,
          config.price,
          limits,
          config.isActive
        );

        console.log(`    Transaction: ${tx.hash}`);
        await tx.wait();
        console.log(`    ${config.name} tier configured: ${ethers.formatEther(config.price)} ETC`);
      } catch (error) {
        console.error(`    Error configuring ${config.name}:`, error.message);
      }
    }
  }

  // Verification
  console.log('\n' + '='.repeat(60));
  console.log('Verification - Checking configured prices');
  console.log('='.repeat(60));

  const TIER_NAMES = ['NONE', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM'];

  for (const [roleName, roleHash] of Object.entries(ROLES)) {
    console.log(`\n${roleName}:`);
    for (let tier = 1; tier <= 4; tier++) {
      const metadata = await tieredRoleManager.tierMetadata(roleHash, tier);
      const status = metadata.isActive ? 'ACTIVE' : 'INACTIVE';
      console.log(
        `  ${TIER_NAMES[tier]}: ${ethers.formatEther(metadata.price)} ETC [${status}]`
      );
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('TIER PRICE CONFIGURATION COMPLETE');
  console.log('='.repeat(60));
  console.log('\nUsers can now purchase tiers with native ETC.');
  console.log('Funds will be collected in the TieredRoleManager contract.');
  console.log('Use the Admin Panel to withdraw collected funds.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
