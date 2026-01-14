const { ethers } = require('hardhat');
async function main() {
  const factory = await ethers.getContractAt('ConditionalMarketFactory', '0x37b9086Cc0d03C8a1030cC50256593B8D0d369Ac');
  const roleManager = await factory.roleManager();
  console.log('ConditionalMarketFactory roleManager:', roleManager);
  
  // Check if it has setRoleManager function - look at the ABI
  console.log('Checking for setRoleManager...');
  const artifact = await hre.artifacts.readArtifact('ConditionalMarketFactory');
  const hasSetRoleManager = artifact.abi.some(fn => fn.name === 'setRoleManager');
  console.log('Has setRoleManager:', hasSetRoleManager);
}
main().catch(console.error);
