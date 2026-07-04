---
description: "Task list for My Wagers — Tester Feedback Refinements"
---

# Tasks: My Wagers — Tester Feedback Refinements

**Input**: Design documents from `specs/040-my-wagers-refinements/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Tests**: INCLUDED — Constitution Principle II (Test-First) mandates Vitest coverage for all
non-trivial frontend logic; the plan calls for it explicitly.

**Organization**: Tasks are grouped by the seven user stories (US1–US7) so each can be implemented,
tested, and shipped independently. All work is in the `frontend/` project — no contract/subgraph
changes.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US7 (maps to spec.md user stories)
- Exact file paths are included in each task

## ⚠️ Shared-file coordination (breaks naive parallelism)

Several tasks edit the same files across stories — do NOT run these in parallel even though they live
in different story phases:

- `frontend/src/components/fairwins/MyMarketsModal.jsx` → T015 (US2), T024 (US3), T030 (US5), T032 (US6), T034 (US7)
- `frontend/src/components/fairwins/wagerVm.js` → T009 (US1), T016 (US2)
- `frontend/src/components/fairwins/WagerCard.jsx` → T010 (US1), T017 (US2)
- `frontend/src/components/fairwins/WagerTable.jsx` → T011 (US1), T018 (US2)
- `frontend/src/test/MyMarketsModal.test.jsx` → T012 (US1), T031 (US6), T033 (US7)

Sequence these by task ID. US1 and US2 share the card files, so prefer completing US1 before US2.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the working baseline; no new dependencies are introduced by this feature.

- [X] T001 Confirm `npm run test:frontend` and `npm run lint --workspace frontend` pass on a clean tree before changes; verify no new npm dependencies are required (ENS via existing `wagmi`, hashing via existing `ethers`).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared test scaffolding used by multiple story tests. These refinements are otherwise
independent — there is no blocking production code shared across all stories.

- [X] T002 [P] Add/extend shared Vitest fixtures for wager states (pending, active, `draw_proposed` with a known `drawProposer`, terminal `draw`, resolved) and pool items (one `bucket:'active'`, one `bucket:'history'`) in `frontend/src/test/fixtures/myWagers.js` (create if absent), reused by US1–US7 tests.

**Checkpoint**: Fixtures ready — user stories can proceed (in priority order or in parallel where files don't collide).

---

## Phase 3: User Story 1 - Recognizable opponents + click-to-reveal address (Priority: P1) 🎯 MVP

**Goal**: Show each opponent by the friendliest available name (address book → ENS → deterministic
two-word name), with a tap to reveal the full address.

**Independent Test**: Render cards for three opponent kinds (address-book / ENS / neither) and confirm
the expected label; tap to reveal and copy the full address; own side still reads "You".

### Tests for User Story 1

- [X] T003 [P] [US1] Unit test `deriveAddressName` (deterministic, casing-invariant, always returns a two-word label) in `frontend/src/test/addressName.test.js`
- [X] T004 [P] [US1] Hook test `useOpponentName` resolution priority (address book > ENS > generated; never returns raw address; synchronous generated fallback) in `frontend/src/test/useOpponentName.test.jsx`
- [X] T005 [P] [US1] Component test `OpponentName` — renders "You" when self, toggles full-address reveal on click/Enter, exposes copy + accessible label — in `frontend/src/test/OpponentName.test.jsx`

### Implementation for User Story 1

- [X] T006 [P] [US1] Implement `deriveAddressName(address)` reusing the `ADJECTIVES`/`NOUNS` vocab from `lib/pools/nicknameWords.js`, keyed by `keccak256` of the normalized address, in `frontend/src/lib/naming/addressName.js`
- [X] T007 [US1] Implement `useOpponentName(address, { chainId })` (address book via `useAddressBook().findByAddress` → `useEnsReverseLookup` → `deriveAddressName`) in `frontend/src/hooks/useOpponentName.js` (depends on T006)
- [X] T008 [US1] Implement `OpponentName.jsx` presentational component (button + reveal + copy, WCAG 2.1 AA) in `frontend/src/components/fairwins/OpponentName.jsx` (depends on T007)
- [X] T009 [US1] In `frontend/src/components/fairwins/wagerVm.js`, expose the raw `opponentAddress` and an `isSelf` flag on the view model (keep existing `opponent` for back-compat) so the card can render `<OpponentName>`
- [X] T010 [US1] Render `<OpponentName address={vm.opponentAddress} isSelf={…} />` in the opponent slot of `frontend/src/components/fairwins/WagerCard.jsx` (depends on T008, T009)
- [X] T011 [US1] Render `<OpponentName>` in the opponent column of `frontend/src/components/fairwins/WagerTable.jsx` (depends on T008, T009)
- [X] T012 [US1] Update opponent-name assertions in `frontend/src/test/MyMarketsModal.test.jsx` (name shown instead of raw address; reveal works)

**Checkpoint**: Opponents render by name with click-to-reveal in both card and table views.

---

## Phase 4: User Story 2 - Draw state clarity + per-party submission (Priority: P1)

**Goal**: Make draw state visible on the card, show which party has submitted, and notify the member
when a counterparty proposes a draw.

**Independent Test**: Drive a wager through a draw proposal from each side; confirm card copy
("You proposed · awaiting opponent" / "Opponent proposed · your turn"), a notification on the
counterparty's proposal, and a terminal "Draw — stakes returned" once both submit.

### Tests for User Story 2

- [ ] T013 [P] [US2] Unit test the draw descriptor derivation (phase/proposer/mySubmitted/opponentSubmitted/label from `computedStatus` + `drawProposedBy`) in `frontend/src/test/wagerVmDraw.test.js`
- [ ] T014 [P] [US2] Regression test that a `null → proposer` draw transition emits a user-facing, clearly-labeled "Draw proposed — respond" notification in `frontend/src/test/diffEngine.test.js` (and/or `frontend/src/test/sources/wagerSource.test.js`)

### Implementation for User Story 2

- [ ] T015 [US2] Enrich the modal's markets with `drawProposedBy` by calling `fetchDrawProposals({ chainId, wagerIds })` (retain prior state on `ok:false`) and mapping the proposer onto each market before building the view model, in `frontend/src/components/fairwins/MyMarketsModal.jsx`
- [ ] T016 [US2] Add the `draw` descriptor (`phase`, `proposer`, `mySubmitted`, `opponentSubmitted`, `label`) to the view model in `frontend/src/components/fairwins/wagerVm.js` (depends on T015; sequence after T009)
- [ ] T017 [US2] Render a distinct draw status treatment + per-party submission chip pair (text + icon, not color alone) in `frontend/src/components/fairwins/WagerCard.jsx` (depends on T016; sequence after T010)
- [ ] T018 [US2] Render draw state in `frontend/src/components/fairwins/WagerTable.jsx` (depends on T016; sequence after T011)
- [ ] T019 [US2] Verify the draw-proposal notification path (`data/notifications/derivedState.js` / `diffEngine.js` / `sources/wagerSource.js`); add/label the emission only if T014 shows it is not already produced
- [ ] T020 [US2] Add draw-state / submission-chip styles in `frontend/src/components/fairwins/WagerCard.css` (and `MyMarketsModal.css` if needed)

**Checkpoint**: Draw wagers show state + submission progress on the card, and proposals notify.

---

## Phase 5: User Story 3 - No repeated decrypt-word prompts (Priority: P1)

**Goal**: Auto-decrypt open challenges (and never prompt for pools) using locally stored, wallet-scoped
encrypted codes, so the member is prompted at most once.

**Independent Test**: Enter a challenge code once, reopen My Wagers → challenge unlocks with no prompt;
open a pool → no decrypt-words prompt at any point.

### Tests for User Story 3

- [ ] T021 [P] [US3] Unit test the auto-unlock decision (saved code → auto-decrypt, no prompt; no saved code → prompt once then `addEntry`) in `frontend/src/test/decryptAutoUnlock.test.js`
- [ ] T022 [P] [US3] Regression test that viewing a member's own pool triggers no decrypt-words prompt in `frontend/src/test/MyPoolsSection.test.jsx`

### Implementation for User Story 3

- [ ] T023 [US3] Add an in-memory session vault-key cache (`getSessionVaultKey(wallet)` derived once from `CODE_VAULT_SIGN_MESSAGE`, cleared on wallet change) in `frontend/src/lib/openChallenge/codeVault.js` (or a small `sessionKey.js` sibling)
- [ ] T024 [US3] Wire auto-decrypt into the open-challenge open handler in `frontend/src/components/fairwins/MyMarketsModal.jsx`: check the vault (`readEntries`) before showing `OpenChallengeDecryptModal`; on successful manual entry, `addEntry` the code (depends on T023)
- [ ] T025 [US3] Confirm the pool view path (`MyPoolsSection` / `useMyPools`) reuses the device-persisted pool identity and never prompts for words; document/adjust if a prompt exists

**Checkpoint**: Challenges auto-unlock after first entry; pools never ask for words.

---

## Phase 6: User Story 4 - Always-current list incl. pools (Priority: P2)

**Goal**: Auto-update pools on the same cadence wagers already use, and stop polling when the modal
closes.

**Independent Test**: Change a pool's state elsewhere → it updates within ~30s with no manual refresh;
close the modal → interval is cleared.

### Tests for User Story 4

- [ ] T026 [P] [US4] Test that `useMyPools` re-runs `load()` on its interval and clears the interval on unmount in `frontend/src/test/useMyPools.test.jsx`

### Implementation for User Story 4

- [ ] T027 [US4] Add `refresh()` + a ~30s interval (matching the wager poll) with unmount cleanup to `frontend/src/hooks/useMyPools.js`

**Checkpoint**: Pools refresh automatically while the modal is open; polling stops on close.

---

## Phase 7: User Story 5 - Terminal group pools filed under History (Priority: P2)

**Goal**: Show active pools in the active tabs and terminal pools only under History.

**Independent Test**: With one active and one terminal pool, active tabs show only the active pool;
the History tab shows the terminal pool.

### Tests for User Story 5

- [ ] T028 [P] [US5] Test that `MyPoolsSection` renders `bucket:'active'` pools on non-history tabs and `bucket:'history'` pools on the History tab (and nothing when the filtered list is empty) in `frontend/src/test/MyPoolsSection.test.jsx`

### Implementation for User Story 5

- [ ] T029 [US5] Make `MyPoolsSection` tab-aware: accept an `activeTab` prop, filter `items` by `bucket` per tab, and remove the per-row Active/Past chip, in `frontend/src/components/fairwins/MyPoolsSection.jsx`
- [ ] T030 [US5] Pass `activeTab` from `frontend/src/components/fairwins/MyMarketsModal.jsx` into `<MyPoolsSection>` (depends on T029)

**Checkpoint**: Terminal pools live under History; active pools stay in the active tabs.

---

## Phase 8: User Story 6 - Accurate status filter (Priority: P3)

**Goal**: Remove the "Disputed" and "Expired" options from the status dropdown without changing
default hiding of expired wagers.

**Independent Test**: Open the Status dropdown → Expired and Disputed absent; remaining options filter
correctly; default view still hides expired wagers.

### Tests for User Story 6

- [ ] T031 [US6] Test that the status `<select>` no longer offers Disputed/Expired and remaining options still filter, in `frontend/src/test/MyMarketsModal.test.jsx` (shares the file with T012/T033 — sequence, do not parallelize)

### Implementation for User Story 6

- [ ] T032 [US6] Remove the `Disputed` and `Expired` `<option>`s from the status filter in `frontend/src/components/fairwins/MyMarketsModal.jsx` (leave `getMarketStatus`/categorization untouched)

**Checkpoint**: Filter offers only reachable statuses; expired wagers stay hidden by default.

---

## Phase 9: User Story 7 - No redundant network pill (Priority: P3)

**Goal**: Remove the header network pill; keep the network name in the subtitle.

**Independent Test**: Open My Wagers → the standalone pill is gone; the subtitle still names the network
(appears exactly once).

### Tests for User Story 7

- [ ] T033 [US7] Test that the header renders no `mm-network-tag` pill and the subtitle still states the active network, in `frontend/src/test/MyMarketsModal.test.jsx` (shares the file with T012/T031 — sequence, do not parallelize)

### Implementation for User Story 7

- [ ] T034 [US7] Remove the `mm-network-tag` `<span>` from the header in `frontend/src/components/fairwins/MyMarketsModal.jsx` and delete the `.mm-network-tag*` rules from `frontend/src/components/fairwins/MyMarketsModal.css`

**Checkpoint**: Network name appears once (subtitle); the redundant pill is gone.

---

## Phase 10: Polish & Cross-Cutting Concerns

- [ ] T035 [P] Run an accessibility audit (axe/Lighthouse) over the changed My Wagers surface — opponent-name reveal, draw status/chips, filter, header — and fix any WCAG 2.1 AA regressions
- [ ] T036 [P] Verify per-network (chainId) isolation across opponent resolution, draw enrichment, and pool bucketing (no testnet/mainnet leakage), per Constitution III
- [ ] T037 Run `npm run test:frontend` and `npm run lint --workspace frontend` — both green with no new warnings
- [ ] T038 Execute the manual scenarios in `specs/040-my-wagers-refinements/quickstart.md` (US1–US7) and confirm the success-criteria mapping

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: after Setup; provides shared test fixtures.
- **User Stories (Phases 3–9)**: after Foundational. Independent by story, but see shared-file
  coordination — US2 shares the card files (`wagerVm.js`, `WagerCard.jsx`, `WagerTable.jsx`) with US1,
  and US2/US3/US5/US6/US7 all edit `MyMarketsModal.jsx`.
- **Polish (Phase 10)**: after all targeted stories are complete.

### User Story Dependencies

- **US1 (P1)**: independent — the MVP slice.
- **US2 (P1)**: independent in behavior, but **sequence after US1** because it edits the same card
  files; also depends on the `drawProposedBy` enrichment (T015) before the view-model change (T016).
- **US3 (P1)**: independent; only shares `MyMarketsModal.jsx` (T024) with other stories.
- **US4 (P2)**: fully independent (`useMyPools.js` only).
- **US5 (P2)**: independent; `MyPoolsSection.jsx` (T029) + one line in `MyMarketsModal.jsx` (T030).
- **US6 (P3)** and **US7 (P3)**: independent; both edit `MyMarketsModal.jsx` + its test file — sequence
  them.

### Within Each User Story

- Tests are written first and expected to FAIL before implementation.
- `deriveAddressName` (T006) → `useOpponentName` (T007) → `OpponentName` (T008) → card/table wiring.
- Draw: enrichment (T015) → view model (T016) → rendering (T017/T018).
- Decrypt: session key (T023) → open-handler wiring (T024).

### Parallel Opportunities

- Phase 2 fixture task (T002) is [P].
- Within US1: T003/T004/T005 (tests) run in parallel; T006 is [P] (new file).
- Across stories, the safely-parallel production files are: US4 (`useMyPools.js`) and US5
  (`MyPoolsSection.jsx`) — these don't collide with the card/modal files.
- Test files for different stories are [P] **except** the three tasks that all edit
  `MyMarketsModal.test.jsx` (T012/T031/T033), which must be sequenced.

---

## Parallel Example: User Story 1

```bash
# Tests first (all different files):
Task: "Unit test deriveAddressName in frontend/src/test/addressName.test.js"      # T003
Task: "Hook test useOpponentName in frontend/src/test/useOpponentName.test.jsx"    # T004
Task: "Component test OpponentName in frontend/src/test/OpponentName.test.jsx"      # T005

# Then the leaf implementation:
Task: "Implement deriveAddressName in frontend/src/lib/naming/addressName.js"       # T006
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 Setup → Phase 2 fixtures.
2. Complete US1 (opponent names + reveal) — the single most-requested readability win.
3. **STOP and VALIDATE** US1 independently (quickstart US1), then demo.

### Incremental Delivery (by priority)

1. Setup + Foundational → ready.
2. **US1** (names) → validate → ship.
3. **US2** (draw clarity) → validate → ship (sequence after US1 for card files).
4. **US3** (frictionless decrypt) → validate → ship.
5. **US4** (auto-update pools), **US5** (pool archiving) → validate → ship.
6. **US6** (filter), **US7** (network pill) → validate → ship.
7. Polish (a11y, isolation, quickstart).

### Parallel Team Strategy

- Dev A: US1 then US2 (owns the card files end-to-end to avoid conflicts).
- Dev B: US3 + US4 + US5 (pool/decrypt paths — minimal overlap with the card files).
- Dev C: US6 + US7 (both small, both in `MyMarketsModal.jsx` — one owner to serialize edits).

---

## Notes

- [P] = different files, no dependency on an incomplete task.
- Write tests first; confirm they fail before implementing (Constitution II).
- Commit after each task or logical group; keep the branch green.
- No `contracts/` (Solidity) changes — Slither/Medusa scope is untouched; this is a frontend-only feature.
- Watch the shared-file list above — it is the main source of accidental conflicts.

## Task Summary

- **Total tasks**: 38 (T001–T038)
- **Per story**: US1 = 10 (T003–T012), US2 = 8 (T013–T020), US3 = 5 (T021–T025), US4 = 2 (T026–T027), US5 = 3 (T028–T030), US6 = 2 (T031–T032), US7 = 2 (T033–T034)
- **Setup/Foundational**: 2 (T001–T002) · **Polish**: 4 (T035–T038)
- **Tests included**: yes (per Constitution II)
