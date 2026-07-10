---
description: "Task list for Mask Sensitive Values (Tilt-to-Hide)"
---

# Tasks: Mask Sensitive Values (Tilt-to-Hide)

**Input**: Design documents from `/specs/046-mask-sensitive-values/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/tilt-to-hide.md, quickstart.md

**Tests**: INCLUDED — the constitution mandates test-first for frontend logic
(Principle II, NON-NEGOTIABLE). Test tasks are written before their
implementation and must fail first.

**Organization**: Tasks are grouped by user story. Foundational phase builds the
shared tilt-to-hide engine; each user story is an independently testable slice on
top of it.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependency on incomplete tasks)
- **[Story]**: US1 / US2 / US3 (user-story phases only)
- All paths are repo-relative.

## Path notes

- Frontend-only feature under `frontend/src/`. No `contracts/`, `subgraph/`,
  `services/`, or `scripts/` changes.
- Formatting is decentralized (no single `<Amount>`); masking is applied by
  wrapping formatted output in `<SensitiveValue>` at each render site. Wrap in the
  JSX component that renders the value — NOT inside pure string helpers
  (`wagerCardHelpers.js`, `wagerVm.js`), which stay pure.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Test harness and deployment prerequisites for device orientation.

- [x] T001 [P] Add a `DeviceOrientationEvent` / `'deviceorientation'` mock to `frontend/src/test/setup.js` (none exists today; follow the existing `window.matchMedia` mock as the template — allow tests to dispatch synthetic events with `beta`/`gamma` and to stub `DeviceOrientationEvent.requestPermission`).
- [x] T002 [P] Fix `Permissions-Policy` in `frontend/nginx.conf` and `frontend/nginx.conf.template`: change `accelerometer=()` → `accelerometer=(self)` and `gyroscope=()` → `gyroscope=(self)`, leaving the other directives unchanged (per research R3 — otherwise orientation events never fire in production).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build the shared tilt-to-hide engine every user story depends on:
the pure classifier, the persisted preference, the live-state provider, and the
masking primitive.

**⚠️ CRITICAL**: No user-story work can begin until this phase is complete.

### Tests (write first, must fail)

- [x] T003 [P] Classifier unit test in `frontend/src/test/privacy/tilt.test.js`: face-up→`hidden`, face-down (|beta|→180)→`hidden`, portrait-viewing→`viewing`, landscape-viewing (large |gamma|)→`viewing`, dead-band holds previous state, null/NaN reading holds previous state.
- [x] T004 [P] `SensitiveValue` component test in `frontend/src/test/privacy/SensitiveValue.test.jsx`: when hidden → placeholder shown, real string absent from DOM text (not copyable), accessible name is "hidden", box width stable and independent of digit count; when shown → exact children rendered.
- [x] T005 [P] Preference test in `frontend/src/test/privacy/userPreferences.tiltToHide.test.jsx`: `tiltToHide` defaults to `true`, `setTiltToHide(false)` persists via `saveUserPreference(account,'tilt_to_hide',false,true)`, value reloads per account.
- [x] T006 [P] `PrivacyProvider` / `usePrivacy` test in `frontend/src/test/privacy/PrivacyContext.test.jsx`: supported path sets `hidden` on synthetic flat event and clears it on viewing event; permission-denied and unsupported paths keep `hidden===false`; preference off keeps `hidden===false` and attaches no listener; listener removed on unmount.

### Implementation

- [x] T007 [P] Create pure classifier `frontend/src/lib/privacy/tilt.js`: export `TILT_DEFAULTS` (`enterFlatDeg`, `exitFlatDeg`, `settleMs`) and `classifyOrientation(reading, prevState, options)` per `contracts/tilt-to-hide.md` §1 (screen-normal-near-vertical rule + hysteresis; no DOM).
- [x] T008 [P] Extend `frontend/src/contexts/UserPreferencesContext.jsx`: add `tiltToHide: true` to both default-state objects, load `getUserPreference(account,'tilt_to_hide',true,true)` in `loadPreferences`, add `setTiltToHide` setter (mirror `setShowZeroBalances`), expose both in context value.
- [x] T009 [P] Create `frontend/src/components/common/SensitiveValue.jsx` (+ `SensitiveValue.css`) per `contracts/tilt-to-hide.md` §3: content-swap masking (placeholder replaces DOM text, accessible name `hiddenLabel` default "hidden", fixed non-digit-encoding width, layout-stable); reads `usePrivacy().hidden`.
- [x] T010 Create `frontend/src/contexts/PrivacyContext.js` (`createContext`) + `frontend/src/contexts/PrivacyContext.jsx` (`PrivacyProvider`) + `frontend/src/hooks/usePrivacy.js`: subscribe to throttled `deviceorientation`, feed `classifyOrientation`, derive effective `hidden` (per data-model rule), detect `support`, handle iOS `requestMotionPermission()`; reads `tiltToHide` from `useUserPreferences()`. (depends on T007, T008)
- [x] T011 Wire exports in `frontend/src/contexts/index.js` and `frontend/src/hooks/index.js` for `PrivacyProvider` / `usePrivacy`. (depends on T010)
- [x] T012 Mount `<PrivacyProvider>` in `frontend/src/main.jsx` just inside `UserPreferencesProvider` so it wraps the remaining providers and `<App/>`. (depends on T010, T011)

**Checkpoint**: Engine ready — classifier, preference, provider, and
`<SensitiveValue>` exist and are unit-tested. No values are wrapped yet.

---

## Phase 3: User Story 1 - Balances hide when I lay my phone flat (Priority: P1) 🎯 MVP

**Goal**: On a mobile device (default-enabled), laying the phone flat auto-masks
every on-screen monetary figure; lifting it reveals them — no manual action.

**Independent Test**: On a mobile device, open a money-bearing screen, lay it flat
→ all monetary values mask within ~1s; lift → exact values return; navigate while
flat → new values render masked; hard-reload while flat → no flash of real digits.

### Tests (write first, must fail)

- [x] T013 [P] [US1] Integration test in `frontend/src/test/privacy/tiltHide.integration.test.jsx`: render a sample money screen inside `PrivacyProvider`, dispatch a flat event → all wrapped values masked; dispatch viewing event → revealed; initial render while already flat → masked with no real-digit frame; values mounted after going flat → masked.

### Implementation — wrap monetary render sites in `<SensitiveValue>`

- [x] T014 [P] [US1] Wrap account-dashboard tiles in `frontend/src/components/account/SummaryTiles.jsx` (`.account-tile-value` — Net P&L, Total Wagered, Wallet Balance); coordinate with `frontend/src/components/account/useCountUp.js` so masking shows the placeholder and does not run/reveal the count-up. Update colocated test.
- [x] T015 [P] [US1] Wrap activity amounts in `frontend/src/components/account/RecentActivityFeed.jsx` (`formatUsd(e.usdValue)`, `.account-feed-amount`) and `frontend/src/components/account/ActivityBreakdowns.jsx`. Update colocated tests.
- [x] T016 [P] [US1] Wrap P&L figures in `frontend/src/components/account/PnlChart.jsx` and `frontend/src/components/account/PnlChartCanvas.jsx` (monetary axis/summary labels; leave non-monetary axis ticks unmasked).
- [x] T017 [P] [US1] Wrap portfolio figures in `frontend/src/components/wallet/PortfolioPanel.jsx` (portfolio total via local `formatUsdFull`, `.portfolio-row-usd`, `.portfolio-row-balance`) and `frontend/src/components/wallet/AssetDetailSheet.jsx`.
- [x] T018 [P] [US1] Wrap wager stake/payout amounts where rendered in `frontend/src/components/fairwins/WagerCard.jsx` and `frontend/src/components/fairwins/WagerTable.jsx` (render the strings from `wagerCardHelpers.js` / `wagerVm.js` through `<SensitiveValue>`; keep those helpers pure).
- [x] T019 [P] [US1] Wrap stake/amount displays in `frontend/src/components/fairwins/TakeChallengePanel.jsx`, `frontend/src/components/fairwins/TradePanel.jsx`, and `frontend/src/components/fairwins/LiveStats.jsx`.
- [x] T020 [P] [US1] Wrap pool stake/payout amounts in the `frontend/src/components/pools/` displays (pool total, per-member stake, payout figures).
- [x] T021 [US1] Completeness sweep: grep for remaining monetary renders (Dashboard tiles, `frontend/src/pages/` money views, vouchers, custody/treasury amounts), wrap any found, and record the finalized render-site inventory as a comment/checklist in this file. Confirm non-monetary numbers (counts, timers, dates, IDs) are NOT wrapped. (depends on T014–T020)

**Checkpoint**: Tilt-to-hide is fully functional end-to-end on mobile (default on).
MVP deliverable.

---

## Phase 4: User Story 2 - Turn tilt-to-hide on or off in Preferences (Priority: P2)

**Goal**: A single app-wide tilt-to-hide toggle in Preferences (default on),
persisted per account; turning it off stops masking everywhere.

**Independent Test**: Open My Account → Preferences → Privacy; confirm the toggle
is on by default; turn it off → laying flat no longer masks anywhere; reload →
setting persists.

### Tests (write first, must fail)

- [x] T022 [P] [US2] Panel test in `frontend/src/test/privacy/PrivacyPreferencesPanel.test.jsx`: renders a `role="switch"` toggle defaulting on, bound to `tiltToHide`; toggling calls `setTiltToHide` and persists; with the pref off, `usePrivacy().hidden` stays false under a flat event (app-wide off).

### Implementation

- [x] T023 [US2] Create `frontend/src/components/account/PrivacyPreferencesPanel.jsx` (+ `PrivacyPreferencesPanel.css`) using the `PrefSwitch` (`role="switch"` / `aria-checked`) pattern from `PortfolioPreferencesPanel.jsx`, bound to `useUserPreferences().tiltToHide` / `setTiltToHide`, with descriptive sub-text ("Balances hide when you lay your phone flat and show when you hold it up").
- [x] T024 [US2] Render the panel under a new "Privacy" `preferences-group-heading` in the Preferences tab of `frontend/src/pages/WalletPage.jsx` (~line 404, alongside Display/Wallet/Portfolio/Notifications) and add any needed heading styles in `frontend/src/pages/WalletPage.css`.

**Checkpoint**: Members can enable/disable tilt-to-hide app-wide; choice persists.

---

## Phase 5: User Story 3 - Understand the feature & unsupported devices (Priority: P3)

**Goal**: Preferences clearly explains tilt-to-hide, and on devices without motion
sensing communicates that it is mobile-only and currently inactive.

**Independent Test**: Read the Preferences description (explains lay-flat hiding);
open on desktop → the setting shows it is mobile-only/inactive; on iOS a denied
motion permission is surfaced.

### Tests (write first, must fail)

- [x] T025 [P] [US3] Extend `frontend/src/test/privacy/PrivacyPreferencesPanel.test.jsx` (or add a sibling spec): when `usePrivacy().support === 'unsupported'` the panel shows a mobile-only/inactive message; when `permission === 'denied'` the panel surfaces it; enabling on iOS triggers `requestMotionPermission()` from the tap gesture.

### Implementation

- [x] T026 [US3] Enhance `frontend/src/components/account/PrivacyPreferencesPanel.jsx` to consume `usePrivacy()` `support` / `permission`: render mobile-only/inactive state on unsupported devices, surface a denied-permission state, and call `requestMotionPermission()` on the enable gesture (per contracts §5). (depends on T023)

**Checkpoint**: All three stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T027 [P] Write `docs/developer-guide/tilt-to-hide.md`: how the mechanism works, thresholds/hysteresis, iOS permission flow, the `Permissions-Policy` requirement, and how to wrap a new monetary value in `<SensitiveValue>`.
- [x] T028 [P] Accessibility pass (axe/Lighthouse in the frontend CI job): confirm masked values are not announced, the placeholder is not read as a value, and the Privacy toggle is keyboard-operable and labeled (WCAG 2.1 AA, constitution V).
- [x] T029 Run `quickstart.md` validation: `npm run test:frontend` (all `src/test/privacy/*` pass) and the manual mobile/desktop checklist; verify no monetary site is missed and no non-monetary value is masked.
- [x] T030 Final gate: `npm run test:frontend` and frontend ESLint clean (no new warnings); confirm no `continue-on-error` added (constitution IV).

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies — start immediately.
- **Foundational (Phase 2)**: after Setup — BLOCKS all user stories.
- **User Story 1 (Phase 3)**: after Foundational. No dependency on US2/US3.
- **User Story 2 (Phase 4)**: after Foundational. Independently testable; its
  app-wide masking effect uses the Phase-2 provider.
- **User Story 3 (Phase 5)**: after Foundational; **extends the US2 panel**
  (T026 depends on T023) so ships after US2.
- **Polish (Phase 6)**: after all desired stories.

### Key task dependencies

- T010 → T007, T008 · T011 → T010 · T012 → T010, T011
- T013–T021 (US1) → Phase 2 complete · T021 → T014–T020
- T024 → T023 · T026 → T023
- T029/T030 → all implementation tasks

### Parallel opportunities

- Setup: T001, T002 in parallel.
- Foundational tests: T003, T004, T005, T006 in parallel; then impl T007, T008,
  T009 in parallel (T010→T011→T012 serial).
- US1 render-site wraps: T014–T020 in parallel (different files); T021 after.
- Different stories can be staffed in parallel after Phase 2, except US3 waits on
  the US2 panel.

---

## Parallel Example: User Story 1 render-site wrapping

```bash
Task: "Wrap SummaryTiles.jsx (T014)"
Task: "Wrap RecentActivityFeed.jsx + ActivityBreakdowns.jsx (T015)"
Task: "Wrap PnlChart.jsx + PnlChartCanvas.jsx (T016)"
Task: "Wrap PortfolioPanel.jsx + AssetDetailSheet.jsx (T017)"
Task: "Wrap WagerCard.jsx + WagerTable.jsx (T018)"
Task: "Wrap TakeChallengePanel/TradePanel/LiveStats (T019)"
Task: "Wrap pools/ amounts (T020)"
```

---

## Implementation Strategy

### MVP first (User Story 1 only)

1. Phase 1 Setup → 2. Phase 2 Foundational (engine) → 3. Phase 3 US1 (wrap sites)
→ **STOP & VALIDATE**: tilt-to-hide works end-to-end on a real phone (default on).
This is a shippable MVP.

### Incremental delivery

1. Setup + Foundational → engine ready.
2. US1 → mobile tilt masking (MVP, demo).
3. US2 → Preferences on/off control (demo).
4. US3 → clarity + unsupported-device messaging (demo).
5. Polish → docs, a11y, quickstart validation.

### Notes

- [P] = different files, no incomplete-task dependency.
- Wrap values in the JSX render site, never in pure string helpers.
- Verify each test fails before implementing (constitution II).
- Commit after each task or logical group; keep ESLint clean.

---

## Implementation notes (completeness sweep — T021)

Finalized monetary render-site inventory wrapped in `<SensitiveValue>`:

- **Account dashboard**: `SummaryTiles` (Net P&L, Total Wagered, Wallet Balance,
  "at stake" sub), `RecentActivityFeed` (USD amounts), `ActivityBreakdowns`
  (per-token stake USD), `PnlChart` (sr summary + data table), `PnlChartCanvas`
  (tooltip + Y-axis ticks).
- **Wallet / portfolio**: `PortfolioPanel` (total, category subtotals, per-asset
  balance + USD), `AssetDetailSheet` (position, per-instance balance + USD),
  `WalletButton` (header USDC balance), `TransferForm` (stable/native/asset
  balances).
- **Wagers**: `WagerCard`, `WagerTable` (stakes), `TakeChallengePanel` (stake /
  winner-takes), `TradePanel` (pay/receive balances, receive value, minimum
  received), `LiveStats` (Value Wagered).
- **Pools**: `PoolParticipants` (payout), `PoolResolutionActions` (escrow target,
  validation totals, claim share).

Deliberately **not** masked (non-monetary or not the user's holdings): participant
/ vote / member counts, dates, deadlines, timers, wager/pool IDs & codes,
addresses, nicknames, win-rate %, price-impact/slippage %, public market
prices/odds (Polymarket cents, DEX exchange rates), and editable amount `<input>`
fields.

## Test status

- All 6 tilt-to-hide test files pass (36 tests). Full frontend suite: the only
  regression from wrapping (`TradePanel.test.jsx` cross-element matcher) was fixed.
- Pre-existing, unrelated failures remain on this branch and are **out of scope**
  for spec 046 (verified failing with the original `test/setup.js` too):
  `clearpath/ClearPathPanel`, `clearpath/ProposalBuilder`, `quickAccessPreference`.
