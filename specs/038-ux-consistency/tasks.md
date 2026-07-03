---

description: "Task list for UX Consistency Harmonization (038)"
---

# Tasks: UX Consistency Harmonization

**Input**: Design documents from `/specs/038-ux-consistency/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ui-contracts.md, quickstart.md

**Tests**: INCLUDED — Constitution Principle II (Test-First, non-negotiable) requires Vitest coverage alongside every behavior change; the plan also calls out that `DeadlineTimeline`/`wagerTimeline` currently have no direct tests.

**Organization**: Tasks are grouped by user story (US1–US5) so each can be implemented, tested, and shipped independently. All paths are under `frontend/`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US5 (Setup/Foundational/Polish carry no story label)

## Path Conventions

Web frontend workspace: `frontend/src/`. Tests live in `frontend/src/test/` and colocated `frontend/src/components/**/__tests__/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm baseline and stage shared assets before any story work

- [ ] T001 Confirm baseline green: run `npm run test:frontend` and `cd frontend && npm run lint` from repo root; record the current pass state so regressions are attributable to this feature
- [ ] T002 [P] Capture a reference note of current behavior (encryption toggle wiring, `#fm-end-date`, two-slider `DeadlineTimeline`, amber tokens, both `<select>` who-settles, bell padding) in `specs/038-ux-consistency/quickstart.md` "Regression guardrails" as the before-state checklist

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Design tokens and shared math that multiple stories consume

**⚠️ CRITICAL**: Complete before the user-story phases that depend on them (US1 timeline math; US3 tokens). US2/US4/US5 do not depend on this phase.

- [X] T003 Add global timeline phase tokens to `frontend/src/theme.css` `:root` — `--timeline-accept: var(--brand-secondary)`, `--timeline-active: var(--brand-primary)`, `--timeline-resolve: #8C7CF0` — with light+dark values (per data-model.md TimelinePhaseToken). Do NOT yet remove the scoped `--fm-*` vars (US3 does that switch-over).
- [X] T004 [P] Add shared clamp/step/ordering helpers to `frontend/src/components/fairwins/wagerTimeline.js` (`clampToRange`, `stepValue`, `enforceOrdering`/min-separation, epoch↔`datetime-local` converters) so drag and modal share identical bounds logic (research R2, FR-004/FR-006)

**Checkpoint**: Tokens available for consumption; timeline math centralized.

---

## Phase 3: User Story 1 - Consistent date/time selection on every timeline (Priority: P1) 🎯 MVP

**Goal**: One interactive timeline control (draggable milestone dots + tap-to-edit `SetTimeModal`) replaces native pickers and range sliders across all three creation flows.

**Independent Test**: Open the 1v1 wager, Open Challenge, and Group Pool flows; confirm times can only be set by dragging a dot or tapping a time to open the set-time modal, the interaction is identical in all three, no native date field or "tap to type a date" link remains, and resulting deadlines appear in the summary.

### Tests for User Story 1 ⚠️ (write first, ensure they FAIL)

- [X] T005 [P] [US1] Unit tests for `wagerTimeline.js` helpers (clamp at min/max, step by 15m/1h, ordering/min-separation, epoch↔datetime-local round-trip) in `frontend/src/test/wagerTimeline.test.js`
- [X] T006 [P] [US1] Component tests for `SetTimeModal` (opens with value, rejects out-of-range with range message, Set fires only in-range, Escape/Cancel closes, focus trap + `role="dialog"`) in `frontend/src/test/SetTimeModal.test.jsx`
- [X] T007 [P] [US1] Component tests for reworked `DeadlineTimeline` (dot has `role="slider"` + aria values; Pointer-Events drag updates value and clamps; arrow keys step; tapping a tile opens the modal; no `datetime-local` field or "tap to type a date" link rendered) in `frontend/src/test/DeadlineTimeline.test.jsx`
- [X] T008 [P] [US1] Add axe accessibility test for `DeadlineTimeline` + `SetTimeModal` (keyboard operability, labelling) in `frontend/src/test/DeadlineTimeline.axe.test.jsx`

### Implementation for User Story 1

- [X] T009 [P] [US1] Create `frontend/src/components/fairwins/SetTimeModal.jsx` + `SetTimeModal.css` per contracts §2 (focus-trapped dialog wrapping a bounded `datetime-local`, Cancel/Set, range explanation on invalid)
- [X] T010 [US1] Rework `frontend/src/components/fairwins/DeadlineTimeline.jsx` per contracts §1: new `milestones[]` + `onChange(key, epochMs)` API; make editable dots draggable (Pointer Events, `setPointerCapture`, `touch-action:none`) with `role="slider"` + arrow-key stepping; tapping a tile/time opens `SetTimeModal`; remove the two `<input type="range">` sliders, the inline `oc-manual-entry` block, and "Tap to type a date" links; preserve accept-drags-resolve-at-constant-gap; consume `--timeline-*` tokens (depends on T004, T009)
- [X] T011 [US1] Update `frontend/src/components/fairwins/DeadlineTimeline.css` (dot hit-area sizing for touch, focus ring, drag cursor; remove slider styling) 
- [X] T012 [US1] Adopt reworked timeline in `frontend/src/components/fairwins/OpenChallengeModal.jsx` — migrate from `acceptBy/resolveBy/onAcceptChange/...` to the `milestones[]` API (labels "Open for acceptance until"/"Must be resolved by"), keep bounds from `acceptMaxHours`/`resolveMaxHours` (depends on T010)
- [X] T013 [US1] Adopt reworked timeline in `frontend/src/components/fairwins/GroupPoolModal.jsx` — `idPrefix="gp"`, labels "Joining open until"/"Must be resolved by", tile heads "Join by"/"Resolve by" (depends on T010)
- [X] T014 [US1] Convert FriendMarketsModal end-time to the shared control in `frontend/src/components/fairwins/FriendMarketsModal.jsx`: remove `#fm-end-date` (`datetime-local`); make the derived timeline's **Ends** dot draggable + tile tap-to-edit; keep "Accept by"/"Resolve by" derived/read-only; bounds from `WAGER_DEFAULTS.MIN/MAX_TRADING_PERIOD_SECONDS` (depends on T010)
- [X] T015 [US1] Update existing modal tests to the new interaction in `frontend/src/test/GroupPoolModal.test.jsx`, `frontend/src/test/FriendMarketsModal.test.jsx`, and the open-challenge tests (`frontend/src/components/fairwins/__tests__/OpenChallengeModal.norecover.test.jsx`, `frontend/src/test/claimCode/OpenChallengeModal.test.jsx`): assert no native picker/"tap to type" link, timeline present, submitted deadline values unchanged

**Checkpoint**: US1 fully functional and independently testable — every flow sets time the same way.

---

## Phase 4: User Story 2 - One control language across creation forms (Priority: P2)

**Goal**: "Who settles" is always a pill row (no dropdowns); stake amount + token share one line with the token always selectable; the encryption toggle is removed (encryption always on) with a compact informational indicator.

**Independent Test**: Across all three flows, every settles/resolves/approves selection is a pill row, every stake is a single line with an always-tappable token control, and no encryption on/off control appears anywhere.

### Tests for User Story 2 ⚠️ (write first, ensure they FAIL)

- [ ] T016 [P] [US2] Component tests for `PillSelect` (renders `role="radiogroup"`/`role="radio"`, roving tabindex, arrow-key selection, `onChange` value, disabled option shows `aria-disabled` + `disabledReason`, preserves passed option values) in `frontend/src/test/PillSelect.test.jsx`
- [ ] T017 [P] [US2] Axe test for `PillSelect` in `frontend/src/test/PillSelect.axe.test.jsx`
- [ ] T018 [P] [US2] Extend `frontend/src/test/FriendMarketsModal.test.jsx`: no encryption toggle/switch present; a non-interactive "End-to-end encrypted" indicator + disclosure is; opponent with no published key surfaces a truthful inline error and blocks submit (research R1); "Who Can Resolve?" is a pill row not a `<select>`; stake amount + token on one line; `isEncrypted` still set on submit

### Implementation for User Story 2

- [ ] T019 [P] [US2] Create `frontend/src/components/ui/PillSelect.jsx` + `PillSelect.css` per contracts §3 (radiogroup semantics, `.active`/`.locked` states relocated from `.fm-resolution-tab` styling); export from `frontend/src/components/ui/index.js`
- [ ] T020 [US2] Replace the "Who Can Resolve?" `<select id="fm-resolution-type">` in `frontend/src/components/fairwins/FriendMarketsModal.jsx` with `PillSelect`, preserving `ResolutionType` option values from `frontend/src/constants/wagerDefaults.js` (depends on T019)
- [ ] T021 [US2] Replace the "How is it resolved?" `<select id="oc-resolution">` in `frontend/src/components/fairwins/OpenChallengeModal.jsx` with `PillSelect`, preserving `OPEN_RESOLUTION_TYPES.Either`(0)/`.ThirdParty`(3) (depends on T019)
- [ ] T022 [US2] Migrate the existing className-convention pill rows to `PillSelect` for one implementation: FriendMarketsModal oracle/offer tab strip and GroupPoolModal "Who must approve the payout?" (Majority 51 / Two-thirds 67 / Everyone 100); keep option values/behavior (depends on T019)
- [ ] T023 [US2] Remove the encryption selector from `frontend/src/components/fairwins/FriendMarketsModal.jsx`: delete `enableEncryption` state/switch, always run the encrypt branch in `handleSubmit`; replace the toggle block with a compact non-interactive "End-to-end encrypted" indicator + "How encryption works" disclosure (keep `showEncryptionDetails`); add a truthful inline error on the opponent-address field when no encryption key is published and block submit (research R1, Constitution III)
- [ ] T024 [US2] Merge stake amount + token onto one line in `frontend/src/components/fairwins/FriendMarketsModal.jsx` (`fm-stake-row`): move the existing token `<select>` inline as the trailing control; CUSTOM still expands the address input below the row (contracts §4)
- [ ] T025 [P] [US2] Make the stake token control interactive in `frontend/src/components/fairwins/OpenChallengeModal.jsx` and `frontend/src/components/fairwins/GroupPoolModal.jsx`: replace the hardcoded `USDC` suffix span with an always-tappable token control that opens showing the single supported stablecoin plus a "only USDC supported on this network" note (contracts §4, research R5)
- [ ] T026 [US2] Update `frontend/src/components/fairwins/FriendMarketsModal.css` (and `GroupPoolModal`/`OpenChallenge` shared styles): `fm-stake-row` layout, slim encryption-indicator style, remove now-unused encryption-toggle CSS

**Checkpoint**: US1 + US2 both work — consistent controls with no dropdowns/toggles.

---

## Phase 5: User Story 3 - Timeline colorway matches the brand (Priority: P3)

**Goal**: Timeline segments/dots/cards use brand-palette colors; the orange/amber colorway is gone; phases stay distinguishable and AA-contrast-compliant.

**Independent Test**: Render every view with a deadline timeline in light and dark themes — no orange/amber remains, colors come from `--timeline-*` tokens, and phases remain distinguishable with passing contrast.

### Tests for User Story 3 ⚠️

- [ ] T027 [P] [US3] Add axe contrast test covering timeline nodes + stat tiles in light and dark themes in `frontend/src/test/timelineColors.axe.test.jsx` (assert no `#E8910C`/amber literal reachable; tokens resolve to brand values)

### Implementation for User Story 3

- [ ] T028 [US3] Switch `.fm-endtime` in `frontend/src/components/fairwins/FriendMarketsModal.css` to consume the global `--timeline-*` tokens (T003): delete the scoped `--fm-accept/#E8910C`, `--fm-active`, `--fm-resolve` definitions and repoint `fm-timeline-node`, `fm-stat-tile` tints, `fm-stat-dot`, and any inline gradients to the tokens (research R3)
- [ ] T029 [US3] Update any remaining inline gradient references that hardcode `var(--fm-accept)`/`var(--fm-active)` (primarily in `frontend/src/components/fairwins/FriendMarketsModal.jsx`; `DeadlineTimeline.jsx` is already tokenized by T010) to the `--timeline-*` tokens; update UI copy that names the timeline color (e.g. the "Opponent accepts before the amber mark…" helper text) to match the new palette; verify no amber remains in any timeline surface

**Checkpoint**: US1–US3 complete; timelines are on-brand everywhere.

---

## Phase 6: User Story 4 - Notification bell is always visible (Priority: P3)

**Goal**: The header bell is fully visible at every breakpoint with a comfortable tap target, never crushed by the global `button` rule.

**Independent Test**: View the header at 320/390/768/1280px widths — bell is fully visible, circular 36×36, unclipped, tappable, and the unread badge shows without breaking layout.

### Tests for User Story 4 ⚠️

- [ ] T030 [P] [US4] Extend `frontend/src/test/NotificationBell.test.jsx`: assert the rendered `.notification-bell` has `padding: 0` (no inherited global button padding), the 18px icon and unread badge render, and a large unread count caps at "99+"; add an axe check and assert the bell is keyboard-focusable with an accessible name (FR-016, Constitution V)

### Implementation for User Story 4

- [ ] T031 [US4] Fix `frontend/src/components/notifications/NotificationBell.css` per contracts §5: explicit `padding:0; border:none; min-width:36px; min-height:36px; flex-shrink:0` and its own background token so no global `button`/`@media` rule can shrink it (research R6)
- [ ] T032 [US4] Cap the unread badge display in `frontend/src/components/notifications/NotificationBell.jsx` (show "99+" for counts > 99) so large counts cannot distort the header

**Checkpoint**: US1–US4 complete.

---

## Phase 7: User Story 5 - Choose which cards appear on quick access (Priority: P3)

**Goal**: A Preferences surface in My Account lets users toggle which of the 9 quick access cards show on the dashboard; choices persist per device and survive reload.

**Independent Test**: In My Account → Preferences, toggle cards off/on; the dashboard reflects it and reflows; hiding all shows a recoverable empty state; choices persist across reload.

### Tests for User Story 5 ⚠️ (write first, ensure they FAIL)

- [ ] T033 [P] [US5] Unit tests for `quickAccessPreference.js` (empty/corrupt storage → all visible; unknown ids ignored; unset id defaults visible; `setCardVisible` persists full hidden set; `subscribe` notifies) in `frontend/src/test/quickAccessPreference.test.js`
- [ ] T034 [P] [US5] Component tests for `PreferencesPanel` (lists all 9 cards with current state, toggling writes preference) in `frontend/src/test/PreferencesPanel.test.jsx`; add an axe accessibility test and assert the visibility toggles are keyboard-operable with accessible labels (FR-016, Constitution V)
- [ ] T035 [P] [US5] Extend `frontend/src/test/Dashboard.test.jsx`: hidden cards are not rendered, remaining cards reflow, all-hidden shows the empty state linking to Preferences

### Implementation for User Story 5

- [ ] T036 [P] [US5] Create `frontend/src/utils/quickAccessPreference.js` per contracts §6 (localStorage key `fairwins_quickaccess_v1`, `getHiddenCards`/`isCardVisible`/`setCardVisible`/`subscribe`, hidden-set semantics from data-model.md), following the `qrColorPreference.js` pattern
- [ ] T037 [P] [US5] Create `frontend/src/components/account/PreferencesPanel.jsx` + `PreferencesPanel.css` listing all 9 quick access cards (ids from data-model.md) with visibility switches wired to `quickAccessPreference` (depends on T036)
- [ ] T038 [US5] Add a Preferences section entry to `frontend/src/components/account/AccountDashboard.jsx` that renders `PreferencesPanel` (depends on T037)
- [ ] T039 [US5] Filter the `QuickActionCard` list in `frontend/src/components/fairwins/Dashboard.jsx` through `quickAccessPreference` + subscribe to changes; add a recoverable empty state (message + link to Preferences) when all cards are hidden (depends on T036, FR-014)

**Checkpoint**: All five user stories independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Consistency verification and validation across the whole feature

- [ ] T040 [P] Sweep for leftover divergence: confirm zero remaining `<select>` for who-settles, zero `datetime-local` form fields / "tap to type a date" links, zero encryption toggles, zero amber timeline literals or color-naming copy across `frontend/src` (grep for `E8910C`, `fm-end-date`, `enableEncryption`, `Tap to type`, `amber`)
- [ ] T041 [P] Update `frontend/src/components/ui/index.js` and any component README/exports so `PillSelect` and `SetTimeModal` are discoverable; remove dead CSS/props left by removed controls
- [ ] T042 Run `cd frontend && npm run lint` and `npm run test:frontend`; resolve any ESLint errors and failing/updated tests (Constitution IV — no `continue-on-error`)
- [ ] T043 Run `npm run test:e2e:fast` (Cypress smoke) to confirm the three creation flows still submit unchanged resolution/stake/deadline values
- [ ] T044 Execute the manual validation scenarios in `specs/038-ux-consistency/quickstart.md` at mobile + desktop, light + dark, and check the boxes

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: after Setup; blocks US1 (needs T004 math) and US3 (needs T003 tokens)
- **US1 (Phase 3)**: after Foundational (T003, T004)
- **US2 (Phase 4)**: after Setup — independent of US1/Foundational (can run in parallel with US1)
- **US3 (Phase 5)**: after Foundational (T003) and ideally after US1's timeline rework lands (T010/T029 touch the same files) — sequence US3 after US1 to avoid conflicts in `DeadlineTimeline.jsx`/`FriendMarketsModal.css`
- **US4 (Phase 6)**: after Setup — fully independent
- **US5 (Phase 7)**: after Setup — fully independent
- **Polish (Phase 8)**: after all desired stories complete

### User Story Dependencies

- **US1 (P1)**: depends only on Foundational — MVP
- **US2 (P2)**: independent; touches FriendMarketsModal/OpenChallenge/GroupPool but different controls than US1 — coordinate merges on shared modal files
- **US3 (P3)**: color-only; shares `DeadlineTimeline.jsx` + `FriendMarketsModal.css` with US1 → do after US1
- **US4 (P3)**: isolated to `notifications/` + header — no cross-story deps
- **US5 (P3)**: isolated to `account/`, `Dashboard.jsx`, new util — no cross-story deps

### Within Each User Story

- Tests written first and failing before implementation (Constitution II)
- Shared primitives (`SetTimeModal`, `PillSelect`, `quickAccessPreference`) before their consumers
- Core component before flow adoption
- Story complete before moving to next priority

### Parallel Opportunities

- Setup: T002 [P]
- Foundational: T004 [P] (T003 independent file)
- US1 tests T005–T008 all [P]; SetTimeModal (T009) parallel to test authoring
- US2 tests T016–T018 [P]; T025 [P] (different files from T020–T024)
- US4 (Phase 6) and US5 (Phase 7) can be developed fully in parallel with US1/US2 by different developers — no shared files
- US5 tests T033–T035 [P]; util + panel (T036/T037) [P]

---

## Parallel Example: User Story 1

```bash
# Author all US1 tests together (they should FAIL first):
Task: "wagerTimeline helper tests in frontend/src/test/wagerTimeline.test.js"       # T005
Task: "SetTimeModal tests in frontend/src/test/SetTimeModal.test.jsx"               # T006
Task: "DeadlineTimeline tests in frontend/src/test/DeadlineTimeline.test.jsx"       # T007
Task: "DeadlineTimeline+SetTimeModal axe test in .../DeadlineTimeline.axe.test.jsx" # T008

# Then build the shared piece while adoption waits:
Task: "Create SetTimeModal.jsx + css"                                              # T009
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → 2. Phase 2 Foundational → 3. Phase 3 US1 → **STOP & VALIDATE** the unified time control across all three flows → demo.

### Incremental Delivery

Setup + Foundational → US1 (MVP: consistent time selection) → US2 (consistent controls) → US3 (on-brand colors) → US4 (visible bell) → US5 (card preferences). Each ships independently and adds value without breaking the previous.

### Parallel Team Strategy

After Setup: Dev A takes US1→US3 (shared timeline files), Dev B takes US2 (creation-form controls), Dev C takes US4 + US5 (isolated surfaces). Merge order on shared modal files: US1 before US3; coordinate US2 stake/control edits against US1 timeline edits.

---

## Notes

- [P] = different files, no incomplete-task dependency
- Encryption change is presentation-only for the happy path but MUST add an honest-state error when no opponent key exists (do not silently create a public wager)
- Keep submitted on-chain values (resolution type, stake, deadlines) identical — this is a UI harmonization, not a product-scope change
- Commit after each task or logical group; verify tests fail before implementing
- Stop at any checkpoint to validate a story independently
