const { ethers } = require('hardhat');

async function main() {
  const OLD_ROLE_MANAGER = '0x3759B1F153193471Dd48401eE198F664f2d7FeB8';
  const NEW_ROLE_MANAGER = '0xA6F794292488C628f91A0475dDF8dE6cEF2706EF';
  
  const oldCode = await ethers.provider.getCode(OLD_ROLE_MANAGER);
  const newCode = await ethers.provider.getCode(NEW_ROLE_MANAGER);
  
  console.log('Old roleManager bytecode length:', oldCode.length);
  console.log('New roleManager bytecode length:', newCode.length);
  console.log('Same bytecode:', oldCode === newCode);
  
  // Check first 100 chars
  console.log('\nOld first 100:', oldCode.slice(0, 100));
  console.log('New first 100:', newCode.slice(0, 100));
}

main().catch(console.error);
