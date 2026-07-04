# Implementation Plan: UX Consistency Harmonization

**Branch**: `claude/ux-consistency-harmonization-lfv7yr` | **Date**: 2026-07-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/038-ux-consistency/spec.md`

## Summary

Harmonize the FairWins frontend so the three creation flows (private wager,
open challenge, group pool), the header, and the dashboard share one control
language: a single interactive deadline-timeline control (draggable milestone
dots + tap-to-edit set-time modal) replaces native date pickers and range
sliders; timeline colors move from the amber colorway to brand-palette tokens;
"who settles" selections become pill rows everywhere via a shared `PillSelect`
component extracted from the existing `.fm-resolution-tabs` CSS convention;
stake amount + token merge onto one line with an always-interactive token
control; the encryption toggle is removed (encryption always on, compact
informational indicator retained); the notification bell CSS is isolated from
the global `button` rule that currently crushes it; and a new Preferences
section in My Account lets users toggle quick access card visibility, persisted
per device in localStorage. Frontend-only — no contract, subgraph, or on-chain
changes.

## Technical Context

**Language/Version**: JavaScript (ESM), React 19.2, Vite 7.2 (existing `frontend/` app)

**Primary Dependencies**: React 19, react-router-dom 7, wagmi/viem/ethers (untouched), plain CSS with design tokens in `frontend/src/theme.css`; no new runtime dependencies

**Storage**: Browser `localStorage` for quick access card preferences (device-scoped, following the existing `qrColorPreference.js` pattern); no server or on-chain storage

**Testing**: Vitest 4 + @testing-library/react + vitest-axe (unit/integration/a11y), Cypress (e2e); tests live in `frontend/src/test/` and colocated `__tests__/`

**Target Platform**: Responsive web (mobile-first — feature is driven by mobile screenshots), evergreen browsers, light + dark theme

**Project Type**: Web frontend (the `frontend/` workspace of the existing monorepo)

**Performance Goals**: Dot-drag interaction tracks the pointer at 60fps (pointer events + CSS transforms, no layout thrash); no bundle-size regression from new dependencies (none added)

**Constraints**: WCAG 2.1 AA (axe/Lighthouse gate in CI); encryption behavior must remain honest (badge only when actually encrypted); no changes to contract ABIs, deployment artifacts, or `wagerRegistry` interaction paths

**Scale/Scope**: 7 UI surfaces, ~10 components touched (3 creation modals, `DeadlineTimeline`, new `SetTimeModal` + `PillSelect` + preferences panel, `NotificationBell`, `Dashboard`, `AccountDashboard`), 9 quick access cards, 3 timeline color tokens

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment | Status |
|---|---|---|
| I. Security-first smart contracts | No `contracts/` changes. Encryption flag (`isEncrypted`) continues to flow to the same creation paths; removing the off-switch narrows, not widens, the attack surface. No key handling changes. | PASS (N/A scope) |
| II. Test-first, comprehensive coverage | Every behavior change lands with Vitest coverage: new dedicated tests for `DeadlineTimeline` (currently untested directly), `SetTimeModal`, `PillSelect`, quick access preference storage, Dashboard card filtering, bell visibility; existing modal tests updated in the same PR. | PASS |
| III. Honest state, no mocks in shipped paths | Encryption indicator renders only when the wager will actually be encrypted; if the opponent's key cannot be found, the UI says so truthfully (see research R1). Timeline milestones keep reflecting real min/max bounds from `WAGER_DEFAULTS`. No mock data introduced. | PASS |
| IV. Fail loudly in CI | No CI config changes; existing lint/test/axe gates cover the new code. | PASS |
| V. Accessible, consistent frontend | Core purpose of the feature. Drag interaction gets a keyboard-equivalent path (dots focusable, arrow keys); pill rows keep `role=radiogroup` semantics; new colors validated for AA contrast; axe tests extended. | PASS |

**Post-design re-check (after Phase 1)**: PASS — design introduces two small
shared components (`PillSelect`, `SetTimeModal`) and one storage util, all
replacing duplicated patterns rather than adding parallel ones. No violations;
Complexity Tracking empty.

## Project Structure

### Documentation (this feature)

```text
specs/038-ux-consistency/
├── spec.md              # Feature specification (/speckit-specify output)
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── ui-contracts.md  # Phase 1 output — component & storage contracts
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
frontend/src/
├── theme.css                          # + global timeline phase tokens (brand palette)
├── index.css                          # (unchanged; bell opts out locally)
├── components/
│   ├── Header.jsx                     # renders NotificationBell (unchanged wiring)
│   ├── ui/
│   │   ├── PillSelect.jsx             # NEW — shared pill/segmented control
│   │   ├── PillSelect.css             # NEW — promoted from .fm-resolution-tabs
│   │   └── index.js                   # + export PillSelect
│   ├── fairwins/
│   │   ├── DeadlineTimeline.jsx       # REWORKED — draggable dots, modal entry, 2-or-3 milestones
│   │   ├── SetTimeModal.jsx           # NEW — tap-to-edit exact date/time modal
│   │   ├── wagerTimeline.js           # + shared clamp/format helpers
│   │   ├── FriendMarketsModal.jsx     # remove enc toggle + #fm-end-date; adopt timeline; stake row; PillSelect
│   │   ├── FriendMarketsModal.css     # remove amber tokens; stake-row layout; slim enc indicator
│   │   ├── OpenChallengeModal.jsx     # PillSelect for "How is it resolved?"; token control on stake line
│   │   ├── GroupPoolModal.jsx         # PillSelect adoption (already pill-style); token control
│   │   └── Dashboard.jsx              # filter QuickActionCards by preference; empty state
│   ├── notifications/
│   │   └── NotificationBell.css       # isolate from global button rule (padding/border reset)
│   └── account/
│       ├── AccountDashboard.jsx       # + Preferences section entry
│       ├── PreferencesPanel.jsx       # NEW — quick access card visibility toggles
│       └── PreferencesPanel.css       # NEW
├── utils/
│   └── quickAccessPreference.js       # NEW — localStorage util (qrColorPreference pattern)
└── test/
    ├── DeadlineTimeline.test.jsx      # NEW (component currently has no direct tests)
    ├── SetTimeModal.test.jsx          # NEW
    ├── PillSelect.test.jsx            # NEW
    ├── PreferencesPanel.test.jsx      # NEW
    ├── quickAccessPreference.test.js  # NEW
    ├── Dashboard.test.jsx             # UPDATED — card filtering + empty state
    ├── NotificationBell.test.jsx      # UPDATED — visibility/size assertions
    ├── FriendMarketsModal.test.jsx    # UPDATED — no toggle, timeline entry, stake row
    └── GroupPoolModal.test.jsx        # UPDATED — PillSelect + timeline
```

**Structure Decision**: Single existing web frontend (`frontend/`); all changes
land inside it. New shared primitives go in `components/ui/` (PillSelect) and
`components/fairwins/` (SetTimeModal, next to the timeline it serves); the
preference util follows the established `utils/*Preference.js` pattern.

## Complexity Tracking

No constitution violations — table intentionally empty.
