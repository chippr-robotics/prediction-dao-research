const { ethers } = require('hardhat');

const CONTRACTS = {
  friendGroupMarketFactory: '0x8cFE477e267bB36925047df8A6E30348f82b0085',
  newConditionalMarketFactory: '0xd6F4a7059Ed5E1dc7fC8123768C5BC0fbc54A93a',
  tieredRoleManager: '0xA6F794292488C628f91A0475dDF8dE6cEF2706EF',
  tester1: '0xB8594B2d60261C89E49B9D64C7165B2f33fFB90E',
  deployer: '0x52502d049571C7893447b86c4d8B38e6184bF6e1',
};

async function main() {
  console.log('='.repeat(60));
  console.log('Full Configuration Verification');
  console.log('='.repeat(60));

  // 1. Verify FriendGroupMarketFactory is using new ConditionalMarketFactory
  console.log('\n--- 1. FriendGroupMarketFactory Configuration ---');
  const friendFactory = await ethers.getContractAt('FriendGroupMarketFactory', CONTRACTS.friendGroupMarketFactory);
  const currentMarketFactory = await friendFactory.marketFactory();
  console.log('marketFactory:', currentMarketFactory);
  console.log('Expected:', CONTRACTS.newConditionalMarketFactory);
  const mfMatch = currentMarketFactory.toLowerCase() === CONTRACTS.newConditionalMarketFactory.toLowerCase();
  console.log('Match:', mfMatch ? 'YES' : 'NO');

  // 2. Verify new ConditionalMarketFactory roleManager
  console.log('\n--- 2. ConditionalMarketFactory Configuration ---');
  const conditionalFactory = await ethers.getContractAt('ConditionalMarketFactory', CONTRACTS.newConditionalMarketFactory);
  const roleManagerAddr = await conditionalFactory.roleManager();
  console.log('roleManager:', roleManagerAddr);
  console.log('Expected:', CONTRACTS.tieredRoleManager);
  const rmMatch = roleManagerAddr.toLowerCase() === CONTRACTS.tieredRoleManager.toLowerCase();
  console.log('Match:', rmMatch ? 'YES' : 'NO');

  // 3. Verify FriendGroupMarketFactory has MARKET_MAKER_ROLE on TieredRoleManager
  console.log('\n--- 3. TieredRoleManager Configuration ---');
  const tieredRM = await ethers.getContractAt('TieredRoleManager', CONTRACTS.tieredRoleManager);
  const marketMakerRole = await tieredRM.MARKET_MAKER_ROLE();
  console.log('MARKET_MAKER_ROLE:', marketMakerRole);

  const hasRole = await tieredRM.hasRole(marketMakerRole, CONTRACTS.friendGroupMarketFactory);
  console.log('FriendGroupMarketFactory hasRole:', hasRole);

  // 4. Test checkMarketCreationLimitFor
  console.log('\n--- 4. checkMarketCreationLimitFor Test ---');
  try {
    const canCreate = await tieredRM.checkMarketCreationLimitFor.staticCall(
      CONTRACTS.friendGroupMarketFactory,
      marketMakerRole
    );
    console.log('checkMarketCreationLimitFor:', canCreate);
  } catch (e) {
    console.log('checkMarketCreationLimitFor failed:', e.message.slice(0, 100));
  }

  // 5. List pending friend markets
  console.log('\n--- 5. Pending Friend Markets ---');
  const marketCount = await friendFactory.friendMarketCount();
  console.log('Total friend markets:', marketCount.toString());

  for (let i = 0n; i < marketCount; i++) {
    try {
      const market = await friendFactory.friendMarkets(i);
      // Check if pending (status == 0)
      if (market.status === 0n) {
        console.log('\nMarket ' + i + ':');
        console.log('  Creator:', market.creator);
        console.log('  Status: PENDING');
        console.log('  Stake:', ethers.formatUnits(market.stakePerParticipant, 6), 'tokens');
        console.log('  Description:', market.description);
        console.log('  Deadline:', new Date(Number(market.acceptanceDeadline) * 1000).toISOString());
        const deadlinePassed = Date.now() / 1000 > Number(market.acceptanceDeadline);
        console.log('  Deadline passed:', deadlinePassed ? 'YES' : 'NO');

        // Check acceptances
        const participants = market.participants;
        console.log('  Participants:', participants.length);
        for (let j = 0; j < participants.length; j++) {
          const isAccepted = await friendFactory.marketAcceptances(i, participants[j]);
          console.log('    ' + participants[j] + ': ' + (isAccepted ? 'ACCEPTED' : 'PENDING'));
        }
      }
    } catch (e) {
      console.log('Market ' + i + ': Error reading - ' + e.message.slice(0, 50));
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Configuration verification complete');
  console.log('='.repeat(60));
}

main().catch(console.error);
