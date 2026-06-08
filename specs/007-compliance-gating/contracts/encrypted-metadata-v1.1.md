# Contract: Encrypted metadata v1.1 — T&C version binding (AAD)

Extends the envelope-encryption schema so each wager carries tamper-evident proof of its
governing T&C version (FR-056/FR-057), without touching key derivation (FR-041).

## Schema change (`frontend/src/schemas/encrypted-metadata-v1.1.json`)

- Add to `properties`: `termsVersion` = `{ "id": string, "hash": "<sha256 hex>" }`.
- Keep `termsVersion` **out of `required`** (legacy compatibility).
- Extend the `version` enum to include `"1.1"`.
- Reconcile the existing drift: the on-disk schema currently describes the old
  `xsalsa20`/top-level shape with `additionalProperties:false`; the v1.1 file MUST match the
  **runtime** envelope (`content.{nonce,ciphertext}`, `keys[]`,
  `x25519-chacha20poly1305` / `xwing-chacha20poly1305`) and allow `termsVersion`.

## AEAD binding (`frontend/src/utils/crypto/envelopeEncryption.js`)

- Add the AAD argument to the **content** cipher only:
  - seal: `encryptEnvelope` (~L305), `encryptEnvelopeXWing` (~L482)
  - open: `decryptEnvelope` (~L383), `decryptEnvelopeXWing` (~L555)
  - **NOT** on the per-recipient DEK-wrap ciphers.
- `aad = utf8ToBytes(TERMS_AAD_PREFIX + "|" + schemaVersion + "|" + termsVersion.hash)` where
  `TERMS_AAD_PREFIX = "FairWins-TC"` is pinned in `constants.js`. The decrypt side
  reconstructs the AAD from `envelope.termsVersion` (the authenticated field), so tampering
  with the claimed version ⇒ ChaCha20-Poly1305 auth failure ("invalid tag").
- The seal/open emit/consume `termsVersion = { id, hash }` alongside existing fields.

## Invariants

- **Key derivation unchanged**: `getMarketSigningMessage`/`SIGNING_MESSAGES`/keccak256 seed
  untouched; the T&C hash is only a function arg into the AEAD + envelope JSON.
- **Canonicalization (frozen)**: `NFC → CRLF/CR→LF → trim → UTF-8 → sha256 → hex`
  (FR-026/FR-059); same algorithm used to compute the Legal Document Version hash.
- **Legacy (FR-057)**: `termsVersion` absent ⇒ decrypt with **no AAD** (today's exact path)
  and treat the wager as governed by the launch version; existing v1.0/v2.0 envelopes
  unchanged and never re-bound.

## Tests (Vitest)

- New-envelope round-trip with `termsVersion` + AAD.
- AAD tamper rejection: mutate `termsVersion.hash` ⇒ decrypt throws.
- Legacy round-trip: v1.0/v2.0 envelope (no `termsVersion`) decrypts with no AAD.
- Hash reproducibility: an independent re-hash of canonical text matches `termsVersion.hash`
  (SC-005/SC-009).
