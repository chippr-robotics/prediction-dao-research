# Tasks: Wager Activity Notifications

**Input**: Design documents from `/specs/012-wager-notifications/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (watcher-api.md, notification-types.md, storage-schema.md), quickstart.md

**Tests**: INCLUDED — constitution Principle II (test-first) is non-negotiable. Within each group, write the test task before (or alongside) the implementation it proves; tests must fail before the implementation lands.

**Organization**: Grouped by user story from spec.md so each story is an independently testable increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 (catch-up feed, P1), US2 (action badges, P2), US3 (live toasts, P3), US4 (deadline warnings, P3)

## Path Conventions

Frontend-only feature: all source under `frontend/src/`, tests under `frontend/src/test/` (per `MyMarketsModal.test.jsx` conventions). No `contracts/`, subgraph, or backend changes.

---

## Phase 1: Setup

**Purpose**: Branch hygiene — no scaffolding needed (no new dependencies; directories are created by their first files)

- [X] T001 Create feature branch from latest origin: `git fetch origin && git checkout -b feat/012-wager-notifications origin/main` (repo rule: never commit to main; local main can be stale)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Pure state/derivation modules, the persistent store, and the polling provider that every user story consumes

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 [P] Add `'draw'` at index 6 of `WAGER_STATUS_NAMES` in `frontend/src/utils/blockchainService.js` (~line 401; on-chain `Draw` currently maps to `'unknown'`) and add a regression assertion in a new `frontend/src/test/wagerStatusNames.test.js`
- [X] T003 [P] Write failing unit tests for state derivation in `frontend/src/test/derivedState.test.js`: full CanonicalState boundary matrix from data-model.md (pending/expired at `acceptanceDeadline`, active/resolvable at `tradingEndTime`, resolvable/refundable at `resolveDeadlineTime`, claimable requires `winner==account && !paid`), plus `deriveActionNeeded` matrix incl. resolutionType actor rules (Either/Creator/Opponent/ThirdParty/oracle) and `respondDraw`
- [X] T004 Implement `frontend/src/data/notifications/derivedState.js` — pure `deriveState(wager, account, nowMs)` and `deriveActionNeeded(wager, account, nowMs, drawProposedBy)` per data-model.md; make T003 pass
- [X] T005 [P] Write failing unit tests for the store in `frontend/src/test/activityStore.test.js`: key is `wager_activity_v1_<chainId>` via `userStorage` (account+chain scoping — assert no bleed between two accounts / two chains), version-mismatch reset, corrupt-JSON reset, `appendEntries` dedup by `entry.id`, prune to 100 newest, terminal-snapshot retention rule, `markRead` for all three ref forms: `{entryId}` (single entry), `{wagerId}` (all of a wager's entries), `'*'` (everything)
- [X] T006 Implement `frontend/src/data/notifications/activityStore.js` — `loadStore/saveStore/appendEntries/markRead(store, ref)` per contracts/storage-schema.md and watcher-api.md (ref: `{entryId} | {wagerId} | '*'`); make T005 pass
- [X] T007 [P] Write failing provider tests in `frontend/src/test/WagerActivityContext.test.jsx` (mock the `fetchWagers` seam, fake timers): 30 s interval; pause on `visibilitychange` hidden + immediate poll on visible; immediate poll on mount/connect/account change/chain change; disconnected ⇒ empty state + no polling/writes; poll failure ⇒ previous state retained, nothing fabricated, ≤1 failure notice per session, auto-retry; account/chain switch swaps store atomically; first poll deferred past first paint (children render immediately)
- [X] T008 Implement `frontend/src/contexts/WagerActivityContext.jsx` — provider skeleton per contracts/watcher-api.md: poll loop calling the `fetchWagers(account, chainId)` seam (default `fetchFriendMarketsForUser` from `frontend/src/utils/blockchainService.js`), computes `actionNeededByWagerId`/`actionNeededCount` via `derivedState.js`, exposes full context value (`entries` empty until US1 wires the diff), `refresh()`; make T007 pass
- [X] T009 [P] Implement `frontend/src/hooks/useWagerActivity.js` — context consumer hook, throws outside provider (assert in T007's file)
- [X] T010 Mount `WagerActivityProvider` in the app-mode tree in `frontend/src/App.jsx` (inside `AppLayout`, below wallet/UI providers so it can read account+chainId and call `useNotification`)

**Checkpoint**: Provider polls and derives action-needed state; stores are scoped and resilient — user story phases can begin

---

## Phase 3: User Story 1 — See What Changed Since My Last Visit (Priority: P1) 🎯 MVP

**Goal**: Bell + activity feed with catch-up: a returning user sees accepted/resolved/claimable/draw/expired changes since last session; unread clears on acknowledge-or-view (NOT on feed open); entry → wager navigation; no duplicates; legacy My Wagers tab unread counts removed (the bell is the single unread indicator)

**Independent Test**: quickstart.md steps 1 (catch-up + acknowledge-or-view read semantics + no-dup reload), 7 (storage reset ⇒ no replayed history), spec US1 acceptance scenarios 1–6

- [X] T011 [P] [US1] Write failing diff-engine tests in `frontend/src/test/diffEngine.test.js`: every transition row in contracts/notification-types.md (incl. `paid false→true` receipt, unmapped-transition factual fallback for v1 `challenged`/`oracle_timed_out`), first-sight rule (no prior snapshot ⇒ snapshot only, zero entries), dedup ids, idempotence (same input twice ⇒ no entries), user-perspective messages (won/lost/your-turn), honest finality (win/claim copy only in `resolved-claimable`/`resolved-won-paid`), encrypted-wager `{desc}` fallback
- [X] T012 [US1] Implement `frontend/src/data/notifications/diffEngine.js` — `diffWagers({snapshots, wagers, account, nowMs})` → `{entries, nextSnapshots}` with message templates per contracts/notification-types.md; make T011 pass
- [X] T013 [US1] Wire the diff into the provider poll cycle in `frontend/src/contexts/WagerActivityContext.jsx`: catch-up diff on first successful poll vs persisted snapshots, persist snapshots+entries via `activityStore`, expose `entries`/`unreadCount`/`markEntryRead`/`markWagerRead`/`markAllRead`; extend `frontend/src/test/WagerActivityContext.test.jsx` (catch-up populates feed ≤ first poll; reload with same chain state ⇒ zero new entries; `markWagerRead(wagerId)` clears exactly that wager's entries)
- [X] T014 [P] [US1] Write failing bell/feed component tests in `frontend/src/test/NotificationBell.test.jsx` (mock `useWagerActivity`): button `aria-label` "Notifications, N unread", Badge count visibility, hidden when disconnected, Enter/Space opens + Escape closes feed; **opening the feed does NOT change unread count** (FR-004); entry click calls `markEntryRead` + navigates + closes; explicit "Mark all read" control calls `markAllRead()`; entries render newest-first; empty state "You're all caught up"; staleness hint when `lastPolledAt` > 5 min
- [X] T015 [US1] Implement `frontend/src/components/notifications/NotificationBell.jsx` + `NotificationBell.css` — header bell with unread Badge per contracts/watcher-api.md; make bell assertions in T014 pass
- [X] T016 [US1] Implement `frontend/src/components/notifications/ActivityFeed.jsx` + `ActivityFeed.css` — labeled region/dialog, entries newest-first with severity styling and actionable weight, entry click → acknowledge (`markEntryRead`) + `onNavigate(wagerId)` + close, explicit "Mark all read" control, NO auto-mark on open; make feed assertions in T014 pass
- [X] T017 [US1] Add the bell to `frontend/src/components/Header.jsx` `.header-actions` (render only when `appMode && isConnected`, between ThemeToggle and WalletButton); verify mobile layout in `frontend/src/components/Header.css`
- [X] T018 [US1] Implement entry → wager navigation: feed entry opens My Wagers detail for that wagerId — pass an initial selected wager into `frontend/src/components/fairwins/Dashboard.jsx` → `MyMarketsModal` (router state or query param), selecting it via the modal's `selectedMarketId`; cover with a test in `frontend/src/test/feedNavigation.test.jsx`
- [X] T019 [US1] Remove the legacy My Wagers unread counts and wire view-to-read (spec FR-016/FR-004): strip the `useMyWagerNotifications` tab/count usage from `frontend/src/components/fairwins/MyMarketsModal.jsx`; call `markWagerRead(wagerId)` whenever a wager's detail view opens (any path, not just feed navigation); update `frontend/src/test/MyMarketsModal.test.jsx` (drop the `useMyWagerNotifications` mock, assert no legacy count UI, assert `markWagerRead` is called on detail open); delete `frontend/src/hooks/useMyWagerNotifications.js` if no other consumers remain (keep the `createUnreadMarketTracker` factory in `frontend/src/hooks/useUnreadMarketTracker.js` — FriendMarkets still uses it)
- [X] T020 [P] [US1] Write failing scan tests in `frontend/src/test/drawProposalScan.test.js`: filters to known wagerIds, watermark starts at current tip when `drawScanBlock=0` (no historical backfill), advances `toBlock`, chunked ranges, any RPC error ⇒ resolves `{proposals: [], toBlock: fromBlock}` (never throws)
- [X] T021 [US1] Implement `frontend/src/data/notifications/drawProposalScan.js` — best-effort `DrawProposed`/`DrawRevoked` `queryFilter` scan per contracts/watcher-api.md using `WAGER_REGISTRY_ABI` from `frontend/src/abis/WagerRegistry.js`; make T020 pass
- [X] T022 [US1] Wire the draw scan into the provider poll in `frontend/src/contexts/WagerActivityContext.jsx`: maintain `snapshots[id].drawProposedBy` + `drawScanBlock`, emit `draw-proposed`/`draw-revoked` entries (counterparty only), feed `drawProposedBy` into `deriveActionNeeded`; extend provider tests for scan-failure degradation (struct pipeline unaffected)

**Checkpoint**: US1 fully functional — returning users see what changed; bell is the single unread indicator; MVP demoable

---

## Phase 4: User Story 2 — Know Where Action Is Needed (Priority: P2)

**Goal**: Action-needed badges on the My Wagers entry point and on individual wager cards, derived from live chain state, cleared when the action completes

**Independent Test**: quickstart.md steps 3 and 7 (badges survive storage reset), spec US2 acceptance scenarios 1–3

- [X] T023 [P] [US2] Write failing badge tests in `frontend/src/test/actionNeededBadges.test.jsx` (mock `useWagerActivity`): Dashboard entry point badged iff `actionNeededCount > 0` with accessible text "N wagers need action"; exactly the wagers with non-null ActionKind badged in the modal, labels per kind (Accept/Resolve/Claim/Refund/Respond to draw); badge disappears when ActionKind becomes null
- [X] T024 [US2] Add the entry-point badge to the My Wagers entry in `frontend/src/components/fairwins/Dashboard.jsx` using `actionNeededCount` from `useWagerActivity` (reuse `frontend/src/components/ui/Badge.jsx`); make Dashboard assertions in T023 pass
- [X] T025 [US2] Add per-card badges in `frontend/src/components/fairwins/MyMarketsModal.jsx` using `actionNeededByWagerId` (graceful when `drawProposedBy` absent — scan is best-effort); make card assertions in T023 pass and keep existing `frontend/src/test/MyMarketsModal.test.jsx` green (mock `useWagerActivity` there)

**Checkpoint**: US1 + US2 work independently — glance shows where to act

---

## Phase 5: User Story 3 — Real-Time Alerts While Using the App (Priority: P3)

**Goal**: Changes detected by a live poll surface as transient toasts within 60 s, in addition to the feed

**Independent Test**: quickstart.md step 2, spec US3 acceptance scenarios 1–2

- [X] T026 [US3] Implement the toast policy in `frontend/src/contexts/WagerActivityContext.jsx` per contracts/watcher-api.md: live-poll entries → `showNotification(message, severity, 6000)` via `useNotification()`; NO toasts for the catch-up batch; max 3 toasts per cycle + one "+N more updates in activity" summary; extend `frontend/src/test/WagerActivityContext.test.jsx` (catch-up silence, live toast, overflow summary, toast type = severity)

**Checkpoint**: Active sessions get immediate alerts; feed remains the durable record

---

## Phase 6: User Story 4 — Warned Before a Deadline Expires (Priority: P3)

**Goal**: Acceptance-expiry and resolution-window warnings within 24 h of the deadline, at most once per wager per window per day, never after the deadline passed

**Independent Test**: quickstart.md step 4, spec US4 acceptance scenarios 1–3

- [X] T027 [P] [US4] Write failing warning tests in `frontend/src/test/deadlineWarnings.test.js`: 24 h threshold (inside/outside boundary), UTC-day anti-spam bucket via `deadlineWarnings` records, recipient/actionability per contracts/notification-types.md (creator vs opponent for acceptance; resolvers only for resolution), passed deadline ⇒ no countdown warning (state transition covers it), entry id shape `<wagerId>:warn:<window>:<dayBucket>`
- [X] T028 [US4] Implement `frontend/src/data/notifications/deadlineWarnings.js` — pure `computeDeadlineWarnings({wagers, warnRecords, account, nowMs})` per contracts/watcher-api.md; make T027 pass
- [X] T029 [US4] Wire warnings into the provider poll cycle in `frontend/src/contexts/WagerActivityContext.jsx`: emit warning entries (feed + toast policy applies), persist `deadlineWarnings` records via `activityStore`; extend provider tests for once-per-day across multiple polls

**Checkpoint**: All four user stories independently functional

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T030 [P] Accessibility pass (constitution V / spec FR-014): axe check on Dashboard with feed open, keyboard-only traversal of bell → feed → entry → close (quickstart step 9); fix any violations in `frontend/src/components/notifications/*`
- [X] T031 Full validation: `npm run test:frontend` and frontend ESLint all green; confirm no `continue-on-error` or CI changes introduced
- [ ] T032 Manual quickstart validation on Polygon Amoy with two accounts per `specs/012-wager-notifications/quickstart.md` steps 1–8 (incl. acknowledge-or-view read semantics and absence of legacy tab counts); record outcomes against the SC gates table (note any deviation in quickstart.md) — *automated outcomes recorded in quickstart.md (2026-06-10); the on-chain two-account walkthrough needs a human with a funded wallet — left open as the PR review checklist*
- [X] T033 Commit, push `feat/012-wager-notifications`, and open a PR with `gh pr create -R chippr-robotics/prediction-dao-research --head feat/012-wager-notifications` with inline `--body` (snap-confined gh: no /tmp body files, no auto-discovery); summarize spec/plan links and SC results

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none — start immediately
- **Foundational (Phase 2)**: after T001 — BLOCKS all user stories. Internal order: T003→T004, T005→T006, T007→T008 (tests first); T002/T009 parallel anytime; T010 after T008
- **US1 (Phase 3)**: after Phase 2. Internal: T011→T012→T013; T014→T015/T016; T017–T018 after T015/T016; T019 after T013 (needs `markWagerRead`) and after T018 (shares MyMarketsModal edits); T020→T021→T022
- **US2 (Phase 4)**: after Phase 2 only (uses provider's `actionNeededByWagerId` from T008). T023→T024/T025. Independent of US1 (T025's `respondDraw` degrades gracefully without T022); coordinate T025 with T019 if run in parallel (same file: MyMarketsModal.jsx)
- **US3 (Phase 5)**: after T013 (toasts ride on diff entries). T026
- **US4 (Phase 6)**: after T013 (warning entries flow through the same store/feed/toast path). T027→T028→T029
- **Polish (Phase 7)**: after all desired stories; T030 [P] with T031; T032 then T033 last

### User Story Dependencies

- **US1 (P1)**: Foundational only — no other stories
- **US2 (P2)**: Foundational only — independently testable (badges derive from live state, not the feed). Same-file coordination with US1's T019/T018 on MyMarketsModal.jsx/Dashboard.jsx if parallelized
- **US3 (P3)**: needs US1's diff wiring (T013)
- **US4 (P3)**: needs US1's store/feed wiring (T013); warning logic itself (T027–T028) is independent

### Parallel Opportunities

- Phase 2: T002, T003, T005, T007, T009 all [P] (distinct files); then T004/T006/T008 in parallel once their tests exist
- After Phase 2: **US1 and US2 can proceed in parallel** (both read the provider; sequence only the MyMarketsModal.jsx touches: T018/T019 vs T025)
- Within US1: T011, T014, T020 in parallel; T012/T015+T016/T021 in parallel after their tests
- Phase 7: T030 ∥ T031

## Parallel Example: Foundational

```bash
# All failing-test tasks together (distinct files):
Task: "T003 derivedState tests in frontend/src/test/derivedState.test.js"
Task: "T005 activityStore tests in frontend/src/test/activityStore.test.js"
Task: "T007 provider tests in frontend/src/test/WagerActivityContext.test.jsx"
Task: "T002 WAGER_STATUS_NAMES draw fix + regression test"
```

## Parallel Example: After Foundational

```bash
# Developer A — US1 core:
Task: "T011 diffEngine tests" → "T012 diffEngine" → "T013 provider wiring" → "T019 legacy-count removal"
# Developer B — US2 (no US1 dependency):
Task: "T023 badge tests" → "T024 Dashboard badge" + "T025 card badges"
```

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 → Phase 2 (foundation) → Phase 3 (US1)
2. **STOP and VALIDATE**: quickstart steps 1, 5–8 — catch-up feed, acknowledge-or-view read semantics, scoping, resilience
3. Demo: the creator finally learns their wager was accepted without opening My Wagers

### Incremental Delivery

1. + US2 (badges) → validate quickstart step 3 → ship
2. + US3 (toasts) → validate quickstart step 2 → ship
3. + US4 (warnings) → validate quickstart step 4 → ship
4. Polish (T030–T032) → PR (T033)

## Notes

- Tests precede implementation within every group (constitution II); verify each new test file fails before implementing
- All chain access goes through the `fetchWagers` seam / `blockchainService` — no new RPC patterns, no `eth_getLogs` except the bounded best-effort draw scan
- Honest-finality copy assertions (T011) are the constitution-III gate — do not soften them to make implementation easier
- Read semantics (spec FR-004/FR-016): unread clears on acknowledge-or-view only — never on feed open; the bell is the single unread indicator (legacy tab counts removed in T019)
- Commit after each task or logical group on `feat/012-wager-notifications`; never to main
