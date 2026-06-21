# FairWins / Prediction DAO — Agent Guide

FairWins is a peer-to-peer wager management layer: smart contracts that escrow
stakes and resolve wagers from external oracles (Polymarket, Chainlink, UMA),
plus a React frontend and a subgraph for indexing.

## Spec-driven development (Spec Kit)

This repo uses [Spec Kit](https://github.com/github/spec-kit) to add features in a
repeatable way. Use the `speckit-*` skills:

1. `/speckit-constitution` — review/update the project standards
2. `/speckit-specify` — capture *what* and *why* (no tech choices yet)
3. `/speckit-clarify` — de-risk ambiguities (optional, before planning)
4. `/speckit-plan` — design the implementation against the chosen stack
5. `/speckit-tasks` — break the plan into ordered, actionable tasks
6. `/speckit-analyze` — cross-check spec/plan/tasks consistency (optional)
7. `/speckit-implement` — execute the tasks

The binding standards live in `.specify/memory/constitution.md`. Every plan must
pass a constitution check; read it before planning or implementing. Per-feature
artifacts live under `specs/<feature>/`.

## Repository map

- `contracts/` — active Solidity (wagers, oracles, access, privacy). `mocks/` is
  test-only. `contracts-archive/` is reference-only; never import or deploy it.
- `test/` — Hardhat tests: unit (`*.test.js`), `integration/`, `fork/`, `oracles/`.
- `frontend/` — React + Vite app, tested with Vitest.
- `subgraph/` — The Graph indexing.
- `scripts/` — deploy, ops, and frontend-contract sync utilities.
- `deployments/` — recorded on-chain addresses (source of truth).

## Common commands

- `npm run compile` / `npm test` — compile and run the contract suite
- `npm run test:fork` / `npm run test:coverage` — fork tests / coverage
- `npm run test:frontend` — frontend tests
- `npm run frontend` — run the frontend dev server
- `npm run sync:frontend-contracts` — regenerate frontend contract artifacts

## Guardrails

- Security-first: contract changes follow checks-effects-interactions, pass
  Slither/Medusa, and get a security review (`.github/agents/`).
- Never commit secrets or private keys; admin keys use the floppy keystore flow.
- CI fails loudly — don't add `continue-on-error` to lint/test/build/security.
- **Upgradeable contracts (UUPS, spec 025):** `WagerRegistry` (and, going forward,
  other value-bearing contracts like `MembershipManager`) is a **UUPS proxy at a
  stable address** — logic is swappable, state is preserved. New upgradeable
  contracts MUST inherit `contracts/upgradeable/UUPSManaged.sol` (do not re-roll
  the proxy/auth wiring), replace the constructor with a one-time `initialize`
  (move any inline state initializers into it), and keep storage **append-only**
  with a trailing `__gap` (never insert/reorder/remove existing state). Run
  `npm run check:storage-layout` (gating in CI) before any upgrade; ship logic
  changes as in-place upgrades (`scripts/deploy/lib/upgradeable.js`), never a
  fresh redeploy. `deployments/` records the proxy (`wagerRegistry`) and the
  current implementation (`wagerRegistryImpl`). See
  `docs/developer-guide/upgradeable-contracts.md` and
  `docs/runbooks/contract-upgrades.md`.
- **Active wager contract is `wagerRegistry` (v2 `WagerRegistry` ABI/events:
  `WagerCreated`/`WagerAccepted`/`PayoutClaimed`/`WagerRefunded`/`WagerCancelled`/
  `WagerDrawn`).** The v1 `FriendGroupMarketFactory` (events `MarketCreatedPending`/
  `ParticipantAccepted`/`WinningsClaimed`/`StakeRefunded`) is **legacy** — no live
  network configures its address. New/active code MUST resolve the escrow via
  `getContractAddressForChain('wagerRegistry', chainId)` and read `WagerRegistry`
  events; do not depend on `friendGroupMarketFactory` except as an explicit
  legacy fallback.

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
at specs/026-membership-vouchers/plan.md
<!-- SPECKIT END -->
