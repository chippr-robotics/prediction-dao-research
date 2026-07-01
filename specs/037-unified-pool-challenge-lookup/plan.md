# Implementation Plan: Unified Phrase Lookup for Pools & Challenges

**Branch**: `claude/unified-pool-challenge-lookup-mslzd9` | **Date**: 2026-07-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/037-unified-pool-challenge-lookup/spec.md`

## Summary

Collapse the two separate "Take a challenge" and "Join a pool" flows into one standalone
"Enter a phrase" surface that resolves a four-word phrase to **either** an open challenge
**or** a group pool and shows the matching take/join UI; consolidate open challenges and
pools into the existing **My Wagers** view (sourced from a hybrid of subgraph indexing and
device-local records); and relocate the open-challenge **recovery codes** feature into the
**My Account → Security** tab. This is a **frontend-only** change (`frontend/`), plus
read-only reuse of the existing subgraph — **no `contracts/`, escrow, or on-chain
mechanics change** (spec FR-014, Out of Scope). It composes existing hooks
(`useOpenChallengeAccept.discover`, `usePools.resolvePhrase`, `useOpenChallengeCodeVault`)
behind a new resolver that runs both lookups concurrently and maps results to a single
lookup-result state machine, including the FR-025 "couldn't check / retry" state.

## Technical Context

**Language/Version**: JavaScript (ES2022) + JSX; Node 22 toolchain (matches CI `node-version: '22'`).

**Primary Dependencies**: React 18 + Vite; React Router (routing/deep links); ethers (read-only
contract calls via existing hooks); existing feature hooks — `useOpenChallengeAccept`,
`useOpenChallengeCodeVault`, `usePools`, `FriendMarketsContext`/`useFriendMarkets`; The Graph
subgraph (read-only queries for enumeration). No new core technology introduced (Constitution
Additional Constraints).

**Storage**: On-chain state read via ethers (authoritative); The Graph subgraph (read-only,
`Wager` / `Pool` / `PoolJoin` entities); device-local `localStorage` (open-challenge code vault
`useOpenChallengeCodeVault`, word-list language pref `fairwins_wordlist_lang_v1`). No new
persistent stores; no schema/mapping changes required for the MVP (existing entities suffice).

**Testing**: Vitest (`npm run test:frontend`) — unit/integration for the resolver, the
lookup-result mapping, My Wagers aggregation/dedup, and the relocated recovery panel. No contract
tests needed (no `contracts/` change).

**Target Platform**: Web SPA (desktop + mobile-responsive), same networks as today
(Polygon/Amoy + existing); challenges are English-only, pools honor the selected word-list language.

**Project Type**: Web frontend (single React app under `frontend/`); subgraph consumed read-only.

**Performance Goals**: Unified lookup resolves both sources **concurrently** so a single-type match
is no slower than the prior dedicated flow (SC-007); correct match type or unambiguous
no-match/collision in ≥95% of valid-phrase attempts (SC-003).

**Constraints**: Read-only lookup/preview MUST require **no wallet signature** (FR-010); only the
terminal take/join action may prompt one. Honor the device word-list language for pool resolution
(FR-009). New/changed UI MUST meet WCAG 2.1 AA and pass ESLint with zero errors (Constitution V).
Never show "no match" when a lookup failed to complete (FR-007/FR-025).

**Scale/Scope**: Per-user scope is small (tens of wagers/challenges/pools). Subgraph queries use
existing pagination patterns. ~1 new modal/surface, ~1 resolver module, ~1 aggregation module,
~1 relocated panel, plus edits to Dashboard quick actions, `OpenChallengeModal`, `GroupPoolModal`,
`MyMarketsModal`, and `WalletPage`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment | Status |
|-----------|------------|--------|
| I. Security-First Smart Contracts | No `contracts/` change; no escrow/oracle/access-control path touched. Feature reuses existing on-chain reads and the unchanged take/join transactions. Highest-risk surfaces untouched (FR-014). | ✅ Pass (N/A on-chain) |
| II. Test-First & Coverage | Non-trivial new logic (resolver, result-state mapping, My Wagers aggregation/dedup, moved panel) gets Vitest unit/integration tests written alongside. No contract interface changes → no contract-test updates required. | ✅ Pass (with test commitments below) |
| III. Honest State, No Mocks | My Wagers reflects real on-chain/subgraph state, scoped to the active network; statuses surfaced truthfully; the FR-025 "couldn't check" state prevents implying a false "nothing there." No mocks in shipped paths. | ✅ Pass |
| IV. Fail Loudly in CI | No `continue-on-error` added to lint/test/build. (The separate solc CI-reliability fix on this branch keeps compile failing loudly after retries.) | ✅ Pass |
| V. Accessible, Consistent Frontend | New lookup surface + Security recovery panel meet WCAG 2.1 AA (labels, focus, roles), ESLint-clean; contract addresses/ABIs continue to come from generated sync artifacts via existing hooks — none hand-copied. | ✅ Pass |

No violations → **Complexity Tracking is empty** (no deviations to justify).

## Project Structure

### Documentation (this feature)

```text
specs/037-unified-pool-challenge-lookup/
├── plan.md              # This file (/speckit-plan output)
├── research.md          # Phase 0 output — resolver/aggregation/relocation decisions
├── data-model.md        # Phase 1 output — entities & lookup-result state machine
├── quickstart.md        # Phase 1 output — validation/run guide
├── contracts/           # Phase 1 output — UI/module interface contracts
│   ├── unified-lookup.md
│   ├── my-wagers-aggregation.md
│   └── recovery-codes-security.md
├── checklists/
│   └── requirements.md  # spec quality checklist (from /speckit-specify)
└── tasks.md             # /speckit-tasks output (NOT created here)
```

### Source Code (repository root)

Frontend-only. Concrete files (paths relative to `frontend/src/`):

```text
frontend/src/
├── components/fairwins/
│   ├── UnifiedLookupModal.jsx        # NEW — the single "Enter a phrase" surface (take + join)
│   ├── OpenChallengeModal.jsx        # EDIT — remove "Take a challenge" + "Recover codes" tabs (create-only)
│   ├── GroupPoolModal.jsx            # EDIT — remove "Join a pool" tab (create-only)
│   ├── MyMarketsModal.jsx            # EDIT — add open-challenge + pool sections (hybrid source)
│   └── Dashboard.jsx                 # EDIT — new "Enter a phrase" quick action; reroute deep link; drop "join-pool" action
├── components/account/
│   └── RecoveryCodesPanel.jsx        # NEW — extracted from OpenChallengeModal RecoverPanel; reusable
├── pages/
│   └── WalletPage.jsx                # EDIT — mount RecoveryCodesPanel in the Security tab
├── lib/lookup/
│   ├── resolvePhraseLookup.js        # NEW — concurrent challenge+pool resolver → LookupResult
│   └── myWagersAggregation.js        # NEW — union/dedup of wagers+challenges+pools for My Wagers
├── hooks/
│   ├── useUnifiedLookup.js           # NEW — thin hook wrapping resolvePhraseLookup + state
│   ├── useOpenChallengeAccept.js     # EDIT — return structured not-found vs error (see research.md)
│   ├── usePools.js                   # (reuse) resolvePhrase already returns structured not-found
│   └── useOpenChallengeCodeVault.js  # (reuse) recovery-codes API, unchanged
└── utils/claimCode/deepLink.js       # (reuse) parse ?oc=take&code= → route into UnifiedLookupModal

frontend/src/**/__tests__/           # Vitest: resolver, aggregation, deep-link routing, moved panel
```

**Structure Decision**: Single existing React app (`frontend/`). New logic is isolated into small
composable modules under `lib/lookup/` and a new modal, so the three deliverables (lookup,
My Wagers, recovery relocation) remain independently testable and shippable (matching the spec's
P1/P2/P3 slices). No backend or subgraph schema change is required for the MVP; any future
per-user pool/challenge index is out of scope.

## Complexity Tracking

No constitution violations — no entries.
