# Contract: `activityLedger` Synced Object (spec 032 extension)

One new entry in `frontend/src/lib/backup/syncedObjects.js`, honoring the
registry's design ("adding a future object = one entry here").

```js
{
  key: 'activityLedger',
  label: 'Activity history',
  networkScoped: true,               // every record carries chainId
  load:  (account) => listClientRecords(account),        // ledgerClientStore
  apply: (account, value, mode) => { /* replace | merge */ },
  merge: (current, incoming) => unionByEntryId(current, incoming),
}
```

## Rules

1. **Payload = client-provenance records only** (`cl:` namespace). On-chain
   and derived entries are excluded — they re-derive from public data
   (FR-009); this keeps bundles small and avoids duplicating chain truth.
2. **Merge is conflict-free**: records are append-only value objects; union
   by `entryId`. Identical ids ⇒ identical records; `mergeConflicts` is
   always empty (unlike addressBook nickname conflicts).
3. **`mode: 'replace'`** still unions — replace semantics would delete
   history and violate FR-008 append-only. This is the one synced object
   where replace and merge are intentionally the same operation; the
   behavior is documented in the backup UI copy.
4. **Restore outcomes** (FR-010/012):
   - backup present + decrypts → client records restored, then deduped
     against re-derived entries (identity precedence);
   - no backup / undecryptable → on-chain ledger still rebuilds; the restore
     flow surfaces "device-local activity history was not recovered".
5. **Automatic inclusion**: new client records are picked up by the next
   backup with no user selection (FR-010) — `load` always returns the full
   current set.
6. **Privacy**: records travel only inside the existing encrypted bundle
   (user-held keys); nothing is uploaded in plaintext, no new endpoints.
