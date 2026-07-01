---
description: "Task list for Unified Phrase Lookup for Pools & Challenges"
---

# Tasks: Unified Phrase Lookup for Pools & Challenges

**Input**: Design documents from `/specs/037-unified-pool-challenge-lookup/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (all present)

**Tests**: INCLUDED — the constitution (Principle II) and plan decision D8 require Vitest coverage
for the non-trivial new logic (resolver, aggregation, relocated panel).

**Organization**: Grouped by user story (P1/P2/P3) so each ships as an independent increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3
- All paths are relative to the repo root.

## Path Conventions

Frontend-only feature; all code under `frontend/src/` (React + Vite + Vitest). No `contracts/`,
subgraph schema, or backend changes (spec FR-014).

**File-conflict coordination (do NOT parallelize these):**
- `frontend/src/components/fairwins/OpenChallengeModal.jsx` — edited by T015 (remove taker tab, US1)
  and T028 (remove recover tab, US3): run sequentially.
- `frontend/src/components/fairwins/Dashboard.jsx` — edited by T013 and T014 (US1): sequential.
- `frontend/src/lib/lookup/myWagersSources.js` — T020 (US2): single owner.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the shared module location and test scaffolding for the new logic.

- [x] T001 Create the lookup module directory `frontend/src/lib/lookup/` with an `index.js` barrel exporting the resolver + aggregation modules
- [x] T002 [P] Add shared Vitest test helpers (fake `discoverChallenge` / `resolvePool` deps, sample challenge/pool/wager fixtures) in `frontend/src/lib/lookup/__tests__/_helpers.js`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The one shared-hook contract change the unified resolver depends on. Changes a hook
that existing code imports, so it must land (and stay backward-compatible) before US1.

**⚠️ CRITICAL**: Complete before starting User Story 1.

- [x] T003 Refactor `useOpenChallengeAccept` to expose a structured challenge lookup outcome `{ status: 'matched' | 'not-found' | 'errored', payload?, error? }` (e.g. a `lookup(code)` path) instead of signaling not-found by throwing a specific string; keep `discover`/`accept` behavior intact for existing callers, in `frontend/src/hooks/useOpenChallengeAccept.js` (research.md D3)
- [ ] T004 [P] Unit tests for the structured challenge lookup outcome (matched / not-found / errored; no signature on lookup) in `frontend/src/hooks/__tests__/useOpenChallengeAccept.lookup.test.js`

**Checkpoint**: Structured challenge lookup available — US1 resolver can be built.

---

## Phase 3: User Story 1 - One phrase finds the right thing (Priority: P1) 🎯 MVP

**Goal**: A single standalone "Enter a phrase" surface resolves a four-word phrase to either an
open challenge or a group pool and shows the matching take/join UI, with no type selector.

**Independent Test**: From the unified lookup, a known pool phrase shows the join panel, a known
challenge phrase shows the take panel, an unknown phrase shows one "no match found", and a
malformed entry shows a format hint before any lookup — all without a wallet signature to preview.

### Tests for User Story 1 ⚠️ (write first, ensure they fail)

- [x] T005 [P] [US1] Unit tests for `resolvePhraseLookup` covering every `LookupResult` branch — format-error, challenge, pool, collision, not-actionable, self, none, lookup-failed, and language-mismatch (English-only challenge gating) — in `frontend/src/lib/lookup/__tests__/resolvePhraseLookup.test.js` (contracts/unified-lookup.md; FR-006/007/009/011/012/025)
- [ ] T006 [P] [US1] Component test for `UnifiedLookupModal` — renders take/join panels, collision chooser, distinguishes "no match" vs "couldn't check", and performs no signature on preview — in `frontend/src/components/fairwins/__tests__/UnifiedLookupModal.test.jsx` (FR-010)
- [ ] T007 [P] [US1] Test the deep-link redirect: `?oc=take&code=<words>` opens the unified modal prefilled and auto-resolves, in `frontend/src/components/fairwins/__tests__/Dashboard.deeplink.test.jsx` (FR-013)

### Implementation for User Story 1

- [x] T008 [US1] Implement `resolvePhraseLookup(input)` — normalize/validate to 4 words, run challenge + pool lookups concurrently via `Promise.allSettled`, gate the challenge lookup to valid English codes, and reduce source outcomes to a `LookupResult` — in `frontend/src/lib/lookup/resolvePhraseLookup.js` (depends on T003; data-model.md, contracts/unified-lookup.md)
- [x] T009 [US1] Implement `useUnifiedLookup()` wrapping the resolver + state and reading `getWordListLang()` and account, in `frontend/src/hooks/useUnifiedLookup.js` (depends on T008)
- [ ] T010 [P] [US1] Extract a behavior-preserving `TakeChallengePanel` from the OpenChallengeModal TakerPanel into `frontend/src/components/fairwins/TakeChallengePanel.jsx`
- [ ] T011 [P] [US1] Extract a behavior-preserving `JoinPoolPanel` from the GroupPoolModal JoinPanel into `frontend/src/components/fairwins/JoinPoolPanel.jsx`
- [ ] T012 [US1] Implement `UnifiedLookupModal.jsx` — phrase input → results routed to take/join panels, collision chooser, not-actionable/self states, and separate "no match found" vs "couldn't check right now — retry" outcomes — in `frontend/src/components/fairwins/UnifiedLookupModal.jsx` (depends on T009, T010, T011)
- [ ] T013 [US1] Add the `enter-phrase` quick action + `UnifiedLookupModal` mount and remove the `join-pool` quick action in `frontend/src/components/fairwins/Dashboard.jsx` (depends on T012)
- [ ] T014 [US1] Reroute the `parseTakeChallengeParams` deep-link effect to open `UnifiedLookupModal` prefilled/auto-resolve in `frontend/src/components/fairwins/Dashboard.jsx` (depends on T012; same file as T013 — run after it)
- [ ] T015 [US1] Remove the "Take a challenge" (taker) tab, making the modal create-only, in `frontend/src/components/fairwins/OpenChallengeModal.jsx` (depends on T010; coordinate with T028)
- [ ] T016 [US1] Remove the "Join a pool" (join) tab, making the modal create-only, in `frontend/src/components/fairwins/GroupPoolModal.jsx` (depends on T011)
- [ ] T017 [US1] Accessibility pass on `UnifiedLookupModal` — labeled input, results in a live region, error `role="alert"`, focus moved to result/error (WCAG 2.1 AA) — in `frontend/src/components/fairwins/UnifiedLookupModal.jsx`

**Checkpoint**: US1 fully functional and independently testable (MVP).

---

## Phase 4: User Story 2 - Manage wagers, challenges, and pools in one place (Priority: P2)

**Goal**: My Wagers lists the user's 1v1 wagers, open challenges, and pools together (active +
history) with type indicators and correct routing.

**Independent Test**: With one wager, one challenge, and one pool on the account, My Wagers shows
all three with type/status and routes each to the right surface; an account with no challenges/pools
sees the unchanged wager-only view.

### Tests for User Story 2 ⚠️

- [ ] T018 [P] [US2] Unit tests for `aggregateMyItems` — union + de-dup by (type,id), active/history bucketing, source precedence (context/subgraph over device), and empty-type safety — in `frontend/src/lib/lookup/__tests__/myWagersAggregation.test.js` (contracts/my-wagers-aggregation.md; FR-016/017/019/024)
- [ ] T019 [P] [US2] Component test: `MyMarketsModal` shows wager + challenge + pool items with type/status and routes correctly, and is unchanged when no challenges/pools exist, in `frontend/src/components/fairwins/__tests__/MyMarketsModal.consolidated.test.jsx`

### Implementation for User Story 2

- [ ] T020 [US2] Implement `myWagersSources.js` — subgraph queries for created open challenges (`Wager(creator, status=open)`) and created/joined pools (`Pool(creator)`, `Pool`+`PoolJoin` reconciled to the user's identity commitment via `usePools.getMemberCommitments`), plus device-vault entries via `useOpenChallengeCodeVault.recoverCodes()` — in `frontend/src/lib/lookup/myWagersSources.js` (research.md D6; reuse the existing graph client)
- [ ] T021 [US2] Implement `aggregateMyItems(sources, account)` — union, de-dup, active/history bucketing, provenance flags — in `frontend/src/lib/lookup/myWagersAggregation.js` (depends on T020)
- [ ] T022 [US2] Integrate aggregation into `frontend/src/components/fairwins/MyMarketsModal.jsx` — render challenge + pool items alongside wagers with type indicator/status across the existing sort/filter and active/history grouping, route per type, and preserve wager-only behavior when empty (depends on T021; FR-015/016/017/018/019)
- [ ] T023 [US2] Ensure active-network scoping and honest status labels for challenge/pool items (no implied finality) in `frontend/src/components/fairwins/MyMarketsModal.jsx` and `frontend/src/lib/lookup/myWagersSources.js` (Constitution III; FR-024 device-scoped note)

**Checkpoint**: US1 and US2 both work independently.

---

## Phase 5: User Story 3 - Recovery codes live in Security (Priority: P3)

**Goal**: The open-challenge recovery-codes feature lives under My Account → Security, and the old
"Recover codes" tab is gone from the Open Challenge surface, with no data loss.

**Independent Test**: My Account → Security shows a working Recovery codes section (unlock → list →
copy) with all previously saved codes; the Open Challenge surface no longer has a Recover codes tab.

### Tests for User Story 3 ⚠️

- [x] T024 [P] [US3] Component test for `RecoveryCodesPanel` — not-connected, no-backup, unlock → list → copy, and the unlock step preserved — in `frontend/src/components/account/__tests__/RecoveryCodesPanel.test.jsx` (FR-020/022/023)
- [x] T025 [P] [US3] Test that `OpenChallengeModal` no longer renders a "Recover codes" tab in `frontend/src/components/fairwins/__tests__/OpenChallengeModal.norecover.test.jsx` (FR-021)

### Implementation for User Story 3

- [x] T026 [US3] Create `RecoveryCodesPanel.jsx` by extracting the RecoverPanel body from OpenChallengeModal, backed by the unchanged `useOpenChallengeCodeVault`, in `frontend/src/components/account/RecoveryCodesPanel.jsx` (contracts/recovery-codes-security.md)
- [x] T027 [US3] Mount `RecoveryCodesPanel` as a subsection under the Security tab in `frontend/src/pages/WalletPage.jsx` (depends on T026; FR-020)
- [x] T028 [US3] Remove the "Recover codes" (recover) tab entirely from `frontend/src/components/fairwins/OpenChallengeModal.jsx` (depends on T026; coordinate with T015 — same file)
- [x] T029 [US3] Accessibility pass on `RecoveryCodesPanel` + the Security subsection — button labels, list semantics, copy feedback in a live region (WCAG 2.1 AA) — in `frontend/src/components/account/RecoveryCodesPanel.jsx`

**Checkpoint**: All three user stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T030 [P] Run `npm run test:frontend` and confirm all new/updated Vitest suites pass
- [ ] T031 [P] ESLint clean (zero errors) and accessibility audit (axe/Lighthouse) for the new surfaces (Constitution IV/V)
- [ ] T032 Update user-facing copy/help that references "Take a challenge", "Join a pool", or "Recover codes" to the unified "Enter a phrase" flow and the Security location (in-app strings and `docs/`)
- [ ] T033 Execute `specs/037-unified-pool-challenge-lookup/quickstart.md` manual validation across US1/US2/US3
- [ ] T034 [P] Grep `frontend/src/` for dead references to removed entry points (the `join-pool` action, the `taker`/`recover` tabs) and remove any leftovers

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup; blocks US1 (T003 → T008).
- **User Stories (Phase 3–5)**: US2 and US3 depend only on Setup and are independent of US1 and of
  each other; US1 additionally depends on Foundational. With staff, US1/US2/US3 can proceed in
  parallel after their prerequisites, minding the file-conflict notes.
- **Polish (Phase 6)**: after the desired stories are complete.

### User Story Dependencies

- **US1 (P1)**: needs T003 (Foundational). Self-contained otherwise.
- **US2 (P2)**: independent (subgraph/context/device sources + MyMarketsModal). No dependency on US1.
- **US3 (P3)**: independent (extract panel + WalletPage + remove tab). Shares `OpenChallengeModal.jsx`
  with US1 (T015/T028) — sequence those two edits.

### Within Each User Story

- Tests first (they should fail), then implementation.
- Resolver (T008) before hook (T009) before modal (T012) before Dashboard wiring (T013/T014).
- Sources (T020) before aggregation (T021) before MyMarketsModal integration (T022).
- Panel extraction (T026) before WalletPage mount (T027) and tab removal (T028).

### Parallel Opportunities

- Setup: T002 ∥ T001-follow-up.
- Foundational: T004 ∥ (after T003).
- US1 tests T005/T006/T007 ∥; panel extractions T010 ∥ T011.
- US2 tests T018 ∥ T019.
- US3 tests T024 ∥ T025.
- Across stories: US1, US2, US3 in parallel by different developers after prerequisites (respect the
  `OpenChallengeModal.jsx` and `Dashboard.jsx` file-conflict notes).
- Polish: T030, T031, T034 ∥.

---

## Parallel Example: User Story 1

```bash
# Tests for US1 together (write first, expect fail):
Task: "Unit tests for resolvePhraseLookup in frontend/src/lib/lookup/__tests__/resolvePhraseLookup.test.js"
Task: "Component test for UnifiedLookupModal in frontend/src/components/fairwins/__tests__/UnifiedLookupModal.test.jsx"
Task: "Deep-link redirect test in frontend/src/components/fairwins/__tests__/Dashboard.deeplink.test.jsx"

# Independent panel extractions together:
Task: "Extract TakeChallengePanel in frontend/src/components/fairwins/TakeChallengePanel.jsx"
Task: "Extract JoinPoolPanel in frontend/src/components/fairwins/JoinPoolPanel.jsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → 2. Phase 2 Foundational (T003) → 3. Phase 3 US1 → 4. **STOP & VALIDATE** the
   unified lookup end-to-end (quickstart Scenario 1) → 5. Demo/ship the MVP.

### Incremental Delivery

1. Setup + Foundational ready.
2. US1 → validate (Scenario 1) → ship (MVP: the unified lookup).
3. US2 → validate (Scenario 2) → ship (consolidated My Wagers).
4. US3 → validate (Scenario 3) → ship (recovery codes in Security).

Each story adds value without breaking the previous ones.

### Parallel Team Strategy

After Setup + Foundational: Dev A → US1, Dev B → US2, Dev C → US3. Coordinate the two
`OpenChallengeModal.jsx` edits (T015/T028) and the two `Dashboard.jsx` edits (T013/T014).

---

## Notes

- [P] = different files, no incomplete-task dependency.
- No contract/subgraph-schema changes (FR-014) — this is a frontend discovery/management/IA change.
- Commit after each task or logical group; keep CI green (Constitution IV — no `continue-on-error`).
- Verify each story against its quickstart scenario before moving on.
