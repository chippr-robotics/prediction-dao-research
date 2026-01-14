require("@nomicfoundation/hardhat-toolbox");

const { subtask } = require("hardhat/config");

// Floppy keystore loader for secure key storage
// Usage: npm run floppy:mount && npm run floppy:create (one-time setup)
const {
  getFloppyPrivateKeys,
  isFloppyMounted,
  keystoreExists,
  adminKeystoreExists,
  CONFIG: FLOPPY_CONFIG
} = require('./scripts/operations/floppy-key/loader');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Synchronously load admin key from floppy keystore
 * Returns null if floppy not mounted, keystore not found, or password not set
 */
function loadAdminKeySync() {
  if (!isFloppyMounted() || !adminKeystoreExists()) {
    return null;
  }

  const password = process.env.FLOPPY_KEYSTORE_PASSWORD;
  if (!password) {
    return null;
  }

  try {
    const keystorePath = path.join(
      FLOPPY_CONFIG.MOUNT_POINT,
      FLOPPY_CONFIG.KEYSTORE_DIR,
      'admin-keystore.json'
    );
    const keystoreJson = fs.readFileSync(keystorePath, 'utf8');
    const keystore = JSON.parse(keystoreJson);
    const { crypto: cryptoParams } = keystore;

    const salt = Buffer.from(cryptoParams.kdfparams.salt, 'hex');
    const iv = Buffer.from(cryptoParams.cipherparams.iv, 'hex');
    const ciphertext = Buffer.from(cryptoParams.ciphertext, 'hex');
    const storedMac = Buffer.from(cryptoParams.mac, 'hex');

    // Derive key synchronously
    const derivedKey = crypto.scryptSync(
      password,
      salt,
      cryptoParams.kdfparams.dklen,
      {
        N: cryptoParams.kdfparams.n,
        r: cryptoParams.kdfparams.r,
        p: cryptoParams.kdfparams.p
      }
    );

    // Verify MAC
    const mac = crypto.createHmac('sha256', derivedKey.slice(16, 32))
      .update(ciphertext)
      .digest();

    if (!mac.equals(storedMac)) {
      console.warn('Warning: Invalid floppy keystore password');
      return null;
    }

    // Decrypt
    const decipher = crypto.createDecipheriv(
      cryptoParams.cipher,
      derivedKey.slice(0, 16),
      iv
    );
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]);

    return '0x' + decrypted.toString('hex');
  } catch (err) {
    console.warn('Warning: Could not load admin key from floppy:', err.message);
    return null;
  }
}

// Load admin key at config time (synchronous)
const adminKey = loadAdminKeySync();
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require("hardhat/builtin-tasks/task-names");

subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD).setAction(async (args, hre, runSuper) => {
  const solcBuild = await runSuper(args);

  const isCodespaces = Boolean(process.env.CODESPACES || process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN);
  const forceSolcJs =
    (process.env.FORCE_SOLCJS ?? "").toLowerCase() === "true" ||
    (isCodespaces && (process.env.FORCE_NATIVE_SOLC ?? "").toLowerCase() !== "true");

  if (!forceSolcJs) {
    return solcBuild;
  }

  let solcjsPath;
  try {
    solcjsPath = require.resolve("solc/soljson.js");
  } catch (e) {
    throw new Error(
      "solc-js not found. Run `npm install` (or `npm i -D solc@0.8.24`) and retry."
    );
  }

  let longVersion = solcBuild.longVersion;
  try {
    // eslint-disable-next-line global-require
    const solc = require("solc");
    if (typeof solc.version === "function") {
      longVersion = solc.version();
    }
  } catch {
    // ignore
  }

  return {
    version: solcBuild.version,
    longVersion,
    compilerPath: solcjsPath,
    isSolcJs: true,
  };
});

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
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
        accountsBalance: "100000000000000000000000", // 100,000 ETH each - increased to handle bond-heavy tests
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
      // Priority: 1) Admin key from floppy (loaded at config time), 2) PRIVATE_KEY env var
      accounts: adminKey ? [adminKey] : (process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : []),
    },
    // Example: Mainnet with floppy keystore (uncomment when ready to use)
    // Requires: npm run floppy:mount && npm run floppy:create (one-time setup)
    // "mainnet-floppy": {
    //   url: process.env.MAINNET_RPC_URL || "https://eth.llamarpc.com",
    //   chainId: 1,
    //   accounts: async () => {
    //     if (!isFloppyMounted() || !keystoreExists()) {
    //       throw new Error("Floppy not mounted or keystore not found. Run: npm run floppy:mount");
    //     }
    //     return getFloppyPrivateKeys({ count: 5 });
    //   },
    // },
    // Mordor testnet with floppy keystore
    // Note: Use `mordor` network for regular testing, or set PRIVATE_KEY env var
    // "mordor-floppy": {
    //   url: "https://rpc.mordor.etccooperative.org",
    //   chainId: 63,
    //   // accounts must be synchronous or use lazyFunction helper
    //   accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    // },
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
    enabled: process.env.REPORT_GAS ? true : false,
    currency: "USD",
    outputFile: process.env.REPORT_GAS ? "gas-report.txt" : undefined,
    noColors: process.env.REPORT_GAS ? true : false,
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
};
