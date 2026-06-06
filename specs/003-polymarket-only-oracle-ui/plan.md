# Implementation Plan: Polymarket-Only Oracle Selection (Frontend)

**Branch**: `003-polymarket-only-oracle-ui` | **Date**: 2026-06-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/003-polymarket-only-oracle-ui/spec.md`

## Summary

Hide every oracle model except **Polymarket** across the user-facing frontend,
reversibly. The change is driven by a **single source of truth** — an "exposed
oracle models" constant derived from one `VITE_*` env flag (default:
Polymarket-only). The oracle tab strip in `FriendMarketsModal` renders from that
constant — covering **both the 1v1 and the Bookmaker** flows (they share the same
oracle selection via `resolutionCategory='all'`); with one model it auto-selects
Polymarket and shows no multi-tab chooser. The **landing page** footer "Oracles"
list and the onboarding/dashboard copy are conditioned on the same flag (Chainlink/
UMA names + links removed when Polymarket-only). Display labels stay intact so
existing non-Polymarket oracle wagers still render and settle. **No contract, ABI,
deployment, or admin-tab changes.** (Folds in former feature 004 — same flag.)

## Technical Context

**Language/Version**: JavaScript (ES2022), React 18 + Vite 7, Node 22

**Primary Dependencies**: The existing frontend (`frontend/src`). Key surfaces:
`components/fairwins/FriendMarketsModal.jsx` (the oracle tab strip,
`ORACLE_TAB_TYPES` at L70–75; tabs rendered ~L1045), `OracleConditionPicker.jsx`
(non-Polymarket condition picker — becomes unreachable for hidden models),
`Dashboard.jsx` / `OnboardingTutorial.jsx` (copy), and `constants/wagerDefaults.js`
(canonical `ResolutionType`, `ORACLE_RESOLUTION_TYPES`, `RESOLUTION_TYPE_LABELS`).

**Storage**: N/A (UI config). The exposure switch is a build-time env flag
(`import.meta.env.VITE_*`), matching the app's existing config pattern
(`VITE_NETWORK_ID`, `VITE_PINATA_*`, …).

**Testing**: Vitest + Testing Library (existing `frontend/src/test/`, incl.
`OracleAdaptersTab.test.jsx`, `useOracleConditions.test.jsx`). Add a focused test
asserting the oracle selector exposes only Polymarket by default and all four when
the flag = `all`.

**Target Platform**: Frontend web app (Vite build).

**Project Type**: Web app (frontend only; no backend/contract work).

**Performance Goals**: N/A (static UI filtering).

**Constraints**:
- Filter only the **selectable** set (`ORACLE_TAB_TYPES`); keep
  `RESOLUTION_TYPE_LABELS`/`RESOLUTION_TAB_LABELS` full so display/settlement of
  existing hidden-model wagers is unaffected (FR-006).
- With one exposed model, avoid a dead single-tab chooser / empty selector (FR-002)
  — default-select Polymarket and suppress the multi-option strip.
- One clearly-named switch, default Polymarket-only, restorable to all without
  further code changes (FR-005).
- Admin `OracleAdaptersTab` is **out of scope — unchanged**.

**Scale/Scope**: ~3–5 frontend files touched (1 config constant + FriendMarketsModal
+ two copy files + 1 test). No production data or contract surface.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Spec-Driven Change** — PASS (specify → plan → tasks).
- **II. Test-First / Coverage (NON-NEGOTIABLE)** — PASS, addressed: add a unit/
  component test that the oracle selector shows only Polymarket by default and the
  full set when the flag flips (covers SC-001/SC-004); keeps existing oracle tests
  green.
- **III. Security-First / No mocks in shipped paths** — PASS, and reinforced:
  **frontend-only**, **zero** contract/ABI/deployment changes (FR-007/SC-006). The
  on-chain oracle adapters remain deployed and operable.
- **IV. Fail Loudly** — PASS (no CI gates weakened; the new test fails on
  regression). N/A to UI copy beyond that.
- **V. (project-specific)** — N/A to a UI-visibility change.

**No violations. No Complexity Tracking entries required.**

## Project Structure

### Documentation (this feature)

```
specs/003-polymarket-only-oracle-ui/
├── spec.md
├── plan.md              # this file
├── research.md          # Phase 0 — switch shape, where to filter, copy, display-preservation
├── data-model.md        # Phase 1 — exposure setting + oracle-model exposure matrix
├── contracts/
│   └── ui-contract.md    # Phase 1 — the UI/config contract + per-surface acceptance
├── quickstart.md        # Phase 1 — how to run/validate both flag states
└── checklists/
    └── requirements.md
```

### Source Code (repository root) — frontend only

```
frontend/
├── src/
│   ├── constants/wagerDefaults.js        # + EXPOSED_ORACLE_RESOLUTION_TYPES derived from a VITE flag (single source of truth)
│   ├── components/
│   │   ├── LandingPage.jsx                # footer "Oracles" list (L~421-422): drop Chainlink/UMA links unless flag=all (folded from 004)
│   │   └── fairwins/
│   │       ├── FriendMarketsModal.jsx    # ORACLE_TAB_TYPES -> derive from EXPOSED_*; covers BOTH 1v1 + Bookmaker (resolutionCategory 'all'); default-select Polymarket; suppress single-tab strip
│   │       ├── Dashboard.jsx              # copy: "Polymarket, Chainlink or UMA" -> conditional on the flag
│   │       └── OnboardingTutorial.jsx     # copy: Chainlink/UMA explainer cards -> conditional on the flag
│   └── test/
│       └── oracleExposure.test.jsx        # NEW — 1v1 + Bookmaker selector shows only Polymarket by default; all four when flag=all; landing has no Chainlink/UMA
│   # READ-ONLY / unchanged: OracleConditionPicker.jsx (unreachable branches), components/admin/OracleAdaptersTab.jsx (out of scope)
contracts/ subgraph/                        # UNTOUCHED (no on-chain changes)
```

**Structure Decision**: A single derived constant
(`EXPOSED_ORACLE_RESOLUTION_TYPES`) in `wagerDefaults.js`, read everywhere the UI
offers oracle choices, is the one switch (FR-005). Each surface filters/conditions
on it; nothing else changes. This keeps the re-enable a one-line flag flip and
prevents fragments from rotting.

## Complexity Tracking

*No constitution violations — no entries.*
