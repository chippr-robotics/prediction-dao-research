const { ethers } = require('hardhat');

const OLD_ROLE_MANAGER = '0x3759B1F153193471Dd48401eE198F664f2d7FeB8';
const FACTORY_V5 = '0x8cFE477e267bB36925047df8A6E30348f82b0085';

async function main() {
  console.log('='.repeat(60));
  console.log('Debug Old RoleManager at', OLD_ROLE_MANAGER);
  console.log('='.repeat(60));

  // Try to get contract type info
  const abi = [
    'function MARKET_MAKER_ROLE() view returns (bytes32)',
    'function hasRole(bytes32 role, address account) view returns (bool)',
    'function checkMarketCreationLimitFor(address user, bytes32 role) returns (bool)',
    // TieredRoleManager specific
    'function tierRegistry() view returns (address)',
    'function usageTracker() view returns (address)',
    'function getTier(address user, bytes32 role) view returns (uint8)',
    'function getCurrentLimit(address user, bytes32 role) view returns (uint256)',
    'function getCurrentUsage(address user, bytes32 role) view returns (uint256)',
    // Admin
    'function owner() view returns (address)',
    'function DEFAULT_ADMIN_ROLE() view returns (bytes32)',
  ];

  const rm = new ethers.Contract(OLD_ROLE_MANAGER, abi, ethers.provider);
  
  const marketMakerRole = await rm.MARKET_MAKER_ROLE();
  console.log('\nMARKET_MAKER_ROLE:', marketMakerRole);
  
  const hasRole = await rm.hasRole(marketMakerRole, FACTORY_V5);
  console.log('Factory v5 hasRole:', hasRole);

  // Check if it's a TieredRoleManager
  try {
    const tierRegistry = await rm.tierRegistry();
    console.log('\ntierRegistry:', tierRegistry);
    
    const usageTracker = await rm.usageTracker();
    console.log('usageTracker:', usageTracker);
    
    // If tierRegistry is set, check tier info
    if (tierRegistry !== ethers.ZeroAddress) {
      const tier = await rm.getTier(FACTORY_V5, marketMakerRole);
      console.log('Factory tier:', tier);
      
      try {
        const limit = await rm.getCurrentLimit(FACTORY_V5, marketMakerRole);
        console.log('Factory limit:', limit.toString());
      } catch (e) {
        console.log('getCurrentLimit error:', e.message.slice(0, 100));
      }
    }
  } catch (e) {
    console.log('\nNot a TieredRoleManager or missing functions:', e.message.slice(0, 100));
  }

  // Try calling checkMarketCreationLimitFor with staticCall to see error
  console.log('\n--- Testing checkMarketCreationLimitFor ---');
  try {
    const result = await rm.checkMarketCreationLimitFor.staticCall(FACTORY_V5, marketMakerRole);
    console.log('Result:', result);
  } catch (e) {
    console.log('Error:', e.message);
    if (e.data) {
      console.log('Error data:', e.data);
    }
    // Check for revert reason
    if (e.reason) {
      console.log('Reason:', e.reason);
    }
  }
}

main().catch(console.error);
