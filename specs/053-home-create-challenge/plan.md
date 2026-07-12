# Implementation Plan: Create-a-Challenge Home Screen

**Branch**: `claude/fairwins-wager-sheet-redesign-xvr24u` | **Date**: 2026-07-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/053-home-create-challenge/spec.md`

## Summary

Make the FairWins home (`/app`) open directly on the **open-challenge create view** rendered
inline (no modal), payments-app style: the amount hero + number pad, the wager memo, and the
resolution selector (self / third-party / network-gated oracle). Add **Accept a challenge** and
**My Rewards** entries beside it. Move the multi-button quick-action grid off home into a new
**`/wagers`** route reachable from the nav drawer, where every create type and action stays
available. Front-end IA/presentation only — all wager/take/rewards logic is reused unchanged.

Technical approach: **extract** the consolidated create panel (`MakerPanel`, already folded to
include the oracle resolution path in this branch's WIP checkpoint) out of `OpenChallengeModal`
into a reusable `CreateChallengePanel` that renders either inside the modal chrome (for the
Wagers grid) or **embedded** inline (for home). Repurpose `Dashboard` into a **HomeScreen** that
renders the embedded panel + the two entries + the Polymarket ticker; create a **WagersPage**
that hosts the relocated `QuickActions` grid and its existing modals; add a `/wagers` route and a
"Wagers" nav-drawer item. Reuse the existing take-a-challenge (`UnifiedLookupModal`) and winnings
(`MyMarketsModal`) flows for the two new entries. No hooks, contracts, ABIs, or crypto change.

## Technical Context

**Language/Version**: JavaScript (ES2022) + JSX; React 18 function components + hooks; react-router-dom.

**Primary Dependencies**: React, react-router-dom (routing/nav), Vite, Vitest + @testing-library/react.
Reuses existing components: `AmountKeypad`, `PillSelect`, `PolymarketBrowser`, `DeadlineTimeline`,
`UnifiedLookupModal`, `MyMarketsModal`, `AppNavDrawer`, and the create hooks
(`useOpenChallengeCreate`, `usePools`, `useFriendMarketCreation`). No new runtime dependency.

**Storage**: N/A (no persistence; quick-access visibility uses the existing `quickAccessPreference`
localStorage util, unchanged).

**Testing**: Vitest + @testing-library/react, co-located under `src/test/**` and
`src/components/**/__tests__/**`. Home + Wagers get their own render/wiring tests; the extracted
panel is tested once and reused.

**Target Platform**: Web (mobile + desktop). Home create view must stay non-scrolling at 320px.

**Project Type**: Web application — frontend only (`frontend/`). No backend/contract work.

**Performance Goals**: Home renders the create view immediately on `/app` with no intermediate
grid; no added network calls; interaction stays instant (reuses the compacted keypad).

**Constraints**: WCAG 2.1 AA (reuses accessible components); existing theme only; non-scrolling home;
no changes to contracts/escrow/oracle/membership/claim-code (FR-014). Deep links must still route
(FR-016). The oracle path stays network-gated (FR-005).

**Scale/Scope**: 1 extracted panel; 1 repurposed home screen; 1 new page + route + nav item; edits
to `appNav.js`/`AppNavDrawer`; finish the WIP oracle-consolidation test updates. ~4 new files, ~6
edited, plus test rework for the Dashboard→Home/Wagers split.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Security-First Smart Contracts (NON-NEGOTIABLE)** — ✅ N/A. No `contracts/` changes; escrow,
  access control, and oracle resolution untouched (FR-014).
- **II. Test-First and Comprehensive Coverage (NON-NEGOTIABLE)** — ✅ Planned. New Vitest tests for
  the extracted `CreateChallengePanel`, the HomeScreen (inline create + Accept + My Rewards wiring),
  and the WagersPage (all relocated items launch their flows). The WIP's mid-updated oracle tests
  are finished here. No contract interface change → no contract test updates.
- **III. Honest State, No Mocks or Placeholders** — ✅ The home create view drives the real create
  flow (same claim-code outcome); Accept/My-Rewards open the real take/winnings surfaces. No
  placeholder screens; disconnected users see the real view with honest connect/membership gating.
- **IV. Fail Loudly in CI** — ✅ No `continue-on-error`; lint/test/a11y gates as usual.
- **V. Accessible, Consistent Frontend (NON-NEGOTIABLE here)** — ✅ Reuses accessible components;
  new route + nav item get proper labels/focus; addresses/ABIs/config still from sync artifacts.

**Result**: PASS. No violations; Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/053-home-create-challenge/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (UI state / IA model)
├── quickstart.md        # Phase 1 output (validation guide)
├── contracts/
│   └── create-challenge-panel.md   # UI contract for the extracted panel + nav/route contract
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
frontend/src/
├── components/fairwins/
│   ├── CreateChallengePanel.jsx     # NEW — extracted consolidated create panel (embedded | modal)
│   ├── OpenChallengeModal.jsx       # EDIT — thin modal wrapper around CreateChallengePanel
│   ├── HomeScreen.jsx               # NEW — /app: inline create + Accept + My Rewards + ticker
│   ├── WagersPage.jsx               # NEW — /wagers: relocated QuickActions grid + its modals
│   ├── Dashboard.jsx                # EDIT/RETIRE — content split into HomeScreen + WagersPage
│   ├── HomeScreen.css / WagersPage.css   # NEW — layout (reuse tokens)
│   └── __tests__/ or src/test/      # tests for panel / home / wagers (+ finish oracle tests)
├── config/appNav.js                 # EDIT — add the "Wagers" nav item + path
├── components/nav/AppNavDrawer.jsx  # EDIT — render the Wagers item
└── App.jsx                          # EDIT — add /wagers route (+ keep /app → HomeScreen)
```

**Structure Decision**: Frontend-only web app. The reusable `CreateChallengePanel` lives beside the
other fairwins create components. `/app` renders the new `HomeScreen`; a new `/wagers` route renders
`WagersPage` (the relocated grid). `Dashboard.jsx` is split — its `QuickActions`/`WelcomeView`/modal
wiring moves into `WagersPage`/`HomeScreen`; `Dashboard.jsx` is retired or reduced to a redirect.
The nav "Wagers" item is added as an absolute-route entry (like Home), special-cased in
`pathForNavItem`.

## Complexity Tracking

> No constitution violations — section intentionally empty.
