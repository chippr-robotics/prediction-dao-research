# Phase 0 Research: My Account Stats Dashboard

All Technical Context unknowns resolved below. Each decision lists rationale and
alternatives considered.

## R1. Charting library (the one new core dependency)

**Decision**: Add **Recharts `^3.8`** for the hero cumulative-P&L time-series
chart, imported only inside `PnlChart.jsx` and **lazy-loaded** via
`React.lazy`/dynamic import so it is excluded from the initial route bundle.

**Rationale**:
- React 19 compatible: Recharts 3.x (latest 3.8.x) explicitly supports React 19,
  which this app uses (19.2). ([npm](https://www.npmjs.com/package/recharts),
  [3.0 migration guide](https://github.com/recharts/recharts/wiki/3.0-migration-guide))
- Provides out-of-the-box `ResponsiveContainer`, area/line series, tooltips, and
  axis components — covering FR-005/FR-006/FR-007 (responsive, range selector
  pairs with it, point inspection via tooltip) with far less custom code than a
  hand-rolled SVG chart, satisfying the constitution's simplicity preference for
  the *amount of code we own*.
- Themeable with our CSS variables: series/area colors set from
  `--chart-series-*` and `--semantic-win/-loss`; honors dark/light (FR-015).
- Lazy-loading keeps bundle growth modest and confined to the one tab that needs
  it (constitution: accessible, performant frontend).

**Alternatives considered**:
- **Custom SVG line/area chart** (consistent with the hand-rolled RAF in
  `LiveStats`): zero dependency and smallest bundle, but we'd reinvent tooltips,
  responsive sizing, and accessible focus handling — higher defect risk for the
  centerpiece visual. Rejected for initial scope; remains a viable fallback if
  Recharts peer-dep resolution proves troublesome.
- **visx** (low-level d3 + React): maximum control, but much more code to reach
  parity and a steeper a11y burden. Rejected (YAGNI).
- **chart.js / react-chartjs-2**: canvas-based — harder to theme with CSS vars
  and less accessible/DOM-inspectable than SVG. Rejected.

**Risk/Mitigation**: If `npm install` reports a React 19 peer conflict, pin a
known-good 3.x and document the exact version; do **not** mask with blanket
`--legacy-peer-deps` in CI. The custom-SVG fallback above bounds the risk.

## R2. Net P&L time-series data source

**Decision**: Build the cumulative-P&L series from **WagerTransfer** rows fetched
by the existing report data source (`data/reports/reportDataSource.js`,
`ReportTransfers($party, $first, $skip)` subgraph query), valued in USD via
`data/reports/valuation.js` (par $1.00/token for stablecoins). Series math lives
in a new pure helper `lib/account/computePnlSeries.js`.

**Rationale**: This is exactly the deposit/payout/refund stream the spec's chart
needs, already indexed, network-scoped, and USD-valued — no new query or subgraph
field required (FR-019). Cumulative net P&L = running sum of
`+payout +refund −deposit` over time. Reusing the indexed transfer path (not the
full PDF/CSV report builder) keeps the read lightweight.

**Alternatives considered**: Reuse the whole `useTaxReport` build pipeline —
rejected: it is oriented to on-demand report generation + history persistence +
gas enrichment, heavier than a dashboard read needs. We reuse its *data source +
valuation*, not its report orchestration.

## R3. Series bucketing granularity (deferred from spec)

**Decision**: Plot **one point per value-moving transfer** (event-stepped
cumulative line), clamped to the selected range window, with the line starting at
the cumulative value as of the range's start. For very dense histories, cap
rendered points by **daily bucketing** (last value per UTC day) only when a range
would exceed a render threshold (e.g. >180 points).

**Rationale**: Event-stepped is the most honest representation (each step is a
real settlement) and trivial to compute; daily bucketing is a pure-perf guard for
the "All" range on heavy users. Both are deterministic and unit-testable.

**Alternatives considered**: Always daily/weekly buckets — rejected: most members
have sparse history where per-event detail is clearer and avoids implying
data on days with no activity.

## R4. Summary metrics derivation

**Decision**: Compute in `lib/account/computeSummary.js` from `useMyWagers`
items (creator/opponent, stakes, status, winner, token) + transfer-derived
realized totals:
- **Net P&L (USD, realized)** = Σ(payout+refund) − Σ(deposit) over settled wagers
  (from transfers/valuation). (Clarification 1)
- **Win Rate** = wins ÷ (wins + losses), where a "win" = settled wager with
  `winner == member`; "loss" = settled wager with a winner ≠ member; draws,
  refunds, cancellations excluded from both. (Clarification 2)
- **Total Wagered** = Σ of the member's own stake across their wagers (creatorStake
  if creator, else opponentStake). (Clarification 3)
- **Active Wagers** = count of wagers with status in {open, active, draw_proposed}.
- **Wallet Balance** = from `useWalletManagement` balances + `usePriceConversion`
  for USD.

**Rationale**: Directly implements the recorded clarifications; pure functions
keep it testable and free of network/React.

## R5. Real-time / freshness model

**Decision**: Polling only (no websockets), reusing each feed's existing cadence
(activity ~30s, site stats ~60s, native price ~5min) and `useWalletManagement`'s
`refreshBalances()` for manual/pull-to-refresh. `useAccountStats` exposes a
`lastUpdated` timestamp per section; `FreshnessIndicator` renders "updated Ns ago"
from it and ticks via a 1s interval (display-only). Numeric tiles animate with the
existing ease-out-cubic count-up pattern extracted/adapted from `LiveStats`,
gated on `prefers-reduced-motion`.

**Rationale**: Matches established app behavior and the spec's assumptions;
reusing cadences avoids new infrastructure (FR-011/FR-012). Honoring
`prefers-reduced-motion` is required for FR-018.

**Alternatives considered**: Add websockets/subgraph subscriptions — rejected:
out of scope, no backend support, contradicts the spec's polling assumption.

## R6. Empty / low-data & error states

**Decision**: `useAccountStats` returns explicit flags: `isEmpty` (no wagers and
no transfers on the active network), `isLowData` (fewer than 2 series points), and
per-section `error`/`isStale`. Components render dedicated empty states (chart
shows a baseline + "no activity yet" + CTA to create/accept a wager; tiles show
neutral zeros marked "no activity yet") and never synthesize points. On poll
error, last-known values render with a stale badge (FR-013).

**Rationale**: Directly satisfies US3 / FR-008 / FR-013 and Constitution III.

## R7. Accessibility approach

**Decision**: Range selector and refresh are real `<button>`s in a labelled
group, keyboard operable; win/loss carry a non-color cue (sign + ▲/▼ glyph or
"+/−" and text) in addition to green/red; the chart has an accessible name and a
visually-hidden text summary (e.g. "Net P&L over last 30 days: +$X") plus a data
table fallback for screen readers. `vitest-axe` asserts no violations; Lighthouse
in CI for AA.

**Rationale**: FR-004/FR-018, Constitution V. SVG charts are notoriously
screen-reader-opaque, so the hidden summary/table is the accepted pattern.

## R8. Network scoping

**Decision**: All sections key their data and caches on the active `chainId`
(from wagmi/`useWalletManagement`); switching networks remounts/refetches and
shows that network's empty state if no history. No values from another chain are
ever blended.

**Rationale**: FR-014, Constitution III (network-scoped data).

## Resolved unknowns summary

| Unknown | Resolution |
|---------|-----------|
| Charting library & version | Recharts ^3.8, lazy-loaded (R1) |
| P&L time-series source | Existing WagerTransfer query + par valuation (R2) |
| Series bucketing | Event-stepped, daily-bucket guard for dense ranges (R3) |
| Metric formulas | Per clarifications 1–3 (R4) |
| Real-time mechanism | Polling at existing cadences + freshness ticker (R5) |
| Empty/error states | Explicit flags, honest states, stale badges (R6) |
| Accessibility | Buttons + non-color cues + hidden chart summary; axe (R7) |
| Network scoping | Keyed on active chainId (R8) |

**Sources**: [recharts on npm](https://www.npmjs.com/package/recharts) ·
[Recharts 3.0 migration guide](https://github.com/recharts/recharts/wiki/3.0-migration-guide) ·
[Best React chart libraries 2026 — LogRocket](https://blog.logrocket.com/best-react-chart-libraries-2026/)
