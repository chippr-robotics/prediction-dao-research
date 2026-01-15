const { ethers } = require('hardhat');

async function main() {
  const ROLE_MANAGER = '0x66e1070a67D0aF86d7C675a2e08AbEb90c1D5C05';
  const rm = await ethers.getContractAt('TieredRoleManager', ROLE_MANAGER);

  // Check tier prices for each role
  const roles = [
    { name: 'ADMIN_ROLE', hash: ethers.keccak256(ethers.toUtf8Bytes('ADMIN_ROLE')) },
    { name: 'MARKET_CREATOR_ROLE', hash: ethers.keccak256(ethers.toUtf8Bytes('MARKET_CREATOR_ROLE')) },
    { name: 'RESOLVER_ROLE', hash: ethers.keccak256(ethers.toUtf8Bytes('RESOLVER_ROLE')) }
  ];

  // MembershipTier enum: NONE=0, TRIAL=1, STANDARD=2, PREMIUM=3, FOUNDER=4, ENTERPRISE=5
  const tierNames = ['NONE', 'TRIAL', 'STANDARD', 'PREMIUM', 'FOUNDER', 'ENTERPRISE'];

  console.log('='.repeat(60));
  console.log('Tier Pricing Configuration');
  console.log('='.repeat(60));

  for (const role of roles) {
    console.log(`\n${role.name}:`);
    for (let tier = 1; tier <= 5; tier++) {
      try {
        const metadata = await rm.tierMetadata(role.hash, tier);
        if (metadata.name || metadata.price > 0) {
          console.log(`  ${tierNames[tier]} (${tier}): price=${ethers.formatEther(metadata.price)} ETC, name="${metadata.name}", active=${metadata.isActive}`);
        }
      } catch (e) {
        // Tier not configured
      }
    }
  }

  console.log('\n' + '='.repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
