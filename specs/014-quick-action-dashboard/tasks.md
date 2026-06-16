---

description: "Task list for Quick Action Dashboard Redesign"
---

# Tasks: Quick Action Dashboard Redesign

**Input**: Design documents from `specs/014-quick-action-dashboard/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/quick-action-ui-contract.md, quickstart.md

**Tests**: Included. Per Constitution Principle II (Test-First & Coverage), the
existing Vitest + Cypress specs are the regression contract for this
presentation-only change and are kept green / extended.

**Organization**: Grouped by user story (US1–US4 from spec.md). Because the whole
feature lives in two shared files — `frontend/src/components/fairwins/Dashboard.jsx`
and `frontend/src/components/fairwins/Dashboard.css` — most tasks touch the same
files and are therefore sequential; `[P]` is used only where files are genuinely
independent.

> **Status note**: This work was delivered in PR #683 on branch
> `claude/quick-action-dashboard-design-2b6o7m`. The list below is the executable
> record and verification checklist for that change.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US4 maps to the spec's user stories

## Path Conventions

- Web app, frontend module only:
  - Component/style: `frontend/src/components/fairwins/`
  - Unit tests: `frontend/src/test/`
  - E2E: `frontend/cypress/e2e/fast/`
  - Spec docs: `specs/014-quick-action-dashboard/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Ensure the frontend toolchain is ready to build/test the change.

- [X] T001 Verify frontend deps are installed (`cd frontend && npm install`) and the baseline suite runs (`npx vitest run`) green before changes.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared scaffolding every story builds on — the per-tile card
component and the grouped grid container. MUST exist before any story-specific
tile/styling work.

**⚠️ CRITICAL**: Both files below are shared by all four user stories.

- [X] T002 Add a reusable `QuickActionCard` component in `frontend/src/components/fairwins/Dashboard.jsx` that renders a `<button className="quick-action-card qa-{category}">` with `aria-label` (defaults to title), accent rail, icon chip, content (tag/title/description), trailing arrow, and an optional `Badge`; drives per-tile color from inline `--qa-accent` / `--qa-accent-rgb` (data-model: QuickAction). Contract C2, B1, B5.
- [X] T003 Restructure `QuickActions` in `frontend/src/components/fairwins/Dashboard.jsx` to render a single `.quick-actions-grid` containing two full-width group-header rows interleaved with the tiles (research R1). Contract C1, C3.
- [X] T004 Replace the quick-action styles in `frontend/src/components/fairwins/Dashboard.css` with the grid + group-header + tile base styles consuming `--qa-accent`/`--qa-accent-rgb` for rail, icon chip, hover glow, focus ring (research R2). Contract C1, B3.

**Checkpoint**: Card + grid scaffolding compiles and renders six tiles.

---

## Phase 3: User Story 1 - Understand the dashboard at a glance (Priority: P1) 🎯 MVP

**Goal**: Six tiles read as two labeled, intent-based groups with distinct
per-action identity.

**Independent Test**: Render the connected dashboard; confirm "Start a wager" and
"Track & share" group labels and that each tile has a distinct accent/icon.

- [X] T005 [US1] Define the two `ActionGroup` clusters and assign each tile a `category`, `accent`, `accentRgb`, and `tag` in `frontend/src/components/fairwins/Dashboard.jsx` (data-model: ActionGroup/QuickAction). Contract C3.
- [X] T006 [US1] Render decorative `role="presentation"` group eyebrow rows ("Start a wager" / "Track & share") with sub-captions in `frontend/src/components/fairwins/Dashboard.jsx`, keeping a single page `<h1>` (research R3). Contract C4.
- [X] T007 [US1] Style group headers, per-tile accent tag, and the primary-group accent wash in `frontend/src/components/fairwins/Dashboard.css` (FR-002/FR-003). Contract C4, B4.
- [X] T008 [P] [US1] Extend `frontend/cypress/e2e/fast/13-dashboard.cy.js` `DSH-01` to assert six grouped `.quick-action-card`s in order and both `.qa-group-eyebrow` labels. Contract C2–C5.

**Checkpoint**: Grouping + identity visible and asserted; MVP of the redesign.

---

## Phase 4: User Story 2 - Start the right kind of wager quickly (Priority: P1)

**Goal**: The three creation tiles are distinguishable and open the same flows as
before, with the create group first.

**Independent Test**: Tap each create tile; confirm participant / oracle /
Make an Offer flow opens with unchanged labels and descriptions.

- [X] T009 [US2] Ensure the three creation tiles (Friends Decide, Oracle Settles, Make an Offer) carry the exact existing titles/descriptions and render in the "Start a wager" group first, so Friends Decide is the first `.quick-action-card`, in `frontend/src/components/fairwins/Dashboard.jsx` (FR-004/FR-005). Contract C5, data-model validation.
- [X] T010 [US2] Confirm each `id` still dispatches its existing flow in `handleQuickAction` (participant / oracle / all) in `frontend/src/components/fairwins/Dashboard.jsx`. Contract A1–A3.
- [X] T011 [P] [US2] Keep `frontend/src/test/Dashboard.test.jsx` green — create-flow wiring (A1–A3), exact label/description assertions, and demo/connected rendering pass unchanged.

**Checkpoint**: Creation paths behave identically; no behavior regression.

---

## Phase 5: User Story 3 - Notice and act on wagers that need attention (Priority: P2)

**Goal**: My Wagers surfaces a legible, accessible action-needed indicator.

**Independent Test**: With count 0/1/many, verify visible numeral + correct
singular/plural sr-only text, and no badge at 0.

- [X] T012 [US3] Build the `BadgeDescriptor` (count + "N wager(s) need(s) action") and attach it to the My Wagers tile only when `actionNeededCount > 0`, folding the sentence into the tile `ariaLabel`, in `frontend/src/components/fairwins/Dashboard.jsx` (data-model: BadgeDescriptor). Contract B6–B9.
- [X] T013 [US3] Pin `.quick-action-badge` to the tile's top-right corner above the arrow column in `frontend/src/components/fairwins/Dashboard.css`. Contract B6, R2.
- [X] T014 [P] [US3] Keep `frontend/src/test/actionNeededBadges.test.jsx` green — visible count, singular/plural aria text, no-badge-at-zero, and provider-absent safety. Contract B6–B9.

**Checkpoint**: Badge correct across all count states and accessible.

---

## Phase 6: User Story 4 - Reach for QR handoff with confidence (Priority: P2)

**Goal**: Scan vs Share are visually paired yet distinguishable, with Share
Account's descriptive accessible name preserved.

**Independent Test**: Inspect the QR pair in "Track & share"; confirm distinct
inbound/outbound cues and Share Account's QR accessible name.

- [X] T015 [US4] Give Scan QR Code (inbound) and Share Account (outbound) distinct accents/icons within the "Track & share" group, and keep Share Account's `ariaLabel` "Share Account — show your address as a QR code", in `frontend/src/components/fairwins/Dashboard.jsx` (FR-007/FR-010). Contract B2, B4.
- [X] T016 [US4] Confirm `scan-qr` opens the QR scanner and `share-account` opens the Address QR modal in the `quick` variant in `frontend/src/components/fairwins/Dashboard.jsx`. Contract A5, A6.
- [X] T017 [P] [US4] Keep the Share Account quick-QR assertions in `frontend/src/test/Dashboard.test.jsx` green (dialog opens, QR for connected address, no color radios, no visible address). Contract A6, B2.

**Checkpoint**: QR pair distinguishable; accessible names intact.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Responsive, motion, accessibility, and full-suite verification across
all stories.

- [X] T018 [P] Add responsive rules in `frontend/src/components/fairwins/Dashboard.css`: multi-column → 2-col (≤1024px) → single full-width column (≤560px); keep the arrow visible on touch (research R4). Contract R1, R2; SC-004.
- [X] T019 [P] Add `@media (prefers-reduced-motion: reduce)` in `frontend/src/components/fairwins/Dashboard.css` to suppress hover lift/scale and entrance motion (FR-011). Contract M1.
- [X] T020 Keep keyboard/a11y green in `frontend/cypress/e2e/fast/22-accessibility.cy.js` — every tile a focusable `<button>` with `aria-label`; first tile Enter opens the create dialog. Contract A7, B1, B3.
- [X] T021 Run lint + full frontend suite from repo root (`npm run test:frontend`) and `npx eslint` on changed files; confirm 1206/1206 pass and zero lint errors (Constitution IV/V).
- [X] T022 Execute `specs/014-quick-action-dashboard/quickstart.md` — automated suites, manual visual checks at 360px, and an axe pass on the quick-action region (Constitution V; SC-003/SC-004).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none — start immediately.
- **Foundational (Phase 2)**: depends on Setup; **blocks all user stories** (shared
  card component + grid + base CSS).
- **User Stories (Phase 3–6)**: depend on Foundational. US1 should land first (it
  establishes the grouping the others sit inside); US2/US3/US4 then layer on.
- **Polish (Phase 7)**: depends on all stories.

### User Story Dependencies

- **US1 (P1)**: after Foundational — establishes groups/identity (soft prerequisite
  for the others, since they place tiles inside the groups).
- **US2 (P1)**: after Foundational; independently testable (create flows).
- **US3 (P2)**: after Foundational; independently testable (badge states).
- **US4 (P2)**: after Foundational; independently testable (QR pair).

### Within Each User Story

- Component/data tasks (`Dashboard.jsx`) and style tasks (`Dashboard.css`) are
  sequential when coupled; test tasks (`[P]`) run alongside since they are separate
  files.

### Parallel Opportunities

- T008, T011, T014, T017 (test files) are `[P]` relative to their story's
  component/CSS work — different files.
- T018 and T019 are `[P]` (both CSS but non-overlapping rule blocks; can be split).
- The two shared source files (`Dashboard.jsx`, `Dashboard.css`) otherwise force
  sequential edits — avoid concurrent edits to the same file.

---

## Parallel Example: User Story 1

```bash
# After T005–T007 land the grouping in Dashboard.jsx/.css, run the E2E assertion:
Task: "Extend DSH-01 grouped-tiles assertion in frontend/cypress/e2e/fast/13-dashboard.cy.js"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 Setup → Phase 2 Foundational (card + grid + base CSS).
2. Phase 3 US1 — grouping + per-action identity.
3. **STOP and VALIDATE**: the dashboard now reads as two labeled, color-coded
   groups — the core of the request — and DSH-01 passes.

### Incremental Delivery

1. Foundation ready → US1 (grouping/identity, MVP) → demo.
2. US2 (create flows preserved) → US3 (badge) → US4 (QR pair) — each independently
   testable, none breaking the others.
3. Polish: responsive + reduced-motion + full-suite/a11y verification.

---

## Notes

- `[P]` = different files, no dependencies; the two shared source files are the
  main serialization constraint.
- This is presentation-only: no contract, subgraph, or backend tasks; Constitution
  Principle I does not apply (no `contracts/` changes).
- Commit after each logical group; keep the existing test contracts green at every
  checkpoint.
