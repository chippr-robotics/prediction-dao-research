const { ethers } = require('hardhat');

async function main() {
  const USC = '0xDE093684c796204224BC081f937aa059D903c52a';
  const TESTER1 = '0xB8594B2d60261C89E49B9D64C7165B2f33fFB90E';
  const FRIEND_FACTORY = '0x8cFE477e267bB36925047df8A6E30348f82b0085';
  const STAKE_AMOUNT = 5000000n;

  console.log('='.repeat(60));
  console.log('Simulate Stake Collection');
  console.log('='.repeat(60));

  const usc = new ethers.Contract(USC, [
    'function transferFrom(address,address,uint256) returns (bool)',
    'function balanceOf(address) view returns (uint256)',
    'function allowance(address,address) view returns (uint256)',
    'function symbol() view returns (string)',
  ], ethers.provider);

  const symbol = await usc.symbol();
  console.log('\nToken:', symbol, 'at', USC);
  console.log('Tester1:', TESTER1);
  console.log('FriendGroupMarketFactory:', FRIEND_FACTORY);
  console.log('Stake amount:', STAKE_AMOUNT.toString());

  // Check balance
  const balance = await usc.balanceOf(TESTER1);
  console.log('\nTester1 balance:', balance.toString());
  console.log('Sufficient:', balance >= STAKE_AMOUNT);

  // Check allowance
  const allowance = await usc.allowance(TESTER1, FRIEND_FACTORY);
  console.log('Allowance to factory:', allowance.toString());
  console.log('Sufficient:', allowance >= STAKE_AMOUNT);

  // Simulate transferFrom
  console.log('\n--- Simulating transferFrom ---');
  try {
    const calldata = usc.interface.encodeFunctionData('transferFrom', [
      TESTER1,
      FRIEND_FACTORY,
      STAKE_AMOUNT
    ]);

    // Simulate with FRIEND_FACTORY as the caller
    const result = await ethers.provider.call({
      to: USC,
      from: FRIEND_FACTORY,
      data: calldata
    });
    console.log('Simulation result:', result);
    console.log('SUCCESS: transferFrom would succeed!');
  } catch (e) {
    console.log('Simulation FAILED:', e.message.slice(0, 200));
    if (e.data) {
      console.log('Error data:', e.data);
    }
  }

  // Also try simulating the full acceptMarket call
  console.log('\n--- Simulating full acceptMarket ---');
  const friendFactory = await ethers.getContractAt('FriendGroupMarketFactory', FRIEND_FACTORY);
  
  try {
    const calldata = friendFactory.interface.encodeFunctionData('acceptMarket', [0]);
    
    const result = await ethers.provider.call({
      to: FRIEND_FACTORY,
      from: TESTER1,
      data: calldata
    });
    console.log('Simulation result:', result);
    console.log('SUCCESS: acceptMarket would succeed!');
  } catch (e) {
    console.log('Simulation FAILED:', e.message.slice(0, 300));
    if (e.data) {
      console.log('Error data:', e.data);
    }
  }
}

main().catch(console.error);
