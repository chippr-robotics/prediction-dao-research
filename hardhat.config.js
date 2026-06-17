require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

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
      const { keccak256 } = require('ethers');
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
        const { HDNodeWallet } = require('ethers');
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
// Load floppy keys WITH fallback for deployment when password mismatch
const floppyKeys = loadFloppyKeysSync(true);
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

// --- Block explorer verification (@nomicfoundation/hardhat-verify) ---
// hardhat-verify 2.x selects Etherscan API V2 (the unified endpoint
// api.etherscan.io/v2/api?chainid=<id>) ONLY when etherscan.apiKey is a STRING; a
// per-network OBJECT forces legacy V1 mode and keeps customChains apiURLs. The two
// modes are mutually exclusive in one config, and Etherscan V2 does NOT cover
// Blockscout chains (Ethereum Classic 61 / Mordor 63). So pick the right shape from
// the --network being acted on:
//   * Etherscan family (polygon 137, amoy 80002) -> V2 unified, single ETHERSCAN_API_KEY
//     (Polygonscan V1 keys/endpoints were shut off 2025-08-15; mint the key at etherscan.io).
//   * Blockscout (etc 61, mordor 63) -> V1 object + customChains pointing at <host>/api.
//     Blockscout ignores the key value but hardhat-verify needs a non-empty placeholder.
function verifyTargetNetwork() {
  const i = process.argv.indexOf("--network");
  if (i !== -1) return process.argv[i + 1];
  // Hardhat also accepts the network via the HARDHAT_NETWORK env var (no --network flag).
  return process.env.HARDHAT_NETWORK;
}
const BLOCKSCOUT_VERIFY_NETWORKS = new Set(["etc", "mordor"]);
const etherscanConfig = BLOCKSCOUT_VERIFY_NETWORKS.has(verifyTargetNetwork())
  ? {
      // Blockscout (Ethereum Classic mainnet + Mordor). Key value is ignored by the
      // server but must be a non-empty string for hardhat-verify to resolve the chain.
      apiKey: { etc: "empty", mordor: "empty" },
      customChains: [
        { network: "etc", chainId: 61, urls: { apiURL: "https://etc.blockscout.com/api", browserURL: "https://etc.blockscout.com" } },
        { network: "mordor", chainId: 63, urls: { apiURL: "https://etc-mordor.blockscout.com/api", browserURL: "https://etc-mordor.blockscout.com" } },
      ],
    }
  : {
      // Etherscan V2 unified key (covers Polygon 137 + Amoy 80002 via the built-in
      // chain list — no customChains needed). Mint at etherscan.io (NOT polygonscan.com).
      apiKey: process.env.ETHERSCAN_API_KEY || "",
    };

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
      // Fork mode for oracle fork tests. Activated by setting AMOY_RPC_URL.
      forking: process.env.AMOY_RPC_URL ? {
        url: process.env.AMOY_RPC_URL,
        blockNumber: process.env.AMOY_FORK_BLOCK ? parseInt(process.env.AMOY_FORK_BLOCK, 10) : undefined,
      } : undefined,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    mordor: {
      url: process.env.MORDOR_RPC_URL || "https://rpc.mordor.etccooperative.org",
      chainId: 63,
      // Deployer key: floppy keystore when mounted, else PRIVATE_KEY from .env
      // (loadFloppyKeysSync allowFallback=true). Explorer: Blockscout (no API key).
      accounts: floppyKeys,
      // Legacy chain (no EIP-1559). The gas-price oracle suggests ~300 gwei, which
      // pushes the ~4.76M-gas WagerRegistry deploy over the node's 1 ETH tx-fee cap.
      // Pin a lower legacy gasPrice via GAS_PRICE_WEI (e.g. 100000000000 = 100 gwei).
      ...(process.env.GAS_PRICE_WEI ? { gasPrice: Number(process.env.GAS_PRICE_WEI) } : {}),
    },
    // Ethereum Classic mainnet (chainId 61). MAINNET — deploy.js requires
    // CONFIRM_MAINNET=true. Explorer verification is Blockscout (etc.blockscout.com).
    etc: {
      url: process.env.ETC_RPC_URL || "https://etc.rivet.link",
      chainId: 61,
      accounts: floppyKeys,
      ...(process.env.GAS_PRICE_WEI ? { gasPrice: Number(process.env.GAS_PRICE_WEI) } : {}),
    },
    amoy: {
      url: process.env.AMOY_RPC_URL || "https://rpc-amoy.polygon.technology",
      chainId: 80002,
      accounts: floppyKeys,
      ...(process.env.GAS_PRICE_WEI ? { gasPrice: Number(process.env.GAS_PRICE_WEI) } : {}),
    },
    // Polygon mainnet (production). Deployer key: floppy keystore when mounted,
    // else PRIVATE_KEY from .env (loadFloppyKeysSync allowFallback=true) — keep the
    // production key on the floppy. Prefer a paid POLYGON_RPC_URL over the public
    // endpoint. deploy.js requires CONFIRM_MAINNET=true for chainId 137. Explorer
    // verification is Polygonscan via Etherscan V2 (ETHERSCAN_API_KEY).
    polygon: {
      url: process.env.POLYGON_RPC_URL || "https://polygon-rpc.com",
      chainId: 137,
      accounts: floppyKeys,
      ...(process.env.GAS_PRICE_WEI ? { gasPrice: Number(process.env.GAS_PRICE_WEI) } : {}),
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
  // Network-aware: Etherscan V2 for polygon/amoy, Blockscout for etc/mordor.
  // See verifyTargetNetwork()/etherscanConfig above.
  etherscan: etherscanConfig,
};
