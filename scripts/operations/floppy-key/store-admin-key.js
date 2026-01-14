#!/usr/bin/env node
/**
 * Store admin/deployer private key on floppy disk
 *
 * Usage:
 *   ADMIN_PRIVATE_KEY="0x..." FLOPPY_KEYSTORE_PASSWORD="password" node scripts/operations/floppy-key/store-admin-key.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const CONFIG = require('./config');

const ADMIN_KEYSTORE_FILENAME = 'admin-keystore.json';

async function storeAdminKey() {
  console.log('='.repeat(50));
  console.log('Store Admin Private Key on Floppy');
  console.log('='.repeat(50));

  // Get private key from environment
  const privateKey = process.env.ADMIN_PRIVATE_KEY;
  if (!privateKey) {
    console.error('Error: ADMIN_PRIVATE_KEY environment variable not set');
    process.exit(1);
  }

  // Validate private key format
  if (!privateKey.match(/^0x[a-fA-F0-9]{64}$/)) {
    console.error('Error: Invalid private key format (expected 0x + 64 hex chars)');
    process.exit(1);
  }

  // Get password
  const password = process.env.FLOPPY_KEYSTORE_PASSWORD;
  if (!password) {
    console.error('Error: FLOPPY_KEYSTORE_PASSWORD environment variable not set');
    process.exit(1);
  }

  // Check floppy mount
  const keystoreDir = path.join(CONFIG.MOUNT_POINT, CONFIG.KEYSTORE_DIR);
  if (!fs.existsSync(CONFIG.MOUNT_POINT)) {
    console.error(`Error: Floppy not mounted at ${CONFIG.MOUNT_POINT}`);
    process.exit(1);
  }

  // Create keystore directory if needed
  if (!fs.existsSync(keystoreDir)) {
    fs.mkdirSync(keystoreDir, { recursive: true });
    console.log('Created keystore directory:', keystoreDir);
  }

  // Generate encryption parameters
  const salt = crypto.randomBytes(32);
  const iv = crypto.randomBytes(16);

  // Use lower scrypt params for this system (still secure, but less memory)
  const SCRYPT_N = 16384;  // 2^14 (lower than config's 2^18)
  const SCRYPT_R = 8;
  const SCRYPT_P = 1;
  const SCRYPT_DKLEN = 32;

  // Derive key using scrypt
  console.log('\nDeriving encryption key (this may take a moment)...');
  const derivedKey = crypto.scryptSync(
    password,
    salt,
    SCRYPT_DKLEN,
    {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P
    }
  );

  // Encrypt private key (remove 0x prefix for storage)
  const privateKeyBytes = Buffer.from(privateKey.slice(2), 'hex');
  const cipher = crypto.createCipheriv(CONFIG.CIPHER, derivedKey.slice(0, 16), iv);
  const encrypted = Buffer.concat([
    cipher.update(privateKeyBytes),
    cipher.final()
  ]);

  // Create MAC for integrity verification
  const mac = crypto.createHmac('sha256', derivedKey.slice(16, 32))
    .update(encrypted)
    .digest();

  // Build keystore JSON
  const keystore = {
    version: 1,
    type: 'admin-private-key',
    crypto: {
      cipher: CONFIG.CIPHER,
      ciphertext: encrypted.toString('hex'),
      cipherparams: {
        iv: iv.toString('hex')
      },
      kdf: 'scrypt',
      kdfparams: {
        n: SCRYPT_N,
        r: SCRYPT_R,
        p: SCRYPT_P,
        dklen: SCRYPT_DKLEN,
        salt: salt.toString('hex')
      },
      mac: mac.toString('hex')
    },
    meta: {
      createdAt: new Date().toISOString(),
      description: 'Admin/Deployer private key for Mordor testnet'
    }
  };

  // Derive address from private key for reference
  const { ethers } = require('ethers');
  const wallet = new ethers.Wallet(privateKey);
  keystore.address = wallet.address;

  // Write keystore file
  const keystorePath = path.join(keystoreDir, ADMIN_KEYSTORE_FILENAME);
  fs.writeFileSync(keystorePath, JSON.stringify(keystore, null, 2));
  fs.chmodSync(keystorePath, 0o600); // Owner read/write only

  console.log('\nAdmin key stored successfully!');
  console.log('Address:', wallet.address);
  console.log('Keystore path:', keystorePath);
  console.log('\nThe private key is now encrypted on the floppy disk.');
}

storeAdminKey().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
