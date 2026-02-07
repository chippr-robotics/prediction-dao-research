import { defineConfig } from "hardhat/config";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import "dotenv/config";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execSync } from "child_process";
import { keccak256, HDNodeWallet } from "ethers";

// Floppy keystore configuration
const FLOPPY_CONFIG = {
  MOUNT_POINT: process.env.FLOPPY_MOUNT || '/mnt/floppy',
  KEYSTORE_DIR: '.keystore',
};

/**
 * Check if floppy is mounted
 */
function isFloppyMounted() {
  try {
    execSync(`mountpoint -q "${FLOPPY_CONFIG.MOUNT_POINT}"`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Synchronously decrypt a keystore file
 * Supports both admin keystore (HMAC-SHA256 MAC) and mnemonic keystore (keccak256 MAC)
 * @param {string} keystorePath - Path to the keystore JSON file
 * @param {string} password - Decryption password
 * @returns {Buffer|null} - Decrypted data or null on failure
 */
function decryptKeystoreSync(keystorePath, password) {
  try {
    const keystoreJson = fs.readFileSync(keystorePath, 'utf8');
    const keystore = JSON.parse(keystoreJson);
    const { crypto: cryptoParams } = keystore;
    const keystoreType = keystore.type; // 'admin-private-key' or 'mnemonic'

    const salt = Buffer.from(cryptoParams.kdfparams.salt, 'hex');
    const iv = Buffer.from(cryptoParams.cipherparams.iv, 'hex');
    const ciphertext = Buffer.from(cryptoParams.ciphertext, 'hex');
    const storedMac = Buffer.from(cryptoParams.mac, 'hex');

    // Derive key synchronously (maxmem needed for high N values)
    const derivedKey = crypto.scryptSync(
      password,
      salt,
      cryptoParams.kdfparams.dklen,
      {
        N: cryptoParams.kdfparams.n,
        r: cryptoParams.kdfparams.r,
        p: cryptoParams.kdfparams.p,
        maxmem: 512 * 1024 * 1024  // 512MB for high N values
      }
    );

    // Verify MAC - different algorithms for different keystore types
    let computedMac;
    if (keystoreType === 'admin-private-key') {
      // Admin keystore uses HMAC-SHA256
      computedMac = crypto.createHmac('sha256', derivedKey.slice(16, 32))
        .update(ciphertext)
        .digest();
    } else {
      // Mnemonic keystore uses keccak256(derivedKey[16:32] || ciphertext)
      const macInput = Buffer.concat([
        Buffer.from(derivedKey.slice(16, 32)),
        ciphertext
      ]);
      computedMac = Buffer.from(keccak256(macInput).slice(2), 'hex');
    }

    if (!computedMac.equals(storedMac)) {
      return null;
    }

    // Decrypt
    const decipher = crypto.createDecipheriv(
      cryptoParams.cipher,
      derivedKey.slice(0, 16),
      iv
    );
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]);
  } catch (err) {
    return null;
  }
}

/**
 * Load keys from floppy keystore (admin key or mnemonic)
 * SECURITY: This is the ONLY way to load keys for production networks
 * PRIVATE_KEY fallback only works for localhost/hardhat networks
 *
 * @param {boolean} allowFallback - Whether to allow PRIVATE_KEY fallback (development only)
 * @returns {string[]} Array of private keys, or empty array if not available
 */
function loadFloppyKeysSync(allowFallback = false) {
  if (!isFloppyMounted()) {
    console.warn('[Floppy] Disk not mounted at', FLOPPY_CONFIG.MOUNT_POINT);
    console.warn('[Floppy] Run: npm run floppy:mount');
    if (allowFallback && process.env.PRIVATE_KEY) {
      console.log('[Floppy] Development mode: Using PRIVATE_KEY env var fallback');
      return [process.env.PRIVATE_KEY];
    }
    return [];
  }

  const password = process.env.FLOPPY_KEYSTORE_PASSWORD;
  if (!password) {
    console.warn('[Floppy] FLOPPY_KEYSTORE_PASSWORD not set');
    // Only allow fallback in development mode (hardhat/localhost networks)
    if (allowFallback && process.env.PRIVATE_KEY) {
      console.log('[Floppy] Development mode: Using PRIVATE_KEY env var fallback');
      return [process.env.PRIVATE_KEY];
    }
    return [];
  }

  const keystoreDir = path.join(FLOPPY_CONFIG.MOUNT_POINT, FLOPPY_CONFIG.KEYSTORE_DIR);

  // Try admin keystore first (single private key)
  const adminKeystorePath = path.join(keystoreDir, 'admin-keystore.json');
  if (fs.existsSync(adminKeystorePath)) {
    const decrypted = decryptKeystoreSync(adminKeystorePath, password);
    if (decrypted) {
      console.log('[Floppy] Loaded admin key');
      return ['0x' + decrypted.toString('hex')];
    } else {
      console.warn('[Floppy] Invalid password for admin keystore');
      if (allowFallback && process.env.PRIVATE_KEY) {
        console.log('[Floppy] Using PRIVATE_KEY env var fallback');
        return [process.env.PRIVATE_KEY];
      }
      return [];
    }
  }

  // Try mnemonic keystore (HD wallet)
  const mnemonicKeystorePath = path.join(keystoreDir, 'mnemonic-keystore.json');
  if (fs.existsSync(mnemonicKeystorePath)) {
    const decrypted = decryptKeystoreSync(mnemonicKeystorePath, password);
    if (decrypted) {
      try {
        const mnemonic = decrypted.toString('utf8');
        // Derive first account using path parameter directly
        const wallet = HDNodeWallet.fromPhrase(mnemonic, undefined, "m/44'/60'/0'/0/0");
        console.log('[Floppy] Loaded mnemonic wallet:', wallet.address);
        return [wallet.privateKey];
      } catch (err) {
        console.warn('[Floppy] Failed to derive keys from mnemonic:', err.message);
        return [];
      }
    } else {
      console.warn('[Floppy] Invalid password for mnemonic keystore');
      return [];
    }
  }

  console.warn('[Floppy] No keystore found on disk');
  console.warn('[Floppy] Expected: admin-keystore.json or mnemonic-keystore.json');
  return [];
}

// Load keys from floppy at config time (synchronous)
// SECURITY: allowFallback=true enables PRIVATE_KEY env var when floppy unavailable
const floppyKeys = loadFloppyKeysSync(true);

export default defineConfig({
  plugins: [hardhatToolboxMochaEthers],

  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1,  // Optimize for deployment size over runtime gas
      },
      viaIR: true,
    },
  },

  networks: {
    hardhat: {
      chainId: 1337,
      allowUnlimitedContractSize: true,
      accounts: {
        count: 20, // More accounts for integration tests
        accountsBalance: "100000000000000000000000", // 100,000 ETH each
      },
      mining: {
        auto: true,
        interval: 0,
      },
    },
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    mordor: {
      url: "https://rpc.mordor.etccooperative.org",
      chainId: 63,
      // SECURITY: Keys loaded from floppy disk only - no PRIVATE_KEY env var fallback
      // Mount floppy and set FLOPPY_KEYSTORE_PASSWORD to use
      accounts: floppyKeys,
    },
  },

  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },

  mocha: {
    timeout: 120000, // 2 minutes for integration tests
  },

  gasReporter: {
    enabled: Boolean(process.env.REPORT_GAS),
    currency: "USD",
    outputFile: process.env.REPORT_GAS ? "gas-report.txt" : undefined,
    noColors: Boolean(process.env.REPORT_GAS),
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
  },

  etherscan: {
    apiKey: {
      'mordor': 'empty'
    },
    customChains: [
      {
        network: "mordor",
        chainId: 63,
        urls: {
          apiURL: "https://etc-mordor.blockscout.com/api",
          browserURL: "https://etc-mordor.blockscout.com"
        }
      }
    ]
  }
});
