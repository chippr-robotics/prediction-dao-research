const { ethers } = require('hardhat');

/**
 * Check current MembershipPaymentManager configuration
 */

const CONTRACTS = {
  paymentProcessor: '0xC6A3D457b0a0D9Fa4859F4211A4c9551F8Ce1F63',
  membershipPaymentManager: '0xA61C3a81e25E8E5E7A6A7EceBEd7e1BF58533e28',
  USC_TOKEN: '0xDE093684c796204224BC081f937aa059D903c52a',
  tierRegistry: '0x4eb93BaF14f668F8f67922121A3b9FC3FB5b8A0d',
};

const ROLES = {
  FRIEND_MARKET_ROLE: ethers.keccak256(ethers.toUtf8Bytes('FRIEND_MARKET_ROLE')),
  MARKET_MAKER_ROLE: ethers.keccak256(ethers.toUtf8Bytes('MARKET_MAKER_ROLE')),
};

async function main() {
  console.log('='.repeat(60));
  console.log('MembershipPaymentManager Configuration Check');
  console.log('='.repeat(60));

  // Check MembershipPaymentManager
  console.log('\n--- MembershipPaymentManager ---');
  console.log('Address:', CONTRACTS.membershipPaymentManager);

  try {
    const mpm = await ethers.getContractAt('MembershipPaymentManager', CONTRACTS.membershipPaymentManager);

    // Check treasury
    const treasury = await mpm.treasury();
    console.log('Treasury:', treasury);

    // Check payment tokens
    const uscToken = await mpm.paymentTokens(CONTRACTS.USC_TOKEN);
    console.log('\nUSC Token Configuration:');
    console.log('  Address:', uscToken.tokenAddress);
    console.log('  Active:', uscToken.isActive);
    console.log('  Symbol:', uscToken.symbol);
    console.log('  Decimals:', uscToken.decimals);

    // Check role prices
    console.log('\nRole Prices (USC):');
    for (const [roleName, roleHash] of Object.entries(ROLES)) {
      try {
        const price = await mpm.getRolePrice(roleHash, CONTRACTS.USC_TOKEN);
        console.log(`  ${roleName}: ${ethers.formatUnits(price, 6)} USC`);
      } catch (e) {
        console.log(`  ${roleName}: Not configured`);
      }
    }

    // Check revenue collected
    try {
      const uscRevenue = await mpm.revenueByToken(CONTRACTS.USC_TOKEN);
      console.log(`\nUSC Revenue collected: ${ethers.formatUnits(uscRevenue, 6)} USC`);
    } catch (e) {
      console.log('\nUSC Revenue: Unable to fetch');
    }
  } catch (e) {
    console.log('Error:', e.message);
  }

  // Check TierRegistry
  console.log('\n--- TierRegistry ---');
  console.log('Address:', CONTRACTS.tierRegistry);

  try {
    const tierRegistry = await ethers.getContractAt('TierRegistry', CONTRACTS.tierRegistry);

    const TIER_NAMES = ['NONE', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM'];

    console.log('\nTier Prices (USC):');
    for (const [roleName, roleHash] of Object.entries(ROLES)) {
      console.log(`\n${roleName}:`);
      for (let tier = 1; tier <= 4; tier++) {
        try {
          const price = await tierRegistry.getTierPrice(roleHash, tier);
          const isActive = await tierRegistry.isTierActive(roleHash, tier);
          console.log(`  ${TIER_NAMES[tier]}: ${ethers.formatUnits(price, 6)} USC, active=${isActive}`);
        } catch (e) {
          console.log(`  ${TIER_NAMES[tier]}: Not configured`);
        }
      }
    }
  } catch (e) {
    console.log('Error:', e.message);
  }

  console.log('\n' + '='.repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
