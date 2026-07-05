# Implementation Plan: Oracle-Settled Open Challenges (Polymarket)

**Branch**: `claude/oracle-settled-challenges-p3iwl9` | **Date**: 2026-07-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/041-oracle-open-challenges/spec.md`

## Summary

Add a new **Oracle Open Challenge** section: the creator picks a live Polymarket market
through the existing `PolymarketBrowser` discovery UX, picks a side, sets an equal stake,
and posts a code-gated open challenge whose accept/settle deadlines are **derived from the
market's own schedule**. The claim-code machinery (spec 024) is reused unchanged; the
claimant view (`TakeChallengePanel`) gains a clear bet summary with Polymarket unmistakably
identified as the automatic settlement source, including live market context.

**This is a frontend-only feature — zero Solidity changes.** `WagerRegistry.createOpenWager`
already accepts and validates oracle linkage (`_checkOracleLinkage` requires a non-zero
`oracleConditionId`, a configured `polymarketAdapter`, and an *unresolved* condition —
`WagerRegistryCore.sol:217-230`), stores `creatorIsYes` + `polymarketConditionId`, and the
post-accept resolution path (`autoResolveFromPolymarket`, `WagerRegistryIntents.sol:226-245`)
is origin-independent. Even the frontend create hook (`useOpenChallengeCreate`) already
threads `oracleConditionId`/`creatorIsYes` through to the contract. What's missing is:
(1) a create UI that collects a market + side, (2) event-derived timeline computation,
(3) oracle metadata sealed into the terms bundle for the claimant, (4) the claimant-view
bet summary + Polymarket identification + live market context, (5) oracle-aware revert
translation, and (6) tests — including contract-level JS tests proving the open + Polymarket
path end-to-end (none exist today).

## Technical Context

**Language/Version**: JavaScript (ES2022), React 18 function components + hooks; Solidity
untouched (Hardhat JS tests only)

**Primary Dependencies**: React, Vite; `ethers` v6 (registry calls, keccak); existing app
modules — `useOpenChallengeCreate` / `useOpenChallengeAccept` / code vault (spec 024),
`PolymarketBrowser` + `usePolymarketSearch` (Gamma API, spec 013), `UnifiedLookupModal` /
`TakeChallengePanel` (spec 037), `DeadlineTimeline` + `wagerTimeline.js` (spec 038),
`ChainCapabilityGate` / `useChainTokens` capability gating, `wagerDefaults.js`
(`ResolutionType`, `isOracleModelExposed`, `toDateTimeLocal`)

**Storage**: No new persistence. Sealed terms envelope (IPFS, code-keyed — spec 024) gains
an optional `oracle` block; on-chain wager struct fields already exist
(`resolutionType`, `polymarketConditionId`, `creatorIsYes`)

**Testing**: Vitest (`npm run test:frontend`) for UI/hooks/pure helpers; Hardhat
(`npm test`) for new contract-level integration tests of the open + Polymarket lifecycle
(using `MockPolymarketCTF` + `PolymarketOracleAdapter` + `deployWagerRegistry` fixture)

**Target Platform**: Web (mobile-first PWA), `/app` dashboard; active only on chains with
the `polymarketSidebets` capability (Polygon mainnet, Amoy testnet today)

**Project Type**: Web application — `frontend/` plus `test/` (contract JS tests); no
`contracts/` source changes

**Performance Goals**: Discovery reuses PolymarketBrowser's existing debounced search
(325 ms) and cached feeds — default feed/search visible < 2 s typical (SC-002); claimant
view renders bound terms immediately and layers live market data in without blocking accept

**Constraints**: WCAG 2.1 AA (side picker and share tools are real buttons with labels;
oracle badge conveyed by text + icon, not color alone); honest state (bound on-chain fields
are authoritative; terms-bundle market info is cross-checked against
`wager.polymarketConditionId`; live data unavailability is disclosed, never faked); strict
per-chain gating (`polymarketSidebets`); no hardcoded addresses/ABIs (generated sync
artifacts only)

**Scale/Scope**: One new modal (create flow), one claimant-view section, ~2 new hooks/libs
(single-market fetch, timeline derivation), one shared result-panel extraction, dashboard
card wiring, ~6 new/extended frontend test files + 1 new contract test file

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

- **I. Security-First Smart Contracts (NON-NEGOTIABLE)** — **Pass (no contract changes).**
  Zero Solidity edits; Slither/Medusa scope unchanged. The feature *exercises* an existing
  oracle-resolution path, which is a highest-risk surface, so the plan adds contract-level
  JS lifecycle tests (create-open-with-Polymarket → code accept → auto-resolve win/tie →
  claim; creation reverts for resolved condition / missing adapter / zero conditionId)
  to prove the deployed logic under the new usage pattern before the UI ships it.
- **II. Test-First & Comprehensive Coverage (NON-NEGOTIABLE)** — **Pass.** New pure helpers
  (`deriveOracleChallengeTimeline`, terms-bundle oracle block build/verify) get Vitest unit
  tests written alongside; component tests for the new create modal, the claimant oracle
  summary (live, degraded, closed/resolved states), and dashboard wiring; the contract
  integration tests above cover resolution/claim/refund/timeout edges for the new path.
- **III. Honest State, No Mocks in Shipped Paths** — **Pass.** The claimant view renders
  the on-chain-bound side/condition as authoritative, cross-checks sealed market metadata
  against `wager.polymarketConditionId` (mismatch → flagged, not trusted), shows a truthful
  "live market info unavailable" state instead of stale/fake odds, and blocks accept when
  the market already shows a public outcome. Deadlines shown come from the values actually
  submitted on-chain. No mock data outside test scopes.
- **IV. Fail Loudly in CI** — **Pass.** No `continue-on-error`; all new tests gate the
  pipeline (frontend + Hardhat suites).
- **V. Accessible, Consistent Frontend** — **Pass.** Reuses the shared `fm-*` modal system,
  `PillSelect`/`InfoTip`/`DeadlineTimeline` components; side picker is a labelled button
  group (`aria-pressed`); oracle source identified by text + glyph; axe/Lighthouse audits
  unchanged in CI. Addresses/ABIs come from generated sync artifacts
  (`getContractAddressForChain`, `abis/WagerRegistry.js`).

**Result: PASS — no violations, Complexity Tracking not required.**

## Project Structure

### Documentation (this feature)

```text
specs/041-oracle-open-challenges/
├── plan.md              # This file (/speckit-plan output)
├── research.md          # Phase 0 output — decisions D1–D9
├── data-model.md        # Phase 1 output — entities & view models
├── quickstart.md        # Phase 1 output — validation scenarios
├── contracts/           # Phase 1 output — module interface contracts
│   ├── create-flow.md
│   ├── claimant-view.md
│   ├── polymarket-market-hook.md
│   └── timeline-derivation.md
├── checklists/
│   └── requirements.md  # Created by /speckit-specify (all pass)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
frontend/src/
├── components/fairwins/
│   ├── OracleOpenChallengeModal.jsx   # NEW: pick market → pick side → stake →
│   │                                  #      derived timeline → create → code result
│   ├── OracleOpenChallengeModal.css   # NEW: section-specific styles (fm-* base reused)
│   ├── ClaimCodeResultPanel.jsx       # NEW (extraction): code display + copy/QR/deep-link
│   │                                  #      + vault backup, shared with OpenChallengeModal
│   ├── OpenChallengeModal.jsx         # EDIT: use extracted ClaimCodeResultPanel (no
│   │                                  #      behavior change to the user-defined flow)
│   ├── TakeChallengePanel.jsx         # EDIT: bet summary (stake/payout) + oracle
│   │                                  #      settlement block + live market context +
│   │                                  #      closed/resolved warning-or-block
│   ├── PolymarketBrowser.jsx          # (reuse inline variant unchanged)
│   └── Dashboard.jsx                  # EDIT: new quick-action card + modal instance +
│                                      #      handleQuickAction case (capability-gated)
├── hooks/
│   ├── useOpenChallengeCreate.js      # EDIT: seal oracle block into terms payload;
│   │                                  #      oracle-aware revert translation
│   ├── useOpenChallengeAccept.js      # (reuse; lookup already returns oracle fields)
│   ├── usePolymarketMarket.js         # NEW: single market by conditionId (Gamma),
│   │                                  #      polling-free fetch + refresh, normalized shape
│   └── usePolymarketSearch.js         # EDIT: export normaliseGammaMarket for reuse
├── lib/openChallenge/
│   └── oracleTimeline.js              # NEW: deriveOracleChallengeTimeline(endDate, now)
│                                      #      → eligibility + capped accept/settle deadlines
├── constants/
│   └── quickAccessCards.js            # EDIT: add 'oracle-open-challenge' card id
└── test/
    ├── claimCode/OracleOpenChallengeModal.test.jsx  # NEW
    ├── claimCode/TakeChallengePanel.oracle.test.jsx # NEW
    ├── oracleTimeline.test.js                       # NEW (pure helper)
    ├── usePolymarketMarket.test.jsx                 # NEW
    ├── claimCode/OpenChallengeModal.test.jsx        # EXTEND (result-panel extraction intact)
    ├── useOpenChallengeAccept.test.jsx              # EXTEND (oracle fields in lookup payload)
    └── Dashboard.test.jsx                           # EXTEND (card + gating)

test/
└── integration/oracle/
    └── WagerRegistry_PolymarketOpenChallenge.test.js # NEW: open+Polymarket lifecycle
                                                      #      (no Solidity changes)
```

**Structure Decision**: Web-application layout, `frontend/` only for product code plus a
new Hardhat integration test under `test/integration/oracle/`. The create flow is a **new
modal** (not a mode inside `OpenChallengeModal`) because its form is market-driven
(picker + side + derived timeline) rather than description-driven (free text + editable
timeline); the shared claim-code result experience is extracted once into
`ClaimCodeResultPanel` and reused by both.

## Complexity Tracking

No constitution violations — table not required.
