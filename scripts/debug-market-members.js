const { ethers } = require('hardhat');

async function main() {
  const friendFactory = await ethers.getContractAt(
    'FriendGroupMarketFactory',
    '0x8cFE477e267bB36925047df8A6E30348f82b0085'
  );

  const market = await friendFactory.friendMarkets(0);
  
  console.log('--- Market 0 Raw Data ---');
  console.log('creator:', market.creator);
  console.log('description:', market.description);
  console.log('stakeToken:', market.stakeToken);
  console.log('stakePerParticipant:', market.stakePerParticipant.toString());
  console.log('status:', market.status);
  console.log('acceptanceDeadline:', market.acceptanceDeadline.toString());
  console.log('acceptanceDeadline (date):', new Date(Number(market.acceptanceDeadline) * 1000).toISOString());
  
  console.log('\n--- Members Array ---');
  console.log('members length:', market.members?.length || 'undefined');
  if (market.members) {
    for (let i = 0; i < market.members.length; i++) {
      console.log('  member[' + i + ']:', market.members[i]);
    }
  }
  
  console.log('\n--- Participants Array ---');
  console.log('participants length:', market.participants?.length || 'undefined');
  if (market.participants) {
    for (let i = 0; i < market.participants.length; i++) {
      console.log('  participant[' + i + ']:', market.participants[i]);
    }
  }
  
  // Check if Tester1 is in members
  const tester1 = '0xB8594B2d60261C89E49B9D64C7165B2f33fFB90E';
  console.log('\n--- Tester1 Check ---');
  console.log('Tester1:', tester1);
  
  const isInMembers = market.members?.some(m => m.toLowerCase() === tester1.toLowerCase());
  const isInParticipants = market.participants?.some(p => p.toLowerCase() === tester1.toLowerCase());
  
  console.log('In members:', isInMembers);
  console.log('In participants:', isInParticipants);
  
  // Check acceptance record
  console.log('\n--- Acceptance Record ---');
  const acceptance = await friendFactory.marketAcceptances(0, tester1);
  console.log('hasAccepted:', acceptance.hasAccepted);
  console.log('stakedAmount:', acceptance.stakedAmount.toString());
}

main().catch(console.error);
