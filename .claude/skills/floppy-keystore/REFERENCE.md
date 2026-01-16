# Floppy Keystore API Reference

## Module: loader.js

The main integration module for loading keys from floppy disk.

### Functions

#### `isFloppyMounted()`

Check if the floppy disk is mounted.

```javascript
const { isFloppyMounted } = require('./scripts/loader');

if (isFloppyMounted()) {
  console.log('Floppy disk is ready');
}
```

**Returns:** `boolean` - `true` if mounted, `false` otherwise

---

#### `keystoreExists()`

Check if the mnemonic keystore file exists.

```javascript
const { keystoreExists } = require('./scripts/loader');

if (!keystoreExists()) {
  console.log('Run: npm run floppy:create');
}
```

**Returns:** `boolean` - `true` if `mnemonic-keystore.json` exists

---

#### `adminKeystoreExists()`

Check if the admin keystore file exists.

```javascript
const { adminKeystoreExists } = require('./scripts/loader');

if (adminKeystoreExists()) {
  console.log('Admin key is available');
}
```

**Returns:** `boolean` - `true` if `admin-keystore.json` exists

---

#### `loadMnemonicFromFloppy()`

Load and decrypt the mnemonic from floppy disk. Caches result for session.

```javascript
const { loadMnemonicFromFloppy } = require('./scripts/loader');

const mnemonic = await loadMnemonicFromFloppy();
// Use mnemonic for wallet operations
```

**Returns:** `Promise<string>` - The decrypted BIP-39 mnemonic phrase

**Throws:**
- `Error` if floppy not mounted
- `Error` if keystore not found
- `Error` if password incorrect

**Environment:**
- `FLOPPY_KEYSTORE_PASSWORD` - If set, uses this password; otherwise prompts interactively

---

#### `getFloppyPrivateKeys(options)`

Derive private keys from the mnemonic on floppy disk.

```javascript
const { getFloppyPrivateKeys } = require('./scripts/loader');

// Get 5 accounts starting from index 0
const keys = await getFloppyPrivateKeys({ count: 5, initialIndex: 0 });
// keys = ['0x...', '0x...', '0x...', '0x...', '0x...']
```

**Parameters:**
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `count` | `number` | `10` | Number of accounts to derive |
| `initialIndex` | `number` | `0` | Starting derivation index |

**Returns:** `Promise<string[]>` - Array of private keys (with `0x` prefix)

**Derivation Path:** `m/44'/60'/0'/0/{index}`

---

#### `loadAdminKeyFromFloppy()`

Load and decrypt the admin private key from floppy disk.

```javascript
const { loadAdminKeyFromFloppy } = require('./scripts/loader');

const privateKey = await loadAdminKeyFromFloppy();
// privateKey = '0x...' (64 hex chars)
```

**Returns:** `Promise<string>` - The decrypted private key with `0x` prefix

---

#### `getAdminPrivateKey()`

Get admin key as array (for Hardhat accounts config).

```javascript
const { getAdminPrivateKey } = require('./scripts/loader');

module.exports = {
  networks: {
    mainnet: {
      accounts: await getAdminPrivateKey()
    }
  }
};
```

**Returns:** `Promise<string[]>` - Single-element array with the admin private key

---

#### `clearCache()`

Clear cached keys from memory. Called automatically on process exit.

```javascript
const { clearCache } = require('./scripts/loader');

// Manually clear if needed
clearCache();
```

---

## Module: keystore.js

Low-level encryption/decryption functions.

### Functions

#### `encryptMnemonic(mnemonic, password)`

Encrypt a BIP-39 mnemonic phrase.

```javascript
const { encryptMnemonic } = require('./scripts/keystore');

const keystore = await encryptMnemonic(
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
  'strongpassword'
);
// Returns keystore JSON object
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `mnemonic` | `string` | BIP-39 mnemonic (12 or 24 words) |
| `password` | `string` | Encryption password |

**Returns:** `Promise<object>` - Keystore JSON object

**Validation:**
- Mnemonic must be 12 or 24 words
- Words must be in BIP-39 English wordlist
- Checksum must be valid

---

#### `decryptMnemonic(keystore, password)`

Decrypt a mnemonic from keystore format.

```javascript
const { decryptMnemonic } = require('./scripts/keystore');
const fs = require('fs');

const keystore = JSON.parse(fs.readFileSync('keystore.json', 'utf8'));
const mnemonic = await decryptMnemonic(keystore, 'strongpassword');
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `keystore` | `object` | Keystore JSON object |
| `password` | `string` | Decryption password |

**Returns:** `Promise<string>` - Decrypted mnemonic phrase

**Throws:** `Error` if password incorrect or keystore corrupted

---

## Module: config.js

Configuration constants.

```javascript
const CONFIG = require('./scripts/config');

console.log(CONFIG.DEVICE);       // '/dev/sde'
console.log(CONFIG.MOUNT_POINT);  // '/mnt/floppy'
console.log(CONFIG.SCRYPT_N);     // 262144
```

### Configuration Values

| Property | Default | Description |
|----------|---------|-------------|
| `DEVICE` | `/dev/sde` | Floppy device path |
| `MOUNT_POINT` | `/mnt/floppy` | Mount directory |
| `KEYSTORE_DIR` | `.keystore` | Keystore subdirectory |
| `KEYSTORE_FILENAME` | `mnemonic-keystore.json` | Mnemonic keystore file |
| `SCRYPT_N` | `262144` | scrypt N parameter (2^18) |
| `SCRYPT_R` | `8` | scrypt r parameter |
| `SCRYPT_P` | `1` | scrypt p parameter |
| `SCRYPT_DKLEN` | `32` | Derived key length |
| `CIPHER` | `aes-128-ctr` | Encryption cipher |
| `MOUNT_OPTIONS` | `[noexec, nosuid, ...]` | Secure mount options |

---

## Synchronous Loading (Hardhat)

For Hardhat configuration, which requires synchronous account loading:

```javascript
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function loadFloppyKeysSync(allowFallback = false) {
  // Check mount
  if (!isFloppyMountedSync()) {
    if (allowFallback && process.env.PRIVATE_KEY) {
      return [process.env.PRIVATE_KEY];
    }
    return [];
  }

  const password = process.env.FLOPPY_KEYSTORE_PASSWORD;
  if (!password) return [];

  // Decrypt admin keystore
  const keystorePath = '/mnt/floppy/.keystore/admin-keystore.json';
  const keystore = JSON.parse(fs.readFileSync(keystorePath, 'utf8'));

  // Use crypto.scryptSync for synchronous decryption
  const derivedKey = crypto.scryptSync(
    password,
    Buffer.from(keystore.crypto.kdfparams.salt, 'hex'),
    keystore.crypto.kdfparams.dklen,
    { N: keystore.crypto.kdfparams.n, r: 8, p: 1, maxmem: 512 * 1024 * 1024 }
  );

  // ... MAC verification and decryption ...
  return ['0x' + decrypted.toString('hex')];
}
```

See [HARDHAT-INTEGRATION.md](HARDHAT-INTEGRATION.md) for complete implementation.
