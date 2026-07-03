# Implementation Plan: Wager View Info Tooltips (Reduce Text Density)

**Branch**: `claude/wager-views-text-density-g17f4p` | **Date**: 2026-07-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/039-wager-info-tooltips/spec.md`

## Summary

Replace the static explainer paragraphs that crowd the wager pop-up views
(open-challenge creation, friend-wager creation, group-pool creation,
take/accept flows, lookup/decrypt modals, and the shared deadline timeline)
with a small info (ⓘ) icon next to the label each paragraph explains. Tapping
or clicking the icon reveals the full text in a speech-bubble popover; at most
one bubble is open at a time, dismissed by re-tap, outside tap, or Escape.
The implementation generalizes the existing `ScreeningInfoButton` pattern
(spec 021) into one shared `InfoTip` component in `frontend/src/components/ui/`,
then sweeps the wager views replacing *static* `.fm-hint` blocks with it.
Dynamic text — validation errors (`role="alert"`), transaction progress
(`role="status"`), computed summaries, and security warnings — stays inline.
Frontend-only; no contract, subgraph, or on-chain changes.

## Technical Context

**Language/Version**: JavaScript (ESM), React 19.2, Vite 7.2 (existing `frontend/` app)

**Primary Dependencies**: React 19, plain CSS following the shared `fm-*` convention and design tokens in `frontend/src/theme.css`; no new runtime dependencies (the popover is hand-rolled like `ScreeningInfoButton`, not a library)

**Storage**: None — bubbles are stateless and on-demand (spec assumption: no "don't show again" persistence)

**Testing**: Vitest 4 + @testing-library/react + vitest-axe (unit/integration/a11y) in `frontend/src/test/` and colocated `__tests__/`; Cypress fast e2e in CI

**Target Platform**: Responsive web, mobile-first (feature driven by a phone screenshot), evergreen browsers, light + dark theme

**Project Type**: Web frontend (the `frontend/` workspace of the existing monorepo)

**Performance Goals**: Bubble open/close is perceptually instant (single state update, no async work); zero bundle-size impact from new dependencies (none added)

**Constraints**: WCAG 2.1 AA (axe/Lighthouse CI gate); bubbles must stay fully within the viewport down to 320 px-wide screens; only presentational changes — no wager behavior, validation, or submission-flow changes (FR-010)

**Scale/Scope**: 8 wager components carry ~43 `.fm-hint` occurrences; ~24 are static explainers to move behind icons, the rest are dynamic and stay inline. 1 new shared component (`InfoTip`), 1 shared CSS file, plus per-view swaps and a `DeadlineTimeline` prop change

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment | Status |
|---|---|---|
| I. Security-first smart contracts | No `contracts/` changes; no wallet, key, or transaction-path changes. The four-word-code brute-force warning is classified as a security warning and stays inline (research R2) so risk disclosure is not hidden. | PASS (N/A scope) |
| II. Test-first, comprehensive coverage | New `InfoTip` ships with dedicated unit + axe tests (open/close, outside-click, Escape, single-open coordination, keyboard). Each swept view's existing Vitest suite is updated in the same PR: assertions that explainer text is visible change to "reachable via its info icon". `DeadlineTimeline.test.jsx` / `.axe.test.jsx` updated for the hint-to-icon change. | PASS |
| III. Honest state, no mocks in shipped paths | Dynamic truth stays visible: `role="alert"` validation, `role="status"` progress, computed deadline summaries, sanctions/membership gating, and encryption honesty text remain inline (FR-005, research R2). Only static instructional copy moves. State-dependent explainers render the text for the state at open time (FR-009) — no stale or mocked copy. | PASS |
| IV. Fail loudly in CI | No CI config changes; existing lint/test/axe/Cypress gates cover the new code. | PASS |
| V. Accessible, consistent frontend | Core of the feature: one shared toggletip pattern across all wager views (FR-006), keyboard-operable with `aria-expanded` + Escape + focus return, content exposed via a live region (research R3), axe suites extended (FR-007). Icon tap target meets the 24×24 CSS px minimum. | PASS |

**Post-design re-check (after Phase 1)**: PASS — design adds exactly one shared
component that *replaces* an ad-hoc pattern (`ScreeningInfoButton` becomes a
thin wrapper over `InfoTip`) rather than adding a parallel one, and deletes
more inline markup than it adds. No violations; Complexity Tracking empty.

## Project Structure

### Documentation (this feature)

```text
specs/039-wager-info-tooltips/
├── spec.md              # Feature specification (/speckit-specify output)
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/
│   └── infotip-component.md   # UI contract for the shared InfoTip component
├── checklists/
│   └── requirements.md  # Spec quality checklist (complete)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
frontend/
├── src/
│   ├── components/
│   │   ├── ui/
│   │   │   ├── InfoTip.jsx            # NEW: shared info-icon + speech-bubble toggletip
│   │   │   ├── InfoTip.css            # NEW: icon, bubble, arrow, viewport-clamp styles
│   │   │   └── ScreeningInfoButton.jsx  # REFACTOR: becomes a thin wrapper over InfoTip
│   │   └── fairwins/
│   │       ├── OpenChallengeModal.jsx     # SWEEP: static fm-hints → InfoTip
│   │       ├── FriendMarketsModal.jsx     # SWEEP: static fm-hints → InfoTip
│   │       ├── GroupPoolModal.jsx         # SWEEP: static fm-hints → InfoTip
│   │       ├── TakeChallengePanel.jsx     # SWEEP: static fm-hints → InfoTip
│   │       ├── UnifiedLookupModal.jsx     # SWEEP: static fm-hint → InfoTip
│   │       ├── OpenChallengeDecryptModal.jsx  # SWEEP: static fm-hint → InfoTip
│   │       ├── OracleConditionPicker.jsx  # SWEEP: state-dependent KIND_HELP → InfoTip
│   │       ├── DeadlineTimeline.jsx       # CHANGE: milestone `hint` renders as InfoTip in tile head
│   │       └── FriendMarketsModal.css     # TRIM: fm-hint stays (dynamic text still uses it)
│   └── test/
│       ├── InfoTip.test.jsx           # NEW: behavior tests
│       ├── InfoTip.axe.test.jsx       # NEW: a11y tests
│       ├── DeadlineTimeline.test.jsx  # UPDATE
│       ├── DeadlineTimeline.axe.test.jsx  # UPDATE
│       ├── FriendMarketsModal.test.jsx    # UPDATE
│       ├── GroupPoolModal.test.jsx        # UPDATE
│       └── (open-challenge / take-challenge / lookup suites)  # UPDATE
```

**Structure Decision**: Follow the established repo layout — shared primitives
in `frontend/src/components/ui/` (where `HelperText`, `ScreeningInfoButton`,
`AddressBookButton` already live), feature views in
`frontend/src/components/fairwins/`, tests in `frontend/src/test/`. No new
directories or workspaces.

## Complexity Tracking

> No constitution violations — table intentionally empty.
