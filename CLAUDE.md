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
- **Upgradeable contracts (UUPS, specs 025 + 027):** both `WagerRegistry` (spec 025)
  and `MembershipManager` (spec 027) are **UUPS proxies at stable addresses** — logic
  is swappable, state is preserved. New upgradeable
  contracts MUST inherit `contracts/upgradeable/UUPSManaged.sol` (do not re-roll
  the proxy/auth wiring), replace the constructor with a one-time `initialize`
  (move any inline state initializers into it), and keep storage **append-only**
  with a trailing `__gap` (never insert/reorder/remove existing state). Run
  `npm run check:storage-layout` (gating in CI) before any upgrade; ship logic
  changes as in-place upgrades (`scripts/deploy/lib/upgradeable.js`), never a
  fresh redeploy. `deployments/` records each proxy (`wagerRegistry`,
  `membershipManager`) and its current implementation (`wagerRegistryImpl`,
  `membershipManagerImpl`). Spec 026's voucher redemption ships as the first
  in-place upgrade of the `membershipManager` proxy. See
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
- **Gasless intents (specs 035 + 036).** The wager registry is TWO facets behind one proxy:
  `WagerRegistry` (main impl) delegatecalls unknown selectors to `WagerRegistryIntents`
  (the `…WithSig`/`…WithAuthorization` twins + relocated `batchExpireOpen`/`autoResolveFrom*`)
  because the main impl sits against the 24 KB code limit. BOTH facets MUST inherit
  `WagerRegistryCore` — the single storage-layout definition; never declare registry state
  anywhere else — and `check:storage-layout` validates the pair. In tests use
  `test/helpers/proxy.js#deployWagerRegistry` (deploys + wires both facets, returns a merged-ABI
  contract). The EIP-712 intent structs exist in THREE places that must stay byte-identical:
  the contract typehashes, `frontend/src/lib/relay/intentTypes.js`, and
  `services/relay-gateway/src/intent/intentTypes.js`. The relayer (spec 036:
  `services/relay-gateway` policy gateway + `services/oz-relayer` engine config) is optional
  infrastructure — every gasless flow keeps a self-submit fallback (never-stranded rule).
  See `docs/developer-guide/gasless-intents.md` + `docs/runbooks/relayer-operations.md`.
- **Wager Pools (spec 034) are a documented exception to the "route escrow
  through `wagerRegistry`" rule.** Group wager pools are a **parallel system**: the
  `WagerPoolFactory` (UUPS proxy, deployment keys `wagerPoolFactory` /
  `wagerPoolFactoryImpl` / `poolImpl`) clones **immutable** `WagerPool`
  instances (ERC-1167). There is **no Semaphore / anonymity** — membership,
  voting, and claims are by **public wallet address** (the winner's address IS the
  claim code). Pools escrow USDC and resolve by a creator-proposed **payout matrix
  keyed by winner address** that members approve to a fraction-of-joined threshold
  — **not** via `wagerRegistry` or oracle adapters. Timing mirrors `WagerRegistry`
  so pools look/feel identical: two absolute deadlines, `acceptDeadline` +
  `resolveDeadline`, bounded/ordered by the factory (`_checkDeadlines`). They reuse
  the shared `ISanctionsGuard` + `IMembershipManager` (role `POOL_PARTICIPANT_ROLE`)
  on the real wallet (FR-021). Relayer-ready: every actor action has an EIP-712
  `…WithSig` twin (via `contracts/upgradeable/SignerIntentBase.sol`) and join is
  relayable via `joinWithAuthorization` (EIP-3009), baked into the immutable clone
  template. Resolve the factory via
  `getContractAddressForChain('wagerPoolFactory', chainId)`. Two-word nicknames are
  **client-side only, never on-chain**. Launch targets **Mordor (ETC testnet) → Polygon**
  (removing Semaphore unblocks ETC/Mordor; no Amoy in the sequence). See `specs/034-zk-wager-pools/`.

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
at specs/049-multisig-policy-engine/plan.md
<!-- SPECKIT END -->
