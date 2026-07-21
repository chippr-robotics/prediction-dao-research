# One Ciphertext, N Wrapped Keys: Multi-Recipient Encryption for Private Wagers

*How FairWins lets two participants and a neutral arbitrator each decrypt the same payload — without re-encrypting it for anyone*

| | |
|---|---|
| **Series** | Privacy Architecture (part 2 of 4) |
| **Part** | Follows [Envelope encryption for private prediction markets](../../private-prediction-markets-envelope-encryption.md) |
| **Audience** | Applied cryptography engineers |
| **Tags** | `encryption`, `key-wrapping`, `privacy`, `cryptography` |
| **Reading time** | ~9 minutes |

> **Important note**: As in part 1, the private wagers described here are based on publicly available information and legitimate forecasting. Encryption protects competitive intelligence and trading strategies — not illegal activity. All participants remain fully subject to applicable laws and compliance obligations.

## The Third Reader Problem

In part 1 of this series, Sarah and Marcus made a 50,000 USDC private wager on a pharmaceutical merger. Their terms lived encrypted on IPFS; the chain held only a reference. Exactly two people on Earth could read the plaintext, and the smart contract guaranteed settlement anyway.

That design had a quiet casualty: arbitration. Some wagers can't be resolved by an oracle — "the merger closes before Q3" maps cleanly to a Polymarket condition, but "our redesign ships before yours" does not. For those, FairWins supports a `ThirdParty` resolution type where a neutral human declares the winner. And here the two-reader envelope broke down completely. The arbitrator could be *named* on-chain and *authorized* to call `declareWinner` — but they could not read the terms they were supposed to rule on, and they couldn't even enumerate the wagers naming them. The feature was disabled in the app: a resolver who can't see the agreement is worse than no resolver.

The naive fixes are all bad. Re-encrypt the whole payload once per reader, and storage grows linearly while the copies can silently diverge — three ciphertexts that may not decrypt to the same terms is a dispute generator, not a dispute resolver. Share one symmetric key among all readers out-of-band, and you've reinvented the key-distribution problem the system exists to avoid. Give the platform a master key so it can grant access, and you've abandoned end-to-end encryption entirely.

The actual fix — FairWins spec 005 — required zero changes to the cryptography. The envelope format was multi-recipient from day one. What changed is *who gets counted as a recipient*, plus a one-line contract change so arbitrators can find their wagers. This post walks the mechanism that made that a config change instead of a redesign.

## One DEK, a Wrapped Key per Reader

The envelope scheme (implemented in `frontend/src/utils/crypto/envelopeEncryption.js`, entirely client-side) separates *content encryption* from *access grants*:

1. Generate a random 32-byte **data encryption key (DEK)**.
2. Encrypt the wager terms **once** with the DEK using ChaCha20-Poly1305 (RFC 8439) — an AEAD, so tampering fails authentication rather than yielding garbage plaintext.
3. For each recipient, **wrap the DEK**: run X25519 ECDH between a fresh ephemeral keypair and the recipient's registered public key, derive a key-encryption key (KEK) with HKDF-SHA256, and encrypt the DEK under that KEK.

Here is the wrap loop, verbatim from `encryptEnvelope`:

```javascript
const wrappedKeys = recipients.map(recipient => {
  const ephemeralKeyPair = generateEphemeralKeyPair()

  // ECDH to derive shared secret
  const sharedSecret = x25519.getSharedSecret(
    ephemeralKeyPair.privateKey,
    recipient.publicKey
  )

  // Derive key encryption key from shared secret
  const kek = hkdf(sha256, sharedSecret, new Uint8Array(0), ENVELOPE_INFO, 32)

  // Encrypt DEK with KEK
  const keyNonce = randomBytes(12)
  const keyCipher = chacha20poly1305(kek, keyNonce)
  const wrappedDek = keyCipher.encrypt(dek)
  ...
})
```

The resulting JSON envelope has a single `content` block (nonce + ciphertext) and a `keys[]` array with one entry per reader, keyed by lowercase Ethereum address. Everything uses the audited Noble libraries (`@noble/curves`, `@noble/ciphers`, `@noble/hashes`).

The cost model is what makes multi-recipient practical. Content encryption is O(1) in the reader count; each additional reader costs one ephemeral keypair, one ECDH, one HKDF call, and ~60 bytes of wrapped-key entry. A 5 KB terms document shared with three readers is stored once, not three times — and every reader provably decrypts the *same* ciphertext, so there is no "which copy is canonical" question for an arbitrator to litigate.

Decryption is the mirror image: find your entry in `keys[]`, recompute the shared secret against the stored ephemeral public key, derive the KEK, unwrap the DEK, decrypt the content. Each reader's path is fully independent — compromise of one reader's wallet exposes their wrapped key, not the wrapping of anyone else's.

## Where Public Keys Come From

Wrapping a DEK for someone requires their encryption public key, and the creator may never have communicated with the arbitrator directly. That directory is on-chain: `contracts/privacy/KeyRegistry.sol`, a deliberately minimal contract.

```solidity
contract KeyRegistry {
    uint256 private constant MIN_KEY_LENGTH = 32;
    uint256 private constant MAX_KEY_LENGTH = 2048;

    mapping(address => bytes) private _keys;

    event KeyRegistered(address indexed user, bytes key, uint64 timestamp);

    function registerKey(bytes calldata publicKey) external { ... }
    function getPublicKey(address user) external view returns (bytes memory);
    function hasKey(address user) external view returns (bool);
}
```

Keys are opaque bytes bounded to 32–2048 bytes, which is not an accident: it accommodates both a 32-byte X25519 key and a 1216-byte X-Wing hybrid post-quantum key (more below) without a contract change. Re-registering overwrites — the wallet is the identity, the key is just its current encryption endpoint.

Users never manage these keys. An EOA derives its keypair deterministically from an EIP-191 `personal_sign` of a fixed message; the signature is hashed with Keccak-256 into the private key or seed. Passkey smart accounts (which have no EOA to sign with) derive the same shape of keypair via HKDF from their WebAuthn PRF master seed. Same wallet, same key, every device — nothing to back up, no key server to trust.

## Making the Arbitrator a First-Class Reader

With N-recipient wrapping and an on-chain key directory already in place, spec 005 (`specs/005-multi-recipient-encryption/`) reduced "let the arbitrator read the wager" to recipient assembly at creation time:

```
recipients = [
  { address: creator,    publicKey: lookupPublicKey(creator) },
  { address: opponent,   publicKey: lookupPublicKey(opponent) },
  // only for ThirdParty wagers with an assigned arbitrator:
  { address: arbitrator, publicKey: lookupPublicKey(arbitrator) },
]
envelope = encryptEnvelope(termsPlaintext, recipients)
```

Two without an arbitrator, three with. The arbitrator decrypts exactly like a participant — the decryption hooks already key off `keys[].address` and needed no changes. But three surrounding decisions carry the real design weight:

**Fail closed on missing keys (FR-007).** A wager can only be encrypted for a reader whose key is registered. If the named arbitrator has never called `registerKey`, creation is *blocked* with a message naming the missing party — the alternative is silently minting a wager its own resolver can never read, discovered months later at resolution time. The reader set is fixed when the bundle is prepared; late-binding a reader after creation is explicitly out of scope for v1.

**Discovery is on-chain, not cryptographic.** Being able to decrypt a wager is useless if you don't know it exists. The one contract change in spec 005 extends the existing per-user index in `WagerRegistry.createWager`: alongside the creator and opponent, `_userWagerIds[w.arbitrator].add(wagerId)` when an arbitrator is set. Arbitrators enumerate their caseload through the same `getUserWagerIds` reads participants already use — one extra `SSTORE`, no new events or storage variables.

**Integrity binds off-chain to on-chain.** The envelope lives on IPFS; the wager stores `metadataHash = keccak256("encrypted:ipfs://<CID>")` on-chain. A reader recomputes the hash before trusting a fetched bundle, so a substituted or corrupted envelope is *detected*, never displayed as valid. And if IPFS is unreachable, the terms degrade to an honest "unavailable" state — funds and resolution never block on plaintext availability.

One honest-disclosure point mirrors the platform's fee doctrine: when an arbitrator is a reader, the UI says so. Participants should never believe a wager is two-party-private when a third key entry exists.

## Growing and Shrinking the Reader Set

Because access is granted per wrapped key, membership changes don't touch the content ciphertext. `addRecipient` lets *any existing reader* — not only the creator — unwrap the DEK with their own key and wrap it for a newcomer, appending one entry to `keys[]`. Since the envelope lives off-chain, this needs no transaction.

Removal is where the abstraction is honest about its limits. `removeRecipient` filters an entry out of `keys[]`, and its docstring says the quiet part loud: *"This doesn't re-encrypt — they may still have the DEK cached. For true revocation, create a new envelope with new DEK."* Multi-recipient encryption grants access; it cannot un-know a key someone already held. FairWins documents this rather than pretending deletion equals revocation.

## The Post-Quantum Variant

Everything above runs identically under the v2.0 envelope, which swaps the per-recipient X25519 exchange for **X-Wing** — the IETF hybrid KEM combining X25519 with ML-KEM-768. `encryptEnvelopeXWing` calls `xwingEncapsulate` per recipient (a 1120-byte KEM ciphertext replaces the 32-byte ephemeral key) and derives the KEK from the combined shared secret via the spec's SHA3-256 combiner. If *either* component algorithm holds, the wrap holds — protection against harvest-now-decrypt-later adversaries. The wrapping layer absorbed the ~35× ciphertext growth with no change to content encryption or the on-chain footprint: the chain still stores a ~60-byte reference regardless of how heavy the envelope gets. `decryptEnvelopeUnified` dispatches on the envelope's `algorithm` field, so v1.0 and v2.0 bundles coexist.

## Design Decisions

- **Reuse the N-recipient API instead of adding an "observer" role.** The original request asked for participants plus an observer; the spec resolved the observer *as* the arbitrator, who reads and resolves. No new cryptosystem, no new role machinery — a third entry in an array that always supported N.
- **Block creation on missing keys rather than late-bind.** Fail loudly at creation beats failing silently at resolution. The trade-off is friction — an arbitrator must register a key before being named — accepted for v1.
- **Discovery via the registry index, not encrypted scanning.** Trial-decrypting every envelope on IPFS would be private but unusable; an on-chain index write is cheap and reuses existing reads. The trade-off: who arbitrates what is public metadata.
- **Accept visible recipient addresses.** `keys[].address` is plaintext, so the reader set of any bundle is enumerable. Hiding it would break the "find my entry" decryption step; the design accepts this as consistent with blockchain transparency.
- **No backward secrecy by design.** Removal without DEK rotation is documented as non-revocation. Correct-but-limited, stated plainly, beats an implied guarantee the math doesn't back.

The through-line of the series so far: part 1 encrypted one agreement for two adversarial readers; part 2 shows the same envelope stretching to any reader set the wager's lifecycle demands. Part 3 turns the same machinery inward — syncing a user's own encrypted data across their devices.

## Sources

- `specs/005-multi-recipient-encryption/spec.md` — requirements, edge cases, decisions
- `specs/005-multi-recipient-encryption/contracts/encryption-bundle-contract.md` — bundle invariants, recipient assembly
- `specs/005-multi-recipient-encryption/contracts/wager-registry-arbitrator-index.md` — the arbitrator discovery index
- `docs/developer-guide/envelope-encryption-spec.md` — primitives, envelope formats, security considerations
- `docs/developer-guide/encryption-architecture.md` — end-to-end flow and key registry integration
- `contracts/privacy/KeyRegistry.sol` — on-chain public-key directory
- `frontend/src/utils/crypto/envelopeEncryption.js` — envelope encryption implementation (v1.0 X25519, v2.0 X-Wing)
- `docs/blog/private-prediction-markets-envelope-encryption.md` — series anchor (part 1)
- [RFC 7748 — X25519](https://datatracker.ietf.org/doc/html/rfc7748)
- [RFC 8439 — ChaCha20-Poly1305](https://datatracker.ietf.org/doc/html/rfc8439)
- [RFC 5869 — HKDF](https://datatracker.ietf.org/doc/html/rfc5869)
- [EIP-191 — Signed Data Standard](https://eips.ethereum.org/EIPS/eip-191)
- [IETF X-Wing hybrid KEM draft](https://datatracker.ietf.org/doc/draft-connolly-cfrg-xwing-kem/)
- [Noble cryptography libraries](https://paulmillr.com/noble/)
