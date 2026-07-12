---
description: "Task list for Payments-Style Wager Create Sheets"
---

# Tasks: Payments-Style Wager Create Sheets

**Input**: Design documents from `specs/052-payments-style-wager-create/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/amount-keypad.md ✅

**Tests**: INCLUDED — the constitution (Principle II, non-negotiable) requires Vitest coverage alongside behavior, and research D8 defines the test strategy.

**Organization**: Tasks are grouped by user story. The shared `AmountKeypad` control is Foundational (blocks every surface). User Stories 1–3 land on the **Open Challenge** reference surface (the MVP); User Story 4 rolls the same layout out to the other three surfaces.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 / US2 / US3 / US4 (Setup, Foundational, Polish have no story label)
- Exact file paths are included in each task.

## Path Conventions

Web app — frontend only. All source under `frontend/src/`. New shared control under
`frontend/src/components/ui/`; edited create sheets under `frontend/src/components/fairwins/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Scaffold the new shared control's files and export.

- [X] T001 [P] Create component skeleton `frontend/src/components/ui/AmountKeypad.jsx` — default-export function component with the prop signature from `specs/052-payments-style-wager-create/contracts/amount-keypad.md` (`value`, `onChange`, `prefix='$'`, `token`, `disabled`, `maxFractionDigits=2`, `id`, `ariaLabel`, `autoFocus`); render a placeholder for now.
- [X] T002 [P] Create stylesheet scaffold `frontend/src/components/ui/AmountKeypad.css` — empty rule blocks for hero, pad grid, and keys; import nothing (global CSS, consumes `theme.css` tokens).
- [X] T003 Export `AmountKeypad` from `frontend/src/components/ui/index.js` (depends on T001).

---

## Phase 2: Foundational (Blocking Prerequisites — the shared control)

**Purpose**: Build and unit-test the shared `AmountKeypad` (hero read-out + on-screen number pad). Every create surface depends on it.

**⚠️ CRITICAL**: No user-story surface work should be considered done until this phase is complete and its tests pass.

- [X] T004 [P] Write failing unit tests in `frontend/src/components/ui/__tests__/AmountKeypad.test.jsx` covering the contract: digit entry updates hero; single decimal only (2nd `.` no-op); precision capped at 2 fractional digits (3rd frac no-op); backspace removes right-most char and reaches zero-state `$0`; `onChange` emits the normalized string; keys are role-queryable buttons (`getByRole('button',{name:'7'})`, decimal, delete); `prefix`/`token` render; `disabled` blocks activation. Use the `vi.mock`/render conventions from `frontend/src/components/fairwins/__tests__/JoinPoolPanel.test.jsx`.
- [X] T005 Implement controlled amount-edit logic in `frontend/src/components/ui/AmountKeypad.jsx` — append digit, allow one decimal separator, cap fractional digits at `maxFractionDigits`, backspace-to-empty; emit normalized string via `onChange`; keep no independent canonical state (per data-model.md state transitions).
- [X] T006 Implement hero read-out in `frontend/src/components/ui/AmountKeypad.jsx` — render `prefix` + `value` + compact `token`; zero-state shows `$0` (de-emphasized) when value is `''`/`'0'`/`'0.00'`; ensure large values stay legible (clamp/scale).
- [X] T007 Implement the on-screen pad in `frontend/src/components/ui/AmountKeypad.jsx` — 3-column grid of `<button type="button">` keys (1-9, then decimal / 0 / backspace) wired to the edit logic.
- [X] T008 Implement hardware-keyboard input and `disabled` in `frontend/src/components/ui/AmountKeypad.jsx` — while focused, `0-9`/`.`/`Backspace` apply the same edits (pad stays visible); `disabled` blocks pad + key handling.
- [X] T009 Implement accessibility in `frontend/src/components/ui/AmountKeypad.jsx` — `aria-live="polite"` (or `role="status"`) amount read-out announcing `prefix+value+token`; `aria-label` on decimal (`"Decimal point"`) and backspace (`"Delete"`) keys; group `aria-label` from `ariaLabel`; honor `prefers-reduced-motion`.
- [X] T010 Style `frontend/src/components/ui/AmountKeypad.css` using `theme.css` tokens (`--bg-primary`/`--bg-secondary`, `--text-primary`/`--text-muted`, `--brand-primary`(+rgb), `--border-color`, `--danger-color`, `--radius-md`/`--radius-lg`/`--radius-full`, `--transition-fast`) — hero typography, pad grid, key press/focus states, zero-state emphasis; match `.fm-stake-input-wrapper` / `.fm-odds-presets` look; no new tokens (FR-014).
- [X] T011 Make T004 pass — run `npm run test:frontend -- AmountKeypad`, fix until green; confirm hero value always equals the string passed to `onChange` (SC-004).

**Checkpoint**: `AmountKeypad` is complete, unit-tested, and exported — surfaces can now adopt it.

---

## Phase 3: User Story 1 — Amount-first hero + number pad on the reference surface (Priority: P1) 🎯 MVP

**Goal**: On the Open Challenge sheet, the stake amount is the visual hero and is entered via the on-screen pad on all viewports (no native keyboard needed).

**Independent Test**: Open the Open Challenge sheet; the amount is the largest element; tap pad keys (incl. decimal + backspace) and the hero updates; resize to desktop width and the pad is still present and usable.

- [X] T012 [US1] In `frontend/src/components/fairwins/OpenChallengeModal.jsx` (`MakerPanel`), replace the `fm-stake-input-wrapper` block (lines ~208–226) with `<AmountKeypad value={stake} onChange={setStake} prefix="$" token="USDC" disabled={busy} />`; preserve the existing `onBlur` `toFixed(2)` normalization behavior (apply on submit/blur equivalent).
- [X] T013 [US1] Reflow `MakerPanel`'s form in `frontend/src/components/fairwins/OpenChallengeModal.jsx` so the amount hero renders at the top of the sheet, above the description and details.
- [X] T014 [P] [US1] Add shared payments-layout helper classes (hero region wrapper, details region) in `frontend/src/components/fairwins/FriendMarketsModal.css` (and any Open-Challenge-specific bits in `frontend/src/components/fairwins/OpenChallengeModal.css`) using existing tokens.
- [X] T015 [US1] Add/extend `frontend/src/components/fairwins/__tests__/OpenChallengeModal.keypad.test.jsx` — assert `AmountKeypad` renders on the Open Challenge sheet and that entering via the pad then submitting passes the hero value as `stake` to the mocked `createOpenChallenge`. Also assert the zero-state keeps the primary action disabled (FR-016) and that the membership gate + claim-code result path (`ClaimCodeResultPanel`) are unchanged (FR-012).

**Checkpoint**: A user can enter a stake on Open Challenge using only the pad, amount is the hero (SC-001, SC-002 for this surface).

---

## Phase 4: User Story 2 — Description as memo on the reference surface (Priority: P1)

**Goal**: The wager description is demoted to a secondary memo field beneath the hero on the Open Challenge sheet.

**Independent Test**: Open Challenge shows the description below the amount with clearly lower visual weight; empty description still blocks submit; typed text reaches the create action unchanged.

- [X] T016 [US2] In `frontend/src/components/fairwins/OpenChallengeModal.jsx`, move the `oc-desc` description input directly beneath the hero and mark it up as a secondary memo field (placeholder/label styled as a note, reduced prominence).
- [X] T017 [P] [US2] Add memo-style CSS (lower visual weight, memo affordance, matches theme) in `frontend/src/components/fairwins/OpenChallengeModal.css`.
- [X] T018 [US2] Extend `frontend/src/components/fairwins/__tests__/OpenChallengeModal.keypad.test.jsx` — empty memo keeps submit disabled; a typed memo is passed (trimmed) to `createOpenChallenge`.

**Checkpoint**: Open Challenge has hero amount + memo description (US1 + US2 both hold on the reference surface).

---

## Phase 5: User Story 3 — Retain resolution / arbitrator / deadline parity (Priority: P2)

**Goal**: All pre-existing Open Challenge controls remain, repositioned into a compact details region below hero/memo, with unchanged values and validation.

**Independent Test**: On the redesigned Open Challenge sheet, exercise resolution `PillSelect`, the third-party `ArbitratorField` (address book + QR), and the accept/resolve `DeadlineTimeline` — each collects and submits the same values with the same gating as before.

- [X] T019 [US3] In `frontend/src/components/fairwins/OpenChallengeModal.jsx`, move the resolution `PillSelect`, conditional `ArbitratorField`, and `DeadlineTimeline` into the details region below hero/memo without changing their props, values, or the `canCreate` gating.
- [X] T020 [US3] Extend the Open Challenge test to verify the third-party arbitrator path still validates/submits and deadline values are collected unchanged (no capability regression, SC-003 for this surface).

**Checkpoint**: The Open Challenge reference surface is fully redesigned, parity-complete, and shippable.

---

## Phase 6: User Story 4 — Consistent payments layout across the remaining three surfaces (Priority: P2)

**Goal**: Apply the same hero + pad + memo + details layout to Oracle Open Challenge, 1v1 create-a-wager, and Group Wager Pool, so all four surfaces are consistent.

**Independent Test**: Open each of the three remaining surfaces; each shows the shared hero + pad + (memo/context) layout and behaves consistently; every pre-existing control still works and submits the same values.

- [X] T021 [P] [US4] Adopt `AmountKeypad` in `frontend/src/components/fairwins/OracleOpenChallengeModal.jsx` (`OracleMakerPanel`) — hero = `stake` (`prefix="$"`, `token="USDC"`); place the selected-market card + YES/NO side picker as the primary context under the hero (auto-composed description stays); derived read-only timeline in the details region. Replace the `fm-stake` block (lines ~307–323).
- [X] T022 [P] [US4] Oracle layout CSS adjustments in `frontend/src/components/fairwins/OracleOpenChallengeModal.css` for the hero/context/details ordering.
- [X] T023 [US4] Adopt `AmountKeypad` in `frontend/src/components/fairwins/FriendMarketsModal.jsx` (1v1) — hero = `stakeAmount` with **token-driven prefix** (`$` for STABLE/CUSTOM, symbol/none otherwise); keep the multi-token `<select>` adjacent to the hero and the custom-token address field + `min 0.1 / max 1000` validation in `validateForm` unchanged; demote `description` to a memo (this also satisfies US2 for the 1v1 surface, FR-009). Replace the `fm-stake` block (lines ~1481–1530).
- [X] T024 [P] [US4] 1v1 hero/memo/details layout CSS in `frontend/src/components/fairwins/FriendMarketsModal.css` (accommodate the adjacent token `<select>`).
- [X] T025 [P] [US4] Adopt `AmountKeypad` in `frontend/src/components/fairwins/GroupPoolModal.jsx` (`CreatePanel`) — hero = `buyIn` (`prefix="$"`, `token="USDC"`, label "Buy-in — each member"); details region keeps max-members input, approval-threshold `PillSelect`, and join/resolve `DeadlineTimeline`; do NOT invent a memo field (pools have none). Replace the `fm-stake` block (lines ~245–271).
- [X] T026 [US4] Add per-surface wiring tests under `frontend/src/components/fairwins/__tests__/` — for Oracle, 1v1 (incl. token-driven prefix), and Pool: `AmountKeypad` renders and the submitted amount equals the hero value via the mocked submit hook (`createOpenChallenge` / `createFriendMarket` / `createPool`). Each also asserts the surface's existing gating and success/claim-code (or pool share) outcome is unchanged (FR-012).

**Checkpoint**: All four surfaces present the consistent payments-style layout (SC-006) with no capability loss (SC-003).

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Verify accessibility, responsiveness, and end-to-end validation across all four surfaces.

- [ ] T027 [P] Run the a11y audit (axe/Lighthouse) on all four create sheets and fix any new violations introduced by the keypad/hero/memo (SC-005, Constitution V).
- [ ] T028 [P] Verify responsive behavior at the 320px viewport and `prefers-reduced-motion` on all four sheets (hero legible, pad usable, no horizontal overflow).
- [ ] T029 Run `specs/052-payments-style-wager-create/quickstart.md` Scenarios A–F against all four surfaces and record results. Include an **SC-007 tap-count parity check**: for an equivalent wager, count taps/steps to create in the redesigned flow vs. the pre-redesign flow per surface and confirm the redesign adds no extra steps.
- [ ] T030 [P] Run `npm run test:frontend` and the lint/build gates; ensure green with no new warnings accumulated.
- [ ] T031 Update any docs/screenshots referencing the old form-first create sheets, if present under `docs/`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS all user stories** (every surface uses `AmountKeypad`).
- **US1 (Phase 3)**: Depends on Foundational. The MVP surface (Open Challenge).
- **US2 (Phase 4)**: Depends on US1 (same file/layout reflow on Open Challenge).
- **US3 (Phase 5)**: Depends on US1 (repositions controls in the same reflowed sheet); independent of US2 in principle but shares the file.
- **US4 (Phase 6)**: Depends on Foundational; strongly benefits from the US1–US3 reference pattern being settled first. The three surfaces are independent of each other.
- **Polish (Phase 7)**: Depends on all desired surfaces being complete.

### Within Each User Story

- Foundational: write tests (T004) first → implement → make green (T011).
- Reference surface (US1–US3): all touch `OpenChallengeModal.jsx`, so run mostly sequentially; CSS tasks (T014, T017) are `[P]` against different concerns.

### Parallel Opportunities

- **Setup**: T001, T002 in parallel (different files); T003 after T001.
- **Foundational**: T004 (tests) can be authored in parallel with early skeleton, but T005–T010 edit the same `AmountKeypad.jsx`/`.css` and run sequentially.
- **US4**: T021/T022 (Oracle), T023/T024 (1v1), and T025 (Pool) touch different files → the three surfaces can be built in parallel by different developers; T026 after they land.
- **Polish**: T027, T028, T030 in parallel.

---

## Parallel Example: User Story 4 (three independent surfaces)

```bash
# Different files — can run concurrently:
Task: "T021 Adopt AmountKeypad in OracleOpenChallengeModal.jsx"
Task: "T023 Adopt AmountKeypad in FriendMarketsModal.jsx (multi-token)"
Task: "T025 Adopt AmountKeypad in GroupPoolModal.jsx"
```

---

## Implementation Strategy

### MVP First

1. Phase 1 (Setup) → Phase 2 (Foundational: `AmountKeypad` + tests).
2. Phase 3 (US1) → **STOP and VALIDATE**: enter a stake on Open Challenge via the pad; amount is the hero.
3. For a *shippable* Open Challenge, also complete US2 (memo) + US3 (parity) — the reference surface is then production-ready.

### Incremental Delivery

1. Foundational → US1 → US2 → US3: Open Challenge fully redesigned (demo-able).
2. US4: roll out to Oracle, 1v1, Pool — one surface at a time, each independently testable.
3. Polish: a11y + responsive + quickstart validation across all four.

### Parallel Team Strategy

1. One developer builds Foundational (`AmountKeypad` + tests).
2. Once green: a lead lands the US1–US3 reference pattern on Open Challenge; then three developers take Oracle / 1v1 / Pool in parallel (US4).

---

## Notes

- `[P]` = different files, no dependency on an incomplete task.
- The `[Story]` label maps each task to a spec user story for traceability.
- Surface #3 (1v1) is the only multi-token surface — token selection, prefix logic, and `min 0.1/max 1000` stay in the sheet; `AmountKeypad` only receives a display `prefix`/`token` (research D4).
- No contract/escrow/oracle/crypto changes (FR-013) — do not touch submit hooks, ABIs, or `config/contracts`.
- Commit after each task or logical group; keep CI green (fail-loudly).
