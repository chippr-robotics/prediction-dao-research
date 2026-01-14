const { ethers } = require('hardhat');

async function main() {
  // Latest failed transaction
  const txHash = '0x56a341c01db2f886035fbd1b78921518598df14ab35b8da3c4f492cdba331a4d';
  
  console.log('Analyzing transaction:', txHash);
  
  // Get transaction receipt
  const receipt = await ethers.provider.getTransactionReceipt(txHash);
  console.log('\n--- Receipt ---');
  console.log('Status:', receipt.status);
  console.log('Gas used:', receipt.gasUsed.toString());
  console.log('Block:', receipt.blockNumber);
  console.log('Logs:', receipt.logs.length);
  
  // Get transaction details
  const tx = await ethers.provider.getTransaction(txHash);
  console.log('\n--- Transaction ---');
  console.log('From:', tx.from);
  console.log('To:', tx.to);
  console.log('Data:', tx.data);
  console.log('Data length:', tx.data?.length || 0);
  console.log('Value:', tx.value.toString());
  console.log('Gas limit:', tx.gasLimit.toString());
  
  // Decode the function call
  if (tx.data && tx.data.length > 10) {
    const selector = tx.data.slice(0, 10);
    console.log('\nFunction selector:', selector);
    
    // acceptMarket(uint256) selector should be keccak256("acceptMarket(uint256)").slice(0,10)
    const expectedSelector = ethers.id("acceptMarket(uint256)").slice(0, 10);
    console.log('Expected acceptMarket selector:', expectedSelector);
    console.log('Match:', selector === expectedSelector);
  }

  // Try to simulate at that block
  console.log('\n--- Replay at block ---');
  try {
    const result = await ethers.provider.call(
      {
        to: tx.to,
        from: tx.from,
        data: tx.data,
        value: tx.value,
        gasLimit: tx.gasLimit
      },
      receipt.blockNumber - 1
    );
    console.log('Simulation at block-1 result:', result);
  } catch (e) {
    console.log('Simulation failed:', e.message.slice(0, 200));
    if (e.data) {
      console.log('Error data:', e.data);
    }
  }
}

main().catch(console.error);
