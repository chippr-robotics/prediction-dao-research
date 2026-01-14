const { ethers } = require('hardhat');

async function main() {
  const NEW_CMF = '0xd6F4a7059Ed5E1dc7fC8123768C5BC0fbc54A93a';
  const OLD_CMF = '0x37b9086Cc0d03C8a1030cC50256593B8D0d369Ac';
  
  console.log('Checking CTF1155 configuration...\n');
  
  const newCMF = await ethers.getContractAt('ConditionalMarketFactory', NEW_CMF);
  const oldCMF = await ethers.getContractAt('ConditionalMarketFactory', OLD_CMF);
  
  try {
    const newCTF = await newCMF.ctf1155();
    console.log('New CMF ctf1155:', newCTF);
  } catch (e) {
    console.log('New CMF ctf1155: ERROR -', e.message.slice(0, 50));
  }
  
  try {
    const oldCTF = await oldCMF.ctf1155();
    console.log('Old CMF ctf1155:', oldCTF);
  } catch (e) {
    console.log('Old CMF ctf1155: ERROR -', e.message.slice(0, 50));
  }
  
  // Also check owner
  try {
    const newOwner = await newCMF.owner();
    console.log('\nNew CMF owner:', newOwner);
  } catch (e) {
    console.log('New CMF owner: ERROR -', e.message.slice(0, 50));
  }
}

main().catch(console.error);
