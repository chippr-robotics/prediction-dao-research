---

description: "Task list for My Account Stats Dashboard implementation"
---

# Tasks: My Account Stats Dashboard

**Input**: Design documents from `specs/020-account-stats-dashboard/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: INCLUDED — the project constitution (Principle II, Test-First) makes
Vitest unit/component tests and a `vitest-axe` accessibility check mandatory, so
each story carries test tasks written before/with its implementation.

**Organization**: Tasks are grouped by user story (US1–US6 from spec.md) so each
story is an independently testable increment. This is a **frontend-only** feature
(no contract/subgraph/deployment changes); all paths are under `frontend/`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete dependencies)
- **[Story]**: US1–US6 (setup/foundational/polish have no story label)

## Path Conventions

- Components: `frontend/src/components/account/`
- Pure logic: `frontend/src/lib/account/`
- Data hook: `frontend/src/hooks/`
- Tests: co-located `*.test.js` / `*.test.jsx` (Vitest convention in this repo)
- Reused (do not modify): `frontend/src/data/reports/{reportDataSource,transferDerivation,valuation}.js`,
  `frontend/src/hooks/{useMyWagers,useWalletManagement,usePriceConversion,useChainTokens}.js`,
  `frontend/src/components/fairwins/LiveStats.jsx` (count-up reference)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dependencies and directory scaffolding.

- [x] T001 Add `recharts` (^3.8) to `frontend/package.json` dependencies and run install; confirm `frontend` build still succeeds (chart will be lazy-loaded later).
- [x] T002 [P] Create directory scaffolding with index barrels: `frontend/src/components/account/index.js` and `frontend/src/lib/account/index.js`.
- [x] T003 [P] Confirm `vitest-axe` is wired for accessibility assertions (matcher import) and add a shared test helper at `frontend/src/components/account/__test-utils__/renderWithProviders.jsx` (wallet/theme/router context) for component tests.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The data seam and dashboard shell that every story builds on. Swaps
the Account tab to the new dashboard while **preserving** existing wallet
utilities so nothing regresses.

**⚠️ CRITICAL**: No user-story work can begin until this phase is complete.

- [x] T004 Implement transfer source adapter `frontend/src/lib/account/transfersSource.js` that fetches the member's WagerTransfer rows for the **active chain** by reusing `data/reports/reportDataSource.js` (`ReportTransfers` query) + `data/reports/valuation.js`, returning normalized `{ direction, tokenAddress, amount, usdValue, timestamp, txHash, wagerId }`.
- [x] T005 Scaffold the data hook `frontend/src/hooks/useAccountStats.js` returning the full contract shape from `contracts/dashboard-data.md` with loading/empty/neutral defaults: `summary:null`, `series:{range:'30D',points:[],isEmpty:true,isLowData:true,endValueUsd:0}`, `breakdowns:null`, `activity:[]`, `isConnected/isSupportedNetwork/chainId/isLoading/isEmpty/error`, per-section `freshness`, `setRange()`, `refresh()`. Wire `useMyWagers`, `useWalletManagement`, `usePriceConversion`, `useChainTokens`, and T004; key all state on active `chainId` (no cross-network blending).
- [x] T006 [P] Create the orchestrator shell `frontend/src/components/account/AccountDashboard.jsx` (+ `AccountDashboard.css`): gating for not-connected (reuse existing connect prompt), unsupported-network, `isEmpty`, and full layout; mobile-first single column with section slots for tiles/chart/breakdowns/feed/utilities.
- [x] T007 [P] Create `frontend/src/components/account/WalletUtilitiesPanel.jsx` (+ css) preserving the existing **address + copy**, **Show QR Code** (existing `AddressQRModal`), and **Disconnect Wallet** behavior moved out of `WalletPage`.
- [x] T008 Modify `frontend/src/pages/WalletPage.jsx` so the `account` tab body renders `<AccountDashboard/>` (with `WalletUtilitiesPanel`), leaving Membership/Network/Security/Preferences/Reporting/Swap tabs untouched.

**Checkpoint**: Account tab renders the dashboard shell; address/QR/Disconnect still work; other sub-tabs unchanged.

---

## Phase 3: User Story 1 - At-a-glance performance summary (Priority: P1) 🎯 MVP

**Goal**: Animated summary tiles (Net P&L USD realized, Win Rate, Total Wagered, Active Wagers, Wallet Balance) populated from the member's own activity.

**Independent Test**: Connect a wallet with settled wagers → tiles show correct, reconciling values; positives vs negatives use color + a non-color sign/▲▼ cue; numbers count-up (and fall back under reduced motion).

### Tests for User Story 1 ⚠️ (write first, ensure they fail)

- [x] T009 [P] [US1] Unit test `frontend/src/lib/account/computeSummary.test.js`: realized net P&L = Σ(payout+refund)−Σ(deposit); win rate = wins÷(wins+losses) with draws/refunds/cancellations excluded (incl. denominator=0 → null); total wagered = member's own stake only; active count = {open,active,draw_proposed}; multi-token totals.
- [x] T010 [P] [US1] Component test `frontend/src/components/account/SummaryTiles.test.jsx`: compact-USD formatting, win/loss styling carries a non-color cue, `winRate===null` renders "—", count-up falls back to final value under `prefers-reduced-motion`.

### Implementation for User Story 1

- [x] T011 [P] [US1] Implement pure `frontend/src/lib/account/computeSummary.js` → `AccountSummary` per `data-model.md` (deterministic; inject `now`).
- [x] T012 [US1] Extend `useAccountStats` (T005) to populate `summary` via `computeSummary` from wagers + transfers + balances + native rate (depends on T011).
- [x] T013 [P] [US1] Implement `frontend/src/components/account/SummaryTiles.jsx` (+ css): five tiles, ease-out-cubic count-up reusing the `LiveStats` pattern, win/loss tokens + non-color cue, reduced-motion guard.
- [x] T014 [US1] Wire `SummaryTiles` into `AccountDashboard` (identity strip + tile row) and verify reconciliation against the member's history.

**Checkpoint**: Summary tiles fully functional and independently testable (MVP).

---

## Phase 4: User Story 2 - Performance over time (Priority: P1)

**Goal**: Hero cumulative-net-P&L time-series chart with 7D/30D/90D/All (default 30D), tooltip point inspection.

**Independent Test**: Wallet with deposits/payouts/refunds → chart plots cumulative P&L on 30D by default; switching range re-scopes in <1s with no refetch; hover/tap shows date + cumulative value.

### Tests for User Story 2 ⚠️ (write first, ensure they fail)

- [x] T015 [P] [US2] Unit test `frontend/src/lib/account/computePnlSeries.test.js`: cumulative running sum (+payout +refund −deposit); range windowing seeds first point at cumulative-as-of-range-start; default 30D; `<2` points → `isLowData`; empty → `isEmpty`; dense history collapses to daily buckets above threshold; `endValueUsd` (ALL) equals summary net P&L.
- [x] T016 [P] [US2] Component test `frontend/src/components/account/PnlChart.test.jsx`: default range is 30D, `setRange` recomputes locally (no fetch), tooltip exposes date + value, chart lazy module resolves.

### Implementation for User Story 2

- [x] T017 [P] [US2] Implement pure `frontend/src/lib/account/computePnlSeries.js` → `PnlSeries` per `data-model.md` (event-stepped + daily-bucket guard; deterministic).
- [x] T018 [US2] Extend `useAccountStats` with `series` + `setRange` that recompute from already-fetched transfers (default `'30D'`, local-only, <1s) (depends on T017).
- [x] T019 [P] [US2] Implement `frontend/src/components/account/PnlChart.jsx` (+ css): **lazy-loaded** Recharts area/line, `ResponsiveContainer`, colors from `--chart-series-*`/`--semantic-win|loss`, keyboard-operable `7D|30D|90D|All` button group (`aria-pressed`), tooltip, and a visually-hidden text summary + data-table fallback for screen readers.
- [x] T020 [US2] Wire `PnlChart` into `AccountDashboard` as the hero section.

**Checkpoint**: Time-series chart functional with range switching and accessible inspection.

---

## Phase 5: User Story 3 - Honest empty and low-data states (Priority: P1)

**Goal**: New/no-history members see honest empty states everywhere — no fabricated curves or numbers — with a clear CTA.

**Independent Test**: Fresh wallet (no history on active network) → tiles show neutral zeros marked "no activity yet" (win rate "—"), chart shows empty state + CTA, breakdowns/feed show empty copy; switching to a network with no history shows that network's empty state.

### Tests for User Story 3 ⚠️ (write first, ensure they fail)

- [x] T021 [P] [US3] Component test `frontend/src/components/account/EmptyStates.test.jsx`: with empty `useAccountStats` data, `SummaryTiles`/`PnlChart` render honest empty states with **no** synthetic points/values; low-data (1 point) renders markers not a misleading line; network-switch yields per-network empty state.

### Implementation for User Story 3

- [x] T022 [US3] Ensure `useAccountStats` computes `isEmpty`/`series.isEmpty`/`series.isLowData` correctly and per active `chainId` (depends on T012, T018).
- [x] T023 [P] [US3] Create `frontend/src/components/account/EmptyState.jsx` (+ css): reusable empty/low-data block with a "create or accept your first wager" CTA; integrate into `SummaryTiles` and `PnlChart` (and breakdown/feed placeholders).
- [x] T024 [US3] Verify no fabricated data path exists (zeros are labelled, chart never draws an invented trend) and the empty layout is mobile-legible.

**Checkpoint**: All P1 stories complete — honest, populated-or-empty dashboard. Deployable MVP slice.

---

## Phase 6: User Story 4 - Activity breakdowns and recent feed (Priority: P2)

**Goal**: Breakdowns by status/token/oracle that reconcile to headline totals, plus a newest-first deposit/payout/refund feed with tx links.

**Independent Test**: Mixed-activity wallet → by-status/by-token/by-oracle counts reconcile to tiles; feed lists latest transfers newest-first with amount, token, relative time, and a working explorer link.

### Tests for User Story 4 ⚠️ (write first, ensure they fail)

- [x] T025 [P] [US4] Unit test `frontend/src/lib/account/breakdowns.test.js`: `Σ byStatus.count` = total wagers and active subset = `activeWagers`; `Σ byToken.ownStakeUsd` = `totalWageredUsd`; `byOracle` labels Polymarket/Chainlink/UMA.
- [x] T026 [P] [US4] Component test `frontend/src/components/account/RecentActivityFeed.test.jsx`: newest-first ordering, direction icon+text, relative "Ns ago", explorer link built for the active network; empty copy when no activity.

### Implementation for User Story 4

- [x] T027 [P] [US4] Implement pure `frontend/src/lib/account/breakdowns.js` → `Breakdown` per `data-model.md`.
- [x] T028 [US4] Extend `useAccountStats` to populate `breakdowns` (from wagers) and `activity` (from transfers, newest-first, windowed) (depends on T027).
- [x] T029 [P] [US4] Implement `frontend/src/components/account/ActivityBreakdowns.jsx` (+ css): status/token/oracle views with text labels (not color-only).
- [x] T030 [P] [US4] Implement `frontend/src/components/account/RecentActivityFeed.jsx` (+ css): feed rows with explorer links (per-network) and optional wager deep-link; no counterparty private data.
- [x] T031 [US4] Wire `ActivityBreakdowns` + `RecentActivityFeed` into `AccountDashboard` and verify reconciliation.

**Checkpoint**: Breakdowns and activity feed functional and reconciling.

---

## Phase 7: User Story 5 - Real-time freshness cues (Priority: P2)

**Goal**: "updated Ns ago" indicators, manual + pull-to-refresh, and stale-not-blank behavior on feed errors.

**Independent Test**: Open dashboard → indicators advance; manual/pull refresh resets them and re-reads balances; simulated feed error keeps last values with a stale badge.

### Tests for User Story 5 ⚠️ (write first, ensure they fail)

- [x] T032 [P] [US5] Component test `frontend/src/components/account/FreshnessIndicator.test.jsx`: renders "updated Ns ago" from `lastUpdated`, ticks, manual refresh invokes `onRefresh` and resets; `stale`/`error` status shows a badge without blanking.

### Implementation for User Story 5

- [x] T033 [US5] Extend `useAccountStats` to track per-section `freshness{lastUpdated,status}`, implement `refresh()` (re-reads balances via `refreshBalances()` + re-pulls transfers), and set `stale`/`error` on poll failure keeping last-known values (depends on T028).
- [x] T034 [P] [US5] Implement `frontend/src/components/account/FreshnessIndicator.jsx` (+ css): 1s display ticker, accessible manual-refresh button, stale/error badge.
- [ ] T035 [US5] Add pull-to-refresh affordance on mobile and wire `FreshnessIndicator` into each live section of `AccountDashboard`.
- [x] T036 [US5] Apply count-up to tile value **changes** on poll (not just first load), respecting reduced motion.

**Checkpoint**: Dashboard feels live and degrades honestly on errors.

---

## Phase 8: User Story 6 - Preserved wallet utilities (Priority: P3)

**Goal**: De-emphasise the wallet utilities beneath the stats and prove no regression in utilities or sub-tabs.

**Independent Test**: Address copy/Show QR/Disconnect work from the de-emphasised panel; every existing sub-tab still opens its current content.

### Tests for User Story 6 ⚠️ (write first, ensure they fail)

- [x] T037 [P] [US6] Component/regression test `frontend/src/pages/WalletPage.test.jsx`: address copy, Show QR (modal opens), and Disconnect work from `WalletUtilitiesPanel`; Membership/Network/Security/Preferences/Reporting/Swap tabs render their existing content unchanged.

### Implementation for User Story 6

- [x] T038 [US6] Refine `WalletUtilitiesPanel` (T007) styling to be visually de-emphasised beneath the stats per the design reference, retaining all actions.
- [x] T039 [US6] Verify `WalletPage` tab routing/state for the other six sub-tabs is intact after the Account-tab swap.

**Checkpoint**: All six user stories independently functional with no regressions.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Accessibility, theming, responsiveness, and end-to-end validation.

- [x] T040 [P] Accessibility test `frontend/src/components/account/AccountDashboard.axe.test.jsx` using `vitest-axe`: no violations; keyboard-operable range selector + refresh; chart accessible name + hidden summary present (FR-018).
- [x] T041 [P] Dark/light theme pass: verify every account component (incl. chart series/area) uses `--bg-*`/`--text-*`/`--semantic-*`/`--chart-series-*` tokens and re-themes on toggle (FR-015).
- [x] T042 [P] Mobile responsiveness pass at ~390px: no horizontal scroll, touch targets adequate, chart legible (FR-016, SC-006).
- [x] T043 Confirm Recharts is lazy-loaded (not in the initial route chunk) and `npm run build` chunking is sane.
- [x] T044 Run `frontend` gates: `npm run lint`, `npm run test:run`, `npm run build` — all green (no `continue-on-error`).
- [ ] T045 Execute `specs/020-account-stats-dashboard/quickstart.md` validation scenarios 1–8 against a populated wallet and a fresh wallet.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately.
- **Foundational (Phase 2)**: depends on Setup — **BLOCKS all user stories** (T004→T005; T006/T007 [P]; T008 depends on T006/T007).
- **US1 (Phase 3)**, **US2 (Phase 4)**: depend only on Foundational; can run in parallel (different files; both extend `useAccountStats` in distinct sections — coordinate T012/T018 if same dev).
- **US3 (Phase 5)**: depends on Foundational + the US1/US2 components it adds empty states to (T012, T018).
- **US4 (Phase 6)**: depends on Foundational; independent of US1–US3.
- **US5 (Phase 7)**: depends on Foundational + US4's `activity` population (T028) for the feed's freshness.
- **US6 (Phase 8)**: depends on Foundational only (utilities preserved in T007).
- **Polish (Phase 9)**: depends on all targeted stories being complete.

### Within Each User Story

- Tests written first and failing, then pure logic → hook wiring → component → dashboard integration.
- Pure `lib/account/*` before the `useAccountStats` extension that consumes it.

### Parallel Opportunities

- Setup: T002, T003 in parallel.
- Foundational: T006, T007 in parallel after T005.
- Pure-logic + its test per story run in parallel with other stories' pure logic (T011, T017, T027 are independent files).
- Component files within a story marked [P] are independent of each other.
- With multiple devs after Foundational: Dev A → US1, Dev B → US2, Dev C → US4/US6; US3 and US5 fold in after their prerequisites.

---

## Parallel Example: User Story 1

```bash
# Tests first (independent files):
Task: "Unit test computeSummary in frontend/src/lib/account/computeSummary.test.js"   # T009
Task: "Component test SummaryTiles in frontend/src/components/account/SummaryTiles.test.jsx"  # T010

# Then pure logic + component in parallel:
Task: "Implement computeSummary.js"     # T011
Task: "Implement SummaryTiles.jsx + css"  # T013
```

---

## Implementation Strategy

### MVP First (P1 stories)

1. Phase 1 Setup → Phase 2 Foundational (shell + data seam, no regressions).
2. Phase 3 US1 (tiles) → **validate independently**.
3. Phase 4 US2 (chart) + Phase 5 US3 (honest empty states) → the P1 trio is a
   demoable, honest MVP. **Stop and validate.**

### Incremental Delivery

4. US4 breakdowns + feed → validate → demo.
5. US5 freshness cues → validate → demo.
6. US6 utilities de-emphasis + regression → validate.
7. Phase 9 polish (a11y/theme/responsive) + quickstart validation.

---

## Notes

- [P] = different files, no incomplete dependencies.
- `useAccountStats` is extended across stories (T005→T012→T018→T022→T028→T033);
  serialize those edits if one developer, or assign one owner for the hook.
- Reuse, don't fork: transfers via `reportDataSource`, USD via `valuation`,
  count-up via the `LiveStats` pattern, QR via `AddressQRModal`.
- Honest-state (Constitution III) and WCAG 2.1 AA (Constitution V) are acceptance
  gates, not afterthoughts — every empty/error path and a11y assertion is tested.
- Commit after each task or logical group.
