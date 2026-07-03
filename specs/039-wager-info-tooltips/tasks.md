# Tasks: Wager View Info Tooltips (Reduce Text Density)

**Input**: Design documents from `/specs/039-wager-info-tooltips/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/infotip-component.md, quickstart.md

**Tests**: Included — the constitution (Principle II) requires tests written or updated alongside every behavior change. Component tests are written before the component; view-suite updates land in the same task group as each sweep.

**Organization**: Tasks are grouped by user story. The shared `InfoTip` component is foundational (blocks all stories). US1 = compact creation forms (MVP), US2 = remaining wager views, US3 = accessibility hardening.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1, US2, US3 (user story phases only)

## Path Conventions

Web app frontend workspace: components in `frontend/src/components/`, tests in `frontend/src/test/` and colocated `__tests__/`. All paths below are repo-relative.

---

## Phase 1: Setup

**Purpose**: Confirm a green baseline so sweep regressions are attributable.

- [ ] T001 Install workspaces (`npm install`) and record a green baseline: `npm run test:frontend` and `npm --workspace frontend run lint` pass on the branch before any change

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared `InfoTip` toggletip that every story's sweep depends on, built to the contract in `contracts/infotip-component.md` (behaviors B1–B8, research R1/R3–R5).

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T002 [P] Write behavior tests for the InfoTip contract (B1–B8: open on click/Enter/Space, re-click close, outside-mousedown close without focus steal, Escape close with focus return, single-open via `fairwins:infotip-open` CustomEvent, unmount cleanup, viewport clamp effect, tab-order/icon-only rendering; children re-evaluated per render for FR-009) in frontend/src/test/InfoTip.test.jsx — tests must fail before T004
- [ ] T003 [P] Write axe tests (trigger name/role/value closed and open, `aria-expanded`/`aria-controls` wiring, live-region announcement container) in frontend/src/test/InfoTip.axe.test.jsx — must fail before T004
- [ ] T004 Implement the InfoTip component (props `label`/`children`/`className` only; button trigger with ⓘ SVG; always-mounted `aria-live="polite"` bubble region; document listeners while open; CustomEvent coordination; `useLayoutEffect` viewport clamp per research R5) in frontend/src/components/ui/InfoTip.jsx
- [ ] T005 Create bubble/icon styles (≥24×24 px hit area, speech-bubble arrow, `max-width: min(20rem, calc(100vw - 2rem))`, light + dark theme tokens with AA contrast, focus-visible ring) in frontend/src/components/ui/InfoTip.css
- [ ] T006 Refactor ScreeningInfoButton to a thin wrapper over InfoTip keeping its public API, `ab-info-*` class hooks, and rich (heading/list/link) content; existing suite frontend/src/test/addressBook/AddressBookButton.test.jsx must stay green unmodified, in frontend/src/components/ui/ScreeningInfoButton.jsx

**Checkpoint**: `InfoTip` passes its own tests and axe suite; `ScreeningInfoButton` call sites unchanged — story sweeps can begin (in parallel if staffed).

---

## Phase 3: User Story 1 - Compact wager creation form with on-demand help (Priority: P1) 🎯 MVP

**Goal**: The open-challenge and friend-wager creation forms show only labels/controls by default; every static explainer (per the data-model.md inventory) sits behind an adjacent info icon, including the deadline-timeline milestone hints. Dynamic text stays inline.

**Independent Test**: Open both creation views on a phone-sized viewport — no explainer paragraphs visible; each formerly-explained field has an ⓘ icon revealing the exact text; validation alerts, progress lines, computed deadline summary, brute-force warning, and encryption honesty text remain inline; create flow unchanged (quickstart.md steps 1–3).

### Tests for User Story 1

- [ ] T007 [P] [US1] Update DeadlineTimeline suites for the hint-to-icon change: assert milestone `hint` text is not rendered inline, appears in the milestone tile head as an InfoTip revealed on activation, and the computed duration line stays inline; extend the axe scan to the open-bubble state, in frontend/src/test/DeadlineTimeline.test.jsx and frontend/src/test/DeadlineTimeline.axe.test.jsx
- [ ] T008 [P] [US1] Update open-challenge suites: replace visible-explainer assertions with hidden-by-default + revealed-via-icon assertions for the 6 MOVE items (intro, phrase, USDC, self-resolution, key-backup, arbitrator per data-model.md); assert the brute-force warning, `role="alert"` deadline warning, and `role="status"` progress stay inline, in frontend/src/test/claimCode/OpenChallengeModal.test.jsx, frontend/src/test/claimCode/OpenChallengeCodeBackup.test.jsx, frontend/src/test/claimCode/publicModeState.test.jsx, and frontend/src/components/fairwins/__tests__/OpenChallengeModal.norecover.test.jsx
- [ ] T009 [P] [US1] Update friend-wager suite the same way for its 8 MOVE items and 4 STAY items (per data-model.md), including state-dependent bubbles (stake-token guidance, `RESOLUTION_TYPE_HINTS`) showing current-state text when opened (FR-009), in frontend/src/test/FriendMarketsModal.test.jsx

### Implementation for User Story 1

- [ ] T010 [US1] Change milestone hint rendering: drop the inline `.dt-hint` span loop and render each milestone's `hint` as an `InfoTip` (label `About: <tileHead>`) inside that milestone's tile head; `milestones[].hint` prop shape unchanged for hosts, in frontend/src/components/fairwins/DeadlineTimeline.jsx
- [ ] T011 [P] [US1] Sweep OpenChallengeModal: replace the 6 static MOVE explainers with `InfoTip`s beside their labels (intro icon beside "What's the wager?" label row); keep STAY items inline exactly as-is, in frontend/src/components/fairwins/OpenChallengeModal.jsx
- [ ] T012 [P] [US1] Sweep FriendMarketsModal: replace its 8 static MOVE explainers with `InfoTip`s (state-dependent ones pass the existing conditional string as children); keep `lockedReason`, opponent-side confirmation, odds summary, and encryption honesty text inline, in frontend/src/components/fairwins/FriendMarketsModal.jsx
- [ ] T013 [US1] Adjust `fm-*` layout styles so labels + icons sit on one line and removed hints don't leave stray margins (`.fm-form-group`, `.dt-hint` removal), keeping `.fm-hint` styles for the remaining dynamic text, in frontend/src/components/fairwins/FriendMarketsModal.css and frontend/src/components/fairwins/DeadlineTimeline.css

**Checkpoint**: Both creation forms are compact and fully functional — MVP demoable per quickstart.md steps 1–3.

---

## Phase 4: User Story 2 - Consistent treatment across all wager pop-up views (Priority: P2)

**Goal**: Every remaining wager pop-up with static explainer text uses the identical InfoTip pattern: group-pool creation, take-challenge, unified lookup, open-challenge decrypt, and the oracle condition picker.

**Independent Test**: Open each of the five views — the MOVE items from the data-model.md inventory are behind icons with identical look/behavior; dynamic status/alert text unchanged (quickstart.md step 4).

### Tests for User Story 2

- [ ] T014 [P] [US2] Update group-pool suite: 5 MOVE items (intro, share-words, USDC, join-close, resolution-detail with FR-009 state variance) hidden by default and revealed via icons; join-deadline `role="alert"` stays inline, in frontend/src/test/GroupPoolModal.test.jsx
- [ ] T015 [P] [US2] Update take/lookup/decrypt/picker suites for their MOVE items (accept-explainer + save-code; "We'll find whatever the words point to…"; decrypt intro; `KIND_HELP[kind]` with FR-009 state variance) and assert `role="status"` progress and flow prompts stay inline, in frontend/src/components/fairwins/__tests__/TakeChallengePanel.test.jsx, frontend/src/components/fairwins/__tests__/UnifiedLookupModal.test.jsx, frontend/src/test/claimCode/OpenChallengeDecryptModal.test.jsx, and frontend/src/test/OracleConditionPicker.test.jsx

### Implementation for User Story 2

- [ ] T016 [P] [US2] Sweep GroupPoolModal per its inventory rows (5 MOVE, 1 STAY), in frontend/src/components/fairwins/GroupPoolModal.jsx
- [ ] T017 [P] [US2] Sweep TakeChallengePanel (move the accept-explainer `<p>` and "Save your code…" line behind icons; keep the `oc-steps` tracker and progress/error inline), in frontend/src/components/fairwins/TakeChallengePanel.jsx
- [ ] T018 [P] [US2] Sweep UnifiedLookupModal (move the "We'll find whatever the words point to…" hint; keep disambiguation prompt and participant status inline), in frontend/src/components/fairwins/UnifiedLookupModal.jsx
- [ ] T019 [P] [US2] Sweep OpenChallengeDecryptModal (move the code-locked intro behind an icon beside the code field label), in frontend/src/components/fairwins/OpenChallengeDecryptModal.jsx
- [ ] T020 [P] [US2] Sweep OracleConditionPicker (`KIND_HELP[kind]` becomes an InfoTip beside the kind selector, current-kind text at open time), in frontend/src/components/fairwins/OracleConditionPicker.jsx

**Checkpoint**: All wager pop-up views share one pattern; SC-002's "100% behind icons, none lost" holds across the full inventory.

---

## Phase 5: User Story 3 - Accessible help for keyboard and assistive-technology users (Priority: P3)

**Goal**: The pattern is verifiably operable by keyboard and screen reader in the real views, and CI a11y gates cover the new open-bubble states.

**Independent Test**: Keyboard-only walkthrough of a creation form (tab → icon focus ring → Enter opens → Escape closes and returns focus) and green axe suites (quickstart.md step 5).

### Implementation for User Story 3

- [ ] T021 [P] [US3] Extend view-level axe coverage to swept views with a bubble open: add InfoTip open-state scans to frontend/src/test/timelineColors.axe.test.jsx or a new frontend/src/test/InfoTipViews.axe.test.jsx covering OpenChallengeModal and GroupPoolModal render trees (SC-004: zero new violations)
- [ ] T022 [P] [US3] Add view-integration keyboard tests: within OpenChallengeModal, tab order reaches each icon in DOM order with accessible names, Enter/Space/Escape behave per contract B1/B4, and no focus trap, in frontend/src/test/claimCode/OpenChallengeModal.test.jsx
- [ ] T023 [US3] Fix any contrast/focus/name findings the new axe scans surface (expected in bubble text tokens or focus ring against modal backgrounds) in frontend/src/components/ui/InfoTip.css

**Checkpoint**: All three stories complete; FR-007/SC-004 enforced in CI.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T024 [P] Sweep-completeness check: grep the seven swept components for remaining static-explainer `.fm-hint` usages and confirm every remaining occurrence is a documented STAY item (update the data-model.md inventory tables' dispositions to "done" as a review record)
- [ ] T025 [P] Remove dead CSS left by the sweep (unused `.dt-hint` rules, orphaned hint margins) in frontend/src/components/fairwins/DeadlineTimeline.css and frontend/src/components/fairwins/FriendMarketsModal.css
- [ ] T026 Run full gates locally: `npm run test:frontend` and `npm --workspace frontend run lint` green; fix any fallout
- [ ] T027 Execute the quickstart.md manual validation (mobile viewport walkthrough incl. 320 px clamp check, SC-001 height/word-count comparison, theme toggle) and record results in specs/039-wager-info-tooltips/quickstart.md under a "Validation run" note

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none.
- **Foundational (Phase 2)**: after T001. T002/T003 (tests) before T004; T005 with T004; T006 after T004. BLOCKS all stories.
- **US1 (Phase 3)**: after Phase 2. T007–T009 (test updates) precede or accompany T010–T013; T010 (DeadlineTimeline) before T011/T012 finish since both creation forms embed it; T013 last in phase.
- **US2 (Phase 4)**: after Phase 2 only — independent of US1 except GroupPoolModal's timeline hints, which need T010; if US2 runs before US1, pull T010 forward.
- **US3 (Phase 5)**: after the views it audits are swept (US1 for T021/T022; ideally US2 too for full coverage).
- **Polish (Phase 6)**: after US1–US3.

### User Story Dependencies

- **US1 (P1)**: Foundational only.
- **US2 (P2)**: Foundational (+ T010 if run before US1). Independently testable.
- **US3 (P3)**: Builds on swept views; no new surfaces.

### Parallel Opportunities

- T002 ∥ T003 (different test files).
- After Phase 2: US1 and US2 sweeps can proceed in parallel; within US1, T007/T008/T009 in parallel, then T011 ∥ T012 after T010.
- Within US2: T014 ∥ T015, then T016–T020 all parallel (five different files).
- T021 ∥ T022; T024 ∥ T025.

## Parallel Example: User Story 1

```bash
# After Phase 2 checkpoint, launch test updates together:
Task: "Update DeadlineTimeline suites (T007)"
Task: "Update open-challenge suites (T008)"
Task: "Update FriendMarketsModal suite (T009)"
# Then T010, then in parallel:
Task: "Sweep OpenChallengeModal (T011)"
Task: "Sweep FriendMarketsModal (T012)"
```

## Implementation Strategy

**MVP first**: Phases 1–3 alone deliver the motivating fix (the screenshot's open-challenge form plus the friend-wager form) — stop at the Phase 3 checkpoint, validate quickstart steps 1–3, and it's demoable. Then add US2 (consistency sweep) and US3 (a11y hardening) as independent increments; each phase ends green with no view half-swept.

## Notes

- Wording of moved explainers is copied verbatim (spec assumption) — sweeps are mechanical against the data-model.md inventory tables.
- Never move a `role="alert"`, `role="status"`, computed summary, or security warning into a bubble (FR-005, research R2) — when in doubt, STAY.
- Commit after each task or logical group; every checkpoint must leave `npm run test:frontend` green (constitution II/IV).
