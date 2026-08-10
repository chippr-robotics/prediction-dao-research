# Legacy account recovery (spec 062)

The **Recovery** section (formerly "Backup & Security") lets a member bring an older account into
FairWins from a raw **EOA private key** or a **BIP-39 word list**, store it encrypted on-device, and
optionally move its funds to a smart account. It is a **frontend-only** feature — no contracts, no
gateway — that composes existing subsystems.

## Where it lives

| Concern | Module |
|---|---|
| Classify / encrypt / decrypt / vault / sweep | `frontend/src/lib/recovery/legacyKeys.js` |
| Backup-synced encrypted store (ciphertext only) | `frontend/src/lib/recovery/legacyRecoveredKeysStore.js` |
| BIP-39 word suggestions (typo help) | `frontend/src/lib/recovery/bip39Suggest.js` |
| Audit ledger record (no secrets) | `frontend/src/data/ledger/sources/legacyRecoverySource.js` |
| UI (guided bottom sheets) | `frontend/src/components/account/LegacyKeyRecoveryPanel.jsx` |
| Backup domain registration | `frontend/src/lib/backup/syncedObjects.js` (`legacyRecoveredKeys`) |

## Rules to keep

- **Secrets are encrypted at rest, never in the clear, never transmitted, never logged.** The raw
  private key / mnemonic is wrapped with AES-GCM under a PBKDF2-SHA256 (650k) key stretched from a
  member-chosen passphrase. A wrong passphrase fails the GCM tag — never fall through to substitute
  material. Only the **ciphertext blob** (`{ v, kind, address, salt, iv, ct, iterations, importedAt }`)
  is persisted or backed up.
- **The vault is per-account.** `legacyKeyVault(account)` is a CRUD facade over
  `legacyRecoveredKeysStore` (userStorage key `legacy_recovered_keys`). The store owns the key + shape;
  do not read/write that key from anywhere else.
- **Moving funds is OPTIONAL.** Storing the encrypted secret completes recovery (the SAVED screen).
  The sweep (`sweepAllAssets`) moves **all supported fungible assets** — native + every supported
  ERC-20 from `getPortfolioRegistry(chainId)` — ERC-20s first, native last (leaving a gas reserve).
  It returns a **per-asset outcome** array; one asset failing never aborts the rest, and nothing is
  silently dropped. NFTs/collectibles are out of scope and disclosed as such.
- **Recovered accounts are first-class.** Saving to the address book uses `useAddressBook()`
  (`findByAddress` → `addContact`/`updateContact`) so the account is usable on every picker. The
  encrypted records ride the spec-032 backup via the `legacyRecoveredKeys` synced object (not
  network-scoped — a legacy EOA address is the same across EVM chains).
- **Audit without leakage.** `captureLegacyRecovery(account, chainId, { recoveredAddress, source })`
  appends one client-ledger record (`kind: 'legacy_account_recovered'`, `refs` = address + type only)
  with a **stable entryId**, so it is idempotent and never carries key material.

## Testing note

Under vitest+jsdom, Node's `Buffer` leaks in and ethers' default sha256 returns a `Buffer` its own
`hexlify` rejects, breaking BIP-39 parsing. Any suite that exercises mnemonics calls
`registerEthersCrypto()` (`frontend/src/test/recovery/registerEthersCrypto.js`) to register
`@noble/hashes`. Real browsers have no `Buffer` and use the pure-JS path — production is unaffected.

See `specs/062-legacy-account-recovery/` for the spec, plan, and task breakdown.
