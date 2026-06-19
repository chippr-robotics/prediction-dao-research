# Quickstart & Validation: My Account Stats Dashboard

How to run and validate the dashboard end-to-end. Implementation detail lives in
[plan.md](./plan.md), [data-model.md](./data-model.md), and
[contracts/](./contracts/); this is the run/verify guide.

## Prerequisites

- Repo deps installed (`npm install` at root and in `frontend/`).
- `frontend/package.json` includes `recharts` (^3.8) — added by this feature.
- A subgraph endpoint configured (`VITE_SUBGRAPH_URL`) for the active network, or
  the RPC fallback reachable. A test wallet with some wager history on a supported
  network (e.g. Polygon Amoy) to see populated data; a fresh wallet to see empty
  states.

## Run

```bash
# from repo root
npm run frontend          # start the Vite dev server
# open the app, connect a wallet, navigate to My Account → Account tab
```

## Validation scenarios (map to spec acceptance criteria)

1. **Summary tiles (US1 / FR-002)** — Connect a wallet with settled wagers; the
   Account tab shows Net P&L (USD), Win Rate, Total Wagered, Active Wagers, Wallet
   Balance, each reconciling with that wallet's history. Net P&L is *realized*
   (active stakes excluded; "at stake" shown separately). Positive vs negative use
   green/red **and** a sign/▲▼ cue.
2. **Time-series chart (US2 / FR-005–007)** — The hero chart opens on **30D** and
   plots cumulative net P&L. Switch 7D/30D/90D/All → re-scopes in <1s with no
   network refetch. Hover/tap a point → date + cumulative value shown.
3. **Empty/low-data (US3 / FR-008)** — Connect a fresh wallet (no history): chart
   shows an honest empty state + CTA, tiles show neutral zeros marked "no activity
   yet", Win Rate shows "—". No fabricated line or numbers.
4. **Breakdowns + feed (US4 / FR-009–010)** — By-status / by-token / by-oracle
   counts reconcile to the headline totals; recent feed lists deposits/payouts/
   refunds newest-first with amount, token, relative time, and a working tx link.
5. **Freshness (US5 / FR-011–013)** — "updated Ns ago" advances; manual refresh /
   pull-to-refresh resets it and re-reads balances; simulate a feed error → last
   values remain with a stale badge (no blanking).
6. **Wallet utilities + sub-tabs (US6 / FR-017)** — Address copy, Show QR,
   Disconnect still work from the de-emphasised panel; Membership/Network/Security/
   Preferences/Reporting/Swap tabs unchanged.
7. **Network scoping (FR-014)** — Switch networks → figures change to the new
   network only; a network with no history shows its own empty state.
8. **Theming (FR-015)** — Toggle dark/light → all elements incl. the chart
   re-theme via tokens.

## Automated checks

```bash
cd frontend
npm run test:run         # Vitest: lib/account/* pure-logic + component tests
npm run lint             # ESLint must pass (no new warnings/errors)
npm run build            # production build must succeed (chart lazy-loaded)
```

- **Unit (pure logic)** — `lib/account/computeSummary`, `computePnlSeries`,
  `breakdowns`: empty input, single transfer, deposits-only (negative trend),
  win/loss/draw handling (draws excluded from win rate), multi-token totals,
  dense-history daily bucketing, range windowing seeds first point correctly.
- **Component** — tiles render/format + count-up fallback under reduced motion;
  chart range switch; empty states; feed ordering + tx links.
- **Accessibility** — `vitest-axe` on `AccountDashboard` (no violations); range
  selector + refresh keyboard-operable; chart exposes name + hidden text summary.
  Lighthouse AA in CI.

## Expected outcomes

- Populated wallet: dashboard paints quickly, tiles animate, chart shows a
  meaningful 30D trend, breakdowns reconcile, feed links resolve.
- Fresh wallet: honest empty states everywhere, zero fabricated data, clear CTA.
- All `test:run`, `lint`, `build`, and axe checks green.
