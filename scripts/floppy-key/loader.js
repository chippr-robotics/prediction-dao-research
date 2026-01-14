/**
 * Hardhat configuration loader for floppy keystore
 * Use this to load mnemonic from floppy disk in hardhat.config.js
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { decryptMnemonic } = require('./keystore');
const CONFIG = require('./config');

const KEYSTORE_PATH = path.join(
  CONFIG.MOUNT_POINT,
  CONFIG.KEYSTORE_DIR,
  CONFIG.KEYSTORE_FILENAME
);

// Cache for session to avoid repeated password prompts
let cachedMnemonic = null;

/**
 * Check if floppy is mounted
 */
function isFloppyMounted() {
  try {
    const { execSync } = require('child_process');
    execSync(`mountpoint -q "${CONFIG.MOUNT_POINT}"`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if keystore exists
 */
function keystoreExists() {
  return fs.existsSync(KEYSTORE_PATH);
}

/**
 * Prompt for password (synchronous for config loading)
 */
function promptPasswordSync(prompt) {
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
 * Load mnemonic from floppy keystore
 * Caches the result for the session to avoid repeated prompts
 *
 * @returns {Promise<string>} The decrypted mnemonic
 * @throws {Error} If floppy not mounted or keystore not found
 */
async function loadMnemonicFromFloppy() {
  // Return cached mnemonic if available
  if (cachedMnemonic) {
    return cachedMnemonic;
  }

  // Check if floppy is mounted
  if (!isFloppyMounted()) {
    throw new Error(
      `Floppy not mounted at ${CONFIG.MOUNT_POINT}. ` +
      'Run: npm run floppy:mount'
    );
  }

  // Check if keystore exists
  if (!keystoreExists()) {
    throw new Error(
      `Keystore not found at ${KEYSTORE_PATH}. ` +
      'Run: npm run floppy:create'
    );
  }

  // Read keystore
  const keystoreJson = fs.readFileSync(KEYSTORE_PATH, 'utf8');
  const keystore = JSON.parse(keystoreJson);

  // Get password from environment or prompt
  let password = process.env.FLOPPY_KEYSTORE_PASSWORD;

  if (!password) {
    console.log('\n[Floppy Keystore] Password required for network operations');
    password = await promptPasswordSync('Enter floppy keystore password: ');
  }

  // Decrypt
  cachedMnemonic = await decryptMnemonic(keystore, password);

  // Clear password from memory
  password = '';

  return cachedMnemonic;
}

/**
 * Get HD wallet accounts config for Hardhat
 * Returns a function that loads the mnemonic lazily
 *
 * @param {object} options - HD wallet options
 * @param {number} options.count - Number of accounts to derive (default: 10)
 * @param {number} options.initialIndex - Starting index (default: 0)
 * @param {string} options.path - Derivation path (default: "m/44'/60'/0'/0")
 * @returns {object} Hardhat accounts config
 */
function getFloppyAccounts(options = {}) {
  const {
    count = 10,
    initialIndex = 0,
    path: derivationPath = "m/44'/60'/0'/0"
  } = options;

  // Return config that will load mnemonic when needed
  return {
    mnemonic: '', // Placeholder - will be replaced at runtime
    count,
    initialIndex,
    path: derivationPath,
    // Custom loader that Hardhat will call
    _loadMnemonic: loadMnemonicFromFloppy
  };
}

/**
 * Create accounts config array from floppy mnemonic
 * Derives private keys directly for networks that need them
 *
 * @param {object} options - Options
 * @param {number} options.count - Number of accounts (default: 10)
 * @param {number} options.initialIndex - Starting index (default: 0)
 * @returns {Promise<string[]>} Array of private keys
 */
async function getFloppyPrivateKeys(options = {}) {
  const {
    count = 10,
    initialIndex = 0
  } = options;

  const mnemonic = await loadMnemonicFromFloppy();

  // Use ethers to derive private keys from mnemonic
  const { HDNodeWallet } = require('ethers');

  const keys = [];
  const masterNode = HDNodeWallet.fromPhrase(mnemonic);

  for (let i = initialIndex; i < initialIndex + count; i++) {
    const wallet = masterNode.derivePath(`m/44'/60'/0'/0/${i}`);
    keys.push(wallet.privateKey);
  }

  return keys;
}

/**
 * Clear cached mnemonic (call on process exit)
 */
function clearCache() {
  cachedMnemonic = null;
}

// Clear cache on process exit
process.on('exit', clearCache);
process.on('SIGINT', () => {
  clearCache();
  process.exit();
});
process.on('SIGTERM', () => {
  clearCache();
  process.exit();
});

module.exports = {
  loadMnemonicFromFloppy,
  getFloppyAccounts,
  getFloppyPrivateKeys,
  isFloppyMounted,
  keystoreExists,
  clearCache,
  CONFIG
};
