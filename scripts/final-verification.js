const { ethers } = require('hardhat');

const CONTRACTS = {
  friendGroupMarketFactory: '0x8cFE477e267bB36925047df8A6E30348f82b0085',
  newConditionalMarketFactory: '0xd6F4a7059Ed5E1dc7fC8123768C5BC0fbc54A93a',
  tieredRoleManager: '0xA6F794292488C628f91A0475dDF8dE6cEF2706EF',
  ctf1155: '0xE56d9034591C6A6A5C023883354FAeB435E3b441',
};

async function main() {
  console.log('='.repeat(60));
  console.log('Final Configuration Verification');
  console.log('='.repeat(60));

  const friendFactory = await ethers.getContractAt('FriendGroupMarketFactory', CONTRACTS.friendGroupMarketFactory);
  const cmf = await ethers.getContractAt('ConditionalMarketFactory', CONTRACTS.newConditionalMarketFactory);
  const tieredRM = await ethers.getContractAt('TieredRoleManager', CONTRACTS.tieredRoleManager);

  // 1. FriendGroupMarketFactory -> ConditionalMarketFactory
  const mf = await friendFactory.marketFactory();
  console.log('\n1. FriendGroupMarketFactory.marketFactory');
  console.log('   Current:', mf);
  console.log('   Expected:', CONTRACTS.newConditionalMarketFactory);
  console.log('   Status:', mf.toLowerCase() === CONTRACTS.newConditionalMarketFactory.toLowerCase() ? 'OK' : 'FAIL');

  // 2. ConditionalMarketFactory -> TieredRoleManager
  const rm = await cmf.roleManager();
  console.log('\n2. ConditionalMarketFactory.roleManager');
  console.log('   Current:', rm);
  console.log('   Expected:', CONTRACTS.tieredRoleManager);
  console.log('   Status:', rm.toLowerCase() === CONTRACTS.tieredRoleManager.toLowerCase() ? 'OK' : 'FAIL');

  // 3. ConditionalMarketFactory -> CTF1155
  const ctf = await cmf.ctf1155();
  console.log('\n3. ConditionalMarketFactory.ctf1155');
  console.log('   Current:', ctf);
  console.log('   Expected:', CONTRACTS.ctf1155);
  console.log('   Status:', ctf.toLowerCase() === CONTRACTS.ctf1155.toLowerCase() ? 'OK' : 'FAIL');

  // 4. TieredRoleManager - FriendGroupMarketFactory has MARKET_MAKER_ROLE
  const marketMakerRole = await tieredRM.MARKET_MAKER_ROLE();
  const hasRole = await tieredRM.hasRole(marketMakerRole, CONTRACTS.friendGroupMarketFactory);
  console.log('\n4. TieredRoleManager.hasRole(MARKET_MAKER_ROLE, FriendGroupMarketFactory)');
  console.log('   Result:', hasRole);
  console.log('   Status:', hasRole ? 'OK' : 'FAIL');

  // 5. checkMarketCreationLimitFor test
  console.log('\n5. checkMarketCreationLimitFor test');
  try {
    const canCreate = await tieredRM.checkMarketCreationLimitFor.staticCall(
      CONTRACTS.friendGroupMarketFactory,
      marketMakerRole
    );
    console.log('   Result:', canCreate);
    console.log('   Status:', canCreate ? 'OK' : 'FAIL');
  } catch (e) {
    console.log('   Error:', e.message.slice(0, 50));
    console.log('   Status: FAIL');
  }

  // Summary
  const checks = [
    mf.toLowerCase() === CONTRACTS.newConditionalMarketFactory.toLowerCase(),
    rm.toLowerCase() === CONTRACTS.tieredRoleManager.toLowerCase(),
    ctf.toLowerCase() === CONTRACTS.ctf1155.toLowerCase(),
    hasRole
  ];
  
  const allPassed = checks.every(c => c);
  console.log('\n' + '='.repeat(60));
  console.log(allPassed ? 'ALL CHECKS PASSED - Ready for testing!' : 'SOME CHECKS FAILED');
  console.log('='.repeat(60));
}

main().catch(console.error);
