# Tasks: Unified My Account Experience

**Input**: Design documents from `/specs/074-unified-my-account/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/my-account-ui-contract.md

**Tests**: Included — constitution II makes Vitest coverage mandatory for
frontend behavior. Contract IDs (U*/C*/V*/A*/X*) refer to
`contracts/my-account-ui-contract.md`.

**Organization**: Grouped by user story; stories are independently testable
increments on top of the shared foundation.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: The shared nav-model and icon groundwork every story reads.

- [X] T001 Add `ACCOUNT_VIEWS`, `ACCOUNT_DEFAULT_VIEW`, `accountViewFromParam()`,
      and `PORTFOLIO_PATH` to `frontend/src/config/appNav.js`; route
      `pathForNavItem('portfolio')` to `PORTFOLIO_PATH` (contracts U4, U6).
- [X] T002 [P] Add the `clock` icon (Activity view) to
      `frontend/src/components/nav/NavIcon.jsx`.

**Checkpoint**: nav model exposes the three views and the new Portfolio path.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The acting-account data seam both US2 and US3 render through.

- [X] T003 Extend `frontend/src/hooks/useAccountStats.js` with the optional
      `{ accountAddress }` acting override: scope wager list, ledger read,
      stable balance, and summary math to it; read the acting account's native
      balance via `provider.getBalance` when overriding; clear held balances on
      effective-address change (contracts A2–A4, research R4).

**Checkpoint**: stats hook can serve any address honestly.

---

## Phase 3: User Story 1 — Browse and switch accounts (Priority: P1) 🎯 MVP

**Goal**: Account card carousel that IS the switcher, in lockstep with the
WalletButton dropdown.

**Independent Test**: contract C1–C6 — render with personal+vault+legacy
accounts, cards/tags/active marker correct, `choose` fires, legacy unlock
gates activation.

- [X] T004 [US1] Create `frontend/src/components/account/AccountCardsCarousel.jsx`:
      cards from `useAccountSwitcher().accounts` in a labelled listbox
      (blockies avatar, label, kind chip, short address, vault network via
      strict `NETWORKS[chainId]` lookup), scroll-snap track, rAF-throttled
      scroll index, arrows + dots (>1 account only), `choose(acc)` on select,
      `LegacyUnlockDialog` mounted beside it (contracts C1–C6).
- [X] T005 [P] [US1] Create `frontend/src/components/account/AccountCardsCarousel.css`:
      fixed-palette card faces (per-kind gradients), snap track, active ring,
      arrows hidden ≤768px, dots; theme tokens with light-literal fallbacks.
- [X] T006 [US1] Add `frontend/src/test/account/AccountCardsCarousel.test.jsx`
      covering contracts C1–C6 with a mocked `useAccountSwitcher` (both export
      shapes) and a stubbed `LegacyUnlockDialog`.

**Checkpoint**: carousel switches accounts standalone.

---

## Phase 4: User Story 2 — One place for activity, portfolio, stats (Priority: P1)

**Goal**: The unified Account tab body with the three deep-linkable views.

**Independent Test**: contracts U1–U4, U7, V1–V5 — default Activity, switch to
Portfolio/Stats, URL round-trips, one switcher per width, honest states kept.

- [X] T007 [US2] Create `frontend/src/components/account/MyAccountView.jsx`:
      carousel on top; `?view=`-driven view switching
      (`accountViewFromParam`, `setSearchParams` replace, default deletes the
      param); Activity view (FreshnessIndicator + ActivityBreakdowns +
      RecentActivityFeed), Portfolio view (`PortfolioPanel` unchanged), Stats
      view (SummaryTiles + PnlChart); existing unsupported-network / empty
      states per view; `WalletUtilitiesPanel` below every view; desktop
      `role="tablist"` strip (contracts U1–U4, U7, V1–V4, X2).
- [X] T008 [P] [US2] Create `frontend/src/components/account/MyAccountView.css`:
      layout, tab strip (pt-tabs idiom) hidden ≤768px (contract V5).
- [X] T009 [US2] Wire `frontend/src/pages/WalletPage.jsx`: the `account` branch
      renders `MyAccountView`; while the Account tab is active, feed
      `SectionIconNav` the `ACCOUNT_VIEWS` items with the current view id and
      route selections to `/wallet?tab=account[&view=…]` (contract V5).
- [X] T010 [US2] Update the barrel `frontend/src/components/account/index.js`
      (add MyAccountView + AccountCardsCarousel, drop AccountDashboard) and
      remove `frontend/src/components/account/AccountDashboard.jsx` + `.css`
      (role replaced; port the `.account-identity` bits into MyAccountView.css).
- [X] T011 [US2] Add `frontend/src/test/account/MyAccountView.test.jsx`
      covering U1–U4, U7, V1–V5 (mock `useAccountStats`,
      `useAccountSwitcher`, `PortfolioPanel`; assert one switcher per width
      via `useIsMobile` mock).
- [X] T012 [P] [US2] Replace `frontend/src/test/account/AccountDashboard.axe.test.jsx`
      with `frontend/src/test/account/MyAccountView.axe.test.jsx` — same
      populated-stats fixture, axe gate on the unified view (contract X1).
- [X] T013 [US2] Update `frontend/src/test/WalletPage.test.jsx` for the new
      account-tab body (mock `useAccountSwitcher`/carousel seams as needed;
      `.profile-section` default-tab assertions keep passing).

**Checkpoint**: unified view complete for the connected wallet.

---

## Phase 5: User Story 3 — Every view follows the selected account (Priority: P2)

**Goal**: Selecting a card re-scopes Activity/Stats (Portfolio already
follows, spec 063).

**Independent Test**: contracts A1–A4 — acting vault address flows into
`useAccountStats`; balances re-read for the acting account; no stale
carry-over.

- [X] T014 [US3] In `frontend/src/components/account/MyAccountView.jsx`, pass
      `{ accountAddress }` from `useEffectiveAccount()` to `useAccountStats`
      only when `isActingAccount` (contract A1).
- [X] T015 [US3] Add `frontend/src/test/account/useAccountStats.acting.test.jsx`
      covering A2–A4 (mock wallet context, repositories, ledger, provider
      `getBalance`; assert address scoping, native-balance source, and
      clear-on-switch).

**Checkpoint**: all three views are acting-account-scoped.

---

## Phase 6: User Story 4 — Saved links keep working (Priority: P3)

**Goal**: `?tab=portfolio` and every in-app Portfolio entry land on the
unified view.

**Independent Test**: contracts U5–U6 — old URL redirects (replace), drawer
Quick Access navigates to the new path.

- [X] T016 [US4] In `frontend/src/pages/WalletPage.jsx`: remove the
      `portfolio` entry from `WALLET_TABS` and its render branch (drop the
      now-unused `PortfolioPanel` import), and add
      `portfolio: PORTFOLIO_PATH` to `TAB_REDIRECTS` (contract U5).
- [X] T017 [P] [US4] Update `frontend/src/test/AppNavDrawer.test.jsx`
      (Quick Access Portfolio → `/wallet?tab=account&view=portfolio`, U6) and
      `frontend/src/test/collectibles/walletPageCollectibles.test.jsx`
      (`?tab=portfolio` lands on the unified view's Portfolio view, U5).

**Checkpoint**: no surface routes to the old standalone tab.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T018 Run the scoped Vitest suites from `quickstart.md` plus
      `frontend` ESLint (`npm run lint`); fix regressions the sweep surfaces
      (never add suppressions).
- [X] T019 [P] Docs: add `docs/developer-guide/my-account.md` describing the
      unified view, the `ACCOUNT_VIEWS` seam, the acting-account stats
      override, and the portfolio redirect; note the change in
      `CLAUDE.md` guardrails if reviewers deem it durable.

## Dependencies

```text
T001, T002 (setup)
   └─► T003 (foundation)
         ├─► US1: T004 ─► T005(P alongside), T006
         ├─► US2: T007 ─► T008(P), T009 ─► T010 ─► T011, T012(P), T013   (T007 needs T004)
         ├─► US3: T014 (needs T003 + T007) ─► T015
         └─► US4: T016 (needs T009) ─► T017
                     └─► Polish: T018 ─► T019
```

- US1 is independently shippable (MVP): carousel + switching with the
  existing dashboard untouched below it.
- US2 depends on US1's carousel component; US3 on US2's view host + the
  T003 hook; US4 on US2's WalletPage wiring.

## Parallel Execution Examples

- After T004: T005 (CSS) ∥ T006 (tests).
- After T007: T008 (CSS) ∥ T012 (axe port) while T009–T011 proceed serially.
- T017 splits across two independent test files.

## Implementation Strategy

MVP = Phase 1–3 (carousel switching on top of the existing dashboard). Then
US2 replaces the dashboard body with the three views, US3 scopes the data,
US4 retires the standalone Portfolio tab. Each checkpoint leaves the app
shippable and honest.
