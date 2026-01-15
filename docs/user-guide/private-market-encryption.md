# Private Market Encryption

Private markets (also called "friend markets") allow you to create prediction markets visible only to invited participants. This document explains how the encryption system protects your market details and ensures only authorized participants can view them.

## What Gets Encrypted

When you create a private market, the following information is encrypted:

- Market name/question
- Description and details
- Any additional metadata you provide

The encrypted data is stored on IPFS (decentralized storage) and referenced on-chain. Even though the data is publicly accessible on IPFS, only invited participants can decrypt and read it.

**What remains visible:**
- That a private market exists
- The list of participant wallet addresses
- Stake amounts and market state (open, resolved, etc.)
- Transaction history

This design ensures the blockchain can still manage the market mechanics while keeping your market's purpose private.

## How Encryption Works

Private markets use **envelope encryption**, a proven approach used by secure messaging apps and cloud providers. Here's how it protects your data:

### The Envelope Model

Think of your market details as a letter inside a locked box. The box uses a random key that's generated fresh for each market. This random key encrypts the actual content.

But how do participants open the box? Each participant receives their own sealed envelope containing a copy of the box's key. These envelopes are locked with each participant's personal key, derived from their wallet.

This means:
1. The market content is encrypted once (efficient, regardless of group size)
2. Each participant has their own way to access the content
3. Adding new participants doesn't require re-encrypting the content
4. Removing someone's envelope doesn't let them forget a key they already have

### Your Encryption Key

Your encryption key is derived from your Ethereum wallet through a signature. When you first interact with a private market, you'll be asked to sign a message: "FairWins Market Encryption v1"

This signature is:
- **Deterministic**: The same wallet always produces the same encryption key
- **Wallet-bound**: Only you can produce this signature
- **Session-cached**: You only need to sign once per browser session

The signature itself is not your private key - it's used to mathematically derive an encryption keypair specific to FairWins. Your actual wallet private key never leaves your wallet.

## Security Guarantees

### What the encryption protects against

**Curious observers**: Someone browsing IPFS or the blockchain cannot read your market details. They see only encrypted data that appears as random characters.

**Unauthorized access**: Even if someone knows a market exists and has the encrypted data, they cannot decrypt it without being an invited participant.

**Future participants**: When you create a market, only current participants can decrypt it. If you add someone later, they receive access at that point.

### What the encryption does NOT protect against

**Participant sharing**: An authorized participant can always screenshot, copy, or share the decrypted content. Encryption controls access, not what participants do with accessed information.

**Metadata**: The wallet addresses of participants are visible on-chain. Someone can see that you're in a private market with specific other addresses.

**Participant removal**: If you remove someone from a market, they may have already decrypted and saved the content. Removal prevents future access but cannot revoke past knowledge.

**Compromised wallets**: If someone's wallet private key is compromised, the attacker can derive their encryption key and access any private markets they're part of.

## Anti-Money-Laundering Protections

While private markets protect your content, they are not exempt from platform safety measures. The nullifier system prevents misuse of private markets for money laundering or other illicit activities.

### How It Works

The platform maintains a registry of nullified (blocked) addresses. These are addresses that have been flagged for suspicious activity, regulatory concerns, or terms of service violations.

When you create or join a private market, the system checks:
- Is the creator's address nullified?
- Are any invited participants nullified?
- Is the person accepting an invitation nullified?

If any participant is nullified, the operation is blocked with an "AddressNullified" error.

### Why This Matters

Private markets could theoretically be misused for money laundering:
1. Bad actor A creates a private market with accomplice B
2. Both stake funds
3. A intentionally loses to B
4. Funds transfer from A to B without going through normal market mechanisms

The nullifier integration prevents this by blocking known bad actors from participating in private markets entirely.

### What This Means for Users

For legitimate users, this protection is invisible. You'll never encounter it unless you're attempting to create a market with a nullified address.

If you receive an "AddressNullified" error:
- You or one of your invited participants has been flagged
- Contact platform support if you believe this is an error
- Nullified addresses can be reinstated after review

### Privacy Balance

The nullifier system doesn't reveal why an address is nullified or expose a list of blocked addresses. It simply returns yes/no when queried about a specific address. This protects privacy while still enabling platform safety.

## The Participant Experience

### Creating a Private Market

1. You write your market question and details
2. You toggle "Private Market" on
3. You sign the encryption message (once per session)
4. The system encrypts your content for your wallet
5. The encrypted package is uploaded to IPFS
6. The market is created on-chain with a reference to the encrypted data

### Joining a Private Market

1. You receive an invitation (the creator or another participant adds your address)
2. You sign the encryption message (once per session)
3. Your signature is shared with the inviter
4. They add your "envelope" to the encrypted package
5. You can now decrypt and view the market details

### Viewing Private Markets

When you open FairWins:
1. The system checks sessionStorage for your cached signature
2. If found, it derives your keys automatically (no popup)
3. Private markets you're part of are decrypted and displayed normally
4. Markets you're not part of show as "Private Market" with no details

## Technical Details

For those interested in the cryptographic specifics:

**Key Derivation**: Your wallet signs a fixed message. The signature is hashed with Keccak-256, producing a 32-byte private key. The corresponding X25519 public key is computed from this.

**Content Encryption**: Market metadata is encrypted with ChaCha20-Poly1305 using a random 256-bit Data Encryption Key (DEK) and 96-bit nonce.

**Key Wrapping**: The DEK is encrypted for each participant using X25519 Diffie-Hellman key exchange, HKDF key derivation, and ChaCha20-Poly1305 encryption.

**Libraries**: The implementation uses audited cryptographic libraries from the Noble suite (@noble/curves, @noble/ciphers, @noble/hashes).

## Frequently Asked Questions

**Why do I need to sign a message?**

Your encryption key must be derived from something only you can produce. Your wallet signature provides this. The message is fixed and harmless - it simply proves you control the wallet.

**Will I need to sign for every market?**

No. Your signature is cached for the browser session. You sign once when you first access any private market, then all subsequent operations use the cached key.

**Can the platform read my private markets?**

No. The FairWins platform never has access to your encryption keys. Decryption happens entirely in your browser using keys derived from your wallet signature.

**What happens if I clear my browser data?**

You'll need to sign the encryption message again next time you access a private market. Your access isn't lost - the signature is just cached for convenience.

**Can I be in multiple private markets?**

Yes. Each market has its own encryption, but your same wallet-derived key works for all markets you're invited to.

**What if I lose access to my wallet?**

You would lose access to any private markets associated with that wallet. This is inherent to wallet-based encryption - the wallet is the key.

**Is the encryption quantum-resistant?**

The current implementation uses X25519 (elliptic curve cryptography) which is not quantum-resistant. If quantum computers become practical threats, the encryption scheme would need to be upgraded. For current purposes, X25519 provides strong security.

## Summary

Private market encryption ensures that only invited participants can view market details. The system uses your Ethereum wallet to derive encryption keys, caches your signature for session convenience, and employs industry-standard cryptographic algorithms.

Your market questions and descriptions remain private from observers, while the blockchain still manages stakes, outcomes, and payouts transparently. This balance lets you run private prediction markets with friends while maintaining the trustless settlement guarantees of blockchain technology.
