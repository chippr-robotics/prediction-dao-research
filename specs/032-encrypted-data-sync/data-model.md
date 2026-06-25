# Data Model: Encrypted Data Backup & Restore

Client-side data (browser `localStorage`) + an encrypted IPFS file + one on-chain pointer slot. No backend, no
database. All shapes are plain JSON; the on-chain pointer stores only a CID string.

## Entity: Backup Bundle (the unified, network-tagged payload)

The single per-wallet object that gets encrypted and stored. One file, but **every network-specific element
carries its `chainId`** (FR-015a); network-agnostic data has none.

```text
BackupBundle {
  schema: "fairwins-data-backup",
  version: 1,
  createdAt: number,            // ms; also the conflict/“newer wins” signal
  wallet: string,               // lowercased owner address (sanity check on restore; not trusted for auth)
  objects: {
    addressBook: AddressBook,           // network-tagged INSIDE (each SavedAddress has chainId) — see below
    preferences: Preferences,           // network-agnostic (global)
    // future: tokens: TokenRef[], daos: DaoRef[] — each element MUST carry chainId (network-scoped)
  }
}
```

- **Network-scoped objects** are collections whose elements each include `chainId`; identity is
  `(elementId, chainId)`. The same identifier on two networks is two distinct, independently-durable elements.
- **Network-agnostic objects** (preferences) have no `chainId`.
- The bundle holds **all networks at once** (address book is already account-global with per-entry `chainId` —
  one read covers every network; no per-chain enumeration).

### addressBook (reused as-is — already network-tagged)
```text
AddressBook  { schemaVersion: 1, contacts: Contact[], updatedAt: number }
Contact      { id, nickname, addresses: SavedAddress[], createdAt, updatedAt }
SavedAddress { address(checksummed), chainId: number, notes, addedAt }   // chainId = the network tag
```
Identity/merge key: `addressKey(address, chainId) = "<addr.toLowerCase()>:<chainId>"`.

### preferences (network-agnostic)
```text
Preferences { recentSearches: string[], favoriteMarkets: string[], defaultSlippage: number, polymarketCategories: string[] }
```

**Validation**: `schema`/`version` recognized (else "no usable backup"); `objects` is a plain object; each
network-scoped element has a numeric `chainId`; unknown future objects are ignored by older clients (forward-
compatible).

## Entity: Encrypted Backup (envelope stored on IPFS)

Clones the address-book backup envelope; AAD binds the header so tampering fails AEAD auth.

```text
EncryptedBackup {
  format: "fairwins-data-backup",
  version: 1,
  alg: "chacha20poly1305",
  nonce: hex,
  ciphertext: hex            // encryptJson(key, BackupBundle, aad=`${format}:${version}`)
}
```
- **Key**: `keccak256(signer.signMessage(DATA_BACKUP_MESSAGE_V1))` → 32 bytes (reuse `deriveBackupKey` pattern;
  new domain message `"FairWins Data Backup v1"`). Never stored/transmitted.
- Stored via `ipfsService.uploadJson(envelope, { namePrefix: 'data-backup' })` → CID.

## Entity: Backup Pointer (on-chain)

The trustless locator — one slot per wallet in `BackupPointerRegistry` on the canonical network (Polygon 137).
Stores only the CID (a pointer; no personal data; public by design, FR-005b).

```text
mapping(address => string) pointer   // owner => latest backup CID
event BackupPointerSet(address indexed owner, string cid, uint64 timestamp)
```
See `contracts/backup-pointer-registry.md`.

## Entity: Synced-Object Registry (the extensibility seam)

`frontend/src/lib/backup/syncedObjects.js` — declares each backed-up object so backup/restore are object-
agnostic and network-scope is enforced.

```text
SyncedObject {
  key: 'addressBook' | 'preferences' | ...,
  networkScoped: boolean,           // true => elements carry chainId; restore re-associates by (id, chainId)
  load(account): object,            // gather current local value (all networks)
  apply(account, value, mode): void,// mode = 'merge' | 'replace'
  merge(current, incoming): { value, conflicts },   // additive-by-(id,chainId) for collections; LWW for scalars
}
```
- `addressBook`: `networkScoped: true`; `load`=`loadAddressBook`, `merge`=`mergeBook` (additive by
  `addressKey`), `apply` replace = `saveAddressBook`, merge = `mergeBook` + `applyConflictResolutions`.
- `preferences`: `networkScoped: false`; `load`=read the 4 keys; `merge`= last-writer-wins by bundle
  `createdAt` (or field-wise newest); `apply`= save the 4 keys.
- Adding `tokens`/`daos` later = a new entry with `networkScoped: true` (FR-016).

## Entity: Backup Status (member-visible, local)

```text
BackupStatus { exists: boolean, lastBackupAt: number|null, state: 'idle'|'backing-up'|'restoring'|'error', message?: string }
```
Derived from the pointer read + local last-backup record; drives the UI (FR-008/FR-011). "Backed up" is only
shown after the pin AND the pointer write both confirm (FR-012).

## State transitions

- **Backup**: idle → backing-up → (pin ok → pointer-tx ok) → idle + `lastBackupAt`; any failure → error
  (local data unchanged).
- **Restore**: idle → restoring → read pointer → fetch → decrypt → (member picks merge/replace + confirm) →
  apply → idle; no pointer/undecryptable/fetch-fail → idle + "nothing to restore"/error (local untouched).

## Scope: backed up vs excluded

| Backed up (user-authored) | Excluded (re-derivable cache / device-local) |
|---|---|
| Address book (per-account, chainId-tagged inside) | Activity store (cache) |
| Global preferences (4 keys) | Tax-report history, wager/friend-market caches |
| *(candidate)* Open-challenge code vault — irrecoverable if lost | UI acks/dismissals, role/purchase mirrors (re-derivable) |
