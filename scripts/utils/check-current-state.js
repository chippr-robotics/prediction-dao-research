const { ethers } = require('hardhat');

async function main() {
  const USC = '0xDE093684c796204224BC081f937aa059D903c52a';
  const TESTER1 = '0xB8594B2d60261C89E49B9D64C7165B2f33fFB90E';
  const FRIEND_FACTORY = '0x8cFE477e267bB36925047df8A6E30348f82b0085';

  const usc = new ethers.Contract(USC, [
    'function balanceOf(address) view returns (uint256)',
    'function allowance(address,address) view returns (uint256)',
  ], ethers.provider);

  console.log('=== Current State Check ===');
  console.log('Block:', await ethers.provider.getBlockNumber());
  
  const balance = await usc.balanceOf(TESTER1);
  console.log('\nTester1 USC balance:', balance.toString(), '(', ethers.formatUnits(balance, 6), 'USC)');
  
  const allowance = await usc.allowance(TESTER1, FRIEND_FACTORY);
  console.log('Tester1 allowance to factory:', allowance.toString(), '(', ethers.formatUnits(allowance, 6), 'USC)');

  // Check Tester1 transaction history for recent acceptMarket calls
  console.log('\n=== Checking Recent Transactions from Tester1 ===');
  const block = await ethers.provider.getBlockNumber();
  
  // Look at last few blocks for transactions from Tester1 to the factory
  for (let i = block; i > block - 20 && i > 0; i--) {
    try {
      const blockData = await ethers.provider.getBlock(i, true);
      if (blockData && blockData.transactions) {
        for (const tx of blockData.transactions) {
          if (tx.from && tx.from.toLowerCase() === TESTER1.toLowerCase() &&
              tx.to && tx.to.toLowerCase() === FRIEND_FACTORY.toLowerCase()) {
            console.log('\nBlock', i, '- TX:', tx.hash);
            const receipt = await ethers.provider.getTransactionReceipt(tx.hash);
            console.log('  Status:', receipt.status === 1 ? 'SUCCESS' : 'REVERTED');
            console.log('  Gas used:', receipt.gasUsed.toString());
          }
        }
      }
    } catch (e) {
      // Skip blocks that can't be fetched
    }
  }

  // Check market acceptance status
  const friendFactory = await ethers.getContractAt('FriendGroupMarketFactory', FRIEND_FACTORY);
  const acceptance = await friendFactory.marketAcceptances(0, TESTER1);
  console.log('\n=== Market 0 Acceptance Status ===');
  console.log('Tester1 hasAccepted:', acceptance.hasAccepted);
  console.log('Tester1 stakedAmount:', acceptance.stakedAmount.toString());

  // Run simulation at current block
  console.log('\n=== Current Block Simulation ===');
  try {
    const calldata = friendFactory.interface.encodeFunctionData('acceptMarket', [0]);
    const result = await ethers.provider.call({
      to: FRIEND_FACTORY,
      from: TESTER1,
      data: calldata
    });
    console.log('Simulation succeeds!');
  } catch (e) {
    console.log('Simulation fails:', e.message.slice(0, 200));
  }
}

main().catch(console.error);
