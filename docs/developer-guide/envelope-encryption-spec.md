# Envelope Encryption Technical Specification

This document provides technical details for developers and security auditors reviewing the private market encryption implementation.

## Overview

Private markets use envelope encryption to protect market metadata. The scheme provides:
- O(1) content encryption regardless of participant count
- Efficient participant addition without re-encryption
- Deterministic key derivation from wallet signatures
- Session-cached keys to minimize signature requests

## Cryptographic Primitives

| Component | Algorithm | Library |
|-----------|-----------|---------|
| Key Exchange | X25519 (Curve25519 ECDH) | @noble/curves/ed25519 |
| Key Derivation | HKDF-SHA256 | @noble/hashes/hkdf |
| Symmetric Encryption | ChaCha20-Poly1305 | @noble/ciphers/chacha |
| Wallet Key Derivation | Keccak-256 | ethers.js |

All cryptographic operations use the Noble suite, which provides audited, side-channel resistant implementations.

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

```json
{
  "version": "1.0",
  "algorithm": "x25519-chacha20poly1305",
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

## File Locations

```
frontend/src/utils/crypto/envelopeEncryption.js  # Core cryptographic functions
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
| 1.0 | Initial implementation with X25519 + ChaCha20-Poly1305 |

## References

- [X25519 (RFC 7748)](https://datatracker.ietf.org/doc/html/rfc7748)
- [ChaCha20-Poly1305 (RFC 8439)](https://datatracker.ietf.org/doc/html/rfc8439)
- [HKDF (RFC 5869)](https://datatracker.ietf.org/doc/html/rfc5869)
- [Noble Cryptography Libraries](https://paulmillr.com/noble/)
- [EIP-191: Signed Data Standard](https://eips.ethereum.org/EIPS/eip-191)
