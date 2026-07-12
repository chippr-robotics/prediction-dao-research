# Implementation Plan: Payments-Style Wager Create Sheets

**Branch**: `claude/fairwins-wager-sheet-redesign-xvr24u` | **Date**: 2026-07-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/052-payments-style-wager-create/spec.md`

## Summary

Redesign the four wager-create sheets (Open Challenge, Oracle Open Challenge, 1v1
create-a-wager, group Wager Pool) into a familiar payments-app layout: an oversized,
glanceable stake **amount as the hero**, a **custom on-screen number pad** (shown on
all viewports) driving entry, and the wager text demoted to a **secondary memo**
field. All existing controls (resolution paths, arbitrator entry, oracle side,
deadlines) and outcomes (validation, membership gating, claim-code generation) are
preserved — this is a presentation/interaction change only.

Technical approach: extract one shared, controlled React control —
**`AmountKeypad`** (hero read-out + on-screen pad) — under `frontend/src/components/ui/`,
styled with plain CSS consuming existing `theme.css` tokens so it matches the `fm-*`
sheets. Each of the four sheets adopts it in place of its current
`fm-stake-input-wrapper` block and re-orders its layout so the amount is the hero and
the description becomes a memo. The keypad is presentation-only: it emits the same
stake string the sheets already pass to their unchanged submit hooks
(`useOpenChallengeCreate`, `useFriendMarketCreation`, `usePools`). No hooks,
contracts, ABIs, or crypto change.

## Technical Context

**Language/Version**: JavaScript (ES2022) + JSX; React 18 function components with hooks.

**Primary Dependencies**: React, Vite (build/dev), Vitest + @testing-library/react
(tests), ethers (already used by submit hooks — not touched here). No new runtime
dependency is introduced.

**Storage**: N/A (no persistence; amount state is component-local `useState`).

**Testing**: Vitest with @testing-library/react, co-located under
`frontend/src/components/**/__tests__/*.test.jsx`. New unit tests for `AmountKeypad`
plus per-surface assertions that the keypad is wired and submitted values are unchanged.

**Target Platform**: Web (mobile + desktop browsers). The on-screen pad renders on all
viewports; the existing `.friend-markets-modal` becomes a bottom-sheet under 640px.

**Project Type**: Web application — frontend only (`frontend/`). No backend/contract work.

**Performance Goals**: Interaction feels instant — each keypad tap updates the hero in
the same frame (<16ms); no added network calls; no layout jank at the smallest
supported viewport (320px width).

**Constraints**: WCAG 2.1 AA (each pad key is a labeled, keyboard-operable control; the
live amount is exposed to assistive tech). Existing-theme only (no new tokens, no neon).
Must not regress any existing create control or validation. Must accommodate surface #3's
multi-token prefix/validation (token-driven `$` vs symbol, `min 0.1 / max 1000`) while
surfaces #1/#2/#4 stay USDC-locked with an always-`$` prefix.

**Scale/Scope**: 1 new shared component (+ its CSS + tests); edits to 4 existing create
components and their local layout/CSS. No change to submit hooks, ABIs, or config.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Security-First Smart Contracts (NON-NEGOTIABLE)** — ✅ N/A / satisfied. No
  `contracts/` changes; no escrow, access-control, or oracle-resolution surface is
  touched. FR-013 makes this an explicit non-goal.
- **II. Test-First and Comprehensive Coverage (NON-NEGOTIABLE)** — ✅ Planned. New
  Vitest unit tests for `AmountKeypad` (digit/decimal/backspace/zero-state/precision)
  written alongside the component; each converted surface gets/keeps a test asserting
  the submitted stake value is unchanged. No contract interface changes, so no
  contract/integration test updates required.
- **III. Honest State, No Mocks or Placeholders** — ✅ Satisfied. The keypad displays
  the real user-entered amount and submits it verbatim; no placeholder/mock values in
  the shipped path. Zero-state (`$0`) truthfully disables submit. Balance/allowance and
  finality messaging remain the hooks' existing honest behavior.
- **IV. Fail Loudly in CI** — ✅ Satisfied. No `continue-on-error` added. Lint, tests,
  and the a11y audit (axe/Lighthouse) gate as usual.
- **V. Accessible, Consistent Frontend (NON-NEGOTIABLE for this feature)** — ✅ Core
  design goal. FR-015 + SC-005: keypad keys are real labeled buttons, keyboard
  operable, live amount announced; existing design tokens/theme reused for
  consistency; addresses/ABIs/config untouched (still from sync artifacts).

**Result**: PASS. No violations; Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/052-payments-style-wager-create/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (UI contract for AmountKeypad)
│   └── amount-keypad.md
├── checklists/
│   └── requirements.md  # Spec quality checklist (/speckit-specify)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
frontend/src/
├── components/
│   ├── ui/
│   │   ├── AmountKeypad.jsx        # NEW — shared hero-amount + on-screen number pad
│   │   ├── AmountKeypad.css        # NEW — plain CSS, consumes theme.css tokens
│   │   ├── index.js                # export AmountKeypad
│   │   └── __tests__/
│   │       └── AmountKeypad.test.jsx   # NEW — unit tests for the control
│   └── fairwins/
│       ├── OpenChallengeModal.jsx          # EDIT — adopt AmountKeypad, memo layout
│       ├── OpenChallengeModal.css          # EDIT — payments layout helpers (shared)
│       ├── OracleOpenChallengeModal.jsx    # EDIT — adopt AmountKeypad, memo layout
│       ├── FriendMarketsModal.jsx          # EDIT — adopt AmountKeypad (multi-token)
│       ├── FriendMarketsModal.css          # EDIT — hero/memo layout, keep fm-stake-*
│       ├── GroupPoolModal.jsx              # EDIT — adopt AmountKeypad (buy-in)
│       └── __tests__/
│           └── *.test.jsx                  # ADD/UPDATE per-surface wiring assertions
```

**Structure Decision**: Frontend-only web application. The reusable control lives in
`frontend/src/components/ui/` (alongside Button/Input/Card) and is exported from
`ui/index.js`. It uses **plain CSS with semantic class names consuming `theme.css`
tokens** (the `PillSelect.css` convention) rather than a CSS Module, because it drops
into the `fm-*` wager sheets and must visually match `.fm-stake-input-wrapper` /
`.fm-odds-presets` with minimal friction. The four create components under
`frontend/src/components/fairwins/` are edited in place; existing `fm-stake-*` classes
are retained (still referenced elsewhere) but the create sheets route amount entry
through `AmountKeypad`.

## Complexity Tracking

> No constitution violations — section intentionally empty.
