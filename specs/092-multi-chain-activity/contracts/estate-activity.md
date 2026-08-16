# Contract: `listEntriesAcrossEstate`

Module: `frontend/src/data/ledger/estateLedger.js`

```js
/**
 * @param {object} q
 * @param {string}   q.account          — the acting account's address (required)
 * @param {number[]} [q.chainIds]       — defaults to cohortChainIds(); always filtered by isInCohort
 * @param {number}   [q.walletChainId]  — the connected wallet's chain (provider reuse)
 * @param {object}   [q.walletProvider] — the wallet's provider (reused when scope === walletChainId)
 * @param {object}   [q.deps]           — test seams: { listEntries, readProviderFor }
 * @returns {Promise<EstateActivityResult>}  — see data-model.md; NEVER rejects
 */
export async function listEntriesAcrossEstate(q)
```

## Guarantees

1. **Never rejects.** Every per-chain failure becomes an `unreachable` ChainActivityState; the
   promise resolves with whatever the readable chains returned.
2. **Cohort-bounded.** Chains outside `cohortChainIds()` are dropped before any read; passing a
   cross-cohort id is not an error, it is a no-op (mirrors `readAcrossEstate`).
3. **Per-chain isolation.** Chains are read concurrently; one chain's latency or failure never
   delays or degrades another's result beyond overall `Promise.all` completion of settled
   per-chain wrappers.
4. **Scope preservation.** Each underlying `listEntries` call receives exactly one chainId and
   that chain's provider; the G5 normalization guard remains in force. The merge never mutates
   or re-tags an entry.
5. **Dedup by `entryId`** across the merged stream; first occurrence wins (order irrelevant —
   duplicates are byte-identical reference-chain rows by construction).
6. **Ordering**: the repository's `compareEntries` semantics over the merged stream — newest
   first, undated rows after all dated rows.
7. **Empty ≠ failed.** A chain that read successfully and returned zero entries is
   `state: 'read', entryCount: 0`. Consumers gate "no activity" language on state, not count.

## Consumer obligations (enforced by tests)

- `useAccountStats` maps `partialChains` → display names and surfaces them on every aggregate
  figure and on the feed.
- The feed renders per-entry network tags from `entry.chainId` and never from the wallet's
  active chain.
- No consumer sums, counts, or renders anything derived from an `unreachable` chain.
