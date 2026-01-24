const { ethers } = require('hardhat');

/**
 * Setup admin roles and configure tier prices in Classic USD (USC) for TieredRoleManager
 *
 * This script:
 * 1. Grants all admin roles to the specified address
 * 2. Configures USC token in MembershipPaymentManager
 * 3. Sets tier prices in USC via MembershipPaymentManager
 * 4. Configures TieredRoleManager tier metadata (with 0 native price)
 *
 * Usage:
 *   FLOPPY_KEYSTORE_PASSWORD=password npx hardhat run scripts/admin/setup-admin-and-prices.js --network mordor
 */

// Current deployed contract addresses
const TIERED_ROLE_MANAGER_ADDRESS = '0x55e6346Be542B13462De504FCC379a2477D227f0';
const MEMBERSHIP_PAYMENT_MANAGER_ADDRESS = '0x797717EAf6d054b35A30c9afF0e231a35Bb5abB7';

// USC token address (Classic USD stablecoin)
const USC_TOKEN_ADDRESS = '0xDE093684c796204224BC081f937aa059D903c52a';

// Address to receive all admin roles
const ADMIN_ADDRESS = '0x52502d049571C7893447b86c4d8B38e6184bF6e1';

// Role hashes
const ROLES = {
  DEFAULT_ADMIN_ROLE: ethers.ZeroHash,
  CORE_SYSTEM_ADMIN_ROLE: ethers.keccak256(ethers.toUtf8Bytes('CORE_SYSTEM_ADMIN_ROLE')),
  OPERATIONS_ADMIN_ROLE: ethers.keccak256(ethers.toUtf8Bytes('OPERATIONS_ADMIN_ROLE')),
  OVERSIGHT_COMMITTEE_ROLE: ethers.keccak256(ethers.toUtf8Bytes('OVERSIGHT_COMMITTEE_ROLE')),
  EMERGENCY_GUARDIAN_ROLE: ethers.keccak256(ethers.toUtf8Bytes('EMERGENCY_GUARDIAN_ROLE')),
  // Premium roles
  FRIEND_MARKET_ROLE: ethers.keccak256(ethers.toUtf8Bytes('FRIEND_MARKET_ROLE')),
  MARKET_MAKER_ROLE: ethers.keccak256(ethers.toUtf8Bytes('MARKET_MAKER_ROLE')),
  CLEARPATH_USER_ROLE: ethers.keccak256(ethers.toUtf8Bytes('CLEARPATH_USER_ROLE')),
  TOKENMINT_ROLE: ethers.keccak256(ethers.toUtf8Bytes('TOKENMINT_ROLE')),
};

// Admin roles to grant (in order of hierarchy)
const ADMIN_ROLES = [
  'DEFAULT_ADMIN_ROLE',
  'CORE_SYSTEM_ADMIN_ROLE',
  'OPERATIONS_ADMIN_ROLE',
  'OVERSIGHT_COMMITTEE_ROLE',
  'EMERGENCY_GUARDIAN_ROLE',
];

// Premium roles for price configuration
const PREMIUM_ROLES = [
  'FRIEND_MARKET_ROLE',
  'MARKET_MAKER_ROLE',
  'CLEARPATH_USER_ROLE',
  'TOKENMINT_ROLE',
];

// MembershipTier enum: NONE=0, BRONZE=1, SILVER=2, GOLD=3, PLATINUM=4
const TIERS = {
  BRONZE: 1,
  SILVER: 2,
  GOLD: 3,
  PLATINUM: 4,
};

// USC prices per tier (USC has 6 decimals)
const USC_DECIMALS = 6;
const USC_PRICES = {
  [TIERS.BRONZE]: ethers.parseUnits('5', USC_DECIMALS),      // $5 USC
  [TIERS.SILVER]: ethers.parseUnits('10', USC_DECIMALS),     // $10 USC
  [TIERS.GOLD]: ethers.parseUnits('25', USC_DECIMALS),       // $25 USC
  [TIERS.PLATINUM]: ethers.parseUnits('50', USC_DECIMALS),   // $50 USC
};

// Tier metadata configuration (price field set to 0 since we use USC via PaymentManager)
const TIER_CONFIG = {
  [TIERS.BRONZE]: {
    name: 'Bronze',
    description: 'Basic membership tier with essential features',
    price: ethers.parseEther('0'),
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
    price: ethers.parseEther('0'),
    limits: {
      dailyBetLimit: ethers.parseEther('500'),
      weeklyBetLimit: ethers.parseEther('2000'),
      monthlyMarketCreation: 15,
      maxPositionSize: ethers.parseEther('50'),
      maxConcurrentMarkets: 5,
      withdrawalLimit: ethers.parseEther('200'),
      canCreatePrivateMarkets: true,
      canUseAdvancedFeatures: true,
      feeDiscount: 500,
    },
    isActive: true,
  },
  [TIERS.GOLD]: {
    name: 'Gold',
    description: 'Advanced tier for power users',
    price: ethers.parseEther('0'),
    limits: {
      dailyBetLimit: ethers.parseEther('2000'),
      weeklyBetLimit: ethers.parseEther('10000'),
      monthlyMarketCreation: 50,
      maxPositionSize: ethers.parseEther('200'),
      maxConcurrentMarkets: 15,
      withdrawalLimit: ethers.parseEther('1000'),
      canCreatePrivateMarkets: true,
      canUseAdvancedFeatures: true,
      feeDiscount: 1000,
    },
    isActive: true,
  },
  [TIERS.PLATINUM]: {
    name: 'Platinum',
    description: 'Premium tier with maximum benefits',
    price: ethers.parseEther('0'),
    limits: {
      dailyBetLimit: ethers.parseEther('10000'),
      weeklyBetLimit: ethers.parseEther('50000'),
      monthlyMarketCreation: 200,
      maxPositionSize: ethers.parseEther('1000'),
      maxConcurrentMarkets: 50,
      withdrawalLimit: ethers.parseEther('5000'),
      canCreatePrivateMarkets: true,
      canUseAdvancedFeatures: true,
      feeDiscount: 2000,
    },
    isActive: true,
  },
};

async function main() {
  console.log('='.repeat(60));
  console.log('Setup Admin Roles and Configure USC Tier Prices');
  console.log('='.repeat(60));

  const [signer] = await ethers.getSigners();
  console.log('\nSigner:', signer.address);
  console.log('Target admin address:', ADMIN_ADDRESS);
  console.log('TieredRoleManager:', TIERED_ROLE_MANAGER_ADDRESS);
  console.log('MembershipPaymentManager:', MEMBERSHIP_PAYMENT_MANAGER_ADDRESS);
  console.log('USC Token:', USC_TOKEN_ADDRESS);

  const tieredRoleManager = await ethers.getContractAt(
    'TieredRoleManager',
    TIERED_ROLE_MANAGER_ADDRESS
  );

  const paymentManager = await ethers.getContractAt(
    'MembershipPaymentManager',
    MEMBERSHIP_PAYMENT_MANAGER_ADDRESS
  );

  // Check signer has DEFAULT_ADMIN_ROLE on TieredRoleManager
  const hasDefaultAdmin = await tieredRoleManager.hasRole(ROLES.DEFAULT_ADMIN_ROLE, signer.address);
  console.log('\nSigner has DEFAULT_ADMIN_ROLE on TieredRoleManager:', hasDefaultAdmin);

  if (!hasDefaultAdmin) {
    console.error('\nERROR: Signer does not have DEFAULT_ADMIN_ROLE');
    process.exit(1);
  }

  // ========== PART 1: Grant Admin Roles ==========
  console.log('\n' + '='.repeat(60));
  console.log('PART 1: Granting Admin Roles');
  console.log('='.repeat(60));

  for (const roleName of ADMIN_ROLES) {
    const roleHash = ROLES[roleName];
    console.log(`\n--- ${roleName} ---`);
    console.log(`  Hash: ${roleHash}`);

    const hasRole = await tieredRoleManager.hasRole(roleHash, ADMIN_ADDRESS);
    console.log(`  Already has role: ${hasRole}`);

    if (!hasRole) {
      try {
        console.log(`  Granting ${roleName}...`);
        const tx = await tieredRoleManager.grantRole(roleHash, ADMIN_ADDRESS);
        console.log(`  TX: ${tx.hash}`);
        await tx.wait();
        console.log(`  GRANTED`);
      } catch (error) {
        console.error(`  Error: ${error.message}`);
      }
    } else {
      console.log(`  SKIPPED (already has role)`);
    }
  }

  // ========== PART 2: Configure USC Token in PaymentManager ==========
  console.log('\n' + '='.repeat(60));
  console.log('PART 2: Configuring USC Token in PaymentManager');
  console.log('='.repeat(60));

  // Check if USC token is already configured
  const uscToken = await paymentManager.paymentTokens(USC_TOKEN_ADDRESS);
  console.log('\nUSC token config:', uscToken);

  if (uscToken.tokenAddress === ethers.ZeroAddress) {
    console.log('\nAdding USC as payment token...');
    try {
      const tx = await paymentManager.addPaymentToken(USC_TOKEN_ADDRESS, 'USC', 18);
      console.log('TX:', tx.hash);
      await tx.wait();
      console.log('USC token added successfully');
    } catch (error) {
      console.error('Error adding USC token:', error.message);
    }
  } else {
    console.log('USC token already configured');
    if (!uscToken.isActive) {
      console.log('Activating USC token...');
      const tx = await paymentManager.setPaymentTokenActive(USC_TOKEN_ADDRESS, true);
      await tx.wait();
      console.log('USC token activated');
    }
  }

  // ========== PART 3: Set USC Prices for Roles ==========
  console.log('\n' + '='.repeat(60));
  console.log('PART 3: Setting USC Prices for Roles');
  console.log('='.repeat(60));

  const TIER_NAMES = ['NONE', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM'];

  for (const roleName of PREMIUM_ROLES) {
    const roleHash = ROLES[roleName];
    console.log(`\n--- ${roleName} ---`);
    console.log(`  Hash: ${roleHash}`);

    // Set price for each tier using the role hash directly
    // Note: MembershipPaymentManager uses role hash, not per-tier pricing
    // We'll use the BRONZE tier price as the base role price
    const basePrice = USC_PRICES[TIERS.BRONZE];
    console.log(`  Setting base USC price: ${ethers.formatEther(basePrice)} USC`);

    try {
      const tx = await paymentManager.setRolePrice(roleHash, USC_TOKEN_ADDRESS, basePrice);
      console.log(`  TX: ${tx.hash}`);
      await tx.wait();
      console.log(`  Price set: ${ethers.formatEther(basePrice)} USC`);
    } catch (error) {
      console.error(`  Error: ${error.message}`);
    }
  }

  // ========== PART 4: Configure Tier Metadata ==========
  console.log('\n' + '='.repeat(60));
  console.log('PART 4: Configuring Tier Metadata (native price = 0)');
  console.log('='.repeat(60));

  for (const roleName of PREMIUM_ROLES) {
    const roleHash = ROLES[roleName];
    console.log(`\n--- ${roleName} ---`);

    for (const [tierNum, config] of Object.entries(TIER_CONFIG)) {
      const tier = parseInt(tierNum);
      console.log(`\n  ${config.name} tier (${tier}):`);

      try {
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

        // Set the USC price in the tier metadata price field for display purposes
        const uscPrice = USC_PRICES[tier];

        const tx = await tieredRoleManager.setTierMetadata(
          roleHash,
          tier,
          config.name,
          config.description,
          uscPrice, // Store USC price for reference
          limits,
          config.isActive
        );
        console.log(`    TX: ${tx.hash}`);
        await tx.wait();
        console.log(`    Set: ${ethers.formatUnits(uscPrice, USC_DECIMALS)} USC [ACTIVE]`);
      } catch (error) {
        console.error(`    Error: ${error.message}`);
      }
    }
  }

  // ========== Verification ==========
  console.log('\n' + '='.repeat(60));
  console.log('VERIFICATION');
  console.log('='.repeat(60));

  console.log('\nAdmin roles for', ADMIN_ADDRESS + ':');
  for (const roleName of ADMIN_ROLES) {
    const hasRole = await tieredRoleManager.hasRole(ROLES[roleName], ADMIN_ADDRESS);
    console.log(`  ${roleName}: ${hasRole ? 'YES' : 'NO'}`);
  }

  console.log('\nUSC Tier Prices (from TieredRoleManager):');
  for (const roleName of PREMIUM_ROLES) {
    console.log(`\n  ${roleName}:`);
    for (let tier = 1; tier <= 4; tier++) {
      const metadata = await tieredRoleManager.tierMetadata(ROLES[roleName], tier);
      const status = metadata.isActive ? 'ACTIVE' : 'INACTIVE';
      console.log(`    ${TIER_NAMES[tier]}: ${ethers.formatUnits(metadata.price, USC_DECIMALS)} USC [${status}]`);
    }
  }

  console.log('\nUSC Prices (from MembershipPaymentManager):');
  for (const roleName of PREMIUM_ROLES) {
    const roleHash = ROLES[roleName];
    const price = await paymentManager.getRolePrice(roleHash, USC_TOKEN_ADDRESS);
    console.log(`  ${roleName}: ${ethers.formatUnits(price, USC_DECIMALS)} USC`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('SETUP COMPLETE - All prices in Classic USD (USC)');
  console.log('='.repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
