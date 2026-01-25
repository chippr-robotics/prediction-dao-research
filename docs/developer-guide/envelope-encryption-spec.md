# Envelope Encryption Technical Specification

This document provides technical details for developers and security auditors reviewing the private market encryption implementation.

## Overview

Private markets use envelope encryption to protect market metadata. The scheme provides:
- O(1) content encryption regardless of participant count
- Efficient participant addition without re-encryption
- Deterministic key derivation from wallet signatures
- Session-cached keys to minimize signature requests

## Cryptographic Primitives

### v2.0 (Current - Post-Quantum)

| Component | Algorithm | Library |
|-----------|-----------|---------|
| Key Exchange | X-Wing (X25519 + ML-KEM-768) | @noble/curves, @noble/post-quantum |
| Key Derivation | HKDF-SHA256 | @noble/hashes/hkdf |
| Symmetric Encryption | ChaCha20-Poly1305 | @noble/ciphers/chacha |
| Wallet Key Derivation | Keccak-256 | ethers.js |
| X-Wing Combiner | SHA3-256 | @noble/hashes/sha3 |

### v1.0 (Legacy - Classical)

| Component | Algorithm | Library |
|-----------|-----------|---------|
| Key Exchange | X25519 (Curve25519 ECDH) | @noble/curves/ed25519 |
| Key Derivation | HKDF-SHA256 | @noble/hashes/hkdf |
| Symmetric Encryption | ChaCha20-Poly1305 | @noble/ciphers/chacha |
| Wallet Key Derivation | Keccak-256 | ethers.js |

All cryptographic operations use the Noble suite, which provides audited, side-channel resistant implementations.

## Post-Quantum Security (v2.0)

Version 2.0 uses X-Wing, a hybrid key encapsulation mechanism combining classical X25519 with post-quantum ML-KEM-768. This protects against "harvest now, decrypt later" attacks where an adversary stores encrypted data today and decrypts it with future quantum computers.

### X-Wing Key Sizes

| Component | v1.0 (X25519) | v2.0 (X-Wing) |
|-----------|---------------|---------------|
| Public Key | 32 bytes | 1216 bytes |
| Secret Key | 32 bytes | 32 bytes (seed) |
| Ciphertext | 32 bytes | 1120 bytes |
| Shared Secret | 32 bytes | 32 bytes |

### X-Wing Combiner

Per the IETF X-Wing specification, the shared secret is derived as:

```
SharedSecret = SHA3-256(XWING_LABEL || ss_ML-KEM || ss_X25519 || ct_X25519 || pk_X25519)
```

Where:
- `XWING_LABEL` = `"\\./\n\\./\n"` (domain separator)
- `ss_ML-KEM` = ML-KEM-768 shared secret (32 bytes)
- `ss_X25519` = X25519 shared secret (32 bytes)
- `ct_X25519` = X25519 ephemeral public key (32 bytes)
- `pk_X25519` = Recipient's X25519 public key (32 bytes)

## Key Derivation

### Wallet to Encryption Key

```
Message: "FairWins Market Encryption v1"
Signature: wallet.signMessage(Message)
PrivateKey: keccak256(utf8ToBytes(Signature))[0:32]
PublicKey: x25519.getPublicKey(PrivateKey)
```

The signature is an Ethereum personal_sign (EIP-191) of the fixed message. Keccak-256 hashing ensures uniform distribution across the key space.

**Security consideration**: The signature must remain secret. It's stored in sessionStorage (not localStorage) to limit persistence.

### Key Encryption Key (KEK) Derivation

For each recipient, an ephemeral X25519 keypair is generated:

```
EphemeralPrivate: randomBytes(32)
EphemeralPublic: x25519.getPublicKey(EphemeralPrivate)
SharedSecret: x25519.getSharedSecret(EphemeralPrivate, RecipientPublic)
KEK: HKDF(SHA256, SharedSecret, salt="", info="FairWins_Envelope_v1", length=32)
```

## Envelope Structure

### v2.0 (X-Wing - Post-Quantum)

```json
{
  "version": "2.0",
  "algorithm": "xwing-chacha20poly1305",
  "signingVersion": 2,
  "content": {
    "nonce": "<hex: 12 bytes>",
    "ciphertext": "<hex: encrypted data + 16-byte auth tag>"
  },
  "keys": [
    {
      "address": "<lowercase ethereum address>",
      "xwingCiphertext": "<hex: 1120 bytes (ML-KEM ciphertext + X25519 ephemeral)>",
      "nonce": "<hex: 12 bytes>",
      "wrappedKey": "<hex: encrypted DEK + 16-byte auth tag>"
    }
  ]
}
```

### v1.0 (X25519 - Classical)

```json
{
  "version": "1.0",
  "algorithm": "x25519-chacha20poly1305",
  "signingVersion": 2,
  "content": {
    "nonce": "<hex: 12 bytes>",
    "ciphertext": "<hex: encrypted data + 16-byte auth tag>"
  },
  "keys": [
    {
      "address": "<lowercase ethereum address>",
      "ephemeralPublicKey": "<hex: 32 bytes>",
      "nonce": "<hex: 12 bytes>",
      "wrappedKey": "<hex: encrypted DEK + 16-byte auth tag>"
    }
  ]
}
```

### Version Detection

```javascript
function isXWingEnvelope(envelope) {
  return envelope?.algorithm === 'xwing-chacha20poly1305'
}

function isX25519Envelope(envelope) {
  return envelope?.algorithm === 'x25519-chacha20poly1305'
}
```
```

## Encryption Flow

### Content Encryption

```
DEK: randomBytes(32)
ContentNonce: randomBytes(12)
Plaintext: JSON.stringify(metadata)
Ciphertext: ChaCha20Poly1305(DEK, ContentNonce).encrypt(Plaintext)
```

### Key Wrapping (per recipient)

```
For each recipient:
  EphemeralKeyPair: generateEphemeralKeyPair()
  SharedSecret: x25519.ECDH(EphemeralKeyPair.private, recipient.publicKey)
  KEK: HKDF(SharedSecret, info="FairWins_Envelope_v1")
  KeyNonce: randomBytes(12)
  WrappedDEK: ChaCha20Poly1305(KEK, KeyNonce).encrypt(DEK)
```

## Decryption Flow

```
1. Find wrapped key entry matching user address
2. Compute SharedSecret: x25519.ECDH(myPrivateKey, entry.ephemeralPublicKey)
3. Derive KEK: HKDF(SharedSecret, info="FairWins_Envelope_v1")
4. Unwrap DEK: ChaCha20Poly1305(KEK, entry.nonce).decrypt(entry.wrappedKey)
5. Decrypt content: ChaCha20Poly1305(DEK, content.nonce).decrypt(content.ciphertext)
6. Parse JSON
```

## Adding Participants

An existing participant can add new participants without the original creator:

```
1. Decrypt envelope to recover DEK (requires existing participant's key)
2. Generate new ephemeral keypair for new recipient
3. Compute SharedSecret with new recipient's public key
4. Derive new KEK
5. Wrap DEK for new recipient
6. Append new key entry to envelope.keys
```

This enables invitation chains where any participant can invite others.

## Session Management

### Signature Caching

```javascript
// Cache key format
const cacheKey = `fairwins_encryption_signature_${address.toLowerCase()}`

// Storage: sessionStorage (cleared on tab close)
sessionStorage.setItem(cacheKey, signature)
```

### Concurrent Request Prevention

A global promise prevents multiple simultaneous signature requests:

```javascript
let initializationPromise = null

async function initializeKeys() {
  if (initializationPromise) {
    return initializationPromise  // Wait for existing request
  }

  initializationPromise = (async () => {
    try {
      const result = await deriveKeyPair(signer)
      // ... cache and return
    } finally {
      initializationPromise = null
    }
  })()

  return initializationPromise
}
```

## Security Considerations

### Strengths

1. **Forward secrecy per-recipient**: Each recipient has unique ephemeral key, limiting exposure if one recipient's key is compromised
2. **Authenticated encryption**: ChaCha20-Poly1305 provides both confidentiality and integrity
3. **Deterministic keys**: Users can always recover access with their wallet
4. **No key server**: Keys are derived client-side; no central authority has access

### Limitations

1. **No backward secrecy**: Removed participants may have cached the DEK
2. **Metadata exposure**: Participant addresses are visible in the envelope
3. **Session storage risk**: Signature in sessionStorage could be accessed by XSS
4. **Single signature dependency**: Compromised signature = compromised all markets for that wallet

### Mitigations

| Risk | Mitigation |
|------|------------|
| XSS stealing signature | CSP headers, input sanitization, sessionStorage isolation |
| Participant enumeration | Accept as design tradeoff; blockchain transparency |
| Removed participant access | Document limitation; recommend new market for true revocation |
| Wallet compromise | User responsibility; recommend hardware wallets |

## IPFS Storage

Encrypted envelopes are stored on IPFS via Pinata, with only a CID reference stored on-chain.

### On-Chain Reference Format

```
encrypted:ipfs://bafybeic5dplry3twzpb3l5byo5tqyj7vfk3vxl7skrn6kzqd7p6ey3mmze
```

### Storage Architecture

| Layer | Content | Size |
|-------|---------|------|
| Blockchain | `encrypted:ipfs://CID` | ~60 bytes |
| IPFS | Full encrypted envelope | 1-10 KB |

### Benefits

1. **Gas efficiency**: CID reference costs ~60 bytes regardless of envelope size
2. **Scalability**: X-Wing's larger ciphertexts don't increase transaction costs
3. **Privacy**: Encrypted data lives off-chain, reducing on-chain metadata
4. **Flexibility**: Envelopes can be updated (adding participants) without on-chain transactions

### IPFS Functions

```javascript
// Upload encrypted envelope to IPFS
const { cid, uri } = await uploadEncryptedEnvelope(envelope, { marketType: 'oneVsOne' })

// Fetch encrypted envelope from IPFS
const envelope = await fetchEncryptedEnvelope(cid)

// Parse on-chain reference
const { isIpfs, cid } = parseEncryptedIpfsReference(description)

// Build on-chain reference
const reference = buildEncryptedIpfsReference(cid)
```

### Backward Compatibility

The system auto-detects envelope storage format:

1. **IPFS reference** (`encrypted:ipfs://...`): Fetch from IPFS, then decrypt
2. **Inline JSON**: Parse directly from description field (legacy)

Both v1.0 (X25519) and v2.0 (X-Wing) envelopes work with either storage method.

## File Locations

```
frontend/src/utils/crypto/envelopeEncryption.js  # Core cryptographic functions
frontend/src/utils/ipfsService.js                # IPFS upload/fetch functions
frontend/src/hooks/useEncryption.js              # React hook with session management
```

## Testing Considerations

When testing the encryption system:

1. **Key derivation consistency**: Same wallet should always produce same keypair
2. **Cross-browser compatibility**: Verify signature format is consistent
3. **Participant addition**: New participants can decrypt after being added
4. **Invalid envelope handling**: Graceful failures for malformed data
5. **Concurrent decryption**: Multiple markets can be decrypted simultaneously

## Version History

| Version | Changes |
|---------|---------|
| 2.0 | X-Wing hybrid KEM (X25519 + ML-KEM-768) for post-quantum security |
| 1.1 | IPFS storage for envelopes, CID reference on-chain |
| 1.0 | Initial implementation with X25519 + ChaCha20-Poly1305 |

## References

- [X25519 (RFC 7748)](https://datatracker.ietf.org/doc/html/rfc7748)
- [ChaCha20-Poly1305 (RFC 8439)](https://datatracker.ietf.org/doc/html/rfc8439)
- [HKDF (RFC 5869)](https://datatracker.ietf.org/doc/html/rfc5869)
- [Noble Cryptography Libraries](https://paulmillr.com/noble/)
- [EIP-191: Signed Data Standard](https://eips.ethereum.org/EIPS/eip-191)
