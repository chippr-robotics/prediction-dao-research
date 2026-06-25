# Contract: Client Backup/Restore Service

The internal client interface for backup/restore, plus the honest-state contract it must honor. Pure logic in
`lib/backup/*`; orchestration in `useDataBackup`. Reuses encryption (`primitives`/`addressBookCrypto` pattern),
IPFS (`ipfsService`), and the address-book merge engine.

## `lib/backup/syncedObjects.js` — the registry (extensibility seam)

```text
activitySyncedObjects: SyncedObject[]   // [addressBook, preferences] initially
SyncedObject = { key, networkScoped, load(account), apply(account, value, mode), merge(current, incoming) }
```
- `networkScoped: true` ⇒ elements carry `chainId`; merge reconciles by `(elementId, chainId)` (FR-008/FR-015a).
- Adding tokens/DAOs later = one entry (must set `networkScoped` truthfully) — no backup/restore redesign (FR-016).

## `lib/backup/backupBundle.js` (pure)

```text
buildBundle(account) -> BackupBundle          // { schema, version, createdAt, wallet, objects:{...} } from registry.load
parseBundle(obj) -> BackupBundle | throws     // validate schema/version + per-element chainId for networkScoped
applyBundle(account, bundle, mode)            // mode 'merge'|'replace'; calls each object's apply; returns conflicts
```

## `lib/backup/backupCrypto.js` (thin; reuses primitives)

```text
DATA_BACKUP_MESSAGE_V1 = "FairWins Data Backup v1"   // domain-separated; distinct from wager/address-book msgs
deriveKey(signer) -> Uint8Array(32)                  // keccak256(signMessage(DATA_BACKUP_MESSAGE_V1)); cached/session
encryptBundle(key, bundle) -> EncryptedBackup        // encryptJson(key, bundle, aad="fairwins-data-backup:1")
decryptBundle(key, envelope) -> BackupBundle | throws// AEAD auth fail / wrong key -> throw (treated as no usable backup)
```

## `lib/backup/backupRegistry.js`

```text
readPointer(reader, owner) -> cid|""        // getPointer on the canonical-network registry (free; read provider)
writePointer(signer, cid) -> txReceipt      // setPointer on the canonical network (requires that network + gas)
CANONICAL_CHAIN_ID = 137                     // Polygon mainnet
```

## `hooks/useDataBackup.js` — orchestration + honest state

```text
backup():  build → deriveKey(sign) → encrypt → uploadJson(await pin) → writePointer(await tx) → mark success + lastBackupAt
restore(): readPointer → (none ⇒ "nothing to restore") → fetchByCid → deriveKey(sign) → decrypt → choose merge/replace + confirm → applyBundle
status:    { exists, lastBackupAt, state, message }
```

## Honest-state contract (MUST)

1. **Success only after both confirms**: `backup()` shows "backed up" + `lastBackupAt` only after the IPFS pin
   AND the `setPointer` tx both confirm (FR-002/FR-012). A pin without a confirmed pointer is NOT success.
2. **Non-destructive failure**: any failure (offline, pin error, tx reject, fetch fail, decrypt fail) leaves
   local data byte-for-byte unchanged; nothing partially applied (FR-012/FR-014).
3. **Corrupt/undecryptable** ⇒ treat as "no usable backup": local untouched, surfaced honestly (FR-013).
4. **Restore is member-controlled**: merge vs replace offered; replace warns before overwrite; cancel = no-op
   (FR-007).
5. **Network-aware**: every restored network-scoped element lands on its original `chainId`; merge keyed by
   `(id, chainId)` so identical identifiers across networks stay distinct (FR-015a/FR-008/SC-012a).
6. **Per-wallet**: only the connected wallet's pointer is read/written; switching wallets switches data
   (FR-018).
7. **No-gas-on-canonical**: backup blocked with a clear message if the member lacks gas on Polygon; restore
   (read-only) still works.
8. **Opt-in**: nothing leaves the device until `backup()` is invoked (FR-006/FR-010).
9. **Size**: warn (not fail) above the ~1 MB soft cap (FR-021).
10. **ABI/address** from the generated sync artifacts, never hardcoded (Constitution V).
