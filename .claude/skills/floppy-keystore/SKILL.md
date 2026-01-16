---
name: floppy-keystore
description: Manage encrypted Ethereum private keys and mnemonics stored on floppy disks. Use when working with floppy disk keystores, mounting/unmounting floppy drives, encrypting mnemonics, storing admin keys, or configuring Hardhat to use floppy-based key storage. Provides air-gapped key management for blockchain deployments.
allowed-tools: Read, Bash, Glob, Grep
---

# Floppy Disk Keystore Skill

Secure Ethereum key management using physical floppy disks for air-gapped storage.

## Overview

This skill enables Claude to help manage encrypted cryptographic keys stored on floppy disks. It provides:

- **Mnemonic encryption** - Store BIP-39 seed phrases securely
- **Admin key storage** - Store single deployer private keys
- **Hardhat integration** - Load keys for blockchain deployments
- **Security-first design** - Air-gapped key management

## Quick Start

### 1. Mount the Floppy Disk

```bash
# Using npm script (if configured)
npm run floppy:mount

# Or manually with the mount script
bash .claude/skills/floppy-keystore/scripts/mount.sh
```

### 2. Create an Encrypted Keystore

```bash
# Store a BIP-39 mnemonic
node .claude/skills/floppy-keystore/scripts/cli.js create

# Or store an admin private key
ADMIN_PRIVATE_KEY="0x..." FLOPPY_KEYSTORE_PASSWORD="yourpassword" \
  node .claude/skills/floppy-keystore/scripts/store-admin-key.js
```

### 3. Use in Hardhat

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

## Commands

| Command | Description |
|---------|-------------|
| `mount` | Mount floppy disk with secure options |
| `unmount` | Safely unmount floppy disk |
| `create` | Create new encrypted mnemonic keystore |
| `test` | Test keystore decryption |
| `info` | Show keystore status and metadata |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FLOPPY_DEVICE` | `/dev/sde` | Floppy device path |
| `FLOPPY_MOUNT` | `/mnt/floppy` | Mount point directory |
| `FLOPPY_KEYSTORE_PASSWORD` | - | Password for keystore decryption |

## Security Model

### Encryption

- **KDF**: scrypt with N=262144 (2^18), r=8, p=1
- **Cipher**: AES-128-CTR
- **MAC**: keccak256 (mnemonic) or HMAC-SHA256 (admin keys)
- **Timing-safe**: Constant-time comparison for MAC verification

### Mount Options

Floppy disks are mounted with restrictive options:
- `noexec` - Prevent executable files
- `nosuid` - Ignore setuid bits
- `nodev` - Ignore device files
- `umask=077` - Owner-only permissions
- `sync,flush` - Immediate write-through

### File Permissions

- Keystore files: `0600` (owner read/write only)
- Keystore directory: `0700` (owner access only)

## File Structure on Floppy

```
/mnt/floppy/
  .keystore/
    mnemonic-keystore.json   # Encrypted BIP-39 mnemonic
    admin-keystore.json      # Encrypted admin private key
```

## Keystore Formats

### Mnemonic Keystore (v3)

```json
{
  "version": 3,
  "id": "<uuid>",
  "type": "mnemonic",
  "wordCount": 12,
  "crypto": {
    "cipher": "aes-128-ctr",
    "cipherparams": { "iv": "<hex>" },
    "ciphertext": "<hex>",
    "kdf": "scrypt",
    "kdfparams": { "n": 262144, "r": 8, "p": 1, "dklen": 32, "salt": "<hex>" },
    "mac": "<hex>"
  }
}
```

### Admin Keystore (v1)

```json
{
  "version": 1,
  "type": "admin-private-key",
  "address": "0x...",
  "crypto": { /* same structure */ },
  "meta": { "createdAt": "<iso-date>", "description": "..." }
}
```

## Integration Patterns

For detailed integration patterns and API reference, see:
- [REFERENCE.md](REFERENCE.md) - Full API documentation
- [HARDHAT-INTEGRATION.md](HARDHAT-INTEGRATION.md) - Hardhat configuration guide

## Troubleshooting

### "Floppy not mounted"
```bash
# Check if device exists
ls -la /dev/sde

# Mount manually
sudo mount -t vfat /dev/sde /mnt/floppy -o noexec,nosuid,nodev,umask=077
```

### "Keystore not found"
```bash
# Check mount point
ls -la /mnt/floppy/.keystore/

# Create new keystore
node .claude/skills/floppy-keystore/scripts/cli.js create
```

### "Invalid password"
- Ensure `FLOPPY_KEYSTORE_PASSWORD` matches the encryption password
- Check for trailing whitespace in environment variable
- Try the interactive test command: `node scripts/cli.js test`

### High Memory Usage During Decryption
The scrypt KDF requires ~512MB RAM. For constrained environments, the admin keystore uses lower parameters (N=16384).
