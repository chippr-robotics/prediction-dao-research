const { ethers } = require('hardhat');
const { requireAddress } = require('./lib/addresses');

/**
 * Set Perpetual Futures Factory Creation Fee
 *
 * This script sets the creation fee for perpetual markets.
 * Only the contract owner can call this function.
 *
 * Usage:
 *   npx hardhat run scripts/admin/set-perp-creation-fee.js --network mordor
 *
 * To set a specific fee (in ETC):
 *   FEE=0.1 npx hardhat run scripts/admin/set-perp-creation-fee.js --network mordor
 *
 * Default behavior: Sets fee to 0 (free market creation for admins)
 */

async function main() {
  console.log('='.repeat(60));
  console.log('Set Perpetual Futures Factory Creation Fee');
  console.log('='.repeat(60));

  const network = await ethers.provider.getNetwork();
  console.log(`\nNetwork: ${network.name || 'unknown'} (Chain ID: ${network.chainId})`);

  const [signer] = await ethers.getSigners();
  console.log('Signer:', signer.address);
  console.log('Balance:', ethers.formatEther(await ethers.provider.getBalance(signer.address)), 'ETC');

  // Get factory address from shared config
  const perpFactoryAddress = requireAddress('perpFactory');
  console.log('\nPerpFactory:', perpFactoryAddress);

  // Get factory contract
  const factory = await ethers.getContractAt(
    'PerpetualFuturesFactory',
    perpFactoryAddress
  );

  // Check current fee
  const currentFee = await factory.creationFee();
  console.log(`Current creation fee: ${ethers.formatEther(currentFee)} ETC`);

  // Check ownership
  const owner = await factory.owner();
  console.log(`Contract owner: ${owner}`);

  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    console.error('\nERROR: Signer is not the contract owner');
    console.log('Only the owner can set the creation fee');
    process.exit(1);
  }

  // Get new fee from environment or default to 0
  const newFeeEther = process.env.FEE || '0';
  const newFee = ethers.parseEther(newFeeEther);

  if (currentFee === newFee) {
    console.log(`\nCreation fee is already ${newFeeEther} ETC. No change needed.`);
    return;
  }

  console.log(`\nSetting creation fee to: ${newFeeEther} ETC`);

  // Send transaction
  const tx = await factory.setCreationFee(newFee);
  console.log(`Transaction hash: ${tx.hash}`);

  const receipt = await tx.wait();
  console.log(`Transaction confirmed in block: ${receipt.blockNumber}`);

  // Verify new fee
  const updatedFee = await factory.creationFee();
  console.log(`\nUpdated creation fee: ${ethers.formatEther(updatedFee)} ETC`);

  console.log('\n' + '='.repeat(60));
  console.log('CREATION FEE UPDATE COMPLETE');
  console.log('='.repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
