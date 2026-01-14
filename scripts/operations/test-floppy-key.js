#!/usr/bin/env node
/**
 * Test floppy key - get address, receive funds, send back
 */
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// Load .env manually
const envPath = path.join(__dirname, '..', '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
}

// Import keystore functions
const { decryptMnemonic } = require('./floppy-key/keystore');
const CONFIG = require('./floppy-key/config');

const KEYSTORE_PATH = path.join(
  CONFIG.MOUNT_POINT,
  CONFIG.KEYSTORE_DIR,
  CONFIG.KEYSTORE_FILENAME
);

const RPC_URL = 'https://rpc.mordor.etccooperative.org';
const DEPLOYER_ADDRESS = '0x52502d049571C7893447b86c4d8B38e6184bF6e1';

async function main() {
  console.log('='.repeat(60));
  console.log('Floppy Key Test');
  console.log('='.repeat(60));

  // Check if keystore exists
  if (!fs.existsSync(KEYSTORE_PATH)) {
    console.error('Error: Keystore not found at', KEYSTORE_PATH);
    process.exit(1);
  }

  // Get password from environment
  const password = process.env.FLOPPY_PASSWORD;
  if (!password) {
    console.error('Error: FLOPPY_PASSWORD not set in environment');
    process.exit(1);
  }

  console.log('\nLoading keystore from:', KEYSTORE_PATH);
  const keystoreJson = fs.readFileSync(KEYSTORE_PATH, 'utf8');
  const keystore = JSON.parse(keystoreJson);
  console.log('Keystore ID:', keystore.id);
  console.log('Word count:', keystore.wordCount);

  // Decrypt mnemonic
  console.log('\nDecrypting mnemonic...');
  let mnemonic;
  try {
    mnemonic = await decryptMnemonic(keystore, password);
    console.log('Decryption successful!');
  } catch (e) {
    console.error('Decryption failed:', e.message);
    process.exit(1);
  }

  // Derive wallet from mnemonic (first account at index 0)
  console.log('\nDeriving wallet from mnemonic...');
  const wallet = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, "m/44'/60'/0'/0/0");

  console.log('\n' + '='.repeat(60));
  console.log('FLOPPY KEY ADDRESS:', wallet.address);
  console.log('='.repeat(60));

  // Connect to provider
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const connectedWallet = wallet.connect(provider);

  // Check balance
  const balance = await provider.getBalance(wallet.address);
  console.log('\nCurrent balance:', ethers.formatEther(balance), 'ETC');

  // Get command from args
  const command = process.argv[2];

  if (command === 'fund') {
    // Fund the floppy address from deployer
    console.log('\n--- Funding from deployer ---');

    const deployerKey = process.env.PRIVATE_KEY;
    if (!deployerKey || deployerKey === '0x0000000000000000000000000000000000000000000000000000000000000001') {
      console.error('Error: Valid PRIVATE_KEY not set for deployer');
      process.exit(1);
    }

    const deployerWallet = new ethers.Wallet(deployerKey, provider);
    console.log('Deployer address:', deployerWallet.address);

    const deployerBalance = await provider.getBalance(deployerWallet.address);
    console.log('Deployer balance:', ethers.formatEther(deployerBalance), 'ETC');

    const fundAmount = ethers.parseEther('0.1');
    console.log('\nSending', ethers.formatEther(fundAmount), 'ETC to floppy address...');

    const tx = await deployerWallet.sendTransaction({
      to: wallet.address,
      value: fundAmount
    });
    console.log('TX hash:', tx.hash);
    await tx.wait();
    console.log('Confirmed!');

    const newBalance = await provider.getBalance(wallet.address);
    console.log('New floppy balance:', ethers.formatEther(newBalance), 'ETC');

  } else if (command === 'return') {
    // Return funds to deployer
    console.log('\n--- Returning funds to deployer ---');

    if (balance === 0n) {
      console.log('No funds to return');
      process.exit(0);
    }

    // Estimate gas for transfer
    const gasPrice = (await provider.getFeeData()).gasPrice;
    const gasLimit = 21000n;
    const gasCost = gasPrice * gasLimit;

    // Keep some for gas, send the rest
    const sendAmount = balance - gasCost - ethers.parseEther('0.01'); // Keep 0.01 ETC buffer

    if (sendAmount <= 0n) {
      console.log('Balance too low to return (need to cover gas)');
      process.exit(0);
    }

    console.log('Sending', ethers.formatEther(sendAmount), 'ETC back to deployer...');

    const tx = await connectedWallet.sendTransaction({
      to: DEPLOYER_ADDRESS,
      value: sendAmount
    });
    console.log('TX hash:', tx.hash);
    await tx.wait();
    console.log('Confirmed!');

    const newBalance = await provider.getBalance(wallet.address);
    console.log('Remaining floppy balance:', ethers.formatEther(newBalance), 'ETC');

  } else {
    console.log('\nUsage:');
    console.log('  node scripts/test-floppy-key.js          # Show address and balance');
    console.log('  node scripts/test-floppy-key.js fund     # Fund from deployer');
    console.log('  node scripts/test-floppy-key.js return   # Return funds to deployer');
  }

  console.log('\n' + '='.repeat(60));
}

main().catch(console.error);
