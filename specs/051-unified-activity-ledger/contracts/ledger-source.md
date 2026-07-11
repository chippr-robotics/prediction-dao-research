# Contract: Ledger Source Adapter

Every activity domain plugs into the ledger through this interface
(`frontend/src/data/ledger/sources/*.js`). Mirrors the spec-031 domain-source
pattern but returns canonical LedgerEntry pre-items instead of notifications.

```js
/**
 * @typedef {object} LedgerSource
 * @property {string} class                    // 'wager' | 'transfer' | 'earn' | 'pool' | 'membership'
 * @property {(ctx: SourceContext) => Promise<LedgerEntryPreItem[]>} list
 * @property {(listener: () => void) => (() => void)} [subscribe]  // optional change signal (e.g. transferStore events)
 */

/**
 * @typedef {object} SourceContext
 * @property {string} account     // lowercased address
 * @property {number} chainId     // strict scoping — a source MUST NOT return entries for other chains
 * @property {object} [provider]  // injected read provider (tests / RPC reuse)
 * @property {AbortSignal} [signal]
 */
```

## Rules

1. **Pure fetch**: `list` performs reads only; it never writes stores and
   never throws for empty history (returns `[]`). Network errors reject; the
   repository degrades per-source and reports which classes are stale rather
   than failing the whole ledger (honest-state principle).
2. **Pre-item shape**: everything in `data-model.md` LedgerEntry except
   enrichment fields (`tokenSymbol/tokenDecimals/valueUsd/valuationStatus`),
   which the repository adds via the shared enrichment pipeline. `entryId`
   MUST be set by the source using `identity.js` builders.
3. **Timestamps**: sources return epoch **ms** or `null` — never `0`, never
   seconds. Chain-time hydration (wager fallback path) happens inside the
   wager source via `timestamps.js`, bounded by the existing scan budget.
4. **Determinism**: for `oc:` and `dv:` entries, calling `list` twice yields
   identical `entryId`s (idempotent re-derivation, FR-009/011).
5. **No cross-domain reach**: a source only reads its own domain's data
   paths; consistency across surfaces is the repository's job.

## Repository assembly contract (`ledgerRepository.js`)

```
listEntries({ account, chainId, filter?, period?, signal? })
  → { entries: LedgerEntry[],          // deduped, enriched, sorted desc by (timestamp ?? recordedAt)
      staleClasses: string[],          // sources that errored; UI must disclose
      prunedBefore: number | null }    // FR-013 disclosure marker
```

- Dedup/merge per `data-model.md` Identity precedence.
- Filters: by class, kind, status, date range — used by the Account tab UI
  and by the report builder (same code path, FR-014).
- Failed entries are included in `entries` and excluded by the summary
  helpers, not by the repository.
