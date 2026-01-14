const { ethers } = require('hardhat');

async function main() {
  const FRIEND_FACTORY = '0x8cFE477e267bB36925047df8A6E30348f82b0085';
  const USC = '0xDE093684c796204224BC081f937aa059D903c52a';
  
  // Use a different account - let's use the deployer (index 0)
  // to test if the issue is specific to Tester1
  const signers = await ethers.getSigners();
  console.log('Available signers:', signers.length);
  console.log('Signer[0] (deployer):', signers[0].address);
  
  // For this test, we need to use Tester1's account
  // But we can only use accounts we have private keys for
  // Let me just run a simulation with explicit gas estimation
  
  const friendFactory = await ethers.getContractAt('FriendGroupMarketFactory', FRIEND_FACTORY);
  
  // First, let's get more details about the market
  const marketData = await friendFactory.getFriendMarketWithStatus(0);
  console.log('\n=== Market 0 Details ===');
  console.log('Creator:', marketData.creator);
  console.log('Members:', marketData.members);
  console.log('Status:', marketData.status.toString());
  console.log('StakeToken:', marketData.stakeToken);
  console.log('StakePerParticipant:', marketData.stakePerParticipant.toString());

  // Check if we can call acceptMarket from deployer (who already accepted)
  console.log('\n=== Testing from deployer ===');
  const deployerAcceptance = await friendFactory.marketAcceptances(0, signers[0].address);
  console.log('Deployer hasAccepted:', deployerAcceptance.hasAccepted);
  
  if (!deployerAcceptance.hasAccepted) {
    // Deployer hasn't accepted yet - this shouldn't be the case
    console.log('Unexpected: deployer should have accepted already');
  }

  // Let's try gas estimation explicitly
  console.log('\n=== Gas Estimation Test ===');
  const TESTER1 = '0xB8594B2d60261C89E49B9D64C7165B2f33fFB90E';
  
  try {
    const estimatedGas = await ethers.provider.estimateGas({
      to: FRIEND_FACTORY,
      from: TESTER1,
      data: friendFactory.interface.encodeFunctionData('acceptMarket', [0])
    });
    console.log('Estimated gas:', estimatedGas.toString());
  } catch (e) {
    console.log('Gas estimation failed:', e.message.slice(0, 200));
    if (e.data) {
      console.log('Error data:', e.data);
    }
  }

  // Let's also test with debug mode
  console.log('\n=== Debug with trace ===');
  try {
    // Try debug_traceCall if available
    const result = await ethers.provider.send('debug_traceCall', [
      {
        to: FRIEND_FACTORY,
        from: TESTER1,
        data: friendFactory.interface.encodeFunctionData('acceptMarket', [0])
      },
      'latest',
      { tracer: 'callTracer' }
    ]);
    console.log('Trace result:', JSON.stringify(result, null, 2).slice(0, 1000));
  } catch (e) {
    console.log('Trace not available:', e.message.slice(0, 100));
  }
}

main().catch(console.error);
