---

description: "Task list for My Wagers — Card Grid Redesign"
---

# Tasks: My Wagers — Card Grid Redesign

**Input**: Design documents from `specs/017-wager-grid-redesign/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: INCLUDED — Constitution Principle II (Test-First) is non-negotiable for
the frontend, and the plan commits to migrating the 40 existing `MyMarketsModal`
tests plus adding `WagerCard` unit tests.

**Organization**: Tasks are grouped by user story (US1–US4 from spec.md) so each
story is an independently testable increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 / US2 / US3 / US4 (setup, foundational, polish carry no label)

## Path Conventions

Web frontend (single `frontend/` app). Components under
`frontend/src/components/fairwins/`, tests under `frontend/src/test/`, Cypress
under `frontend/cypress/e2e/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Small shared scaffolding the grid components will use.

- [x] T001 [P] Add `MyWagersDensity` enum (`COMPACT`/`COMFORTABLE`) and the `fairwins.myWagers.density` sessionStorage key constant in `frontend/src/constants/wagerDefaults.js`
- [x] T002 [P] Create empty card stylesheet `frontend/src/components/fairwins/WagerCard.css` (file + header comment) for use by the new components

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Stand up the card components as a drop-in for `MarketsTable` so every
user story can build on a rendering grid. No visual polish yet.

**⚠️ CRITICAL**: No user story work begins until this phase is complete.

- [x] T003 Extract the pure, table-agnostic helpers `getMarketDisplayTitle`, `getRowOutcome`, and `isWinnerUnpaid` from `frontend/src/components/fairwins/MyMarketsModal.jsx` into a new `frontend/src/components/fairwins/wagerCardHelpers.js` and re-import them in `MyMarketsModal.jsx` (no behavior change)
- [x] T004 [P] Create `frontend/src/components/fairwins/WagerCardGrid.jsx` scaffold accepting the full `MarketsTable` prop contract plus `density` (see `contracts/wager-card-grid.contract.md`); render one placeholder `WagerCard` per `markets[i]`
- [x] T005 [P] Create `frontend/src/components/fairwins/WagerCard.jsx` scaffold rendering only the collapsed header shell (props per contract; imports helpers from T003)
- [x] T006 Add base responsive grid + card-shell CSS (flex-wrap grid container, 16px rounded card, single-column at phone width) in `frontend/src/components/fairwins/WagerCard.css`
- [x] T007 Replace `<MarketsTable .../>` with `<WagerCardGrid .../>` at all four call sites (Participating, Created, Arbitrating, History) in `frontend/src/components/fairwins/MyMarketsModal.jsx`, passing the new `density` prop; keep `MarketsTable` in the file temporarily

**Checkpoint**: My Wagers renders cards (collapsed) from live data in every tab.

---

## Phase 3: User Story 1 - Browse my wagers as scannable cards (Priority: P1) 🎯 MVP

**Goal**: Wagers render as a responsive grid of cards showing stake + real token
symbol, title, colored status pill, and (History) outcome; empty states per tab.

**Independent Test**: With wagers in each tab, cards show stake/title/status;
viewport resize reflows columns; an empty tab shows its empty state.

### Tests for User Story 1

- [x] T008 [P] [US1] Add collapsed-card unit tests (stake prominent, real token symbol, title truncation, status pill text+class, History outcome color) in `frontend/src/test/WagerCard.test.jsx`
- [x] T009 [P] [US1] Update the "With Markets Data" and "Empty States" assertions in `frontend/src/test/MyMarketsModal.test.jsx` from table rows/cells to card DOM

### Implementation for User Story 1

- [x] T010 [US1] Render collapsed card content in `frontend/src/components/fairwins/WagerCard.jsx`: prominent stake + `market.stakeTokenSymbol`, title via `getMarketDisplayTitle`, status pill via `getStatusLabel`/`getStatusClass`, History outcome via `getRowOutcome`
- [x] T011 [US1] Implement responsive multi→single column reflow and the comfortable-density preview meta-line (avatar dot + opponent + time) in `frontend/src/components/fairwins/WagerCard.css` and `WagerCard.jsx`
- [x] T012 [US1] Ensure each tab's empty state renders correctly with the grid in `frontend/src/components/fairwins/MyMarketsModal.jsx` (preserve existing per-tab empty copy)

**Checkpoint**: US1 fully functional — cards browseable and responsive; MVP demoable.

---

## Phase 4: User Story 2 - Expand a card to see details and decrypt (Priority: P1)

**Goal**: Click-to-expand accordion (single open) revealing terms + 2-col metadata;
inline decrypt for encrypted wagers; "View details" opens the retained full view.

**Independent Test**: Expand a card → terms/metadata + rotated chevron; opening
another collapses the first; encrypted card shows decrypt → reveals in place;
"View details" opens `MarketDetailView`.

### Tests for User Story 2

- [x] T013 [P] [US2] Add expand/collapse, single-open invariant, decrypt state-machine (locked→decrypting→revealed→unavailable), and "View details"→`onSelect` tests in `frontend/src/test/WagerCard.test.jsx`
- [x] T014 [P] [US2] Migrate the "FR-010 graceful degradation (terms unavailable)" tests in `frontend/src/test/MyMarketsModal.test.jsx` to the expanded-card DOM

### Implementation for User Story 2

- [x] T015 [US2] Add single-open `openId` accordion state in `frontend/src/components/fairwins/WagerCardGrid.jsx` (expanding one collapses others; reset when `markets`/tab changes)
- [x] T016 [US2] Build the expanded region in `frontend/src/components/fairwins/WagerCard.jsx`: terms box + 2-column metadata grid (opponent/outcome, ends/settled, wager ID, creator), chevron rotation, `aria-expanded`/`aria-controls`
- [x] T017 [US2] Wire locked/decrypting/revealed/unavailable states to `onDecrypt(id)`/`isDecrypting`/`market.decryptedMetadata` in `WagerCard.jsx`, preserving the terms-unavailable + retry behavior (FR-010)
- [x] T018 [US2] Add the "View details" control in `WagerCard.jsx` calling `onSelect(market)` (opens the existing `MarketDetailView`)

**Checkpoint**: US1 + US2 work — cards inspectable inline with detail view retained.

---

## Phase 5: User Story 3 - Take the right action from a card (Priority: P1)

**Goal**: Expanded cards surface only valid actions per status/role, run the
existing on-chain flows, show busy/error state, and confirm via toast.

**Independent Test**: For each state/role, the expected actions appear (and no
invalid ones), invoke the existing flow, and the list/state updates with a toast.

### Tests for User Story 3

- [x] T019 [P] [US3] Add action-visibility-by-state tests (accept/decline, resolve, claim, refund, respond-to-draw, reclaim & clear), busy/disabled via `claimingId`/`refundingId`, and per-card error rendering in `frontend/src/test/WagerCard.test.jsx`
- [x] T020 [P] [US3] Add a confirmation-toast test (toast appears on successful action) in `frontend/src/test/MyMarketsModal.test.jsx`

### Implementation for User Story 3

- [x] T021 [US3] Compute available actions in `frontend/src/components/fairwins/WagerCard.jsx` from the existing predicates (`canResolve`, `canAccept`, `isCreatorOfPending`, `isWinnerUnpaid`) and the activity-watcher kinds (`accept/resolve/claim/refund/respondDraw`); render buttons with primary/danger/success/ghost variants
- [x] T022 [US3] Wire each action's `onClick` to the existing callbacks (`onAccept`/`onResolve`/`onClaim`/`onRefund`/`onClearExpired`) in `WagerCard.jsx`, including opening the resolution and acceptance modals (no change to on-chain semantics)
- [x] T023 [US3] Implement busy/disabled state (`claimingId`/`refundingId`) and per-card error (`claimError`/`refundError`) in `WagerCard.jsx`
- [x] T024 [US3] Add a confirmation toast on successful action in `frontend/src/components/fairwins/MyMarketsModal.jsx` (+ styles in `MyMarketsModal.css`)
- [x] T025 [US3] Preserve the clear-all-expired affordance under the Expired filter in `frontend/src/components/fairwins/WagerCardGrid.jsx` (`statusFilter === EXPIRED && onClearAllExpired`)

**Checkpoint**: US1–US3 work — full action set reachable from cards (zero dropped).

---

## Phase 6: User Story 4 - Navigate tabs, filter, sort, and adjust density (Priority: P2)

**Goal**: Pill-style tabs with count badges, working status filter/sort/refresh on
the grid, a compact/comfortable density toggle, and a pinned header.

**Independent Test**: Switching tabs updates grid + counts and resets open card;
filter/sort change visible cards; density toggle changes spacing without losing
tab/filter/sort/open state; header stays pinned on scroll.

### Tests for User Story 4

- [x] T026 [P] [US4] Add pill-tab count-badge and density-toggle behavior tests (toggle preserves tab/filter/sort) in `frontend/src/test/MyMarketsModal.test.jsx`
- [x] T027 [P] [US4] Update the "Tab Navigation" tests in `frontend/src/test/MyMarketsModal.test.jsx` for the pill markup and Arbitrating-only-when-present rule

### Implementation for User Story 4

- [x] T028 [US4] Restyle tabs as pills with count badges (Arbitrating shown only when its count > 0) in `frontend/src/components/fairwins/MyMarketsModal.jsx` + `MyMarketsModal.css`
- [x] T029 [US4] Add the density toggle to the toolbar; hold `density` state in `MyMarketsModal.jsx` (default compact, mirrored to `sessionStorage`) and pass to every `WagerCardGrid`
- [x] T030 [US4] Confirm status filter, sort, and refresh operate on the card grid and the header (title, network pill, tabs, toolbar) stays sticky on scroll in `MyMarketsModal.jsx`/`MyMarketsModal.css`

**Checkpoint**: All four stories independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Remove dead code, finish test/selector migration, and validate.

- [x] T031 Remove the now-unused `MarketsTable` component (and any dead helpers) from `frontend/src/components/fairwins/MyMarketsModal.jsx`; reuse `ResolveButtonWithCountdown` inside cards where the resolve countdown is shown
- [x] T032 [P] Sweep any remaining table-oriented assertions (`role="table"`, column headers, row cells) in `frontend/src/test/MyMarketsModal.test.jsx`
- [x] T033 [P] Update My Wagers Cypress selectors for the card DOM in `frontend/cypress/e2e/full/05-wager-acceptance.cy.js`, `06-decline-cancel.cy.js`, `07-manual-resolution.cy.js`, `10-claim-payouts.cy.js` (and `fast/13-dashboard.cy.js`, `fast/22-accessibility.cy.js` as needed)
- [x] T034 Accessibility pass (keyboard operate tabs/expand/actions, `aria-expanded`/labels, color-contrast/status-not-by-color-alone) in `WagerCard.jsx`/`WagerCardGrid.jsx`/CSS; ensure axe/Lighthouse CI is clean
- [x] T035 [P] Run `cd frontend && npm run lint` and `npm run test:frontend`; fix any failures
- [x] T036 Execute the `specs/017-wager-grid-redesign/quickstart.md` manual validation scenarios and confirm the diff contains no `contracts/`, ABI, or subgraph changes

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately.
- **Foundational (Phase 2)**: depends on Setup — **BLOCKS all user stories**.
- **User Stories (Phase 3–6)**: all depend on Foundational. US1 is the MVP. US2
  and US3 build on the same `WagerCard` file (largely sequential); US4 touches the
  modal header/toolbar and can proceed in parallel with US2/US3.
- **Polish (Phase 7)**: depends on the user stories being complete (T031 requires
  all four call sites migrated and all card behavior in place).

### User Story Dependencies

- **US1 (P1)**: after Foundational. No dependency on other stories.
- **US2 (P1)**: after US1 (extends the same `WagerCard`; expanded region needs the
  collapsed card).
- **US3 (P1)**: after US2 (actions live inside the expanded region).
- **US4 (P2)**: after Foundational; independent of US2/US3 (header/toolbar +
  density prop already threaded in Phase 2).

### Within Each User Story

- Write the listed tests first and confirm they fail before implementing.
- Component state/markup before wiring callbacks; story complete before the next.

### Parallel Opportunities

- Setup: T001, T002 in parallel.
- Foundational: T004 and T005 in parallel (after T003 lands the shared helpers).
- Each story's test tasks ([P]) run together; e.g. T008+T009, T013+T014,
  T019+T020, T026+T027.
- US4 (header/toolbar) can be developed alongside US2/US3 (card body) by a second
  contributor.
- Polish: T032, T033, T035 in parallel.

---

## Parallel Example: User Story 1

```bash
# Tests together:
Task: "Collapsed-card unit tests in frontend/src/test/WagerCard.test.jsx"        # T008
Task: "Migrate With-Markets/Empty-State assertions in MyMarketsModal.test.jsx"   # T009
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → 2. Phase 2 Foundational (critical) → 3. Phase 3 US1 →
4. **STOP & VALIDATE**: cards render and reflow with real data → demo.

### Incremental Delivery

Foundation → US1 (MVP: browseable cards) → US2 (inline detail + decrypt) →
US3 (actions + toast) → US4 (pill tabs + density + sticky) → Polish (remove table,
finish test/selector migration, a11y, validate). Each story adds value without
breaking the previous.

---

## Notes

- [P] = different files, no incomplete-task dependency.
- This is a frontend presentation change: **no** `contracts/`, ABI, or subgraph
  edits; the `useMyWagers`/`WagerRepository` data layer and all on-chain action
  handlers are reused unchanged.
- Honest state: cards show real token symbols/values and stay network-scoped; the
  mockup's "USDC"/mock data is reference-only.
- Commit after each task or logical group; keep CI (lint/test/a11y) green.
