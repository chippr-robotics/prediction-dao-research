# Contract: Persisted store schema (v1) & migration

The `localStorage` contract for the generalized activity system. Reuses the existing versioned/validated/
corrupt-reset envelope and per-(account, chain) key scoping.

## Key

```
fw_user_<lowercased-address>_platform_activity_v1_<chainId>
```
- `fw_user_<address>_` — prepended by `utils/userStorage` (account scope; always `localStorage`).
- `platform_activity_v1_<chainId>` — `featureKey(chainId)`; the `_<chainId>` embeds network scope because
  `userStorage` is not network-aware.

Disconnected wallet (`!account`) → `load` returns the default store **without touching storage**; `save`
no-ops. Two accounts on one chain, and one account on two chains, are fully isolated.

## Shape (`STORE_VERSION = 1`)

```text
{
  version: 1,
  lastPolledAt: number,          // ms; 0 in the default store
  entries: ActivityEntry[],      // merged across domains, newest-first, length <= MAX_ENTRIES (100)
  sources: {
    [sourceKey: string]: {
      snapshots: { [refId: string]: object },
      aux: object                // optional per-source records (e.g. deadline warn timestamps)
    }
  }
}
```

`isValidStore(value)` accepts only: plain object, `version === 1`, `lastPolledAt` number, `entries` array,
`sources` plain object. Anything else → `console.warn` (if a value was present) + reset to `defaultStore()`
(honest corrupt-recovery; never throws to the UI).

## Pure store API (generalized from `activityStore.js`)

| Function | Signature | Behavior |
|----------|-----------|----------|
| `defaultStore()` | `() → Store` | `{version:1,lastPolledAt:0,entries:[],sources:{}}` |
| `loadStore(account, chainId)` | `→ Store` | read+validate+migrate (below); default when no account/missing/corrupt |
| `saveStore(account, chainId, store)` | `→ void` | no-op when `!account`; else persist |
| `appendEntries(store, entries)` | `→ Store` | id-dedup (existing wins) + prepend newest-first + slice to `MAX_ENTRIES`; **global across domains** |
| `markRead(store, ref)` | `→ Store` | `ref = '*' \| {entryId} \| {refId}` (`refId` generalizes `wagerId`); flips only unread matches |
| `pruneSnapshots(store, sourceKey, currentIds, nowMs)` | `→ Store` | drop a source's snapshot when absent-this-cycle AND terminal AND older than 30d |
| `setSourceSlice(store, key, {snapshots, aux})` | `→ Store` | replace one source partition (engine step 3) |

All pure (return a new store, never mutate). `ActivityEntry` and dedup semantics per `data-model.md`.

## Migration: legacy wager store → platform store

Trigger: `loadStore(account, chainId)` finds **no** `platform_activity_v1_<chainId>` value but **does**
find a legacy `wager_activity_v1_<chainId>` value (valid).

Transform (one-time, then persist under the new key):
```text
platform = {
  version: 1,
  lastPolledAt: legacy.lastPolledAt,
  entries: legacy.entries.map(e => ({ ...e, domain: 'wagers', refId: e.wagerId ?? e.refId })),
  sources: { wagers: { snapshots: legacy.snapshots, aux: legacy.deadlineWarnings ?? {} } },
}
// legacy.drawScanBlock dropped (unused since spec 017)
```
Read state (`entry.read`) is preserved. The legacy key MAY be left in place (harmless) or cleared; do not
fail if it is malformed — fall back to a default platform store. Idempotent: once the platform key exists,
migration never runs again.

## Invariants (tested)

- Corrupt/old-version value → default store, no throw, one `console.warn`.
- Cross-account and cross-chain isolation (distinct keys; no leakage) — FR-015.
- `appendEntries` dedup preserves the existing entry (and its `read`) on `id` collision — FR-010/018.
- `markRead({refId})` and `'*'` affect only matching unread entries; a concurrent poll re-reads latest
  before append so a mid-cycle `markRead` is not resurrected — FR-014.
- Migration preserves entry count + read state and produces a valid v1 store.
