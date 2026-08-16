# Data Model: Multi-Chain Activity Ledger

## EstateActivityResult (returned by `listEntriesAcrossEstate`)

| Field | Type | Rules |
|---|---|---|
| `entries` | `LedgerEntry[]` | merged, newest-first (repository comparator), deduped by `entryId`; every entry keeps its `chainId` |
| `chainStates` | `ChainActivityState[]` | one per attempted cohort chain, always present |
| `partialChains` | `number[]` | chainIds whose state is `unreachable` — the names consumers must disclose |
| `staleByChain` | `Map<number, string[]>` | per-chain source classes that degraded within a `read` chain |
| `prunedByChain` | `Map<number, number>` | per-chain pruning marker (epoch ms), only for chains that reported one |

## ChainActivityState

| Field | Type | Rules |
|---|---|---|
| `chainId` | `number` | cohort member |
| `state` | `'read' \| 'unreachable'` | `read` even when zero entries (genuinely empty is honest); `unreachable` on provider absence or a thrown per-chain read |
| `reason` | `string?` | present only for `unreachable` |
| `entryCount` | `number` | 0 for `unreachable` — consumers must never render this 0 as "no activity" (gate on `state`) |

## LedgerEntry (existing, unchanged shape — relevant fields)

| Field | Rule in this feature |
|---|---|
| `entryId` | globally unique because it embeds chainId; the cross-chain dedup key |
| `chainId` | the row's network tag; drives the badge, explorer link, network filter, and `(chainId, wagerId)` lookups |
| `refs.wagerId` | only meaningful together with `chainId` |
| `wagerTitle` | annotated from the per-chain title map — never resolved across chains |

## Derived view-model changes

- **wagerStatusById** → `wagerStatusByKey: Map<'chainId:wagerId', status>`
- **wagerTitles** → `Map<chainId, Map<wagerId, title>>`
- **staleClasses (UI)** → strings of the form `"<class> on <network name>"`
- **partial disclosure (UI)** → network display names via `networkName(chainId)`

## Invariants

1. An entry appears in `entries` iff its chain's state is `read` (unreachable chains contribute
   nothing, and their absence is named — never zeroed).
2. `entries[i].chainId` is always in the attempted cohort set (G5 holds per chain; the merge
   never re-tags).
3. Two entries with equal `entryId` never both survive the merge.
4. `partialChains` non-empty ⇒ every aggregate figure downstream is rendered with the partial
   disclosure; `partialChains` empty ⇒ no partial language anywhere.
5. The display cap (50 rows) is applied after the merged sort, never per chain.
