---
name: floppy-keystore
description: Manage encrypted multi-chain cryptocurrency keys stored on floppy disks. Supports Ethereum, Bitcoin, Zcash, Monero, and Solana. Use when working with floppy disk keystores, deriving keys for multiple blockchains, mounting/unmounting floppy drives, or configuring secure air-gapped key storage. One mnemonic, all chains.
allowed-tools: Read, Bash, Glob, Grep
---

# Floppy Disk Keystore Skill

Multi-chain cryptocurrency key management using physical floppy disks for air-gapped storage.

## Overview

This skill enables secure management of encrypted cryptographic keys stored on floppy disks. A single BIP-39 mnemonic phrase can derive keys for multiple blockchain networks:

| Chain | Symbol | Curve | Networks |
|-------|--------|-------|----------|
| Ethereum | ETH | secp256k1 | mainnet, sepolia, arbitrum, optimism, polygon, base |
| Bitcoin | BTC | secp256k1 | mainnet, testnet (Legacy, SegWit, Taproot) |
| Zcash | ZEC | secp256k1 | mainnet, testnet (transparent addresses) |
| Monero | XMR | ed25519 | mainnet, stagenet, testnet |
| Solana | SOL | ed25519 | mainnet-beta, devnet, testnet |
| Ethereum Classic | ETC | secp256k1 | mainnet, mordor |

## Quick Start

### 1. Mount the Floppy Disk

```bash
node .claude/skills/floppy-keystore/scripts/cli.js mount
```

### 2. Create an Encrypted Keystore

```bash
node .claude/skills/floppy-keystore/scripts/cli.js create
# Enter your BIP-39 mnemonic (12 or 24 words)
# Set encryption password
```

### 3. Derive Keys for Any Chain

```bash
# Ethereum keys
node cli.js derive ethereum --count=5

# Bitcoin Native SegWit addresses
node cli.js derive bitcoin --type=nativeSegwit --count=3

# Solana keys
node cli.js derive solana --count=2

# Show addresses only (no private keys)
node cli.js address monero --count=10
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `mount` | Mount floppy disk with secure options |
| `unmount` | Safely unmount floppy disk |
| `create` | Create new encrypted mnemonic keystore |
| `test` | Test keystore decryption |
| `info` | Show keystore status and supported chains |
| `chains` | List all supported blockchain chains |
| `derive <chain>` | Derive keys for a specific chain |
| `address <chain>` | Show addresses only (no private keys) |

### Derive Options

```bash
--count=N     # Number of accounts to derive (default: 1)
--start=N     # Starting index (default: 0)
--type=TYPE   # Address type (Bitcoin: legacy, segwit, nativeSegwit, taproot)
```

## Programmatic Usage

### Basic Ethereum (Hardhat Compatible)

```javascript
const { loadFloppyKeysSync } = require('./.claude/skills/floppy-keystore/scripts/loader');

module.exports = {
  networks: {
    mainnet: {
      url: "https://eth.llamarpc.com",
      accounts: loadFloppyKeysSync()
    }
  }
};
```

### Multi-Chain Key Derivation

```javascript
const { deriveChainKeys, getChainAddresses } = require('./loader');

// Derive Ethereum keys
const ethKeys = await deriveChainKeys('ethereum', { count: 5 });

// Derive Bitcoin keys (Native SegWit)
const btcKeys = await deriveChainKeys('bitcoin', {
  count: 3,
  addressType: 'nativeSegwit'
});

// Derive Solana keys
const solKeys = await deriveChainKeys('solana', { count: 2 });

// Get just addresses
const xmrAddresses = await getChainAddresses('monero', { count: 10 });
```

### Key Object Structure

```javascript
// Ethereum/Bitcoin/Zcash (secp256k1)
{
  chain: 'ETH',
  index: 0,
  path: "m/44'/60'/0'/0/0",
  privateKey: '0x...',
  publicKey: '0x...',
  address: '0x...'
}

// Monero (ed25519 - dual key)
{
  chain: 'XMR',
  index: 0,
  path: 'derived/0',
  privateSpendKey: '...',
  privateViewKey: '...',
  address: '4...'
}

// Solana (ed25519)
{
  chain: 'SOL',
  index: 0,
  path: "m/44'/501'/0'/0'",
  privateKey: '...',
  publicKey: '...',  // Base58
  address: '...'     // Same as publicKey
}
```

## Bitcoin Address Types

Bitcoin supports multiple address formats:

| Type | Purpose | Prefix | Description |
|------|---------|--------|-------------|
| `legacy` | 44 | 1... | P2PKH (Original format) |
| `segwit` | 49 | 3... | P2SH-wrapped SegWit |
| `nativeSegwit` | 84 | bc1q... | P2WPKH (Recommended) |
| `taproot` | 86 | bc1p... | P2TR (Latest) |

```bash
# Derive Bitcoin Taproot addresses
node cli.js derive bitcoin --type=taproot --count=5
```

## Derivation Paths

Standard BIP-44 paths used for each chain:

| Chain | Path | Notes |
|-------|------|-------|
| Ethereum | `m/44'/60'/0'/0/{i}` | Standard EVM path |
| Bitcoin | `m/84'/0'/0'/0/{i}` | Native SegWit default |
| Zcash | `m/44'/133'/0'/0/{i}` | Transparent addresses |
| Monero | `m/44'/128'/0'/0/{i}` | Derived from BIP-39 |
| Solana | `m/44'/501'/{i}'/0'` | Hardened derivation |
| ETC | `m/44'/61'/0'/0/{i}` | Ethereum Classic |

## Security Model

### Encryption

- **KDF**: scrypt (N=262144, r=8, p=1) - ~512MB memory
- **Cipher**: AES-128-CTR
- **MAC**: keccak256 (mnemonic) / HMAC-SHA256 (admin keys)
- **Timing-safe**: Constant-time comparison

### Mount Security

```bash
noexec      # Prevent executable files
nosuid      # Ignore setuid bits
nodev       # Ignore device files
umask=077   # Owner-only permissions
sync,flush  # Immediate write-through
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FLOPPY_DEVICE` | `/dev/sde` | Floppy device path |
| `FLOPPY_MOUNT` | `/mnt/floppy` | Mount point directory |
| `FLOPPY_KEYSTORE_PASSWORD` | - | Password for non-interactive use |

## Optional Dependencies

For full functionality on all chains, install these optional packages:

```bash
# Bitcoin address generation
npm install bitcoinjs-lib tiny-secp256k1 ecpair

# Solana key derivation
npm install @solana/web3.js ed25519-hd-key bip39

# Monero address generation
npm install monero-javascript
```

Without these packages, the skill will:
- Still derive valid private keys
- Show hash160/partial addresses with notes about missing libraries
- Work fully for Ethereum and EVM chains (uses ethers.js)

## File Structure

```
/mnt/floppy/
  .keystore/
    mnemonic-keystore.json   # Encrypted BIP-39 mnemonic (all chains)
    admin-keystore.json      # Single admin key (optional)
```

## Troubleshooting

### "Floppy not mounted"
```bash
# Check if device exists
ls -la /dev/sde

# Mount manually
sudo mount -t vfat /dev/sde /mnt/floppy -o noexec,nosuid,nodev,umask=077
```

### "Unknown chain"
```bash
# List supported chains
node cli.js chains

# Use alias
node cli.js derive btc   # Same as 'bitcoin'
node cli.js derive eth   # Same as 'ethereum'
```

### Missing addresses for Bitcoin/Solana/Monero
Install the optional dependencies for full address generation:
```bash
npm install bitcoinjs-lib tiny-secp256k1 ecpair  # Bitcoin
npm install @solana/web3.js ed25519-hd-key       # Solana
```

## Additional Documentation

- [REFERENCE.md](REFERENCE.md) - Full API documentation
- [HARDHAT-INTEGRATION.md](HARDHAT-INTEGRATION.md) - Hardhat configuration guide

## Security Best Practices

1. **Physical security** - Store floppy in secure location
2. **Strong password** - Use 16+ characters
3. **Unmount immediately** - Don't leave mounted
4. **Never share mnemonic** - One mnemonic = all chains
5. **Test before production** - Verify addresses on testnets first
