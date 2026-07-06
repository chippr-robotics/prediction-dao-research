# Interface Contract: PRF Key Derivation & Master-Seed Wrapping

Provider: `frontend/src/lib/passkey/prfKeys.js`. Consumers: existing
envelope-encryption stack (`utils/crypto/*`, `hooks/useEncryption.js`),
spec-032 encrypted-data-sync (blob transport). Implements research §6,
FR-012, clarification Q1.

## Derivation pipeline (per credential)

```text
WebAuthn get() with prf.eval = { first: SALT_FAIRWINS_V1 }
  → prfOutput (32 bytes, deterministic per credential+salt)
  → KEK = HKDF-SHA256(prfOutput, info="fairwins-kek-v1")
masterSeed (random 32 bytes, generated once per account, in memory only)
  → wrappedSeed = AEAD_encrypt(KEK, masterSeed)      # stored per credential
  → derived keys = existing derivation (x25519 + X-Wing) fed from masterSeed
```

- `SALT_FAIRWINS_V1` is a fixed, versioned constant (same governance as the
  existing `FairWins Market Encryption Terms v2` message).
- Downstream derivation reuses the existing `deriveKeyPairFromSignature`
  input contract (seed bytes in, keypair out) so envelope encryption, key
  publication, and multi-recipient flows are untouched.

## API surface

| Function | Contract |
|---|---|
| `probePrf(credentialId)` | true/false; result cached as `prfCapable` (data-model) |
| `initMasterSeed(account)` | first PRF-capable credential: generate seed, wrap, store blob via sync channel; idempotent (refuses if blobs exist) |
| `unwrapMasterSeed(credentialId)` | ceremony → PRF → KEK → unwrap blob → seed (memory only); typed failure if blob missing/corrupt |
| `wrapForController(controller)` | on controller add: existing session (holding seed) wraps for the new credential's KEK, or for a linked EOA via the legacy signature-derived key |
| `revokeController(controller)` | delete that controller's blob (paired with on-chain owner removal — on-chain is authoritative revocation) |
| `capability(account)` | `'available'` (≥1 PRF-capable controller with blob) / `'unavailable'(reason)` — feeds `accountCapabilities.encryption` (FR-012 degradation UI) |

## Invariants & failure rules

- masterSeed is never persisted, logged, or transmitted — wrapped blobs only.
- Same account ⇒ same masterSeed ⇒ same derived keys on every device and
  every controller that holds a blob (FR-012).
- A non-PRF credential can still fully operate the account (transactions
  unaffected); only encrypted features gate on capability, with explicit
  reason (clarification Q1). No silent key mismatch is ever possible: a
  credential without a blob gets `unavailable`, never wrong keys.
- Blob loss (sync wipe) with a surviving PRF credential is recoverable only
  via a controller that still holds the seed (session or blob); otherwise
  encrypted data is honestly reported unrecoverable — matching the existing
  signature-derived scheme's loss semantics.
- Security review obligation: AEAD choice, HKDF info-strings, and salt
  versioning reviewed with the same rigor as the existing crypto utils
  (constitution I applies to key-handling code, not just Solidity).
