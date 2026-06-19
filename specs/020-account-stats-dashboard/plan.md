# Implementation Plan: My Account Stats Dashboard

**Branch**: `020-account-stats-dashboard` | **Date**: 2026-06-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/020-account-stats-dashboard/spec.md`

## Summary

Redesign the **Account** sub-tab of the My Account (`WalletPage`) view from a bare
address/QR/Disconnect panel into a real-time personal stats dashboard: animated
summary tiles (realized Net P&L, Win Rate, Total Wagered, Active Wagers, Wallet
Balance), a hero cumulative-net-P&L time-series chart (7D/30D/90D/All, default
30D), activity breakdowns (by status, token, oracle type) and a recent
deposit/payout/refund feed, honest empty/low-data states, polling-based freshness
cues, and a de-emphasised wallet-utilities panel. It is **frontend-only**:
no contract, subgraph-schema, or deployment changes. All numbers derive from
existing data feeds (`useMyWagers`, the WagerTransfer report data source +
`valuation`, `useWalletManagement`, `usePriceConversion`, roles/membership);
the only new runtime dependency is a charting library (Recharts 3.x).

## Technical Context

**Language/Version**: JavaScript (ES2022) + JSX, React 19.2, Vite 7.

**Primary Dependencies**: React 19, react-router-dom 7, wagmi 3 (chain/account
context), existing app hooks/data layer; **new**: `recharts` ^3.8 for the
time-series chart.

**Storage**: None added. Reads on-chain/indexed data via the existing subgraph
(`VITE_SUBGRAPH_URL`) with RPC fallback; reuses module-scoped caches already in
the data layer. No new persistence (tax-report localStorage history is untouched).

**Testing**: Vitest 4 + @testing-library/react for component/logic tests;
`vitest-axe` for the WCAG 2.1 AA accessibility gate. Pure aggregation logic
(P&L, win rate, totals, series bucketing) is unit-tested in isolation.

**Target Platform**: Modern evergreen browsers, mobile-first (~390px) scaling to
desktop; SPA served by the existing Vite build.

**Project Type**: Web application — change confined to `frontend/`.

**Performance Goals**: First meaningful dashboard paint within ~1s of the Account
tab opening on cached data; range switch re-scopes in <1s (SC-004); live sections
reflect new activity within one poll interval (SC-005).

**Constraints**: WCAG 2.1 AA (non-color win/loss cues, keyboard-operable range
selector + refresh, accessible chart description); honest state — no fabricated
data for new/low-data users; active-network scoping (no cross-network leakage);
honor dark/light themes and `--chart-series-*`/`--semantic-*` tokens; keep bundle
growth modest (lazy-load the chart library).

**Scale/Scope**: One redesigned tab (~5 new presentational components + 1
aggregation hook + pure helpers). A member's wager/transfer history is small
(tens–hundreds of rows) and paginated; series math runs client-side.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|-----------|------------|
| **I. Security-First Smart Contracts** | **N/A** — no `contracts/` changes. Read-only frontend feature; no fund-custody or oracle-resolution code touched. |
| **II. Test-First & Coverage** | **PASS (planned)** — Vitest unit tests for all aggregation logic (P&L, win rate, totals, series bucketing, empty-state) written alongside; component tests for tiles/chart/feed; axe test for accessibility. No contract interface changes, so no contract tests required. |
| **III. Honest State, No Mocks/Placeholders** | **PASS** — core requirement of the spec (FR-008, FR-013, FR-019, FR-020). No fabricated curves/figures; unsettled wagers excluded from realized P&L; data scoped to the active network (FR-014); USD via the same par/rate valuation used in reports. |
| **IV. Fail Loudly in CI** | **PASS** — no `continue-on-error`; lint/test/build/axe must pass. New dep added to `frontend/package.json` honestly. |
| **V. Accessible, Consistent Frontend** | **PASS (planned)** — WCAG 2.1 AA via axe/Lighthouse (FR-018); ESLint clean; consumes generated contract/network artifacts (no hardcoded addresses); uses existing theme tokens. |

**Additional constraints**: New core tech (`recharts`) is justified in
[research.md](./research.md) per the constitution's tech-stack rule. No archived
code imported. No key-management or deployment surface touched.

**Result**: PASS — no violations; Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/020-account-stats-dashboard/
├── plan.md              # This file
├── spec.md              # Feature spec (+ Clarifications)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (UI/data contracts)
│   ├── dashboard-data.md
│   └── components.md
├── design/
│   └── FairWins_Account_Dashboard.html   # Claude Design reference
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
frontend/src/
├── pages/
│   └── WalletPage.jsx                 # MODIFIED: Account tab renders <AccountDashboard/>;
│                                      #   address/QR/Disconnect move into a de-emphasised panel
├── components/
│   └── account/                       # NEW component group for the dashboard
│       ├── AccountDashboard.jsx       # orchestrator: layout + section composition
│       ├── SummaryTiles.jsx           # animated tiles (reuses count-up pattern from LiveStats)
│       ├── PnlChart.jsx               # hero time-series (Recharts, lazy-loaded) + range selector
│       ├── ActivityBreakdowns.jsx     # by status / token / oracle type
│       ├── RecentActivityFeed.jsx     # deposit/payout/refund list w/ tx links
│       ├── FreshnessIndicator.jsx     # "updated Ns ago" + manual refresh
│       ├── WalletUtilitiesPanel.jsx   # address copy / Show QR / Disconnect (de-emphasised)
│       └── *.css
├── hooks/
│   └── useAccountStats.js             # NEW: aggregates feeds → AccountSummary + series + feed
├── lib/account/                       # NEW pure helpers (no React) — unit-tested
│   ├── computeSummary.js              # win rate, totals, active counts from wagers
│   ├── computePnlSeries.js            # transfers → cumulative-P&L points, range/bucket
│   └── breakdowns.js                  # group wagers by status/token/oracle
└── (reuses) data/reports/{reportDataSource,transferDerivation,valuation}.js,
            hooks/{useMyWagers,useWalletManagement,usePriceConversion,useChainTokens}.js

frontend/test/ (or co-located *.test.js)
├── lib/account/computeSummary.test.js
├── lib/account/computePnlSeries.test.js
├── lib/account/breakdowns.test.js
└── components/account/*.test.jsx      # incl. AccountDashboard.axe.test.jsx
```

**Structure Decision**: Web application, change isolated to `frontend/`. A new
`components/account/` group holds presentational components; a single
`useAccountStats` hook is the data seam composing existing feeds; pure math lives
in `lib/account/` so it is unit-testable without React or network. The hero chart
is the only place Recharts is imported, and it is lazy-loaded so the rest of the
tab (and other routes) don't pay for it.

## Complexity Tracking

> No constitutional violations — section intentionally empty.
