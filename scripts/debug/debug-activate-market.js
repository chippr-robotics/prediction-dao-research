const { ethers } = require('hardhat');

const CONTRACTS = {
  friendGroupMarketFactory: '0x8cFE477e267bB36925047df8A6E30348f82b0085',
  newConditionalMarketFactory: '0xd6F4a7059Ed5E1dc7fC8123768C5BC0fbc54A93a',
  ctf1155: '0xE56d9034591C6A6A5C023883354FAeB435E3b441',
  tieredRoleManager: '0xA6F794292488C628f91A0475dDF8dE6cEF2706EF',
};

async function main() {
  console.log('='.repeat(60));
  console.log('Debug _activateMarket Flow');
  console.log('='.repeat(60));

  const friendFactory = await ethers.getContractAt('FriendGroupMarketFactory', CONTRACTS.friendGroupMarketFactory);
  const cmf = await ethers.getContractAt('ConditionalMarketFactory', CONTRACTS.newConditionalMarketFactory);
  const ctf1155 = await ethers.getContractAt('CTF1155', CONTRACTS.ctf1155);
  const tieredRM = await ethers.getContractAt('TieredRoleManager', CONTRACTS.tieredRoleManager);

  // Get market 0 data
  const market = await friendFactory.friendMarkets(0);
  console.log('\n--- Market 0 Data ---');
  console.log('Creator:', market.creator);
  console.log('Status:', market.status);
  console.log('stakeToken:', market.stakeToken);
  console.log('stakePerParticipant:', market.stakePerParticipant.toString());
  console.log('tradingPeriodSeconds:', market.tradingPeriodSeconds.toString());

  // Check totalStaked
  const totalStaked = await friendFactory.marketTotalStaked(0);
  console.log('totalStaked:', totalStaked.toString());

  // Check defaultCollateralToken
  const defaultCollateral = await friendFactory.defaultCollateralToken();
  console.log('\ndefaultCollateralToken:', defaultCollateral);

  // Determine collateral for _activateMarket
  const collateral = defaultCollateral !== ethers.ZeroAddress ? defaultCollateral : market.stakeToken;
  console.log('Effective collateral for activation:', collateral);

  // Check acceptance status
  const acceptanceStatus = await friendFactory.getAcceptanceStatus(0);
  console.log('\n--- Acceptance Status ---');
  console.log('Accepted:', acceptanceStatus[0].toString());
  console.log('Required:', acceptanceStatus[1].toString());
  console.log('All accepted:', acceptanceStatus[0] >= acceptanceStatus[1]);

  // Check if proposal already exists in CMF
  const proposalId = 0n + 1000000n; // PROPOSAL_ID_OFFSET = 1000000
  console.log('\n--- CMF Checks ---');
  console.log('proposalId:', proposalId.toString());
  
  try {
    const existingMarket = await cmf.getMarketByProposal(proposalId);
    console.log('Existing market for proposal:', existingMarket);
  } catch (e) {
    console.log('No existing market for proposal (expected)');
  }

  // Check CMF owner
  const cmfOwner = await cmf.owner();
  console.log('CMF owner:', cmfOwner);
  console.log('FriendGroupMarketFactory:', CONTRACTS.friendGroupMarketFactory);

  // Check MARKET_MAKER_ROLE
  const marketMakerRole = await tieredRM.MARKET_MAKER_ROLE();
  const hasRole = await cmf.roleManager().then(rm => {
    return tieredRM.hasRole(marketMakerRole, CONTRACTS.friendGroupMarketFactory);
  });
  console.log('FGMFactory has MARKET_MAKER_ROLE:', hasRole);

  // Check CTF1155 configuration
  console.log('\n--- CTF1155 Checks ---');
  const ctfOnCMF = await cmf.ctf1155();
  console.log('CTF1155 on CMF:', ctfOnCMF);

  // Check if CTF1155 allows CMF to prepare conditions
  // CTF1155 is usually permissionless for prepareCondition
  console.log('CTF1155 contract exists:', (await ethers.provider.getCode(CONTRACTS.ctf1155)) !== '0x');

  // Simulate the deployMarketPair call
  console.log('\n--- Simulating deployMarketPair ---');
  const liquidityAmount = totalStaked;
  const liquidityParameter = ethers.parseEther('0.01');
  const tradingPeriod = market.tradingPeriodSeconds;

  console.log('Parameters:');
  console.log('  proposalId:', proposalId.toString());
  console.log('  collateralToken:', collateral);
  console.log('  liquidityAmount:', liquidityAmount.toString());
  console.log('  liquidityParameter:', liquidityParameter.toString());
  console.log('  tradingPeriod:', tradingPeriod.toString());

  // Check MIN/MAX trading period
  const MIN_TRADING_PERIOD = await cmf.MIN_TRADING_PERIOD();
  const MAX_TRADING_PERIOD = await cmf.MAX_TRADING_PERIOD();
  console.log('  MIN_TRADING_PERIOD:', MIN_TRADING_PERIOD.toString());
  console.log('  MAX_TRADING_PERIOD:', MAX_TRADING_PERIOD.toString());
  console.log('  tradingPeriod valid:', tradingPeriod >= MIN_TRADING_PERIOD && tradingPeriod <= MAX_TRADING_PERIOD);

  // Try to simulate the call
  console.log('\n--- Static Call Simulation ---');
  try {
    // We need to call from the FriendGroupMarketFactory address
    // Use eth_call with from address override
    const iface = cmf.interface;
    const calldata = iface.encodeFunctionData('deployMarketPair', [
      proposalId,
      collateral,
      liquidityAmount,
      liquidityParameter,
      tradingPeriod,
      0 // BetType.YesNo
    ]);

    const result = await ethers.provider.call({
      to: CONTRACTS.newConditionalMarketFactory,
      from: CONTRACTS.friendGroupMarketFactory,
      data: calldata
    });
    console.log('Simulation succeeded! Result:', result);
  } catch (e) {
    console.log('Simulation failed:', e.message.slice(0, 200));
    if (e.data) {
      console.log('Error data:', e.data);
    }
  }
}

main().catch(console.error);
