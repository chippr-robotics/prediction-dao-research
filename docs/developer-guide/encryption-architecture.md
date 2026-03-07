# Encryption Architecture

This document describes the end-to-end encryption system used to protect private P2P wager details. All wager content encryption and decryption happens client-side in the browser. Neither the platform nor any third party can read encrypted wager data.

## Design Principles

- **End-to-end encrypted**: Only the invited participants can read wager details
- **No key servers**: Encryption keys are derived locally from wallet signatures
- **Deterministic keys**: The same wallet always produces the same encryption key, so there is nothing to back up or store
- **Efficient**: Wager content is encrypted once regardless of how many participants are involved
- **Backward compatible**: Supports both the current envelope model and the legacy shared-signature model

## Envelope Encryption Model

Private wagers use an envelope encryption scheme, the same pattern used by secure messaging applications and cloud encryption services.

### How It Works

Each wager has two layers of encryption:

1. **Data Encryption Key (DEK)** -- A random symmetric key generated fresh for each wager. This key encrypts the actual wager content (description, terms, metadata).

2. **Per-Recipient Key Wrapping** -- The DEK is individually wrapped (encrypted) for each participant using their personal encryption key. Each participant gets their own "envelope" containing a copy of the DEK that only they can open.

```
Wager Content
     |
     v
[Encrypted with random DEK]  -->  Encrypted Content Blob
     |
     +--[DEK wrapped for Creator]    -->  Creator's Envelope
     +--[DEK wrapped for Opponent]   -->  Opponent's Envelope
     +--[DEK wrapped for Participant 3]  -->  Participant 3's Envelope
```

### Benefits

- **O(1) content encryption**: The wager content is encrypted once, not once per participant
- **Efficient participant addition**: Adding a new participant only requires wrapping the DEK for their key -- no re-encryption of the content
- **Independent access**: Each participant decrypts independently using only their own key
- **Forward secrecy per recipient**: Each key wrapping uses a unique ephemeral key, limiting blast radius if one participant's key is compromised

## Key Derivation from Wallet Signature

Encryption keys are derived deterministically from your Ethereum wallet. No separate key storage or password is needed.

### Process

1. The app asks the user to sign a fixed message: `"FairWins Market Encryption v1"`
2. The wallet produces an Ethereum personal signature (EIP-191)
3. The signature is hashed to produce a 32-byte private encryption key
4. The corresponding public encryption key is computed from the private key

```
Wallet Signature  -->  Hash Function  -->  Private Key (32 bytes)
                                                |
                                                v
                                          Public Key (32 bytes)
```

### Properties

- **Deterministic**: The same wallet always produces the same signature for the same message, yielding the same encryption key pair every time
- **Wallet-bound**: Only the wallet owner can produce the signature, so only they can derive the key
- **No storage needed**: The key can always be re-derived from the wallet; nothing needs to be saved
- **Session-cached**: The signature is held in `sessionStorage` for the duration of the browser tab, avoiding repeated signature prompts

## On-Chain Key Registry (ZKKeyManager)

The ZKKeyManager contract serves as a public directory of encryption public keys. When a user registers their key on-chain, anyone can look it up to encrypt data for that user without any direct communication.

### Integration Flow

1. **Registration**: When a user first derives their encryption key pair, the public key is submitted to `ZKKeyManager.registerKey(publicKeyHex)`
2. **Lookup**: When creating a wager, the app calls `ZKKeyManager.getPublicKey(opponentAddress)` to retrieve the opponent's public key
3. **Validation**: `ZKKeyManager.hasValidKey(address)` checks whether a key is registered, active, and not expired

### Key Lifecycle on Chain

| Stage | Contract Function | Description |
|-------|------------------|-------------|
| Register | `registerKey(publicKey)` | First-time registration |
| Lookup | `getPublicKey(address)` | Retrieve a user's public key |
| Validate | `hasValidKey(address)` | Check if key is active and not expired |
| Rotate | `rotateKey(newPublicKey)` | Replace current key (old key hash preserved in history) |
| Revoke | `revokeKey(address)` | Admin revocation for compromised keys |
| Expire | Automatic | Keys have a `expiresAt` timestamp; expired keys fail validation |

The frontend wraps these in `keyRegistryService.js`:

```javascript
import { lookupPublicKey, hasRegisteredKey, ensureKeyRegistered } from './keyRegistryService'

// Check if opponent has a key
const hasKey = await hasRegisteredKey(opponentAddress, provider)

// Look up opponent's public key (returns Uint8Array or null)
const opponentPublicKey = await lookupPublicKey(opponentAddress, provider)

// Register own key if not already registered
await ensureKeyRegistered(signer, myAddress, myPublicKeyBytes)
```

A 5-minute in-memory cache prevents redundant RPC calls for repeated lookups.

## Encryption at Wager Creation

When a user creates a private wager, the following happens:

1. **Derive own key pair** from wallet signature (or use cached session key)
2. **Look up opponent's public key** from the on-chain registry (ZKKeyManager)
3. **Block if opponent has no key** -- the UI prevents creation and shows a message that the opponent must register their encryption key first
4. **Generate a random DEK** (32 random bytes)
5. **Encrypt the wager content** (description, metadata) with the DEK
6. **Wrap DEK for the creator** -- generate an ephemeral key pair, compute a shared secret with the creator's public key, derive a key encryption key (KEK) from the shared secret, encrypt the DEK with the KEK
7. **Wrap DEK for the opponent** -- same process using the opponent's public key from the registry
8. **Build the envelope** -- combine encrypted content, creator's wrapped key entry, and opponent's wrapped key entry into a JSON structure
9. **Upload to IPFS** -- the envelope is uploaded to IPFS via Pinata, returning a CID
10. **Store reference on-chain** -- the wager's description field is set to `encrypted:ipfs://<CID>`

### Envelope Structure

```json
{
  "version": "1.0",
  "algorithm": "envelope-encryption",
  "content": {
    "nonce": "<hex>",
    "ciphertext": "<hex>"
  },
  "keys": [
    {
      "address": "0xCreatorAddress",
      "ephemeralPublicKey": "<hex>",
      "nonce": "<hex>",
      "wrappedKey": "<hex>"
    },
    {
      "address": "0xOpponentAddress",
      "ephemeralPublicKey": "<hex>",
      "nonce": "<hex>",
      "wrappedKey": "<hex>"
    }
  ]
}
```

## Decryption at Wager Viewing

When a participant opens a private wager:

1. **Read on-chain reference** -- detect the `encrypted:ipfs://<CID>` prefix in the description field
2. **Fetch envelope from IPFS** -- download the full encrypted envelope from IPFS using the CID
3. **Find own key entry** -- scan the `keys` array for an entry matching the user's address
4. **Derive private key** from wallet signature (or use cached session key)
5. **Compute shared secret** using own private key and the `ephemeralPublicKey` from the key entry
6. **Derive KEK** from the shared secret
7. **Unwrap the DEK** -- decrypt the `wrappedKey` using the KEK
8. **Decrypt content** -- decrypt the `ciphertext` using the unwrapped DEK
9. **Parse and display** the wager description and metadata

If the user's address is not in the `keys` array, the wager shows as "Encrypted Market" with no readable content.

## IPFS Storage

Encrypted envelopes are stored on IPFS rather than directly on-chain for two reasons:

1. **Gas efficiency** -- The on-chain reference (`encrypted:ipfs://<CID>`) is approximately 60 bytes regardless of envelope size. Envelope sizes range from 1-10 KB depending on participant count.
2. **Flexibility** -- Envelopes can be updated (e.g., adding participants) by uploading a new version to IPFS without an on-chain transaction.

### Storage Architecture

| Layer | What Is Stored | Typical Size |
|-------|---------------|-------------|
| Blockchain | `encrypted:ipfs://<CID>` reference | ~60 bytes |
| IPFS (Pinata) | Full encrypted envelope JSON | 1-10 KB |

### Functions

```javascript
import { uploadEncryptedEnvelope, fetchEncryptedEnvelope } from './ipfsService'

// Upload
const { cid, uri } = await uploadEncryptedEnvelope(envelope, { marketType: 'oneVsOne' })

// Fetch
const envelope = await fetchEncryptedEnvelope(cid)

// Parse on-chain reference
const { isIpfs, cid } = parseEncryptedIpfsReference(description)

// Build on-chain reference
const reference = buildEncryptedIpfsReference(cid)
```

## Adding Participants After Creation

An existing participant can add new people to a private wager without the original creator:

1. Decrypt the envelope to recover the DEK (requires being an existing participant)
2. Look up the new participant's public key from the on-chain registry
3. Generate a new ephemeral key pair
4. Compute shared secret with the new participant's public key
5. Wrap the DEK for the new participant
6. Append the new key entry to the envelope's `keys` array
7. Upload the updated envelope to IPFS

This enables invitation chains where any participant can add others.

## Session Management

### Signature Caching

The wallet signature is cached in `sessionStorage` under the key `fairwins_encryption_signature_<address>`. This means:

- You sign once per browser tab session
- Closing the tab clears the cache
- Different tabs or browsers require a new signature
- `localStorage` is intentionally not used to limit persistence

### Concurrent Request Prevention

A global promise prevents multiple simultaneous signature requests from the wallet:

```javascript
let initializationPromise = null

async function initializeKeys() {
  if (initializationPromise) {
    return initializationPromise  // Wait for existing request
  }
  initializationPromise = (async () => {
    try {
      return await deriveKeyPair(signer)
    } finally {
      initializationPromise = null
    }
  })()
  return initializationPromise
}
```

## Backward Compatibility

The system handles two storage formats and two envelope versions:

### Storage Format Detection

1. **IPFS reference** (`encrypted:ipfs://...`) -- Fetch envelope from IPFS, then decrypt
2. **Inline JSON** -- Parse the envelope directly from the on-chain description field (legacy)

Both formats are auto-detected when loading a wager.

### Legacy Shared-Signature Model

Before the on-chain key registry existed, private wagers used a shared-signature flow:

1. Creator generates an encryption key from their wallet signature
2. Creator shares the signature (or a derived secret) with the opponent out-of-band
3. Both parties use the shared secret to derive a common encryption key

The current system detects legacy envelopes and handles them transparently. New wagers always use the per-recipient envelope model.

## Security Considerations

### What Is Protected

- Wager descriptions and terms are encrypted and unreadable to non-participants
- Even IPFS nodes storing the data cannot decrypt it
- The platform backend never has access to encryption keys

### What Is Visible

- Participant wallet addresses (in the envelope `keys` array and on-chain)
- Stake amounts, tokens, and wager status (on-chain)
- That a private wager exists (the `encrypted:ipfs://` prefix is visible)

### Limitations

- **No backward secrecy**: If a participant is removed, they may have already decrypted and cached the content
- **Session storage risk**: The cached signature in `sessionStorage` could be accessed by a cross-site scripting (XSS) attack
- **Single signature dependency**: A compromised wallet signature exposes all wagers associated with that wallet
- **Metadata exposure**: Participant addresses are not encrypted

### Mitigations

| Risk | Mitigation |
|------|------------|
| XSS attacks | Content Security Policy headers, input sanitization |
| Wallet compromise | Recommend hardware wallets; key rotation via ZKKeyManager |
| Removed participant | Document as design limitation; create new wager for true revocation |
| Participant enumeration | Accepted as a blockchain transparency tradeoff |

## File Locations

| File | Purpose |
|------|---------|
| `frontend/src/utils/crypto/envelopeEncryption.js` | Core encryption and decryption functions |
| `frontend/src/utils/ipfsService.js` | IPFS upload and fetch for encrypted envelopes |
| `frontend/src/utils/keyRegistryService.js` | On-chain key registry reads and writes |
| `frontend/src/hooks/useEncryption.js` | React hook with session management and key derivation |
| `frontend/src/abis/ZKKeyManager.js` | ZKKeyManager contract ABI |
| `frontend/src/config/contracts.js` | Deployed contract addresses |
