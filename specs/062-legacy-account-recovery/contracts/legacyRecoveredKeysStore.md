# Contract: `lib/recovery/legacyRecoveredKeysStore.js` (new)

Backup-synced accessor over the encrypted legacy-key vault. Only **ciphertext** blobs are read/written
here — no plaintext ever passes through. Modeled on `lib/custody/vaultReferences.js`.

Storage: `userStorage` key `legacy_recovered_keys`, per-account (`fw_user_<owner>_legacy_recovered_keys`).
Value shape: `{ [lowerAddress]: VaultEntry }` (see data-model).

## Functions

```
loadLegacyRecoveredKeys(account) → { [lowerAddress]: VaultEntry }
saveLegacyRecoveredKeys(account, map) → void
mergeLegacyRecoveredKeys(current, incoming) → { value, conflicts }
```

- `merge` unions by lowercased address; on the same address, the entry with the **newer `importedAt`**
  wins; `conflicts` lists addresses present on both sides with differing ciphertext (informational).
- `save` is a full-map overwrite (the caller composes merges).

## Synced-object registration (`lib/backup/syncedObjects.js`)

Append one entry to the `syncedObjects` array:

```
{
  key: 'legacyRecoveredKeys',
  label: 'Recovered accounts',
  networkScoped: false,
  load:  (account) => loadLegacyRecoveredKeys(account),
  apply: (account, value, mode) =>
           mode === 'replace'
             ? (saveLegacyRecoveredKeys(account, value), { conflicts: [] })
             : (() => {
                 const { value: merged, conflicts } =
                   mergeLegacyRecoveredKeys(loadLegacyRecoveredKeys(account), value)
                 saveLegacyRecoveredKeys(account, merged)
                 return { conflicts }
               })(),
  merge: (current, incoming) => mergeLegacyRecoveredKeys(current, incoming),
}
```

No `assertNetworkTagged` branch is required (`networkScoped: false`).

## Relationship to `legacyKeyVault`

`legacyKeyVault(storage)` (in `legacyKeys.js`) is the imperative CRUD the panel uses. Both read/write
the **same** `legacy_recovered_keys` key; this store adds the backup `load/apply/merge` surface. To
avoid drift, `legacyKeyVault` is refactored to resolve its storage key through this module's constant
(or the constant is shared), so there is a single source of truth for the key name and value shape.
