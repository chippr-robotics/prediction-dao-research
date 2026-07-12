---
description: "Task list for Create-a-Challenge Home Screen"
---

# Tasks: Create-a-Challenge Home Screen

**Input**: Design documents from `specs/053-home-create-challenge/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/create-challenge-panel.md ✅

**Tests**: INCLUDED — Constitution Principle II (non-negotiable) + research D8.

**Starting point**: This branch's WIP checkpoint already (a) applied the payments-sheet cleanups
(subtitle/caption removal, compact keypad, SVG resolution icons) and (b) consolidated oracle
settlement into the Open Challenge create panel (`MakerPanel` in `OpenChallengeModal.jsx`) and
deleted the standalone oracle modal — with several tests left mid-update. This feature extracts that
panel, builds the inline home + `/wagers` section around it, and finishes the test debt against the
new structure.

**Organization**: Foundational = extract the reusable create panel (blocks the home + the Wagers
open-challenge entry). US1/US2 = the inline home create view (P1). US3 = Accept + My Rewards (P2).
US4 = the relocated Wagers section + nav (P2).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: different files, no dependency on an incomplete task
- **[Story]**: US1 / US2 / US3 / US4 (Setup, Foundational, Polish have no story label)

## Path Conventions

Web app — frontend only. All source under `frontend/src/`.

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 [P] Create component scaffolds: `frontend/src/components/fairwins/CreateChallengePanel.jsx`, `HomeScreen.jsx`, `WagersPage.jsx` (empty default-export components) so imports resolve.
- [X] T002 [P] Create stylesheet scaffolds `frontend/src/components/fairwins/HomeScreen.css` and `WagersPage.css` (empty; consume existing theme tokens).

---

## Phase 2: Foundational (Blocking Prerequisites — extract the create panel)

**⚠️ CRITICAL**: The home screen and the Wagers open-challenge entry both depend on the extracted panel.

- [X] T003 [P] Write failing tests in `frontend/src/test/CreateChallengePanel.test.jsx` per `contracts/create-challenge-panel.md`: renders in `embedded` and modal modes; self / third-party / oracle paths reachable; oracle pill locked off-network and selectable on-network → market-search step → market card + side; submit passes the correct settlement config to the mocked `useOpenChallengeCreate`; success shows the claim-code result and calls `onDone`; zero amount keeps create disabled. Mock `useChainTokens` + `PolymarketBrowser` as in the deleted oracle test.
- [X] T004 Extract the consolidated `MakerPanel` from `frontend/src/components/fairwins/OpenChallengeModal.jsx` into `frontend/src/components/fairwins/CreateChallengePanel.jsx` — export `CreateChallengePanel({ embedded=false, onClose, onDone, initialResolutionType })`; move all create state/logic (amount, memo, resolution incl. oracle path + market step, deadlines, submit, result view). Render the `ClaimCodeResultPanel` result inline and call `onDone` on success.
- [X] T005 Reduce `frontend/src/components/fairwins/OpenChallengeModal.jsx` to a thin modal shell (backdrop + header + close) wrapping `<CreateChallengePanel embedded={false} … />`, preserving its `isOpen`/`onClose`/`initialResolutionType` props and the header InfoTip.
- [X] T006 Make T003 pass — run `npm run test:frontend -- CreateChallengePanel`; confirm both render modes and all three resolution paths work and submit unchanged.
- [X] T007 [P] Finish the WIP test debt at the modal/panel level (subtitle + caption removals): update `frontend/src/test/claimCode/OpenChallengeModal.test.jsx` (drop the removed "About: Stake — each side" caption assertion; keep the header "About open challenges" InfoTip), `frontend/src/test/claimCode/publicModeState.test.jsx` (subtitle text removed; InfoTip still present), and `frontend/src/test/claimCode/OpenChallengeCodeBackup.test.jsx` as needed so the Open Challenge modal suite is green.

**Checkpoint**: `CreateChallengePanel` is extracted, reused by the modal, and green.

---

## Phase 3: User Story 1 — The app opens straight into "create a challenge" (Priority: P1) 🎯 MVP

**Goal**: `/app` renders the inline open-challenge create view as primary content, no quick-action grid.

**Independent Test**: Navigate to `/app`; the inline create view (amount hero + pad + memo + resolution) is the primary content, and a challenge can be created from it end-to-end.

- [X] T008 [US1] Build `frontend/src/components/fairwins/HomeScreen.jsx` — render `<CreateChallengePanel embedded />` as the primary content; carry over the wallet-connect/membership gating so the create action is gated when disconnected/below tier (absorb `WelcomeView` into a light connect affordance near the action, not a full replacement).
- [X] T009 [US1] Style `frontend/src/components/fairwins/HomeScreen.css` (center the inline create view, keep it non-scrolling at 320px) using existing theme tokens.
- [X] T010 [US1] Point `/app`, `/main`, `/fairwins` at `HomeScreen` in `frontend/src/App.jsx` (replace the `Dashboard` element for those routes).
- [X] T011 [US1] Add `frontend/src/test/HomeScreen.test.jsx` — assert the inline create view is the primary content and NO quick-action grid is present; a stake entered on the pad + submit calls the mocked create flow; disconnected renders the view with the create action gated (FR-013).

**Checkpoint**: The app opens on the inline create view (SC-001, SC-002).

---

## Phase 4: User Story 2 — Resolution paths incl. network-gated oracle from home (Priority: P1)

**Goal**: All three resolution paths work from the home create view; oracle is network-gated and opens the market-search step; no standalone oracle modal remains.

**Independent Test**: On `/app`, exercise self / third-party / oracle; oracle locked off-network, selectable on-network → market step; the Polymarket ticker routes into the oracle path.

- [X] T012 [US2] Wire the Polymarket ticker on `frontend/src/components/fairwins/HomeScreen.jsx` (`PolymarketTickerCrawler`) to open the create view's oracle path (preselect oracle via `initialResolutionType`), reusing the repointed handler from the WIP.
- [X] T013 [US2] Extend `frontend/src/test/HomeScreen.test.jsx` — oracle pill locked on a non-Polymarket network and selectable on a Polymarket network (mock `useChainTokens`); selecting oracle opens the market-search step; a ticker click routes into the oracle path; assert no standalone "Open Oracle Challenge" modal exists anywhere (SC-006).

**Checkpoint**: All resolution paths (incl. gated oracle) work from home (SC-003, SC-006).

---

## Phase 5: User Story 3 — Accept a challenge & My Rewards from home (Priority: P2)

**Goal**: Home has "Accept a challenge" (unified lookup) and "My Rewards" (My Wagers) entries; deep links still route.

**Independent Test**: From home, Accept opens the phrase-lookup/take flow; My Rewards opens My Wagers; `?oc=take&code=` opens the prefilled lookup.

- [X] T014 [US3] Add the "Accept a challenge" and "My Rewards" entry points to `frontend/src/components/fairwins/HomeScreen.jsx` (secondary actions near the create view), opening `UnifiedLookupModal` and `MyMarketsModal` respectively via local state (same pattern Dashboard used).
- [X] T015 [US3] Move the `?oc=take&code=` deep-link handling from `Dashboard` into `frontend/src/components/fairwins/HomeScreen.jsx` so a take link opens the unified lookup prefilled + auto-resolving (FR-016).
- [X] T016 [US3] Extend `frontend/src/test/HomeScreen.test.jsx` — Accept opens the unified lookup (stub); My Rewards opens My Wagers (stub); the `?oc=take&code=` deep link opens the lookup prefilled/auto-resolving.

**Checkpoint**: Home covers create + accept + rewards (SC-004).

---

## Phase 6: User Story 4 — All wager types accessible from a "Wagers" section (Priority: P2)

**Goal**: A new `/wagers` route + nav-drawer item hosts the relocated quick-action grid and its modals; the grid is gone from home; nothing lost.

**Independent Test**: Nav drawer → Wagers → `/wagers` shows every previously-home create type + action, each launching its flow; quick-access visibility still applies; home no longer shows the grid.

- [X] T017 [US4] Build `frontend/src/components/fairwins/WagersPage.jsx` — move `QuickActions` + `handleQuickAction` + all create/track modal state (`FriendMarketsModal`, `GroupPoolModal`, `OpenChallengeModal`, `UnifiedLookupModal`, `MyMarketsModal`, `QRScanner`, `AddressQRModal`) and the `quickAccessPreference` visibility filtering out of `Dashboard` into this page.
- [X] T018 [US4] Split/retire `frontend/src/components/fairwins/Dashboard.jsx` — its `QuickActions`/`WelcomeView`/modal wiring now lives in `WagersPage`/`HomeScreen`; reduce `Dashboard.jsx` to a redirect/re-export or delete it once no route references it.
- [X] T019 [P] [US4] Add the `/wagers` route under `AppLayout` in `frontend/src/App.jsx` → `WagersPage`.
- [X] T020 [P] [US4] Add the "Wagers" nav item in `frontend/src/config/appNav.js` (absolute-route entry like `HOME_ITEM`, e.g. `{ id: 'wagers', label: 'Wagers', icon: <NavIcon name>, to: '/wagers' }`) and special-case `pathForNavItem('wagers') → '/wagers'`.
- [X] T021 [US4] Render the Wagers item in `frontend/src/components/nav/AppNavDrawer.jsx` and mark it active on `/wagers`.
- [X] T022 [P] [US4] Style `frontend/src/components/fairwins/WagersPage.css` (grid layout reused from the old Dashboard styles) using existing tokens.
- [X] T023 [US4] Add `frontend/src/test/WagersPage.test.jsx` — every previously-home card is present and launches its flow (stub modals); quick-access visibility toggles hide/show cards; the "Open Challenge" card opens the modal (wrapping the panel).
- [X] T024 [US4] Rework `frontend/src/test/Dashboard.test.jsx` for the split: home-grid + oracle-entry assertions move to `WagersPage.test.jsx`; the home tests assert the inline create view (or delete/redirect `Dashboard.test` if `Dashboard.jsx` is retired). Update the ticker/oracle-entry expectations to the consolidated flow.
- [X] T025 [P] [US4] Add a nav test (extend an existing nav test or add `frontend/src/test/appNav.test.js`) — `pathForNavItem('wagers') === '/wagers'` and the drawer renders/activates the Wagers item.
- [X] T026 [US4] Fix `frontend/src/test/accessibility.test.jsx` — the deleted-oracle-modal a11y block now renders the consolidated create view (or is removed); ensure no import of the deleted `OracleOpenChallengeModal`.

**Checkpoint**: Every wager type/action lives in `/wagers`; home is decluttered (SC-005).

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T027 [P] Run the a11y audit (axe/Lighthouse) on `/app` and `/wagers` and fix any new violations (labels/focus for the new entries + Wagers nav item) (SC-007).
- [ ] T028 [P] Verify the home create view is non-scrolling and legible at 320px and honors reduced-motion (reuses the compacted keypad).
- [ ] T029 Confirm deep links + existing routes still work (`?oc=take&code=`, `/friend-market/accept`, `/pools/:address`) after the home surface change (FR-016).
- [ ] T030 Run `specs/053-home-create-challenge/quickstart.md` Scenarios A–F and record results.
- [ ] T031 [P] Run `npm run test:frontend` + `eslint` + `npm run build`; ensure green with no new warnings (finishes any remaining WIP test debt, e.g. `FriendMarketsModal.test.jsx` "Private wagers with friends" subtitle assertion).
- [ ] T032 Update docs/screenshots referencing the old dashboard grid / separate oracle modal under `docs/` (e.g. `docs/user-guide/`), reflecting the create-a-challenge home + Wagers section.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (P1)**: none — start immediately.
- **Foundational (P2)**: depends on Setup — **BLOCKS all user stories** (home + Wagers reuse the panel).
- **US1 (P3)**: depends on Foundational. The MVP surface (`/app` inline create).
- **US2 (P4)**: depends on US1 (same `HomeScreen` file) + the panel's oracle path (Foundational).
- **US3 (P5)**: depends on US1 (adds entries to `HomeScreen`).
- **US4 (P6)**: depends on Foundational (Wagers grid reuses the modal/panel); largely independent of US1–US3 (different files: `WagersPage`, `App.jsx`, `appNav.js`, `AppNavDrawer`).
- **Polish (P7)**: after the desired stories.

### Parallel Opportunities

- **Setup**: T001 ∥ T002.
- **Foundational**: T003 (tests) authored in parallel; T004/T005 edit the same files (sequential); T007 is a separate test file (∥).
- **US4**: T019 (route), T020 (nav config), T022 (CSS), T025 (nav test) touch different files → parallel; T017/T018 (the page + Dashboard split) are the core sequential work.
- **Polish**: T027, T028, T031 in parallel.
- US1–US3 (HomeScreen) and US4 (WagersPage) can be built by different developers once Foundational lands.

---

## Parallel Example: User Story 4 (independent files)

```bash
Task: "T019 Add /wagers route in App.jsx"
Task: "T020 Add Wagers nav item + path in appNav.js"
Task: "T022 WagersPage.css grid layout"
Task: "T025 Nav test for the Wagers item"
```

---

## Implementation Strategy

### MVP First

1. Setup → Foundational (extract `CreateChallengePanel`, green).
2. US1 → **STOP and VALIDATE**: `/app` opens on the inline create view and can create a challenge.
3. Add US2 (gated oracle from home) for a complete create surface.

### Incremental Delivery

1. Foundational → US1 → US2: the create-a-challenge home is live.
2. US3: Accept + My Rewards complete the home hub.
3. US4: relocate the full grid to `/wagers` (nothing lost) and finish the test rework.
4. Polish: a11y + responsive + deep-link + quickstart + docs.

### Parallel Team Strategy

1. One developer extracts `CreateChallengePanel` (Foundational).
2. Then: developer A builds HomeScreen (US1–US3); developer B builds WagersPage + route/nav (US4).

---

## Notes

- `[P]` = different files, no dependency on an incomplete task.
- No contract/escrow/oracle/membership/claim-code changes (FR-014) — do not touch create/take/rewards
  hooks, ABIs, or `config/contracts`; only how surfaces are composed and navigated.
- Reuse the existing `AmountKeypad`, `PillSelect` (+ SVG resolution icons), `PolymarketBrowser`,
  `DeadlineTimeline`, `UnifiedLookupModal`, `MyMarketsModal`, and the compacted layout from the WIP.
- Keep the branch green before opening the PR; the WIP's mid-updated tests are finished across
  T007 / T024 / T026 / T031.
