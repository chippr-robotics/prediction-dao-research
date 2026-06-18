# Contract: `useAccountStats` data hook

The dashboard's single data seam. Composes existing feeds into the derived view
models in [data-model.md](../data-model.md). Pure aggregation is delegated to
`lib/account/*` so it is unit-testable without React or network.

## Signature

```text
useAccountStats({ range = '30D' } = {}) → {
  // headline
  summary: AccountSummary | null,

  // hero chart (recomputed locally on range change, no refetch)
  series: PnlSeries,            // { range, points[], isEmpty, isLowData, endValueUsd }
  setRange(range): void,        // '7D' | '30D' | '90D' | 'ALL'

  // secondary
  breakdowns: Breakdown | null, // { byStatus[], byToken[], byOracle[] }
  activity: ActivityFeedEntry[],

  // state
  isConnected: boolean,
  isSupportedNetwork: boolean,
  chainId: number,
  isLoading: boolean,           // first load, no cached data yet
  isEmpty: boolean,             // connected, supported, but zero activity on this network
  error: Error | null,

  // freshness (per section)
  freshness: {
    summary: FreshnessState,
    series: FreshnessState,
    balances: FreshnessState,
    activity: FreshnessState,
  },
  refresh(): Promise<void>,     // manual / pull-to-refresh (re-reads balances + transfers)
}
```

## Behavioral contract

1. **Network scoping** — every returned figure is for the active `chainId` only;
   on chain switch the hook re-keys and refetches; it MUST NOT blend cross-network
   data. (FR-014)
2. **Honest empties** — when there is no activity, `isEmpty === true`,
   `series.isEmpty === true`, `summary` fields are neutral zeros (with
   `winRate === null`), and **no** synthetic points are produced. (FR-008, FR-019)
3. **Realized P&L** — `summary.netPnlUsd` and `series.endValueUsd` (for `ALL`)
   reconcile exactly; both exclude unsettled stakes. (Clarification 1)
4. **Reconciliation** — `Σ breakdowns.byStatus.count === total wagers`;
   active subset === `summary.activeWagers`;
   `Σ breakdowns.byToken.ownStakeUsd === summary.totalWageredUsd`. (FR-009)
5. **Range change is local** — `setRange` recomputes `series` from already-fetched
   transfers without a network round-trip, completing in <1s. (SC-004)
6. **Stale, not blank** — on a failed poll the last-known values remain and the
   relevant `freshness[section].status` becomes `'stale' | 'error'`. (FR-013)
7. **No private data** — `activity` and breakdowns expose only the member's own
   transactions/aggregates; never counterparty private/encrypted detail. (FR-020)

## Pure helpers (no React) — independently unit-tested

```text
lib/account/computeSummary.js   → computeSummary(wagers, transfers, balances, rates) → AccountSummary
lib/account/computePnlSeries.js → computePnlSeries(transfers, range, now) → PnlSeries
lib/account/breakdowns.js       → computeBreakdowns(wagers, tokenMeta) → Breakdown
```

These MUST be deterministic given inputs (inject `now`) and cover: empty input,
single transfer, deposits-only (negative-trending), settled wins/losses, draws
excluded from win rate, multi-token totals, and dense-history daily bucketing.
