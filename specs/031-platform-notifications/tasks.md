---
description: "Task list for Platform-Wide Notification & Activity System (spec 031)"
---

# Tasks: Platform-Wide Notification & Activity System

**Input**: Design documents from `specs/031-platform-notifications/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: INCLUDED — Constitution II (Test-First) is non-negotiable for this frontend logic; the plan
mirrors the existing `diffEngine`/`activityStore`/`WagerActivityContext` test suites.

**Organization**: By user story. Foundational (Phase 2) is a **no-regression refactor**: the wager watcher
moves onto the generalized engine and keeps working. Stories then light up cross-domain behavior on top.

**Path conventions**: Frontend SPA — all paths under `frontend/src/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Reads-only enablement + test scaffolding. No behavior change.

- [x] T001 [P] Add the already-existing OZ Governor read views to `GOVERNOR_READ_ABI` — `hasVoted(uint256,address)`, `getVotes(address,uint256)`, and `proposalEta(uint256)` (include only if tracked Governors expose it) — in `frontend/src/abis/externalDAORegistry.js` (reads only; NO contract change).
- [x] T002 [P] Create the test folder `frontend/src/test/sources/` and a `frontend/src/data/notifications/sources/README.md` stub recording the source keys (`wagers|dao|token|membership`) and the entry `domain`/`refId`/`link` conventions from `data-model.md`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The domain-agnostic engine, store, provider, and the wager source — so wagers run on the
generalized system with **no regression**. **No story work begins until this phase is complete.**

**⚠️ CRITICAL**: blocks all user stories.

### Tests (write first, must fail before implementation)

- [x] T003 [P] Unit tests for the generalized store (partitioned v1 shape, `isValidStore`/corrupt-reset, `defaultStore`, `appendEntries` global id-dedup+cap, `markRead` with `{entryId}|{refId}|'*'`, `pruneSnapshots(sourceKey,...)`, `setSourceSlice`) in `frontend/src/test/activityStore.test.js` (extend existing).
- [x] T004 [P] Unit tests for the legacy→platform store migration (entries stamped `domain:'wagers'`+`refId`, `snapshots`→`sources.wagers.snapshots`, `deadlineWarnings`→`sources.wagers.aux`, read-state preserved, idempotent, malformed-legacy → default) in `frontend/src/test/activityStore.migration.test.js`.
- [x] T005 [P] Unit tests for `activityEngine` composition (run N mock sources, merge fresh, cap toasts once over merged list, `ok:false` retains that source's prior slice, scope guard discards stale-scope results) in `frontend/src/test/activityEngine.test.js`.

### Implementation

- [x] T006 Generalize the store to partitioned v1 + one-time migration + generic API (`appendEntries`, `markRead` incl. `{refId}`, `pruneSnapshots(store, sourceKey, currentIds, nowMs)`, `setSourceSlice`, key `platform_activity_v1_<chainId>`) per `contracts/store-schema.md` in `frontend/src/data/notifications/activityStore.js`.
- [x] T007 Implement `activityEngine` (compose registered sources, merge `fresh`, apply toast cap once, per-source `ok:false` retain, snapshot prune, return `{store, fresh, actionNeededCount}`) per `contracts/activity-source.md` in `frontend/src/data/notifications/activityEngine.js`.
- [x] T008 Implement the generic context object + `POLL_INTERVAL_MS=30000` in `frontend/src/contexts/ActivityContext.js`.
- [x] T009 Implement `ActivityProvider` — 30s visibility-aware deferred poll loop, per-(account,chainId) scope swap with in-flight `scopeRef` guard, concurrent-`markRead`-survives-poll re-read, one-failure-notice-per-session; exposes `{ entries, unreadCount, actionNeededCount, isPolling, lastPolledAt, markEntryRead, markRefRead, markAllRead, refresh }` in `frontend/src/contexts/ActivityProvider.jsx`.
- [x] T010 Implement `useActivity()` / `useActivityOptional()` in `frontend/src/hooks/useActivity.js`.
- [x] T011 [P] Implement `wagerSource` wrapping existing `fetchFriendMarketsForUser`/`fetchDrawProposals`/`diffWagers`/`computeDeadlineWarnings`/`deriveActionNeeded`, post-stamping each entry with `domain:'wagers'`, `refId=wagerId`, and a wager `link` (NO change to the wager pure modules) in `frontend/src/data/notifications/sources/wagerSource.js`.
- [x] T012 Provide a backward-compatible `useWagerActivity` shim over `useActivity` (wager-filtered `entries` + `actionNeededByWagerId` + `markWagerRead`) so existing consumers (Dashboard, WagerTable, WagerCardGrid, MyMarketsModal) keep working unchanged in `frontend/src/hooks/useWagerActivity.js`.
- [x] T013 Mount `ActivityProvider` in place of `WagerActivityProvider` in `frontend/src/App.jsx` (`AppLayout`).
- [x] T014 Provider integration test (real pure modules, mocked source seams, fake timers + fixed `NOW`) proving **wager no-regression** through the new engine + scope swap + failure retention in `frontend/src/test/ActivityProvider.test.jsx`.

**Checkpoint**: Wagers run on the generalized engine with no behavior change; store migrates with read-state intact.

---

## Phase 3: User Story 1 - One feed for everything on my account (Priority: P1) 🎯 MVP

**Goal**: Light up all four domains in a single durable, per-scope feed with a domain tag and correct unread count.

**Independent Test**: With wager + tracked-DAO (+ token/membership) state on the active scope, open the bell → one chronological feed shows entries from every active domain, each tagged; navigate away/back and reload → persists.

### Tests (write first)

- [ ] T015 [P] [US1] `daoSource.detect` tests: OZ state→event mapping (Active→voting-open, Succeeded→queue, Queued→execute, Executed/Defeated/Expired/Canceled→finalized), snapshot-diff first-sight = zero entries, `partial` flag on truncated scan, `ok:false` on RPC failure, in `frontend/src/test/sources/daoSource.test.js`.
- [ ] T016 [P] [US1] `tokenSource.detect` tests: role/pause snapshot-diff emits on change, first-sight baseline (zero), historical events omitted, in `frontend/src/test/sources/tokenSource.test.js`.
- [ ] T017 [P] [US1] `membershipSource.detect` tests: tier/expiry snapshot-diff (granted/upgraded/expired), first-sight baseline, in `frontend/src/test/sources/membershipSource.test.js`.

### Implementation

- [ ] T018 [US1] Implement `daoSource` — list tracked DAOs via `useClearPath().listExternalDAOs`, cache the bounded `fetchGovernorProposals` scan and per-cycle re-read `state`/`proposalVotes` only for non-terminal proposals, map states→entries (`domain:'dao'`, `refId='<daoAddr>#<proposalId>'`, `link` to the ClearPath tab), set `partial`, in `frontend/src/data/notifications/sources/daoSource.js`.
- [ ] T019 [P] [US1] Implement `tokenSource` — for tokens the user administers/holds (via `useTokenFactory` discovery) snapshot `hasRole` role surface + `paused()`, diff→informational entries (`domain:'token'`); document+omit mint/role/pause history, in `frontend/src/data/notifications/sources/tokenSource.js`.
- [ ] T020 [P] [US1] Implement `membershipSource` — read `getMembership(user, role)` (tier, `expiresAt`), snapshot-diff→granted/upgraded/expired entries (`domain:'membership'`), in `frontend/src/data/notifications/sources/membershipSource.js`.
- [ ] T021 [US1] Register the ordered source list `[wagerSource, daoSource, tokenSource, membershipSource]` in `frontend/src/data/notifications/sources/index.js` and consume it in the engine/provider.
- [ ] T022 [US1] Generalize `ActivityFeed` to render ANY domain: per-domain tag + icon, navigate via `entry.link` (default wager link/`domain:'wagers'` for legacy entries), dialog label "Activity", in `frontend/src/components/notifications/ActivityFeed.jsx` (+ `ActivityFeed.css`).
- [ ] T023 [US1] Generalize `NotificationBell` unread for the merged feed (preserve `aria-label` with count) in `frontend/src/components/notifications/NotificationBell.jsx`.
- [ ] T024 [P] [US1] Feed rendering test: multi-domain entries render with tags + deep-links; legacy wager entries default to `domain:'wagers'`, in `frontend/src/test/ActivityFeed.test.jsx`.

**Checkpoint**: Cross-domain unified feed is live (MVP).

---

## Phase 4: User Story 2 - Get alerted the moment something new happens (Priority: P2)

**Goal**: New activity in any domain raises a (bounded) live toast + updates unread; catch-up after being away is feed-only.

**Independent Test**: With the app open, cause a non-wager change → a toast appears + unread increments; simulate returning with many accumulated changes → feed populates without a toast storm.

### Tests (write first)

- [ ] T025 [P] [US2] Engine/provider tests: toast cap (3 + "+N more" summary) applied **once** across the merged multi-source `fresh`; first cycle (catch-up) is feed-only; one failure notice spans sources, in `frontend/src/test/activityEngine.test.js` + `frontend/src/test/ActivityProvider.test.jsx` (extend).

### Implementation

- [ ] T026 [US2] Ensure the toast cap + catch-up suppression + summary operate over the merged cross-source `fresh` list (verify/adjust the merge-then-cap seam) in `frontend/src/data/notifications/activityEngine.js` / `frontend/src/contexts/ActivityProvider.jsx`.

**Checkpoint**: Live cross-domain alerts with no catch-up storm.

---

## Phase 5: User Story 3 - Know what needs my action, across domains (Priority: P2)

**Goal**: Action-needed entries are distinguished from informational across domains, and the bell surfaces an action-needed indicator (distinct from unread).

**Independent Test**: Create a castable DAO vote (action) + an expiring membership (action) + one info entry → both actions flagged and reflected on the bell; the info entry is not; resolving an action clears it next cycle.

### Tests (write first)

- [ ] T027 [P] [US3] Source action-needed tests: `daoSource` (vote iff `!hasVoted && getVotes>0`, queue, execute; honest degrade to info when the ABI views are absent), `membershipSource` (renew when expiring-soon; redeem when voucher redeemable), in `frontend/src/test/sources/daoSource.test.js` + `membershipSource.test.js` (extend).

### Implementation

- [ ] T028 [US3] Add action-needed derivation to `daoSource` — `vote`/`queue`/`execute` `actionNeededById`, gating `vote` on `hasVoted`/`getVotes` and `execute` on `proposalEta` when readable (else truthful fallback) — in `frontend/src/data/notifications/sources/daoSource.js`.
- [ ] T029 [P] [US3] Add membership `expiring-soon` (deadline-warning style, anti-spam once/UTC-day, default 7-day window) + `voucher-redeemable` action entries + `actionNeededById` (via `useVouchers` read) in `frontend/src/data/notifications/sources/membershipSource.js`.
- [ ] T030 [US3] Aggregate `actionNeededCount` across all sources in `frontend/src/contexts/ActivityProvider.jsx`.
- [ ] T031 [US3] Surface action-needed on `NotificationBell` (fold the count into the `aria-label` + a visible indicator, not a silent badge) in `frontend/src/components/notifications/NotificationBell.jsx`.
- [ ] T032 [P] [US3] Bell action-needed test (count rendered + in `aria-label`; clears when resolved) in `frontend/src/test/NotificationBell.test.jsx`.

**Checkpoint**: Cross-domain action-needed visible on the bell and in the feed.

---

## Phase 6: User Story 4 - Manage and trust my feed (read state, filtering, scope isolation) (Priority: P3)

**Goal**: Mark read (one/all), filter the feed by domain (view-only), and strict per-(account,network) isolation.

**Independent Test**: Mark one read → unread −1; mark all → 0; filter to a domain → only that domain shows, counts unchanged; switch wallet/network → only that scope's feed; switch back → original intact.

### Tests (write first)

- [ ] T033 [P] [US4] Tests: per-domain filter is view-only (entries/unread/action-needed unchanged); `markRefRead` flips only matching entries; scope isolation (no cross-account/cross-chain leakage), in `frontend/src/test/ActivityFeed.test.jsx` + `frontend/src/test/ActivityProvider.test.jsx` (extend).

### Implementation

- [ ] T034 [US4] Add a keyboard-operable per-domain view filter to `ActivityFeed` (local `domainFilter` state derived from loaded entries, shown only when >1 domain, resets on open, does not steal panel focus) in `frontend/src/components/notifications/ActivityFeed.jsx` (+ `ActivityFeed.css`).
- [ ] T035 [US4] Generalize the feed's read-state controls to any domain (`markEntryRead`/`markAllRead`/`markRefRead`, "Mark all read") in `frontend/src/components/notifications/ActivityFeed.jsx`.

**Checkpoint**: Feed is manageable and scope-isolated across all domains.

---

## Phase 7: User Story 5 - New domains plug in without rebuilding the plumbing (Priority: P3)

**Goal**: A documented source registry/interface such that a new domain appears in feed/bell/unread/action-needed/scoping with no edits to shared code; documented gaps handled honestly.

**Independent Test**: Register a dummy source → its entries flow through engine→feed→bell with zero edits to shared files.

### Tests (write first)

- [ ] T036 [P] [US5] Extensibility proof test: register a dummy in-memory source and assert its entries appear via the engine→provider→feed with NO modification to engine/store/feed/bell files, in `frontend/src/test/activityEngine.test.js` (extend).

### Implementation

- [ ] T037 [US5] Formalize the `ActivitySource` registry + interface JSDoc (matching `contracts/activity-source.md`) in `frontend/src/data/notifications/sources/index.js` (+ the `sources/README.md`).
- [ ] T038 [P] [US5] Document client-side detection gaps + partial handling (DAO window `partial` surfaced in the feed; token/membership historical events omitted, never faked; subgraph noted as the future path) in `frontend/src/data/notifications/sources/README.md` and cross-ref `specs/031-platform-notifications/research.md`.

**Checkpoint**: Adding a future domain is a one-module change.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T039 [P] Accessibility (axe / WCAG 2.1 AA) tests for the generalized feed + bell + domain filter (dialog focus/Escape, bell `aria-label` with unread+action-needed, filter keyboard-operable, toast polite/assertive preserved) in `frontend/src/test/platform-notifications.accessibility.test.jsx`.
- [ ] T040 [P] Run the full notification/ClearPath/wager test suites + `eslint` over the changed dirs; fix any failures (no `continue-on-error`).
- [ ] T041 Execute `quickstart.md` scenarios V1–V10 against the dev server (Mordor) and record results.
- [ ] T042 [P] Retire the superseded `WagerActivityProvider`/`WagerActivityContext` once all consumers use `ActivityProvider` (keep the `useWagerActivity` shim); update imports in `frontend/src/App.jsx` and remove dead files under `frontend/src/contexts/`.
- [ ] T043 [P] Update project memory + docs: note the generalized activity system, the source contract, and that historical-event coverage is a future subgraph enhancement.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (P1)**: no dependencies.
- **Foundational (P2)**: depends on Setup; **BLOCKS all user stories** (engine/store/provider/wagerSource).
- **US1 (P3)**: depends on Foundational. The MVP.
- **US2 (P4)**: depends on Foundational; verifies the engine's cross-source toast policy (light; can follow US1).
- **US3 (P5)**: depends on US1 (extends `daoSource`/`membershipSource` + bell).
- **US4 (P6)**: depends on US1 (extends `ActivityFeed`).
- **US5 (P7)**: depends on US1 (formalizes the registry the sources already use).
- **Polish (P8)**: depends on the desired stories being complete.

### Within a story

- Tests first (must fail), then implementation. Store/engine before provider; provider before sources wiring; sources before feed/bell rendering.

### Cross-story file notes (sequential, not parallel)

- `daoSource.js`/`membershipSource.js`: created in US1, extended in US3 (action-needed) — same files, sequential.
- `ActivityFeed.jsx`: touched in US1 (render), US4 (filter + read-state) — sequential.
- `NotificationBell.jsx`: touched in US1 (unread), US3 (action-needed) — sequential.
- `activityEngine.js`/`ActivityProvider.jsx`: foundational; verified/extended in US2/US3 — sequential.

### Parallel opportunities

- Setup T001/T002 in parallel.
- Foundational tests T003/T004/T005 in parallel (before impl); `wagerSource` T011 [P] alongside provider wiring.
- US1 source tests T015/T016/T017 in parallel; `tokenSource` T019 + `membershipSource` T020 in parallel (distinct files); feed test T024 [P].
- US3 T029 [P] (membership) alongside T028 (dao); bell test T032 [P].
- Polish T039/T040/T042/T043 in parallel.

---

## Parallel Example: Foundational tests

```bash
# Write these together (they must fail before T006–T014):
Task: "Store unit tests in frontend/src/test/activityStore.test.js"           # T003
Task: "Migration tests in frontend/src/test/activityStore.migration.test.js"  # T004
Task: "Engine composition tests in frontend/src/test/activityEngine.test.js"  # T005
```

## Parallel Example: US1 source implementations

```bash
# After the source tests fail and daoSource (T018) is in progress:
Task: "Implement tokenSource in frontend/src/data/notifications/sources/tokenSource.js"        # T019
Task: "Implement membershipSource in frontend/src/data/notifications/sources/membershipSource.js" # T020
```

---

## Implementation Strategy

### MVP (Setup + Foundational + US1)

1. Phase 1 Setup → Phase 2 Foundational (wagers on the generalized engine, **no regression** — validate via T014 + the existing wager suite).
2. Phase 3 US1 → the unified cross-domain feed. **STOP & VALIDATE** quickstart V1/V2.
3. Demo: one bell, all domains, durable, scope-isolated.

### Incremental delivery

- US1 (MVP) → US2 (live alerts) → US3 (action-needed) → US4 (manage/filter) → US5 (extensibility proof) → Polish. Each is an independently testable increment that never regresses the prior.

---

## Notes

- `[P]` = different files, no incomplete-task dependency.
- No backend, no contract changes (only reads-only ABI additions in T001).
- Honest state throughout: snapshot-diff first-sight = baseline; failures retain prior slice; DAO partial scans marked; documented gaps omitted, never faked.
- Commit after each task or logical group; keep `main` clean (work on `feat/platform-notifications-031`).
- Verify each phase's tests fail before implementing it.
