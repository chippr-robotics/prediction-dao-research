# Contract: Account Dashboard components

Presentational components under `frontend/src/components/account/`. They consume
`useAccountStats` (directly or via props) and the existing theme tokens. All must
honor dark/light mode and meet WCAG 2.1 AA.

## `<AccountDashboard />`
- **Role**: Orchestrator rendered by `WalletPage` for the `account` tab.
- **Props**: none (reads `useAccountStats` + wallet context).
- **Renders**: identity strip → `SummaryTiles` → `PnlChart` → `ActivityBreakdowns`
  + `RecentActivityFeed` → `WalletUtilitiesPanel`.
- **States**: not-connected → existing connect prompt; supported-network gate;
  `isEmpty` → first-run empty layout with CTA; otherwise full dashboard.
- **Layout**: mobile-first single column at ~390px; multi-column from a breakpoint.

## `<SummaryTiles summary freshness />`
- Tiles: Net P&L (USD, signed), Win Rate (% or "—"), Total Wagered, Active Wagers,
  Wallet Balance.
- Numbers **count-up** on first reveal and on value change; respects
  `prefers-reduced-motion` (falls back to final value). Reuse the ease-out-cubic
  pattern from `LiveStats`.
- Win/loss styling uses `--semantic-win`/`--semantic-loss` **plus** a non-color
  cue (sign + ▲/▼). Money uses compact USD notation (`formatPrice`).
- Empty/low-data: neutral zeros labelled "no activity yet".

## `<PnlChart series setRange />`
- Hero cumulative-net-P&L area/line chart (Recharts, **lazy-loaded**), default 30D.
- Range selector: keyboard-operable button group `7D | 30D | 90D | All`; selected
  state announced (aria-pressed).
- Point inspection: tooltip on hover (pointer) / tap (touch) showing date +
  cumulative value (FR-007).
- Theming: area/line from `--chart-series-*`; positive vs negative region cued by
  `--semantic-win`/`--semantic-loss`.
- Accessibility: chart has an accessible name + visually-hidden text summary and a
  screen-reader data-table fallback; no reliance on color alone.
- Empty/low-data: render baseline + "no activity yet" CTA (US3) or discrete
  markers — never a fabricated trend line.

## `<ActivityBreakdowns breakdowns />`
- Three compact views: by status (active vs settled, won/lost/draw), by token, by
  oracle type. Each reconciles to the headline totals (FR-009). Counts have text
  labels (not color-only).

## `<RecentActivityFeed activity />`
- Newest-first list of deposits/payouts/refunds: direction (with icon + text),
  amount + token symbol, USD value, relative "Ns ago" time, and a link to the
  transaction on the active network's explorer. Optional deep-link to the wager.
- Empty: "no recent activity yet".

## `<FreshnessIndicator state onRefresh />`
- Renders "updated Ns ago" from `state.lastUpdated`, ticking ~1s (display only).
- Manual refresh button (accessible name) + pull-to-refresh affordance on mobile.
- On `stale`/`error`: shows a stale badge; never blanks the section.

## `<WalletUtilitiesPanel address />`
- De-emphasised panel preserving: full address with copy, **Show QR Code**
  (existing `AddressQRModal`), **Disconnect Wallet** (existing flow). No behavior
  change vs. today (FR-017).

## Unchanged
- `WalletPage` sub-tabs Membership / Network / Security / Preferences / Reporting /
  Swap keep their current content and behavior; only the `account` tab body
  changes.
