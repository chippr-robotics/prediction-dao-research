const { ethers } = require('hardhat');

const OLD_ROLE_MANAGER = '0x3759B1F153193471Dd48401eE198F664f2d7FeB8';
const FACTORY_V5 = '0x8cFE477e267bB36925047df8A6E30348f82b0085';

async function main() {
  const [signer] = await ethers.getSigners();
  console.log('Probing old roleManager functions...\n');
  
  // Try various ABI combinations to discover what functions exist
  const testCalls = [
    ['owner()', 'function owner() view returns (address)'],
    ['tierRegistry()', 'function tierRegistry() view returns (address)'],
    ['usageTracker()', 'function usageTracker() view returns (address)'],
    ['userTiers(address,bytes32)', 'function userTiers(address, bytes32) view returns (uint8)'],
    ['getTier(address,bytes32)', 'function getTier(address, bytes32) view returns (uint8)'],
    ['getUserTier(address,bytes32)', 'function getUserTier(address, bytes32) view returns (uint8)'],
    ['memberTiers(address,bytes32)', 'function memberTiers(address, bytes32) view returns (uint8)'],
    ['membershipTiers(address,bytes32)', 'function membershipTiers(address, bytes32) view returns (uint8)'],
    ['tierMetadata(bytes32,uint8)', 'function tierMetadata(bytes32, uint8) view returns (tuple(uint256,uint256,uint256,uint256))'],
    ['NONE()', 'function NONE() view returns (uint8)'],
    ['BRONZE()', 'function BRONZE() view returns (uint8)'],
  ];
  
  const marketMakerRole = '0x75e5bf8b7de9fd9f24c97951733c6410a040b7a07b543096cb36c6dda365aa8b';
  
  for (const [sig, abi] of testCalls) {
    try {
      const contract = new ethers.Contract(OLD_ROLE_MANAGER, [abi], ethers.provider);
      const funcName = sig.split('(')[0];
      
      let result;
      if (sig.includes('address,bytes32')) {
        result = await contract[funcName](FACTORY_V5, marketMakerRole);
      } else if (sig.includes('bytes32,uint8')) {
        result = await contract[funcName](marketMakerRole, 4);
      } else {
        result = await contract[funcName]();
      }
      console.log(`✓ ${sig}: ${result}`);
    } catch (e) {
      console.log(`✗ ${sig}: reverted`);
    }
  }
  
  // Try grantTier
  console.log('\n--- Trying grantTier ---');
  const grantAbi = 'function grantTier(address user, bytes32 role, uint8 tier, uint256 durationSeconds)';
  const rm = new ethers.Contract(OLD_ROLE_MANAGER, [grantAbi], signer);
  
  try {
    // Estimate gas first
    const gas = await rm.grantTier.estimateGas(FACTORY_V5, marketMakerRole, 4, 3153600000);
    console.log('grantTier estimated gas:', gas.toString());
  } catch (e) {
    console.log('grantTier estimate failed:', e.message.slice(0, 200));
  }
}

main().catch(console.error);
