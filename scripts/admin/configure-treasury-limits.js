const { ethers } = require('hardhat');

/**
 * Configure TreasuryVault spending limits for production security
 *
 * This script sets up:
 * - Transaction limits (max per single withdrawal)
 * - Rate limits (max per time period)
 * - Authorized spenders
 *
 * RECOMMENDED PRODUCTION SETUP:
 * 1. Transfer ownership to a multi-sig (Safe) wallet
 * 2. Set conservative transaction limits
 * 3. Set rate limits to prevent rapid draining
 * 4. Add multiple authorized spenders for oversight
 *
 * Usage:
 *   FLOPPY_KEYSTORE_PASSWORD=password npx hardhat run scripts/admin/configure-treasury-limits.js --network mordor
 */

const TREASURY_VAULT_ADDRESS = '0x93F7ee39C02d99289E3c29696f1F3a70656d0772';
const FAIRWINS_TOKEN_ADDRESS = '0xec6Ed68627749b9C244a25A6d0bAC8962043fdcB';

// Configuration parameters - adjust for production
const CONFIG = {
  // ETH (ETC) limits
  eth: {
    // Max per single transaction (10 ETC)
    transactionLimit: ethers.parseEther('10'),
    // Rate limit: max 50 ETC per day
    rateLimitPeriod: 86400, // 1 day in seconds
    periodLimit: ethers.parseEther('50')
  },
  // FairWins Token limits
  fairWins: {
    // Max per single transaction (1000 FWN)
    transactionLimit: ethers.parseEther('1000'),
    // Rate limit: max 5000 FWN per day
    rateLimitPeriod: 86400,
    periodLimit: ethers.parseEther('5000')
  },
  // Additional authorized spenders (optional)
  // Set to empty array to skip
  additionalSpenders: []
};

async function main() {
  console.log('='.repeat(60));
  console.log('Configure TreasuryVault Spending Limits');
  console.log('='.repeat(60));

  const [signer] = await ethers.getSigners();
  console.log('Signer:', signer.address);

  // Get TreasuryVault contract
  const treasury = await ethers.getContractAt('TreasuryVault', TREASURY_VAULT_ADDRESS);

  // Check ownership
  const owner = await treasury.owner();
  console.log('\nTreasury Owner:', owner);
  const isOwner = owner.toLowerCase() === signer.address.toLowerCase();

  if (!isOwner) {
    console.log('\nWARNING: You are not the owner of the TreasuryVault.');
    console.log('Only the owner can configure spending limits.');
    console.log('Current owner:', owner);
    process.exit(1);
  }

  // Display current state
  console.log('\n--- Current Configuration ---');
  const ethBalance = await treasury.getETHBalance();
  console.log('ETH Balance:', ethers.formatEther(ethBalance), 'ETC');

  try {
    const fwnBalance = await treasury.getTokenBalance(FAIRWINS_TOKEN_ADDRESS);
    console.log('FWN Balance:', ethers.formatEther(fwnBalance), 'FWN');
  } catch (e) {
    console.log('FWN Balance: Unable to fetch');
  }

  const isPaused = await treasury.paused();
  console.log('Paused:', isPaused);

  // Current limits
  const currentEthTxLimit = await treasury.transactionLimit(ethers.ZeroAddress);
  const currentEthRatePeriod = await treasury.rateLimitPeriod(ethers.ZeroAddress);
  const currentEthPeriodLimit = await treasury.periodLimit(ethers.ZeroAddress);

  console.log('\nCurrent ETH Limits:');
  console.log('  Transaction Limit:', currentEthTxLimit > 0 ? ethers.formatEther(currentEthTxLimit) + ' ETC' : 'Unlimited');
  console.log('  Rate Period:', currentEthRatePeriod > 0 ? `${currentEthRatePeriod}s` : 'None');
  console.log('  Period Limit:', currentEthPeriodLimit > 0 ? ethers.formatEther(currentEthPeriodLimit) + ' ETC' : 'Unlimited');

  // Configure ETH limits
  console.log('\n--- Configuring ETH Limits ---');

  if (CONFIG.eth.transactionLimit > 0) {
    console.log('Setting ETH transaction limit to', ethers.formatEther(CONFIG.eth.transactionLimit), 'ETC...');
    const tx1 = await treasury.setTransactionLimit(ethers.ZeroAddress, CONFIG.eth.transactionLimit);
    await tx1.wait();
    console.log('Transaction limit set!');
  }

  if (CONFIG.eth.rateLimitPeriod > 0 && CONFIG.eth.periodLimit > 0) {
    console.log('Setting ETH rate limit:', ethers.formatEther(CONFIG.eth.periodLimit), 'ETC per', CONFIG.eth.rateLimitPeriod, 'seconds...');
    const tx2 = await treasury.setRateLimit(ethers.ZeroAddress, CONFIG.eth.rateLimitPeriod, CONFIG.eth.periodLimit);
    await tx2.wait();
    console.log('Rate limit set!');
  }

  // Configure FairWins token limits
  console.log('\n--- Configuring FairWins Token Limits ---');

  if (CONFIG.fairWins.transactionLimit > 0) {
    console.log('Setting FWN transaction limit to', ethers.formatEther(CONFIG.fairWins.transactionLimit), 'FWN...');
    const tx3 = await treasury.setTransactionLimit(FAIRWINS_TOKEN_ADDRESS, CONFIG.fairWins.transactionLimit);
    await tx3.wait();
    console.log('Transaction limit set!');
  }

  if (CONFIG.fairWins.rateLimitPeriod > 0 && CONFIG.fairWins.periodLimit > 0) {
    console.log('Setting FWN rate limit:', ethers.formatEther(CONFIG.fairWins.periodLimit), 'FWN per', CONFIG.fairWins.rateLimitPeriod, 'seconds...');
    const tx4 = await treasury.setRateLimit(FAIRWINS_TOKEN_ADDRESS, CONFIG.fairWins.rateLimitPeriod, CONFIG.fairWins.periodLimit);
    await tx4.wait();
    console.log('Rate limit set!');
  }

  // Add authorized spenders
  if (CONFIG.additionalSpenders.length > 0) {
    console.log('\n--- Adding Authorized Spenders ---');
    for (const spender of CONFIG.additionalSpenders) {
      const isAlreadyAuthorized = await treasury.isAuthorizedSpender(spender);
      if (!isAlreadyAuthorized) {
        console.log('Authorizing spender:', spender);
        const tx = await treasury.authorizeSpender(spender);
        await tx.wait();
        console.log('Spender authorized!');
      } else {
        console.log('Spender already authorized:', spender);
      }
    }
  }

  // Verify new configuration
  console.log('\n--- Verification ---');
  const newEthTxLimit = await treasury.transactionLimit(ethers.ZeroAddress);
  const newEthRatePeriod = await treasury.rateLimitPeriod(ethers.ZeroAddress);
  const newEthPeriodLimit = await treasury.periodLimit(ethers.ZeroAddress);
  const newFwnTxLimit = await treasury.transactionLimit(FAIRWINS_TOKEN_ADDRESS);
  const newFwnRatePeriod = await treasury.rateLimitPeriod(FAIRWINS_TOKEN_ADDRESS);
  const newFwnPeriodLimit = await treasury.periodLimit(FAIRWINS_TOKEN_ADDRESS);

  console.log('\nNew ETH Limits:');
  console.log('  Transaction Limit:', newEthTxLimit > 0 ? ethers.formatEther(newEthTxLimit) + ' ETC' : 'Unlimited');
  console.log('  Rate Period:', newEthRatePeriod > 0 ? `${newEthRatePeriod}s (${newEthRatePeriod / 3600} hours)` : 'None');
  console.log('  Period Limit:', newEthPeriodLimit > 0 ? ethers.formatEther(newEthPeriodLimit) + ' ETC' : 'Unlimited');

  console.log('\nNew FWN Limits:');
  console.log('  Transaction Limit:', newFwnTxLimit > 0 ? ethers.formatEther(newFwnTxLimit) + ' FWN' : 'Unlimited');
  console.log('  Rate Period:', newFwnRatePeriod > 0 ? `${newFwnRatePeriod}s (${newFwnRatePeriod / 3600} hours)` : 'None');
  console.log('  Period Limit:', newFwnPeriodLimit > 0 ? ethers.formatEther(newFwnPeriodLimit) + ' FWN' : 'Unlimited');

  console.log('\n' + '='.repeat(60));
  console.log('TREASURY CONFIGURATION COMPLETE');
  console.log('='.repeat(60));
  console.log('\nIMPORTANT: For production multi-sig security:');
  console.log('1. Deploy a Safe (Gnosis Safe) multi-sig wallet');
  console.log('2. Transfer TreasuryVault ownership to the Safe');
  console.log('3. Require 2-of-3 or 3-of-5 signatures for owner actions');
  console.log('4. Individual authorized spenders can only withdraw within limits');
  console.log('5. Ownership changes (via Safe) can adjust limits as needed');
  console.log('='.repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
