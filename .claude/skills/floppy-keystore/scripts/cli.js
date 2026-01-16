#!/usr/bin/env node
/**
 * Floppy Disk Keystore Manager CLI
 *
 * Commands:
 *   mount     - Mount the floppy disk securely
 *   unmount   - Sync and unmount the floppy disk
 *   create    - Create a new encrypted mnemonic keystore
 *   test      - Test keystore decryption
 *   info      - Show keystore information
 *   help      - Show this help message
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');
const { encryptMnemonic, decryptMnemonic } = require('./keystore');
const CONFIG = require('./config');

const KEYSTORE_PATH = path.join(
  CONFIG.MOUNT_POINT,
  CONFIG.KEYSTORE_DIR,
  CONFIG.KEYSTORE_FILENAME
);

/**
 * Prompt for password without echoing
 */
function promptPassword(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true
    });

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    process.stdout.write(prompt);

    let password = '';
    process.stdin.on('data', function handler(char) {
      const c = char.toString();

      if (c === '\n' || c === '\r' || c === '\u0004') {
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        process.stdin.removeListener('data', handler);
        rl.close();
        console.log();
        resolve(password);
      } else if (c === '\u0003') {
        process.exit(1);
      } else if (c === '\u007f' || c === '\b') {
        password = password.slice(0, -1);
      } else if (c.charCodeAt(0) >= 32) {
        password += c;
      }
    });
  });
}

/**
 * Prompt for text input
 */
function promptInput(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Check if floppy is mounted
 */
function isMounted() {
  try {
    execSync(`mountpoint -q "${CONFIG.MOUNT_POINT}"`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Mount the floppy disk
 */
function mountFloppy() {
  const scriptPath = path.join(__dirname, 'mount.sh');
  execSync(`bash "${scriptPath}"`, { stdio: 'inherit' });
}

/**
 * Unmount the floppy disk
 */
function unmountFloppy() {
  const scriptPath = path.join(__dirname, 'unmount.sh');
  execSync(`bash "${scriptPath}"`, { stdio: 'inherit' });
}

/**
 * Create a new encrypted keystore
 */
async function createKeystore() {
  if (!isMounted()) {
    console.log('Mounting floppy disk...');
    mountFloppy();
  }

  if (fs.existsSync(KEYSTORE_PATH)) {
    console.error('Error: Keystore already exists at', KEYSTORE_PATH);
    console.error('Remove it first to create a new one.');
    process.exit(1);
  }

  console.log('\n=== Create Encrypted Mnemonic Keystore ===\n');
  console.log('Enter your BIP-39 mnemonic phrase (12 or 24 words):');

  const mnemonic = await promptInput('> ');

  const password = await promptPassword('Enter encryption password (min 8 chars): ');

  if (password.length < 8) {
    console.error('Error: Password must be at least 8 characters');
    process.exit(1);
  }

  const passwordConfirm = await promptPassword('Confirm password: ');

  if (password !== passwordConfirm) {
    console.error('Error: Passwords do not match');
    process.exit(1);
  }

  console.log('\nEncrypting mnemonic...');

  try {
    const keystore = await encryptMnemonic(mnemonic, password);

    // Create keystore directory if needed
    const keystoreDir = path.dirname(KEYSTORE_PATH);
    if (!fs.existsSync(keystoreDir)) {
      fs.mkdirSync(keystoreDir, { mode: 0o700, recursive: true });
    }

    // Write keystore with restricted permissions
    fs.writeFileSync(
      KEYSTORE_PATH,
      JSON.stringify(keystore, null, 2),
      { mode: 0o600 }
    );

    // Sync to ensure data is written to floppy
    execSync('sync');

    console.log('\nKeystore created successfully!');
    console.log('Location:', KEYSTORE_PATH);
    console.log('Word count:', keystore.wordCount);
    console.log('ID:', keystore.id);
    console.log('\nRemember to unmount the floppy when done.');

  } catch (error) {
    console.error('Error creating keystore:', error.message);
    process.exit(1);
  }
}

/**
 * Test keystore decryption
 */
async function testKeystore() {
  if (!isMounted()) {
    console.error('Error: Floppy not mounted');
    console.error('Run mount command first');
    process.exit(1);
  }

  if (!fs.existsSync(KEYSTORE_PATH)) {
    console.error('Error: Keystore not found at', KEYSTORE_PATH);
    process.exit(1);
  }

  console.log('\n=== Test Keystore Decryption ===\n');

  const keystoreJson = fs.readFileSync(KEYSTORE_PATH, 'utf8');
  const keystore = JSON.parse(keystoreJson);

  console.log('Keystore ID:', keystore.id);
  console.log('Word count:', keystore.wordCount);

  const password = await promptPassword('Enter keystore password: ');

  try {
    console.log('\nDecrypting...');
    const mnemonic = await decryptMnemonic(keystore, password);

    console.log('\nDecryption successful!');
    console.log('Word count verified:', mnemonic.split(' ').length);
    // Don't print the actual mnemonic for security

  } catch (error) {
    console.error('\nDecryption failed:', error.message);
    process.exit(1);
  }
}

/**
 * Show keystore info
 */
function showInfo() {
  console.log('\n=== Floppy Keystore Info ===\n');

  if (!isMounted()) {
    console.log('Floppy status: NOT MOUNTED');
    console.log('Run mount command to access keystore');
    return;
  }

  console.log('Floppy status: MOUNTED at', CONFIG.MOUNT_POINT);

  // Check mnemonic keystore
  if (!fs.existsSync(KEYSTORE_PATH)) {
    console.log('Mnemonic keystore: NOT FOUND');
  } else {
    const keystoreJson = fs.readFileSync(KEYSTORE_PATH, 'utf8');
    const keystore = JSON.parse(keystoreJson);

    console.log('Mnemonic keystore: FOUND');
    console.log('  ID:', keystore.id);
    console.log('  Type:', keystore.type);
    console.log('  Word count:', keystore.wordCount);
    console.log('  KDF:', keystore.crypto.kdf);
    console.log('  Cipher:', keystore.crypto.cipher);
  }

  // Check admin keystore
  const adminKeystorePath = path.join(
    CONFIG.MOUNT_POINT,
    CONFIG.KEYSTORE_DIR,
    CONFIG.ADMIN_KEYSTORE_FILENAME
  );

  if (!fs.existsSync(adminKeystorePath)) {
    console.log('\nAdmin keystore: NOT FOUND');
  } else {
    const keystoreJson = fs.readFileSync(adminKeystorePath, 'utf8');
    const keystore = JSON.parse(keystoreJson);

    console.log('\nAdmin keystore: FOUND');
    console.log('  Type:', keystore.type);
    console.log('  Address:', keystore.address);
    console.log('  Created:', keystore.meta?.createdAt || 'unknown');
  }
}

/**
 * Print usage help
 */
function showHelp() {
  console.log(`
Floppy Disk Keystore Manager

Commands:
  mount     - Mount the floppy disk securely
  unmount   - Sync and unmount the floppy disk
  create    - Create a new encrypted mnemonic keystore
  test      - Test decryption of the keystore
  info      - Show keystore information
  help      - Show this help message

Environment variables:
  FLOPPY_DEVICE - Device path (default: /dev/sde)
  FLOPPY_MOUNT  - Mount point (default: /mnt/floppy)

Security notes:
  - Store floppy in secure location when not in use
  - Use strong password (16+ characters recommended)
  - Never share your mnemonic phrase
  - Unmount floppy immediately after use
`);
}

// Main CLI handler
const command = process.argv[2];

switch (command) {
  case 'mount':
    mountFloppy();
    break;
  case 'unmount':
    unmountFloppy();
    break;
  case 'create':
    createKeystore().catch(console.error);
    break;
  case 'test':
    testKeystore().catch(console.error);
    break;
  case 'info':
    showInfo();
    break;
  case 'help':
  case '--help':
  case '-h':
    showHelp();
    break;
  default:
    showHelp();
}
