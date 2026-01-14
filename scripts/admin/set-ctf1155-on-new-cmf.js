const { ethers } = require('hardhat');

async function main() {
  const NEW_CMF = '0xd6F4a7059Ed5E1dc7fC8123768C5BC0fbc54A93a';
  const CTF1155 = '0xE56d9034591C6A6A5C023883354FAeB435E3b441';
  
  console.log('Setting CTF1155 on new ConditionalMarketFactory...');
  console.log('New CMF:', NEW_CMF);
  console.log('CTF1155:', CTF1155);
  
  const [signer] = await ethers.getSigners();
  console.log('Signer:', signer.address);
  
  const cmf = await ethers.getContractAt('ConditionalMarketFactory', NEW_CMF);
  
  // Check current state
  const currentCTF = await cmf.ctf1155();
  console.log('\nCurrent ctf1155:', currentCTF);
  
  if (currentCTF !== ethers.ZeroAddress) {
    console.log('CTF1155 already set!');
    return;
  }
  
  // Set CTF1155
  console.log('\nSetting CTF1155...');
  const tx = await cmf.setCTF1155(CTF1155);
  console.log('TX hash:', tx.hash);
  await tx.wait();
  console.log('Confirmed!');
  
  // Verify
  const newCTF = await cmf.ctf1155();
  console.log('New ctf1155:', newCTF);
  
  if (newCTF.toLowerCase() === CTF1155.toLowerCase()) {
    console.log('\nSUCCESS: CTF1155 set correctly!');
  } else {
    console.log('\nERROR: CTF1155 not set correctly!');
  }
}

main().catch(console.error);
