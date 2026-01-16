#!/usr/bin/env node
/**
 * Floppy Disk Keystore Manager CLI
 *
 * Multi-chain key management from encrypted floppy disk storage.
 *
 * Commands:
 *   mount           - Mount the floppy disk securely
 *   unmount         - Sync and unmount the floppy disk
 *   create          - Create a new encrypted mnemonic keystore
 *   test            - Test keystore decryption
 *   info            - Show keystore information
 *   chains          - List supported blockchain chains
 *   derive <chain>  - Derive keys for a specific chain
 *   address <chain> - Show addresses for a specific chain
 *   help            - Show this help message
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');
const { encryptMnemonic, decryptMnemonic } = require('./keystore');
const { deriveKeys, getChainSummary } = require('./chains');
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
  console.log('This mnemonic will be used to derive keys for ALL supported chains:');
  console.log('  - Ethereum (ETH) and EVM chains');
  console.log('  - Bitcoin (BTC) - Legacy, SegWit, Taproot');
  console.log('  - Zcash (ZEC) - Transparent addresses');
  console.log('  - Monero (XMR) - Derived from BIP-39');
  console.log('  - Solana (SOL)');
  console.log('');
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
    console.log('\nYou can now derive keys for any supported chain.');
    console.log('Run: node cli.js chains  - to see supported chains');
    console.log('Run: node cli.js derive ethereum  - to derive Ethereum keys');
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
    console.log('\nMnemonic keystore: NOT FOUND');
  } else {
    const keystoreJson = fs.readFileSync(KEYSTORE_PATH, 'utf8');
    const keystore = JSON.parse(keystoreJson);

    console.log('\nMnemonic keystore: FOUND');
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

  console.log('\n=== Supported Chains ===\n');
  const chains = getChainSummary();
  chains.forEach(chain => {
    console.log(`  ${chain.symbol.padEnd(5)} - ${chain.name} (${chain.curve})`);
  });
}

/**
 * List supported chains
 */
function listChains() {
  console.log('\n=== Supported Blockchain Chains ===\n');

  const chains = getChainSummary();

  chains.forEach(chain => {
    console.log(`${chain.name} (${chain.symbol})`);
    console.log(`  ID:         ${chain.id}`);
    console.log(`  Curve:      ${chain.curve}`);
    console.log(`  Path:       ${chain.derivationPath}`);
    console.log(`  Networks:   ${chain.networks.join(', ')}`);
    if (chain.addressTypes) {
      console.log(`  Addr Types: ${chain.addressTypes.join(', ')}`);
    }
    console.log('');
  });

  console.log('Aliases:');
  Object.entries(CONFIG.CHAIN_ALIASES).forEach(([alias, chain]) => {
    console.log(`  ${alias} -> ${chain}`);
  });
}

/**
 * Derive keys for a specific chain
 */
async function deriveChainKeys(chainId, options = {}) {
  if (!isMounted()) {
    console.error('Error: Floppy not mounted');
    process.exit(1);
  }

  if (!fs.existsSync(KEYSTORE_PATH)) {
    console.error('Error: Keystore not found');
    process.exit(1);
  }

  const chain = CONFIG.getChainConfig(chainId);
  if (!chain) {
    console.error(`Error: Unknown chain '${chainId}'`);
    console.error('Run: node cli.js chains  - to see supported chains');
    process.exit(1);
  }

  console.log(`\n=== Derive ${chain.name} (${chain.symbol}) Keys ===\n`);

  // Get password
  let password = process.env.FLOPPY_KEYSTORE_PASSWORD;
  if (!password) {
    password = await promptPassword('Enter keystore password: ');
  }

  // Decrypt mnemonic
  const keystoreJson = fs.readFileSync(KEYSTORE_PATH, 'utf8');
  const keystore = JSON.parse(keystoreJson);

  console.log('\nDecrypting mnemonic...');
  const mnemonic = await decryptMnemonic(keystore, password);

  // Parse options
  const count = parseInt(options.count) || 1;
  const startIndex = parseInt(options.start) || 0;
  const addressType = options.type || null;

  console.log(`\nDeriving ${count} key(s) starting at index ${startIndex}...`);
  if (addressType) {
    console.log(`Address type: ${addressType}`);
  }

  try {
    const keys = await deriveKeys(mnemonic, chainId, { count, startIndex, addressType });

    console.log('\n--- Derived Keys ---\n');

    keys.forEach((key, i) => {
      console.log(`Account ${key.index}:`);
      console.log(`  Path:    ${key.path}`);
      console.log(`  Address: ${key.address}`);

      // For Monero, show both keys
      if (key.privateSpendKey) {
        console.log(`  Spend Key: ${key.privateSpendKey.slice(0, 16)}...`);
        console.log(`  View Key:  ${key.privateViewKey.slice(0, 16)}...`);
      } else {
        console.log(`  Private: ${key.privateKey.slice(0, 16)}...`);
      }

      if (key.addressType) {
        console.log(`  Type:    ${key.addressType}`);
      }
      if (key.note) {
        console.log(`  Note:    ${key.note}`);
      }
      console.log('');
    });

  } catch (error) {
    console.error('Error deriving keys:', error.message);
    process.exit(1);
  }
}

/**
 * Show addresses for a chain (without showing private keys)
 */
async function showAddresses(chainId, options = {}) {
  if (!isMounted()) {
    console.error('Error: Floppy not mounted');
    process.exit(1);
  }

  if (!fs.existsSync(KEYSTORE_PATH)) {
    console.error('Error: Keystore not found');
    process.exit(1);
  }

  const chain = CONFIG.getChainConfig(chainId);
  if (!chain) {
    console.error(`Error: Unknown chain '${chainId}'`);
    process.exit(1);
  }

  console.log(`\n=== ${chain.name} (${chain.symbol}) Addresses ===\n`);

  let password = process.env.FLOPPY_KEYSTORE_PASSWORD;
  if (!password) {
    password = await promptPassword('Enter keystore password: ');
  }

  const keystoreJson = fs.readFileSync(KEYSTORE_PATH, 'utf8');
  const keystore = JSON.parse(keystoreJson);

  console.log('\nDecrypting...');
  const mnemonic = await decryptMnemonic(keystore, password);

  const count = parseInt(options.count) || 5;
  const startIndex = parseInt(options.start) || 0;
  const addressType = options.type || null;

  try {
    const keys = await deriveKeys(mnemonic, chainId, { count, startIndex, addressType });

    console.log('');
    keys.forEach(key => {
      const typeStr = key.addressType ? ` (${key.addressType})` : '';
      console.log(`[${key.index}] ${key.address}${typeStr}`);
    });
    console.log('');

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

/**
 * Print usage help
 */
function showHelp() {
  console.log(`
Floppy Disk Keystore Manager - Multi-Chain Support

Commands:
  mount              - Mount the floppy disk securely
  unmount            - Sync and unmount the floppy disk
  create             - Create a new encrypted mnemonic keystore
  test               - Test keystore decryption
  info               - Show keystore information and supported chains
  chains             - List all supported blockchain chains
  derive <chain>     - Derive keys for a specific chain
  address <chain>    - Show addresses for a chain (no private keys)
  help               - Show this help message

Derive Options:
  --count=N          - Number of accounts to derive (default: 1)
  --start=N          - Starting index (default: 0)
  --type=TYPE        - Address type (for Bitcoin: legacy, segwit, nativeSegwit, taproot)

Examples:
  node cli.js derive ethereum --count=5
  node cli.js derive bitcoin --type=nativeSegwit --count=3
  node cli.js derive solana --count=2
  node cli.js address monero --count=10

Supported Chains:
  ethereum (eth)     - Ethereum and EVM chains
  bitcoin (btc)      - Bitcoin (multiple address types)
  zcash (zec)        - Zcash transparent addresses
  monero (xmr)       - Monero (derived from BIP-39)
  solana (sol)       - Solana
  ethereumClassic    - Ethereum Classic

Environment Variables:
  FLOPPY_DEVICE              - Device path (default: /dev/sde)
  FLOPPY_MOUNT               - Mount point (default: /mnt/floppy)
  FLOPPY_KEYSTORE_PASSWORD   - Keystore password (for non-interactive use)

Security Notes:
  - Store floppy in secure location when not in use
  - Use strong password (16+ characters recommended)
  - Never share your mnemonic phrase
  - Unmount floppy immediately after use
  - The same mnemonic derives keys for ALL chains
`);
}

/**
 * Parse command line options
 */
function parseOptions(args) {
  const options = {};
  args.forEach(arg => {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      options[key] = value || true;
    }
  });
  return options;
}

// Main CLI handler
const args = process.argv.slice(2);
const command = args[0];
const subcommand = args[1];
const options = parseOptions(args.slice(2));

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

  case 'chains':
    listChains();
    break;

  case 'derive':
    if (!subcommand) {
      console.error('Error: Please specify a chain (e.g., derive ethereum)');
      process.exit(1);
    }
    deriveChainKeys(subcommand, options).catch(console.error);
    break;

  case 'address':
  case 'addresses':
    if (!subcommand) {
      console.error('Error: Please specify a chain (e.g., address bitcoin)');
      process.exit(1);
    }
    showAddresses(subcommand, options).catch(console.error);
    break;

  case 'help':
  case '--help':
  case '-h':
    showHelp();
    break;

  default:
    showHelp();
}
