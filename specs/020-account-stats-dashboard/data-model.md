# Phase 1 Data Model: My Account Stats Dashboard

All structures are **client-side, derived** view models composed from existing
feeds. No new persisted storage, contract, or subgraph entity is introduced.
Everything is scoped to the active network (`chainId`).

## Source feeds (existing — inputs)

| Source | Provides |
|--------|----------|
| `useMyWagers` | member's wagers: `{ id, status, resolutionType, creator, opponent, winner, creatorStake, opponentStake, token, createdAt, resolvedAt }` |
| `reportDataSource` + `transferDerivation` | WagerTransfer rows: `{ wagerId, direction(deposit\|payout\|refund), tokenAddress, amountRaw, fromAddress, toAddress, txHash, blockNumber, timestamp }` |
| `valuation.valueTransfer` | `{ usdValue, costBasis, valuationSource }` (par $1/token stablecoin) |
| `useWalletManagement` | `balances{ native, wrappedNative, tokens }`, `refreshBalances()`, `chainId` |
| `usePriceConversion` | `nativeUsdRate`, `convertToUsd()`, `formatPrice()` |
| `useChainTokens` | active-network token `symbol`/`decimals`, `capabilities` |
| roles/membership | current roles / membership state (for de-emphasised panel) |

## Derived view models (new — outputs of `useAccountStats`)

### AccountSummary
The headline tile values for the active network.

| Field | Type | Derivation / Rule |
|-------|------|-------------------|
| `netPnlUsd` | number | Σ(payout+refund usd) − Σ(deposit usd) over **settled** wagers (realized). |
| `winRate` | number (0–1) \| null | wins ÷ (wins+losses); draws/refunds/cancellations excluded. `null` when denominator = 0 (shown as "—"). |
| `wins` / `losses` | int | settled wagers where winner == member / winner ≠ member. |
| `totalWageredUsd` | number | Σ member's **own** stake (creatorStake if creator else opponentStake), USD-valued. |
| `activeWagers` | int | count of status ∈ {open, active, draw_proposed}. |
| `walletBalanceUsd` | number | Σ active-network balances valued in USD (stable at par, native via rate). |
| `walletBalances` | TokenBalance[] | per-token rows for the balances panel. |
| `atStakeUsd` | number | Σ own stake of currently-active wagers (the "at stake" companion to realized P&L). |

**Validation**: all monetary fields ≥ 0 except `netPnlUsd` (signed). Counts are
non-negative integers. `winRate ∈ [0,1] ∪ {null}`.

### TokenBalance
| Field | Type | Notes |
|-------|------|-------|
| `tokenAddress` | string | active network |
| `symbol` | string | from `useChainTokens` (never hardcoded) |
| `decimals` | int | from `useChainTokens` |
| `amount` | string/number | human units |
| `usdValue` | number | par for stable, rate for native |

### PnlSeriesPoint
A point on the cumulative-net-P&L line.

| Field | Type | Rule |
|-------|------|------|
| `timestamp` | number (ms) | transfer time (or bucket day) within selected range |
| `cumulativeUsd` | number | running Σ(+payout +refund −deposit) up to and incl. this point |
| `deltaUsd` | number | this point's signed contribution |
| `kind` | 'deposit'\|'payout'\|'refund'\|'bucket' | for point markers / tooltip |

**Rules**: series is sorted ascending by `timestamp`; the first rendered point is
seeded with the cumulative value as of the range start (so a windowed view is
continuous, not reset to 0). Daily-bucket mode collapses to last cumulative value
per UTC day when point count would exceed the render threshold.

### PnlSeries (range-scoped wrapper)
| Field | Type | Notes |
|-------|------|-------|
| `range` | '7D'\|'30D'\|'90D'\|'ALL' | default `'30D'` |
| `points` | PnlSeriesPoint[] | possibly empty |
| `isEmpty` | bool | no transfers in range |
| `isLowData` | bool | < 2 points (render markers, not a misleading line) |
| `endValueUsd` | number | latest cumulative value (matches `AccountSummary.netPnlUsd` for ALL) |

### Breakdown
Decompositions reconciling to the headline totals.

| Field | Type | Notes |
|-------|------|-------|
| `byStatus` | `{ status, count }[]` | covers all spec statuses; Σ count = total wagers; active subset = `activeWagers` |
| `byToken` | `{ tokenAddress, symbol, count, ownStakeUsd }[]` | Σ ownStakeUsd = `totalWageredUsd` |
| `byOracle` | `{ resolutionType, label, count }[]` | label maps Polymarket/Chainlink/UMA/etc. |

### ActivityFeedEntry
A row in the recent-activity feed.

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | `txHash-logIndex` |
| `direction` | 'deposit'\|'payout'\|'refund' | from transfer |
| `amount` | string | human units |
| `symbol` | string | token ticker |
| `usdValue` | number | valuation |
| `timestamp` | number (ms) | for "Ns ago" relative time |
| `txHash` | string | builds explorer link for the active network |
| `wagerId` | string | optional deep-link to the wager |

**Rules**: newest-first; list is windowed (e.g. latest N, with "view all" → tax
report/wager history). Never shows counterparty private/encrypted detail.

### FreshnessState (per live section)
| Field | Type | Notes |
|-------|------|-------|
| `lastUpdated` | number (ms) \| null | time of last successful refresh |
| `status` | 'fresh'\|'refreshing'\|'stale'\|'error' | drives indicator + stale badge |

## Status → metric mapping (canonical)

| Wager `status` | Counts toward |
|----------------|---------------|
| `open` | Active Wagers, at-stake |
| `active` | Active Wagers, at-stake |
| `draw_proposed` | Active Wagers, at-stake |
| `resolved` (winner == member) | Wins, Win Rate denom, realized P&L |
| `resolved` (winner ≠ member) | Losses, Win Rate denom, realized P&L |
| `drawn` | settled; realized P&L (refund); **excluded** from Win Rate |
| `refunded` | settled; realized P&L (refund); excluded from Win Rate |
| `cancelled` | excluded from Win Rate; refund (if any) in realized P&L |
| `declined` | excluded everywhere except total wagers count |

## Lifecycle / refresh

- On Account-tab mount (connected + supported network): load summary + breakdowns
  (from `useMyWagers`) and transfers (from report data source); compute series for
  default 30D range.
- Range change: recompute series client-side from already-fetched transfers (no
  refetch) → satisfies <1s SC-004.
- Poll: feeds refresh on their existing cadences; changed tiles count-up in place.
- Manual refresh / pull-to-refresh: calls `refreshBalances()` and re-pulls
  transfers; resets `FreshnessState.lastUpdated`.
- Network switch: re-key on `chainId`, refetch, show that network's empty state if
  no history.
