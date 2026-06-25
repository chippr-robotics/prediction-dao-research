# Encrypted data backup & restore (spec 032)

Client side of the backup feature. Reuses the audited encryption primitives, the IPFS pin/fetch path, and the
address-book merge engine; the only new on-chain piece is the value-free `BackupPointerRegistry`.

- `backupCrypto.js` — `deriveKey(signer)` (keccak256 of `signMessage("FairWins Data Backup v1")`, distinct
  domain message), `encryptBundle`/`decryptBundle` (ChaCha20-Poly1305, header bound via AEAD AAD). A wrong
  key / tampered / foreign envelope throws → callers treat as "no usable backup" (never overwrite local).
- `backupBundle.js` — `buildBundle(account, nowMs)` / `parseBundle(obj)` / `applyBundle(account, bundle, mode)`.
  The bundle is **unified per wallet** and **network-tagged**: `parseBundle` rejects a network-scoped element
  missing its `chainId` (FR-015a). `mode` = `'merge'` (additive) | `'replace'`.
- `syncedObjects.js` — the extensible registry: each object declares `networkScoped` + `load`/`apply`/`merge`.
  Initial: `addressBook` (networkScoped; merge additive by `(address, chainId)`) + `preferences`
  (network-agnostic; last-writer-wins). Add tokens/DAOs as new entries (FR-016).
- `backupRegistry.js` — `readPointer(owner)` (free, read-only provider on the canonical network),
  `writePointer(signer, cid)`, `isBackupAvailable()`. Canonical network = Polygon mainnet (137).

Envelope/bundle shapes: see `specs/032-encrypted-data-sync/data-model.md`. Honest-state contract +
flow: see `specs/032-encrypted-data-sync/contracts/backup-service.md`. The orchestration hook
(`hooks/useDataBackup.js`) and UI (`components/account/BackupPanel.jsx`) build on these (US1+).
