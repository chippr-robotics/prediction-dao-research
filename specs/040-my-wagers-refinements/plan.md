# Implementation Plan: My Wagers — Tester Feedback Refinements

**Branch**: `claude/my-wagers-refinements-729gjz` | **Date**: 2026-07-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/040-my-wagers-refinements/spec.md`

## Summary

Eight tester-driven refinements to the **My Wagers** modal (`frontend/src/components/fairwins/MyMarketsModal.jsx`
and its card/pool children). All are frontend presentation + local client-state changes; no
contract, oracle, or subgraph schema changes. The work reuses existing subsystems rather than
building new ones: the address book (spec 021), ENS reverse lookup, the pool nickname vocabulary
(spec 034), the open-challenge code vault (spec 024), the notification/activity engine (spec 031),
the pool aggregation layer (spec 037), and the existing 30s auto-refresh (spec 019). The two
larger slices are (1) an **opponent-name resolver** (address book → ENS → deterministic two-word
name) with click-to-reveal, and (2) **draw clarity** (a visible draw state on the card plus a
per-party submission indicator, backed by the already-indexed `drawProposer`). The rest are small,
surgical edits: prune two filter options, drop the redundant header network pill, auto-decrypt from
the code vault instead of re-prompting, extend pool polling, and file terminal pools under History.

## Technical Context

**Language/Version**: JavaScript (ES2022), React 18 function components + hooks

**Primary Dependencies**: React, Vite; `wagmi`/`viem` (ENS reverse lookup on mainnet); `ethers`
(keccak hashing for deterministic name derivation, reused from pool nickname); `react-router-dom`;
existing app modules — `useAddressBook` (spec 021), `useEnsReverseLookup` (`hooks/useEnsResolution.js`),
`lib/pools/nicknameWords.js`, `lib/openChallenge/codeVault.js`, notification `activityEngine`/
`wagerSource`/`drawProposalScan` (spec 031/017), `useMyPools` + `lib/lookup/myWagersAggregation.js`
(spec 037), `FriendMarketsContext` auto-refresh (spec 019)

**Storage**: Browser `localStorage` (address book, open-challenge code vault — both wallet-scoped,
at-rest encrypted) and in-memory session cache for the derived vault key. No backend; no new
persisted schema beyond what the code vault already stores.

**Testing**: Vitest (`npm run test:frontend`) — unit tests for new pure helpers + component tests
for `MyMarketsModal`, `WagerCard`, `MyPoolsSection`

**Target Platform**: Web (mobile-first PWA); My Wagers is a modal reachable from `/app`

**Project Type**: Web application — this feature touches the `frontend/` project only

**Performance Goals**: Name resolution and draw enrichment must not block card render; ENS lookups
are cached (5-min `staleTime`, 30-min `gcTime`) and fall back immediately to the generated name so no
card ever shows a spinner in place of an opponent. Auto-update cadence matches the existing 30s poll.

**Constraints**: WCAG 2.1 AA (keyboard-accessible name reveal; draw state conveyed by text + icon,
not color alone); honest state (names are display-only; draw submission state derives from real
on-chain/subgraph state; no fabricated finality); strict per-network (chainId) data isolation.

**Scale/Scope**: One modal, up to a few hundred wager cards + a handful of pools per member; two new
small modules, one new presentational component, and edits to ~6 existing files.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

- **I. Security-First Smart Contracts (NON-NEGOTIABLE)** — **N/A / Pass.** No `contracts/` changes;
  no escrow, access-control, or oracle-resolution paths are touched. Slither/Medusa scope unchanged.
- **II. Test-First & Comprehensive Coverage (NON-NEGOTIABLE)** — **Pass.** Every new pure helper
  (`deriveAddressName`, opponent resolution order, terminal-pool bucketing filter, vault
  auto-unlock decision) gets Vitest unit tests written alongside it; `MyMarketsModal`/`WagerCard`/
  `MyPoolsSection` component tests are updated for the filter, network-pill, draw, and pool-archive
  changes. No contract interface changes, so no contract-test updates required.
- **III. Honest State, No Mocks in Shipped Paths** — **Pass.** Opponent names are a display layer over
  the real on-chain address (revealable in one tap); draw submission state is derived from the indexed
  `drawProposer` and the `WagerDrawn` event, never assumed; terminal-pool bucketing uses real pool
  state. All data stays scoped to the active `chainId` (no testnet/mainnet leakage). No mock data added.
- **IV. Fail Loudly in CI** — **Pass.** No `continue-on-error` added; new tests gate the pipeline.
- **V. Accessible, Consistent Frontend** — **Pass.** The opponent-name control is a real
  `<button>`/toggle with an accessible label and copy affordance; the draw status uses text + icon and
  meets contrast; the filter `<select>` keeps its `<label>`. No hardcoded addresses/ABIs — ENS and
  address-book data come from existing hooks; network config is untouched.

**Result: PASS — no violations, Complexity Tracking not required.**

## Project Structure

### Documentation (this feature)

```text
specs/040-my-wagers-refinements/
├── plan.md              # This file (/speckit-plan output)
├── research.md          # Phase 0 output — design decisions per user story
├── data-model.md        # Phase 1 output — client-side view entities
├── quickstart.md        # Phase 1 output — validation scenarios
├── contracts/           # Phase 1 output — module/component interface contracts
│   ├── opponent-name.md
│   ├── draw-state.md
│   ├── decrypt-autounlock.md
│   └── my-wagers-ui.md
├── checklists/
│   └── requirements.md  # Created by /speckit-specify
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
frontend/src/
├── components/fairwins/
│   ├── MyMarketsModal.jsx        # EDIT: remove network pill + Disputed/Expired options;
│   │                             #        pass activeTab to MyPoolsSection; enrich markets
│   │                             #        with drawProposer for the card view model
│   ├── MyMarketsModal.css        # EDIT: drop unused .mm-network-tag rules
│   ├── wagerVm.js                # EDIT: opponent field → OpponentName; add draw submission meta
│   ├── WagerCard.jsx             # EDIT: render OpponentName; render draw state + submission chips
│   ├── WagerTable.jsx            # EDIT: same opponent/draw treatment for the table view
│   ├── MyPoolsSection.jsx        # EDIT: tab-aware — active pools in active tabs, terminal in History
│   ├── OpponentName.jsx          # NEW: presentational component — resolves + reveals opponent
│   └── wagerCardHelpers.js       # (reuse formatShortAddress; no behavior change)
├── hooks/
│   ├── useOpponentName.js        # NEW: address-book → ENS → generated resolution for one address
│   ├── useMyPools.js             # EDIT: add periodic refresh + manual refresh(), stop when unmounted
│   └── useEnsResolution.js       # (reuse useEnsReverseLookup)
├── lib/
│   ├── naming/addressName.js     # NEW: deriveAddressName(address) → deterministic two-word label
│   ├── openChallenge/codeVault.js# (reuse; add session vault-key cache helper if needed)
│   └── lookup/myWagersAggregation.js # (reuse bucket logic; align terminal-state definition)
└── test/
    ├── addressName.test.js           # NEW
    ├── useOpponentName.test.jsx       # NEW
    ├── OpponentName.test.jsx          # NEW
    ├── MyMarketsModal.test.jsx        # EDIT: filter options, no network pill, draw, pool archive
    ├── MyPoolsSection.test.jsx        # NEW/EDIT: tab-aware bucketing
    └── decryptAutoUnlock.test.js      # NEW: vault auto-decrypt vs prompt decision
```

**Structure Decision**: Single existing `frontend/` React project. New logic lands as small,
independently testable modules (`lib/naming/addressName.js`, `hooks/useOpponentName.js`,
`components/fairwins/OpponentName.jsx`) plus surgical edits to the My Wagers modal and its card/table/
pool children. No new top-level directories, no backend, no build-tooling changes.

## Complexity Tracking

> No constitution violations — this section intentionally left empty.
