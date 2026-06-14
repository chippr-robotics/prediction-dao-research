# Quickstart & Validation: Quick Action Dashboard Redesign

How to run and validate the redesigned quick-action region. References the
[UI contract](./contracts/quick-action-ui-contract.md) (C#/A#/B#/R#/M# IDs) and
[data model](./data-model.md) instead of restating them.

## Prerequisites

- Node + npm installed; from `frontend/` run `npm install` once.
- Repo root has `npm run test:frontend` and `npm run frontend` wrappers.

## 1. Automated validation (primary)

```bash
# From repo root — full frontend unit/integration suite (must be green)
npm run test:frontend

# Or target just the quick-action specs from frontend/
cd frontend
npx vitest run src/test/Dashboard.test.jsx src/test/actionNeededBadges.test.jsx
```

**Expected**: all pass. These cover C2–C5 (cards render, labels, order), A1–A6
(click → flow wiring incl. Share Account quick QR), and B6–B9 (badge text, aria,
singular/plural, provider-absent safety).

Fast E2E (grouping, keyboard, structure):

```bash
cd frontend
npx cypress run --spec \
  "cypress/e2e/fast/13-dashboard.cy.js,cypress/e2e/fast/22-accessibility.cy.js"
```

**Expected**: `DSH-01` confirms six grouped tiles + both group labels (C2–C4);
`A11Y-07` confirms every tile is a focusable `<button>` with an `aria-label` and
Enter on the first tile opens the create dialog (A7/B1/B3/C5).

## 2. Manual validation (visual / experiential)

```bash
npm run frontend   # starts the Vite dev server
```

Then connect a wallet (or run with `VITE_USE_MOCK_WAGERS=true` for demo mode) and
open the dashboard. Verify against the contract:

- **Grouping (C3/C4, SC-001)**: two labeled clusters — "Start a wager" over the
  three creation tiles, "Track & share" over My Wagers + the two QR tiles. A
  first-time viewer can sort all six into create / track / QR by sight.
- **Identity (FR-003/FR-010)**: each tile has a distinct accent (rail, icon chip,
  arrow) and a small role tag; Scan vs Share are distinguishable (B4).
- **Primary emphasis (FR-002)**: the creation group reads as primary (accent wash).
- **Badge (B6–B8)**: with action-needed wagers, My Wagers shows the count in its
  corner without overlapping the arrow; wording matches singular/plural.
- **Keyboard (B1/B3/A7)**: Tab reaches each tile with a visible focus ring; Enter
  activates it.
- **Responsive (R1/R2, SC-004)**: narrow the window / use device emulation at
  360px — six full-label tiles stack in one column, no badge overlap, no
  horizontal scroll.
- **Motion (M1)**: with OS "reduce motion" on, hover lift/scale is suppressed.

## 3. Accessibility audit

The CI axe/Lighthouse a11y checks (Constitution V) must pass. Locally, run an axe
browser extension on the connected dashboard and confirm no new violations in the
quick-action region (focus order, names/roles, contrast of label/description text).

## Done / acceptance

- Section 1 automated suites green (mirrors CI Frontend Unit Tests + Cypress Fast).
- Manual checks above match the contract.
- No regression to surrounding dashboard regions (header, CTA banner, Polymarket
  feed, How-It-Works) — FR-012.
