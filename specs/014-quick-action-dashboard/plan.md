# Implementation Plan: Quick Action Dashboard Redesign

**Branch**: `claude/quick-action-dashboard-design-2b6o7m` | **Date**: 2026-06-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/014-quick-action-dashboard/spec.md`

## Summary

Reorganize the connected "Your Wagers" quick-action region from a flat grid of
six look-alike tiles into two visibly labeled, intent-based groups — **Start a
wager** (the three creation tiles) and **Track & share** (My Wagers plus the two
QR actions) — and give every action its own accent color and iconography. The
change is presentation-only: action labels, descriptions, the flows each tile
opens, the My Wagers action-needed badge, and all aria/keyboard semantics are
preserved. Implementation is confined to the existing `Dashboard.jsx` quick-action
component and `Dashboard.css`, driven by per-tile CSS custom properties so a
single accent source feeds the rail, icon chip, hover glow, and arrow.

## Technical Context

**Language/Version**: JavaScript (ES2022) + JSX, React 18

**Primary Dependencies**: React, Vite, React Router (existing `Dashboard` tree);
the shared `Badge` UI component for the action-needed indicator. No new
dependencies.

**Storage**: N/A (no persisted state introduced; the action-needed count comes
from the existing wager-activity watcher, the QR color preference from existing
localStorage)

**Testing**: Vitest + Testing Library (`src/test/Dashboard.test.jsx`,
`src/test/actionNeededBadges.test.jsx`); Cypress fast-tier E2E
(`13-dashboard.cy.js`, `22-accessibility.cy.js`); axe/Lighthouse a11y audits in CI

**Target Platform**: Modern evergreen browsers, mobile + desktop web (responsive
down to ~360px viewport)

**Project Type**: Web application (frontend only for this feature)

**Performance Goals**: No measurable runtime cost change; the region renders six
static buttons. Maintain 60fps on hover/entrance transitions; honor
`prefers-reduced-motion`.

**Constraints**: WCAG 2.1 AA (color is not the only differentiator; visible focus;
accessible names preserved); no horizontal scroll at 360px; ESLint clean; existing
test contracts (selectors `.quick-actions-grid`, `.quick-action-card` buttons with
`aria-label`; first tile opens the create flow) remain green.

**Scale/Scope**: One dashboard region; six action tiles in two groups; two files
changed plus spec/test updates. No contract, subgraph, or backend changes.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applies? | Assessment |
|-----------|----------|------------|
| I. Security-First Smart Contracts | No | No `contracts/` changes; no on-chain, fund-custody, oracle, or access-control surface is touched. |
| II. Test-First & Coverage | Yes | Frontend Vitest specs for the quick-action region and the action-needed badge are preserved and updated alongside the change; the full frontend suite passes (1206/1206) and the stale Cypress `DSH-01` assertion is corrected. No contract interface changes. |
| III. Honest State, No Mocks | Yes | Presentation-only; no mock/placeholder data added to production paths. The action-needed count and address-QR continue to read real watcher/wallet state; no finality is implied that the chain has not reached. |
| IV. Fail Loudly in CI | Yes | No `continue-on-error` added; lint/test/a11y gates remain enforcing. |
| V. Accessible, Consistent Frontend | Yes (primary) | Targets WCAG 2.1 AA: keyboard-focusable buttons with visible focus, preserved accessible names (incl. Share Account's QR wording and the badge's sr-only text), non-color cues (labels, tags, icons), reduced-motion support. ESLint clean. No contract addresses/ABIs/network config touched. |

**Result**: PASS — no violations, no Complexity Tracking entries required. This is
a Principle V (frontend) change with Principle II test obligations, both satisfied.

## Project Structure

### Documentation (this feature)

```text
specs/014-quick-action-dashboard/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (view-model entities)
├── quickstart.md        # Phase 1 output (validation guide)
├── contracts/
│   └── quick-action-ui-contract.md   # Phase 1 output (UI contract)
├── checklists/
│   └── requirements.md  # Spec quality checklist (from /speckit-specify)
└── tasks.md             # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
frontend/
├── src/
│   ├── components/
│   │   ├── fairwins/
│   │   │   ├── Dashboard.jsx      # QuickActions + QuickActionCard (changed)
│   │   │   └── Dashboard.css      # quick-action grid/tile styling (changed)
│   │   └── ui/
│   │       └── Badge.jsx          # reused unchanged (action-needed badge)
│   └── test/
│       ├── Dashboard.test.jsx         # action wiring, labels, share-account QR
│       └── actionNeededBadges.test.jsx # My Wagers badge text/aria
└── cypress/e2e/fast/
    ├── 13-dashboard.cy.js        # DSH-01 grouped-tiles assertion (updated)
    └── 22-accessibility.cy.js    # keyboard/aria for quick-action cards
```

**Structure Decision**: Web application, frontend module only. The feature lives
entirely under `frontend/src/components/fairwins/` (the `QuickActions` /
`QuickActionCard` components and their stylesheet), with test coverage under
`frontend/src/test/` and `frontend/cypress/e2e/fast/`. No backend, contract, or
subgraph directories participate.

## Complexity Tracking

> No constitution violations — section intentionally empty.
