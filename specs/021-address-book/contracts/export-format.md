# Contract: encrypted export/import (`addressBookCrypto`)

`frontend/src/lib/addressBook/addressBookCrypto.js` — encrypts/decrypts the address
book using a key derived from a wallet signature (clarified Q1), reusing the existing
`@noble` ChaCha20-Poly1305 primitives in `utils/crypto/primitives.js`. No new crypto
library.

## Key derivation (domain-separated)

```js
// Signing message — DISTINCT from the encryption-key message in crypto/constants.js
// so the backup key never coincides with the wager-encryption private key.
ADDRESS_BOOK_BACKUP_MESSAGE_V1 = "FairWins Address Book Backup v1"

// 32-byte symmetric key = keccak256(signature) bytes.
deriveBackupKey(signer): Promise<Uint8Array>            // prompts one wallet signature
deriveBackupKeyFromSignature(signature: string): Uint8Array
```

## File envelope (what the member downloads)

```json
{
  "format": "fairwins-address-book-backup",
  "version": 1,
  "alg": "chacha20poly1305",
  "nonce": "<hex>",
  "ciphertext": "<hex>"
}
```

- `ciphertext` is `encryptJson(key, <export payload>, aad)` where the export payload
  is defined in `data-model.md` (Export payload).
- `aad` (authenticated associated data) binds the envelope metadata
  (`format`+`version`) so a tampered header fails authentication.
- The file contains **no** plaintext nicknames, addresses, or notes (FR-019).

## API

```js
// Returns a Blob/string ready to download. Prompts one signature.
exportAddressBook(book: AddressBook, signer): Promise<string /* JSON envelope */>

// Decrypts an envelope using the connected wallet. Prompts one signature.
// Throws a typed error on wrong-wallet / corrupt-file (AEAD auth failure) — the
// caller leaves the existing book untouched (FR-021).
importAddressBook(envelopeJson: string, signer): Promise<AddressBook>
```

## Behavioural contract

| Scenario | Result |
|----------|--------|
| Export, then import with the **same wallet** | Full round-trip; all contacts/addresses/networks/notes restored (FR-020, SC-005). |
| Import with a **different wallet** | AEAD authentication fails → typed error; no contact data revealed; existing book unchanged (FR-021). |
| Corrupt/invalid/incompatible file | Validation or AEAD error → clear message; existing book unchanged (FR-021). |
| Overlap with existing contacts | Decrypt → hand off to `mergeBook` (additive, keyed on address; conflicts surfaced) (FR-022). |

## Notes

- The derived key is held only transiently in memory for the operation and never
  persisted (Constitution: no secrets persisted).
- Version field allows future format migration; importer rejects unknown
  `format`/`version` with a clear message rather than guessing.
