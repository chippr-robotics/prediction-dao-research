const { ethers } = require('hardhat');

async function main() {
  const [signer] = await ethers.getSigners();
  console.log('Signer:', signer.address);

  const registry = await ethers.getContractAt('NullifierRegistry', '0x239C06E7AD066b5087Ed84686475f04f364ACBb7');
  const role = await registry.NULLIFIER_ADMIN_ROLE();
  const user = '0xB8594B2d60261C89E49B9D64C7165B2f33fFB90E';

  console.log('Granting NULLIFIER_ADMIN_ROLE to', user);
  const tx = await registry.grantRole(role, user);
  await tx.wait();
  console.log('Done! hasRole:', await registry.hasRole(role, user));
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
