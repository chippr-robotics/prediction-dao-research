const { ethers } = require('hardhat');

/**
 * Investigate where tier purchase payments went
 */

const CONTRACTS = {
  friendGroupMarketFactory: '0x8cFE477e267bB36925047df8A6E30348f82b0085',
  tieredRoleManager: '0xA6F794292488C628f91A0475dDF8dE6cEF2706EF',
  membershipPaymentManager: '0xA61C3a81e25E8E5E7A6A7EceBEd7e1BF58533e28',
  paymentProcessor: '0xC6A3D457b0a0D9Fa4859F4211A4c9551F8Ce1F63',
  tierRegistry: '0x4eb93BaF14f668F8f67922121A3b9FC3FB5b8A0d',
  treasuryVault: '0x93F7ee39C02d99289E3c29696f1F3a70656d0772'
};

async function main() {
  console.log('='.repeat(60));
  console.log('Payment Flow Investigation');
  console.log('='.repeat(60));

  const provider = ethers.provider;

  // Check all contract balances
  console.log('\n--- Contract Balances ---');
  for (const [name, address] of Object.entries(CONTRACTS)) {
    const balance = await provider.getBalance(address);
    console.log(`${name}: ${ethers.formatEther(balance)} ETC`);
  }

  // Check FriendGroupMarketFactory configuration
  console.log('\n--- FriendGroupMarketFactory Config ---');
  const fgmf = await ethers.getContractAt('FriendGroupMarketFactory', CONTRACTS.friendGroupMarketFactory);

  try {
    const roleManager = await fgmf.roleManager();
    console.log('roleManager:', roleManager);
  } catch (e) {
    console.log('roleManager: not found');
  }

  try {
    const membershipPaymentManager = await fgmf.membershipPaymentManager();
    console.log('membershipPaymentManager:', membershipPaymentManager);
  } catch (e) {
    console.log('membershipPaymentManager: not found');
  }

  // Check TierRegistry prices for FRIEND_MARKET_ROLE
  console.log('\n--- TierRegistry Configuration ---');
  const tierRegistry = await ethers.getContractAt('TierRegistry', CONTRACTS.tierRegistry);
  const FRIEND_MARKET_ROLE = ethers.keccak256(ethers.toUtf8Bytes('FRIEND_MARKET_ROLE'));

  console.log('FRIEND_MARKET_ROLE hash:', FRIEND_MARKET_ROLE);

  const tierNames = ['NONE', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM'];
  for (let tier = 1; tier <= 4; tier++) {
    try {
      const price = await tierRegistry.getTierPrice(FRIEND_MARKET_ROLE, tier);
      const isActive = await tierRegistry.isTierActive(FRIEND_MARKET_ROLE, tier);
      console.log(`  ${tierNames[tier]}: price=${ethers.formatUnits(price, 6)} USC, active=${isActive}`);
    } catch (e) {
      console.log(`  ${tierNames[tier]}: Error - ${e.message}`);
    }
  }

  // Check MembershipPaymentManager
  console.log('\n--- MembershipPaymentManager Config ---');
  const mpm = await ethers.getContractAt('MembershipPaymentManager', CONTRACTS.membershipPaymentManager);

  try {
    const paymentToken = await mpm.paymentToken();
    console.log('Payment token (USC):', paymentToken);

    // Check USC token balance of MembershipPaymentManager
    const erc20 = await ethers.getContractAt('IERC20', paymentToken);
    const mpmBalance = await erc20.balanceOf(CONTRACTS.membershipPaymentManager);
    console.log('MembershipPaymentManager USC balance:', ethers.formatUnits(mpmBalance, 6), 'USC');

    // Check treasury balance
    const treasuryBalance = await erc20.balanceOf(CONTRACTS.treasuryVault);
    console.log('TreasuryVault USC balance:', ethers.formatUnits(treasuryBalance, 6), 'USC');
  } catch (e) {
    console.log('Error:', e.message);
  }

  // Look for tier purchase events
  console.log('\n--- Looking for TierPurchased events ---');

  // Check TieredRoleManager
  const trm = await ethers.getContractAt('TieredRoleManager', CONTRACTS.tieredRoleManager);
  const filter = trm.filters.TierPurchased();
  const events = await trm.queryFilter(filter, 12000000);
  console.log(`TieredRoleManager (${CONTRACTS.tieredRoleManager}): ${events.length} TierPurchased events`);
  for (const event of events.slice(0, 10)) {
    console.log(`  User: ${event.args.user}, Amount: ${ethers.formatEther(event.args.amount)} ETC`);
  }

  // Check FriendGroupMarketFactory for payment events
  console.log('\n--- Looking for FriendGroupMarketFactory payment events ---');
  try {
    const membershipFilter = fgmf.filters.MembershipPurchased();
    const membershipEvents = await fgmf.queryFilter(membershipFilter, 12000000);
    console.log(`MembershipPurchased events: ${membershipEvents.length}`);
    for (const event of membershipEvents.slice(0, 10)) {
      console.log(`  User: ${event.args.user}, Tier: ${event.args.tier}, Amount: ${ethers.formatEther(event.args.amount)} ETC`);
    }
  } catch (e) {
    console.log('MembershipPurchased events: not found -', e.message);
  }

  // Look for MembershipPayment events
  console.log('\n--- Looking for MembershipPayment events ---');
  try {
    const paymentFilter = mpm.filters.MembershipPayment();
    const paymentEvents = await mpm.queryFilter(paymentFilter, 12000000);
    console.log(`MembershipPaymentManager: ${paymentEvents.length} MembershipPayment events`);
    for (const event of paymentEvents.slice(0, 10)) {
      console.log(`  User: ${event.args.user}, Role: ${event.args.role}, Tier: ${event.args.tier}, Amount: ${ethers.formatUnits(event.args.amount, 6)} USC`);
    }
  } catch (e) {
    console.log('MembershipPayment events error:', e.message);
  }

  console.log('\n' + '='.repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
