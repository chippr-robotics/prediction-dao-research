const { ethers } = require('hardhat');

const OLD_ROLE_MANAGER = '0x3759B1F153193471Dd48401eE198F664f2d7FeB8';
const FACTORY_V5 = '0x8cFE477e267bB36925047df8A6E30348f82b0085';

async function main() {
  console.log('='.repeat(60));
  console.log('Grant Tier on Old TieredRoleManager');
  console.log('='.repeat(60));

  const [signer] = await ethers.getSigners();
  console.log('Signer:', signer.address);

  // TieredRoleManager ABI
  const abi = [
    'function MARKET_MAKER_ROLE() view returns (bytes32)',
    'function hasRole(bytes32 role, address account) view returns (bool)',
    'function grantTier(address user, bytes32 role, uint8 tier, uint256 durationSeconds)',
    'function checkMarketCreationLimitFor(address user, bytes32 role) returns (bool)',
    'function userTiers(address, bytes32) view returns (uint8)',
    'function owner() view returns (address)',
    'event TierGranted(address indexed user, bytes32 indexed role, uint8 tier, uint256 expiresAt)',
  ];

  const rm = new ethers.Contract(OLD_ROLE_MANAGER, abi, signer);
  
  const marketMakerRole = await rm.MARKET_MAKER_ROLE();
  console.log('\nMARKET_MAKER_ROLE:', marketMakerRole);
  
  // Check current tier
  const currentTier = await rm.userTiers(FACTORY_V5, marketMakerRole);
  console.log('Current tier for factory:', currentTier);
  
  if (currentTier > 0) {
    console.log('\n✓ Factory already has tier', currentTier);
    
    // Test checkMarketCreationLimitFor
    console.log('\nTesting checkMarketCreationLimitFor...');
    try {
      const result = await rm.checkMarketCreationLimitFor.staticCall(FACTORY_V5, marketMakerRole);
      console.log('Result:', result);
    } catch (e) {
      console.log('Error:', e.message);
    }
    return;
  }

  // Grant PLATINUM tier (tier 4) with 100 year duration
  console.log('\n--- Granting PLATINUM tier ---');
  const PLATINUM = 4;
  const DURATION = 100 * 365 * 24 * 60 * 60; // 100 years
  
  try {
    const tx = await rm.grantTier(FACTORY_V5, marketMakerRole, PLATINUM, DURATION);
    console.log('Transaction hash:', tx.hash);
    const receipt = await tx.wait();
    console.log('Confirmed in block:', receipt.blockNumber);
    console.log('Gas used:', receipt.gasUsed.toString());
  } catch (e) {
    console.error('Failed to grant tier:', e.message);
    
    // Check if we're the owner
    try {
      const owner = await rm.owner();
      console.log('\nContract owner:', owner);
      console.log('Signer:', signer.address);
      if (owner.toLowerCase() !== signer.address.toLowerCase()) {
        console.log('\nNOTE: You are not the owner. Grant may require owner permissions.');
      }
    } catch (e2) {
      console.log('Could not check owner');
    }
    return;
  }

  // Verify
  const newTier = await rm.userTiers(FACTORY_V5, marketMakerRole);
  console.log('\nNew tier for factory:', newTier);
  
  // Test checkMarketCreationLimitFor
  console.log('\nTesting checkMarketCreationLimitFor...');
  try {
    const result = await rm.checkMarketCreationLimitFor.staticCall(FACTORY_V5, marketMakerRole);
    console.log('Result:', result);
    console.log('\n✓ SUCCESS! Factory can now create markets.');
  } catch (e) {
    console.log('Error:', e.message);
  }
}

main().catch(console.error);
