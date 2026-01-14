const { ethers } = require('hardhat');

async function main() {
  const friendFactory = await ethers.getContractAt(
    'FriendGroupMarketFactory',
    '0x8cFE477e267bB36925047df8A6E30348f82b0085'
  );

  // Use getFriendMarketWithStatus to get members array
  const marketData = await friendFactory.getFriendMarketWithStatus(0);
  
  console.log('--- Market 0 via getFriendMarketWithStatus ---');
  console.log('marketId:', marketData.marketId.toString());
  console.log('marketType:', marketData.marketType.toString());
  console.log('creator:', marketData.creator);
  console.log('arbitrator:', marketData.arbitrator);
  console.log('status:', marketData.status.toString());
  console.log('acceptanceDeadline:', marketData.acceptanceDeadline.toString());
  console.log('stakePerParticipant:', marketData.stakePerParticipant.toString());
  console.log('stakeToken:', marketData.stakeToken);
  console.log('acceptedCount:', marketData.acceptedCount.toString());
  console.log('minThreshold:', marketData.minThreshold.toString());
  console.log('description:', marketData.description);
  
  console.log('\n--- Members Array ---');
  console.log('members length:', marketData.members.length);
  for (let i = 0; i < marketData.members.length; i++) {
    console.log('  member[' + i + ']:', marketData.members[i]);
  }
  
  // Check if Tester1 is in members
  const tester1 = '0xB8594B2d60261C89E49B9D64C7165B2f33fFB90E';
  console.log('\n--- Tester1 Check ---');
  console.log('Tester1:', tester1);
  
  const isInMembers = marketData.members.some(m => m.toLowerCase() === tester1.toLowerCase());
  console.log('In members:', isInMembers);
  
  // Check acceptance record for both members
  console.log('\n--- Acceptance Records ---');
  for (const member of marketData.members) {
    const acceptance = await friendFactory.marketAcceptances(0, member);
    console.log(member + ':');
    console.log('  hasAccepted:', acceptance.hasAccepted);
    console.log('  stakedAmount:', acceptance.stakedAmount.toString());
  }
}

main().catch(console.error);
