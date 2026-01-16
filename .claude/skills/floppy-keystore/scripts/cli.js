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
const identity = require('./identity');
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

=== Key Management ===
  mount              - Mount the floppy disk securely
  unmount            - Sync and unmount the floppy disk
  create             - Create a new encrypted mnemonic keystore
  test               - Test keystore decryption
  info               - Show keystore information and supported chains
  chains             - List all supported blockchain chains
  derive <chain>     - Derive keys for a specific chain
  address <chain>    - Show addresses for a chain (no private keys)

=== Identity & Memory ===
  storage            - Show disk space usage
  did <cmd>          - Manage DID document (create, show, add-service)
  profile <cmd>      - Manage agent profile (set, show)
  memory <cmd>       - Manage persistent memory (add, list, search, delete, clear)
  metadata <cmd>     - Key-value metadata store (set, get, list, delete)

=== Help ===
  help               - Show this help message

Derive Options:
  --count=N          - Number of accounts to derive (default: 1)
  --start=N          - Starting index (default: 0)
  --type=TYPE        - Address type (for Bitcoin: legacy, segwit, nativeSegwit, taproot)

Memory Options:
  --type=TYPE        - Entry type (note, context, fact, etc.)
  --tags=a,b,c       - Comma-separated tags
  --importance=N     - Importance 1-10 (default: 5)
  --content=TEXT     - Memory content

Examples:
  # Key derivation
  node cli.js derive ethereum --count=5
  node cli.js derive bitcoin --type=nativeSegwit --count=3

  # DID management
  node cli.js did create --method=key
  node cli.js did add-service --type=AgentService --endpoint=https://...

  # Memory management
  node cli.js memory add --content="User prefers dark mode" --tags=preference --importance=7
  node cli.js memory list --type=note
  node cli.js memory search --text="dark mode"

  # Metadata
  node cli.js metadata set --key=lastSync --value="2025-01-15"
  node cli.js metadata get --key=lastSync

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

Storage Capacity:
  ~1.4 MB available for identity, memory, and metadata after keystores
`);
}

// ============================================================================
// Identity & Memory Commands
// ============================================================================

/**
 * Show storage stats
 */
function showStorage() {
  if (!isMounted()) {
    console.error('Error: Floppy not mounted');
    process.exit(1);
  }

  console.log('\n=== Floppy Disk Storage ===\n');

  const stats = identity.getStorageStats();

  console.log(`Capacity:  ${stats.capacityFormatted}`);
  console.log(`Used:      ${stats.usedFormatted} (${stats.usedPercent}%)`);
  console.log(`Available: ${stats.availableFormatted}`);

  console.log('\nFiles:');
  Object.entries(stats.files).forEach(([file, size]) => {
    console.log(`  ${file.padEnd(35)} ${identity.getStorageStats().usedFormatted ? (size + ' B').padStart(10) : ''}`);
  });
}

/**
 * Create or show DID document
 */
async function manageDID(subcommand, options) {
  if (!isMounted()) {
    console.error('Error: Floppy not mounted');
    process.exit(1);
  }

  switch (subcommand) {
    case 'create': {
      const existing = identity.getDIDDocument();
      if (existing && !options.force) {
        console.error('DID document already exists. Use --force to overwrite.');
        console.log('Current DID:', existing.id);
        process.exit(1);
      }

      const method = options.method || 'key';
      const doc = identity.createDIDDocument({ method });

      console.log('\n=== DID Document Created ===\n');
      console.log('DID:', doc.id);
      console.log('Controller:', doc.controller);
      console.log('Created:', doc.created);
      console.log('\nVerification Methods:');
      doc.verificationMethod.forEach(vm => {
        console.log(`  - ${vm.id} (${vm.type})`);
      });
      break;
    }

    case 'show':
    default: {
      const doc = identity.getDIDDocument();
      if (!doc) {
        console.log('No DID document found. Create one with: did create');
        return;
      }

      console.log('\n=== DID Document ===\n');
      console.log(JSON.stringify(doc, null, 2));
      break;
    }

    case 'add-service': {
      if (!options.type || !options.endpoint) {
        console.error('Usage: did add-service --type=TYPE --endpoint=URL [--id=ID]');
        process.exit(1);
      }

      const doc = identity.addDIDService({
        id: options.id,
        type: options.type,
        endpoint: options.endpoint
      });

      console.log('Service added to DID document');
      console.log('Services:', doc.service.length);
      break;
    }

    case 'atproto': {
      // Create AT Protocol compatible DID
      if (!options.domain || !options.handle || !options.pds) {
        console.error('Usage: did atproto --domain=DOMAIN --handle=HANDLE --pds=PDS_URL');
        console.error('');
        console.error('Example:');
        console.error('  did atproto --domain=agent.example.com --handle=agent.bsky.social --pds=https://bsky.social');
        process.exit(1);
      }

      const existing = identity.getDIDDocument();
      if (existing && !options.force) {
        console.error('DID document already exists. Use --force to overwrite.');
        console.log('Current DID:', existing.id);
        process.exit(1);
      }

      const doc = identity.createATProtoDIDDocument({
        domain: options.domain,
        handle: options.handle,
        pdsUrl: options.pds
      });

      console.log('\n=== AT Protocol DID Created ===\n');
      console.log('DID:', doc.id);
      console.log('Handle:', doc.alsoKnownAs[0]);
      console.log('PDS:', doc.service.find(s => s.type === 'AtprotoPersonalDataServer')?.serviceEndpoint);
      console.log('\nNote: Run "did setkey" to set the public key from your keystore.');
      console.log('      Then run "did export" to get the document for web hosting.');
      break;
    }

    case 'setkey': {
      // Set the public key from the floppy keystore
      const doc = identity.getDIDDocument();
      if (!doc) {
        console.error('No DID document found. Create one first.');
        process.exit(1);
      }

      const password = options.password || process.env.FLOPPY_KEYSTORE_PASSWORD ||
        await promptPassword('Keystore password: ');

      const { loadMnemonicFromFloppyWithPassword, deriveChainKeys } = require('./loader');

      try {
        // Load keystore and derive first key
        const keystoreFile = path.join(CONFIG.MOUNT_POINT, CONFIG.KEYSTORE_DIR, CONFIG.KEYSTORE_FILENAME);
        const keystore = JSON.parse(fs.readFileSync(keystoreFile, 'utf8'));
        const mnemonic = await decryptMnemonic(keystore, password);

        // Derive Ethereum key (secp256k1 - compatible with AT Protocol)
        const keys = await deriveKeys(mnemonic, 'ethereum', { count: 1 });
        const publicKey = keys[0].publicKey;

        // Set in DID document
        const updated = identity.setATProtoPublicKey(publicKey);

        console.log('\n=== Public Key Set ===\n');
        console.log('Key ID:', updated.verificationMethod[0].id);
        console.log('Type:', updated.verificationMethod[0].type);
        console.log('Public Key (multibase):', updated.verificationMethod[0].publicKeyMultibase?.substring(0, 40) + '...');
      } catch (err) {
        console.error('Error setting public key:', err.message);
        process.exit(1);
      }
      break;
    }

    case 'validate': {
      // Validate DID for AT Protocol
      const result = identity.validateATProtoDID();

      console.log('\n=== AT Protocol DID Validation ===\n');
      console.log('Valid:', result.valid ? 'Yes' : 'No');

      if (result.errors.length > 0) {
        console.log('\nErrors:');
        result.errors.forEach(e => console.log('  - ' + e));
      }

      if (result.warnings.length > 0) {
        console.log('\nWarnings:');
        result.warnings.forEach(w => console.log('  - ' + w));
      }

      if (result.valid) {
        console.log('\nDID document is valid for AT Protocol.');
        console.log('Host at: https://<domain>/.well-known/did.json');
      }
      break;
    }

    case 'export': {
      // Export DID for web hosting
      try {
        const json = identity.exportDIDForWeb();
        console.log(json);

        if (options.file) {
          fs.writeFileSync(options.file, json);
          console.error(`\nExported to: ${options.file}`);
        } else {
          console.error('\nTo save to file: did export --file=did.json');
          console.error('Host at: https://<domain>/.well-known/did.json');
        }
      } catch (err) {
        console.error('Error exporting:', err.message);
        process.exit(1);
      }
      break;
    }

    case 'handle': {
      // Update AT Protocol handle
      if (!options.handle) {
        console.error('Usage: did handle --handle=NEW_HANDLE');
        process.exit(1);
      }

      const doc = identity.updateATProtoHandle(options.handle);
      console.log('Handle updated to:', doc.alsoKnownAs[0]);
      break;
    }
  }
}

/**
 * Manage agent profile
 */
async function manageProfile(subcommand, options) {
  if (!isMounted()) {
    console.error('Error: Floppy not mounted');
    process.exit(1);
  }

  switch (subcommand) {
    case 'set': {
      const profile = {};

      if (options.name) profile.name = options.name;
      if (options.description) profile.description = options.description;
      if (options.version) profile.version = options.version;

      if (Object.keys(profile).length === 0) {
        // Interactive mode
        profile.name = await promptInput('Agent name: ');
        profile.description = await promptInput('Description: ');
        profile.version = await promptInput('Version (e.g., 1.0.0): ');
      }

      const result = identity.setProfile(profile);
      console.log('\nProfile updated:');
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'show':
    default: {
      const profile = identity.getProfile();
      if (!profile) {
        console.log('No profile found. Create one with: profile set');
        return;
      }

      console.log('\n=== Agent Profile ===\n');
      console.log(JSON.stringify(profile, null, 2));
      break;
    }
  }
}

/**
 * Manage memory entries
 */
async function manageMemory(subcommand, options) {
  if (!isMounted()) {
    console.error('Error: Floppy not mounted');
    process.exit(1);
  }

  switch (subcommand) {
    case 'add': {
      let content = options.content;
      if (!content) {
        content = await promptInput('Memory content: ');
      }

      const entry = identity.addMemory({
        type: options.type || 'note',
        content,
        tags: options.tags ? options.tags.split(',') : [],
        importance: parseInt(options.importance) || 5
      });

      console.log('\nMemory added:');
      console.log(`  ID: ${entry.id}`);
      console.log(`  Type: ${entry.type}`);
      console.log(`  Importance: ${entry.importance}/10`);
      break;
    }

    case 'list': {
      const entries = identity.searchMemory({
        type: options.type,
        tags: options.tags ? options.tags.split(',') : null,
        minImportance: options.importance ? parseInt(options.importance) : null,
        limit: options.limit ? parseInt(options.limit) : 20
      });

      console.log(`\n=== Memory Entries (${entries.length}) ===\n`);

      if (entries.length === 0) {
        console.log('No entries found.');
        return;
      }

      entries.forEach(entry => {
        const preview = entry.content.length > 60
          ? entry.content.slice(0, 60) + '...'
          : entry.content;
        console.log(`[${entry.id}] (${entry.type}, imp:${entry.importance}) ${preview}`);
        if (entry.tags.length > 0) {
          console.log(`         Tags: ${entry.tags.join(', ')}`);
        }
      });
      break;
    }

    case 'show': {
      const id = options.id || args[2];
      if (!id) {
        console.error('Usage: memory show --id=ID');
        process.exit(1);
      }

      const entries = identity.getMemory();
      const entry = entries.find(e => e.id === id);

      if (!entry) {
        console.error('Entry not found:', id);
        process.exit(1);
      }

      console.log('\n=== Memory Entry ===\n');
      console.log(JSON.stringify(entry, null, 2));
      break;
    }

    case 'search': {
      const text = options.text || args[2];
      if (!text) {
        console.error('Usage: memory search --text=QUERY');
        process.exit(1);
      }

      const entries = identity.searchMemory({ text, limit: 10 });

      console.log(`\n=== Search Results (${entries.length}) ===\n`);
      entries.forEach(entry => {
        console.log(`[${entry.id}] ${entry.content.slice(0, 80)}...`);
      });
      break;
    }

    case 'delete': {
      const id = options.id || args[2];
      if (!id) {
        console.error('Usage: memory delete --id=ID');
        process.exit(1);
      }

      if (identity.deleteMemory(id)) {
        console.log('Deleted:', id);
      } else {
        console.error('Entry not found:', id);
      }
      break;
    }

    case 'clear': {
      const confirm = await promptInput('Clear ALL memory? Type "yes" to confirm: ');
      if (confirm === 'yes') {
        identity.clearMemory();
        console.log('Memory cleared.');
      } else {
        console.log('Cancelled.');
      }
      break;
    }

    default:
      console.log('Usage: memory <add|list|show|search|delete|clear>');
  }
}

/**
 * Manage metadata key-value store
 */
function manageMetadata(subcommand, options) {
  if (!isMounted()) {
    console.error('Error: Floppy not mounted');
    process.exit(1);
  }

  switch (subcommand) {
    case 'set': {
      const key = options.key || args[2];
      const value = options.value || args[3];

      if (!key || value === undefined) {
        console.error('Usage: metadata set --key=KEY --value=VALUE');
        process.exit(1);
      }

      // Try to parse as JSON
      let parsedValue = value;
      try {
        parsedValue = JSON.parse(value);
      } catch {
        // Keep as string
      }

      identity.setMetadataValue(key, parsedValue);
      console.log(`Set ${key} = ${JSON.stringify(parsedValue)}`);
      break;
    }

    case 'get': {
      const key = options.key || args[2];
      if (!key) {
        console.error('Usage: metadata get --key=KEY');
        process.exit(1);
      }

      const value = identity.getMetadataValue(key);
      if (value === null) {
        console.log(`Key '${key}' not found`);
      } else {
        console.log(JSON.stringify(value, null, 2));
      }
      break;
    }

    case 'list':
    default: {
      const metadata = identity.getMetadata();
      console.log('\n=== Metadata ===\n');
      console.log(JSON.stringify(metadata, null, 2));
      break;
    }

    case 'delete': {
      const key = options.key || args[2];
      if (!key) {
        console.error('Usage: metadata delete --key=KEY');
        process.exit(1);
      }

      identity.deleteMetadataValue(key);
      console.log(`Deleted: ${key}`);
      break;
    }
  }
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

  case 'storage':
    showStorage();
    break;

  case 'did':
    manageDID(subcommand, options).catch(console.error);
    break;

  case 'profile':
    manageProfile(subcommand, options).catch(console.error);
    break;

  case 'memory':
    manageMemory(subcommand, options).catch(console.error);
    break;

  case 'metadata':
    manageMetadata(subcommand, options);
    break;

  case 'help':
  case '--help':
  case '-h':
    showHelp();
    break;

  default:
    showHelp();
}
