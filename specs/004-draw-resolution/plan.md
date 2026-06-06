# Implementation Plan: Draw Resolution (Both Stakes Returned)

**Branch**: `004-draw-resolution` | **Date**: 2026-06-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-draw-resolution/spec.md`

## Summary

Add an explicit **Draw** outcome to the wager lifecycle: a fully-funded (`Active`) wager can be settled so that **each party recovers their own original stake** and no winner is paid. Three resolution paths:

1. **Mutual-consent draw** for participant-resolved wagers (`Either` / `Creator` / `Opponent`): both participants must agree (one calls `declareDraw`, the other confirms) before stakes are returned.
2. **Arbitrator-solo draw** for `ThirdParty` wagers: the arbitrator settles a draw alone.
3. **Polymarket auto-draw on tie**: when a linked Polymarket market resolves as a tie (equal/zero payout numerators — a 50/50 or "invalid"/disputed market), the resolve call settles a draw immediately instead of leaving the wager stuck until its deadline.

A draw is recorded as a new terminal `Status.Draw`, distinct from `Resolved` (winner declared) and `Refunded` (deadline timeout). Funds are returned via push transfer (same shape as the existing `claimRefund` both-stakes path), so a draw is a single settling action with no separate claim.

**Technical approach**: `WagerRegistry` is **not upgradeable** (a deliberate security property for a fund-custody contract), so this ships as a versioned **WagerRegistry v3** redeploy — the same pattern used for v1→v2. Crucially, the Polymarket tie can be detected from the **existing** `IOracleAdapter` surface (`isConditionResolved() == true` while `getOutcome()` returns `resolvedAt == 0` uniquely means "resolved tie"), so **no oracle adapter redeploy is required** — only the registry changes. The change is feasible now with minimal migration risk because the mainnet registry is currently **paused for testing** (per `deployments/polygon-chain137-v2.json` ops notes), so there is little-to-no live wager state to migrate.

## Technical Context

**Language/Version**: Solidity `^0.8.24` (contracts); JavaScript/JSX + React 18 + Vite (frontend); AssemblyScript (subgraph mappings).

**Primary Dependencies**: Hardhat, OpenZeppelin Contracts (`AccessControl`, `ReentrancyGuard`, `Pausable`, `SafeERC20`, `EnumerableSet`); ethers v6 (frontend writes); The Graph (`graph-cli`/`graph-ts`).

**Storage**: On-chain contract storage (Polygon mainnet chainId 137, Amoy testnet 80002). New per-wager draw-consent state held in a side mapping to keep the public `Wager` struct ABI-stable.

**Testing**: Hardhat (`test/*.test.js` unit, `test/integration/` integration, `test/fork/` & `test/oracles/` oracle/fork); Vitest (frontend); Slither + Medusa (security); axe/Lighthouse (a11y in CI).

**Target Platform**: EVM (Polygon); web app at fairwins.app.

**Project Type**: Web3 monorepo — Solidity contracts + React/Vite frontend + The Graph subgraph.

**Performance Goals**: Draw settlement in a single transaction; gas comparable to `claimRefund` (two ERC20 transfers + status write). No new external calls beyond the two read views the registry already makes to the Polymarket adapter.

**Constraints**: Checks-effects-interactions and reentrancy-safe (handles user funds); no value created/lost/stranded on a draw (Σ returned == Σ escrowed); UX must not imply a finality the chain has not reached; addresses/ABIs consumed by the frontend come only from generated sync artifacts; WCAG 2.1 AA for new UI; CI fails loudly.

**Scale/Scope**: Small per-feature footprint but cross-cutting: 1 core contract (v3 redeploy), 1 interface, frontend resolution modal + status display + ABI, subgraph schema + one handler, contract/frontend/fork tests, deploy + sync scripts, security review. Live deployments: Polygon mainnet + Amoy; legacy networks read-only.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### I. Security-First Smart Contracts (NON-NEGOTIABLE) — **PASS, highest-risk surface**

This change touches the two highest-risk surfaces named in the constitution: **fund custody** (returning escrowed stakes) and **oracle resolution** (Polymarket tie). Explicit reasoning:

- **Checks-effects-interactions / reentrancy**: `_settleDraw` sets `status = Draw` and clears draw-consent **before** any token transfer; entry points carry `nonReentrant`. Mirrors the audited `claimRefund` ordering. Tokens are allowlisted (USDC/WMATIC) so no untrusted transfer hooks.
- **Access control / fund-movement authority**: a draw moves both parties' funds, so it requires **both** participants' consent for `Either`/`Creator`/`Opponent` (a single party can never unilaterally force a refund-via-draw), the designated `arbitrator` for `ThirdParty`, and **only the oracle tie result** for oracle types (no human override; FR-008c). Frozen accounts cannot drive a draw (`notFrozen`), matching `declareWinner`.
- **No value created/lost**: a draw returns exactly `creatorStake` to creator and `opponentStake` to opponent; Σ == escrowed. Covered by tests across equal and unequal stakes (FR-002/003/004, SC-001/004).
- **EthTrust-SL**: target ≥ L2 as today; the change adds no new external integration (reuses existing `IOracleAdapter` reads) and no new trust assumption.
- **Static/fuzz analysis + review**: Slither (0 new high/critical) and Medusa fuzzing on the new settlement/consent paths; smart-contract security agent review before merge.

### II. Test-First and Comprehensive Coverage (NON-NEGOTIABLE) — **PASS**

Resolution/claim/refund paths and their failure/edge cases are explicitly tested (see [quickstart.md](./quickstart.md)): unit tests for mutual consent, arbitrator-solo, oracle-type rejection, double-settle/post-draw rejection, pending-proposal-does-not-lock, revoke, equal/unequal stakes; integration/fork tests for Polymarket tie → auto-draw and decisive → unchanged win. The contract-interface change updates `IWagerRegistry`, the contract tests, and the frontend ABI in the same PR. Frontend Vitest covers draw-option visibility/authorization and status display. Full suite green locally + CI before merge.

### III. Honest State, No Mocks or Placeholders — **PASS**

`Draw` is real, distinct on-chain state; the UI surfaces "Draw — stakes returned" truthfully and never conflates it with a timeout `Refunded` or a winner `Resolved`. A pending (one-sided) draw proposal is shown as *pending*, not final (FR-008b). No mocks in shipped paths; mocks remain test-only. State stays network-scoped.

### IV. Fail Loudly in CI — **PASS**

No `continue-on-error` added to lint/test/build/security. New contract tests, frontend tests, and Slither gating run in CI and block on failure.

### V. Accessible, Consistent Frontend — **PASS**

The new "Draw" control and status badge meet WCAG 2.1 AA (labeled, keyboard-reachable, not color-only — distinct text "Draw"); ESLint clean. The new v3 address + regenerated ABI come from the sync artifacts (`npm run sync:frontend-contracts`), never hand-copied.

### Additional Constraints — **PASS**

Tech stack unchanged (no new core technology). Deployer/admin uses the air-gapped floppy keystore flow for the v3 deploy; no secrets committed. `contracts-archive/` untouched. `deployments/` artifacts are updated as the source of truth for the new v3 address.

**Result**: No constitution violations. One complexity item (non-upgradeable v3 redeploy) is justified in Complexity Tracking — it is the *secure* choice, not added complexity.

## Project Structure

### Documentation (this feature)

```text
specs/004-draw-resolution/
├── plan.md              # This file (/speckit-plan)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (state model: Status.Draw, consent, events)
├── quickstart.md        # Phase 1 output (validation scenarios)
├── contracts/           # Phase 1 output (on-chain ABI delta, UI contract, subgraph delta)
│   ├── wager-registry-draw.md
│   ├── frontend-ui-contract.md
│   └── subgraph-contract.md
├── checklists/
│   └── requirements.md  # from /speckit-specify
└── tasks.md             # /speckit-tasks (NOT created here)
```

### Source Code (repository root)

```text
contracts/
├── interfaces/
│   └── IWagerRegistry.sol         # + Status.Draw (append, value 6); + WagerDrawn / DrawProposed / DrawRevoked events; + declareDraw / revokeDraw fns
└── wagers/
    └── WagerRegistry.sol          # v3: declareDraw, revokeDraw, _settleDraw; _drawConsent mapping; autoResolveFromPolymarket tie→draw branch; new errors

test/
├── WagerRegistry.draw.test.js     # NEW unit suite: mutual consent, arbitrator-solo, eligibility, finality, equal/unequal stakes, revoke, frozen
├── WagerRegistry.test.js          # update Status enum fixture (add Draw)
└── integration/oracle/
    └── WagerRegistry_Polymarket.test.js   # tie now → Status.Draw via auto-draw (update assertion); decisive unchanged; unresolved still reverts

frontend/src/
├── constants/wagerDefaults.js     # + WagerStatus.DRAW; + DRAW in TERMINAL_STATUSES; on-chain Status 6 → 'draw'
├── abis/WagerRegistry.js          # regenerated ABI (declareDraw, revokeDraw, WagerDrawn, ...) via sync
├── config/contracts.js            # v3 wagerRegistry address per chain (via sync)
├── components/fairwins/
│   └── MyMarketsModal.jsx         # ResolutionModal: Draw option + propose/confirm UX; getStatusLabel/getStatusClass/terminal-status + Draw; declareDraw write
└── test/
    └── MyMarketsModal.test.jsx    # + draw option visibility/auth + propose/confirm + status display

subgraph/
├── schema.graphql                 # + draw to WagerStatus enum; Wager.drawnAt / isDraw (verify WagerRegistry is the indexed source first)
├── subgraph.yaml                  # + WagerDrawn handler (if registry indexed)
└── src/mappings/*.ts              # + handleWagerDrawn; add 'draw' to status array

scripts/
├── deploy/deploy.js               # v3 salt suffix for WagerRegistry; rewire (re-uses existing adapter; setPolymarketAdapter unchanged)
└── utils/sync-frontend-contracts.js  # used to regenerate frontend addresses (no change expected)

deployments/
├── amoy-chain80002-v3.json        # NEW v3 record (Amoy first)
└── polygon-chain137-v3.json       # NEW v3 record (mainnet — gated, explicit confirmation; system currently paused)
```

**Structure Decision**: Existing Web3 monorepo layout. The feature is additive: a versioned **v3** `WagerRegistry` (interface + implementation), frontend resolution/status/ABI changes, an optional subgraph handler, and tests. The Polymarket adapter and all other contracts are **unchanged**. The legacy v2 registry remains read-only for any pre-existing wagers; v3 becomes the canonical registry the frontend points to.

## Complexity Tracking

| Violation / Cost | Why Needed | Simpler Alternative Rejected Because |
|------------------|-----------|--------------------------------------|
| New **v3 redeploy** of the (live, non-upgradeable) `WagerRegistry` instead of an in-place edit | A new terminal `Status` value and new settlement functions cannot be added to an already-deployed immutable contract | Making `WagerRegistry` upgradeable (proxy) was rejected: introducing an admin-controlled upgrade path to a live **fund-custody** contract is a *larger* attack surface and trust assumption than a clean versioned redeploy. Immutability is a deliberate security property; v1→v2 set the precedent. Migration risk is minimal now because the mainnet registry is **paused/in-testing** with little live state. |
| Coordinated change across contract + frontend + ABI + (optional) subgraph in one feature | A draw is meaningless unless funds move on-chain **and** users can trigger/see it honestly (Constitution III & V) | A contract-only change would ship a capability with no honest user surface; a frontend-only change would be a mock/placeholder (forbidden by Constitution III). The cross-layer scope is inherent, not gold-plating. |
