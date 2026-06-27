# Implementation Plan: ZK-Wager Pools

**Branch**: `claude/wager-pool-group-gateway-u4g0zq` | **Date**: 2026-06-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/034-zk-wager-pools/spec.md`

## Summary

Add **group wager pools** as a parallel system to the one-to-one `WagerRegistry`: a creator
opens a pool, many members buy in with USDC, and the group resolves by **anonymous m-of-n
consensus** — while sharing nothing more than four ordinary words and never exposing which
wallet cast which vote.

Technical approach (grounded in [research.md](./research.md)): a **`ZKWagerPoolFactory`**
(`UUPSManaged` upgradeable proxy, mirroring spec 028's `TokenFactory`) clones an **immutable
`ZKWagerPool`** per group via OZ 5.4 `cloneDeterministicWithImmutableArgs` (isolated storage,
bounded state). Each pool owns one **Semaphore V4** group: joining inserts an identity
commitment; resolution counts anonymous `validateProof` approvals (`scope = proposalId`) until
a **fraction of the joined members** approve, locking the creator's proposed payout outcome;
winners then claim — proving ownership of a winning **in-pool identity** — to **any address**,
keeping anonymity through payout. Joins screen the **real wallet** via the shared
`ISanctionsGuard` (guard **required** on value-bearing networks — revert if unset) +
`IMembershipManager` under a dedicated **`POOL_PARTICIPANT_ROLE`** (full parity with wagers,
FR-021). Each pool gets a
unique **4 BIP-39 word-index** identity (language-independent; rendered via a My Account
word-list language selector) and members get client-derived **two-word nicknames** (computed
from the public identity commitment, never written on-chain). The
subgraph indexes pools dynamically via a **factory data source + `Pool` template** (spec 028
precedent). Gasless joins (P2) use **EIP-3009 `receiveWithAuthorization`** + a Payload Packer
that re-screens the wallet, plus a managed relayer (OZ/Defender). Live unresolved leaderboards
(P3) are off-chain and explicitly non-final.

**Phasing**: P1 = factory + Semaphore voting + payout/claim + 4-word gateway + nicknames +
language selector + subgraph; P2 = gasless permit/relayer; P3 = live leaderboards.
**Risk-phased rollout**: ship P1 on **Polygon/Amoy first** (canonical Semaphore, no relayer);
defer **ETC self-deployment** of Semaphore and the P2 relayer to later increments.

## Technical Context

**Language/Version**: Solidity ^0.8.23 (Semaphore V4 pragma; pin `evmVersion: "shanghai"` for
ETC builds), Hardhat; JavaScript/React 18 + Vite frontend; AssemblyScript subgraph mappings.

**Primary Dependencies**: OpenZeppelin Contracts/Upgradeable **5.4.0** (`Clones`,
`UUPSManaged` base, `SafeERC20`); **`@semaphore-protocol/contracts`** (NEW, Solidity);
**`@semaphore-protocol/identity` `/group` `/proof`** (NEW, frontend, snarkjs/wasm); The Graph
(`graph-cli`, templates). USDC (native Circle, EIP-2612 + EIP-3009). Managed relayer (OZ/
Defender) for P2. New deps justified in **Complexity Tracking**.

**Storage**: On-chain — factory is a UUPS proxy (append-only storage + `__gap`); pool clones
are immutable, bounded state (no unbounded arrays; members in the Semaphore LeanIMT, votes
nullifier-gated). Subgraph — GraphQL entities per network. Off-chain — member identity secrets
(local), device/wallet preference for word-list language; Payload Packer is stateless.

**Testing**: Hardhat unit + integration + (Semaphore singleton) fork tests under `test/`;
resolution/claim/refund/timeout failure paths required (constitution II); Slither + Medusa;
`check:storage-layout`. Vitest for frontend; matchstick for subgraph. New mocks:
`MockSemaphoreVerifier`, `MockUSDCPermit`/EIP-3009.

**Target Platform**: EVM L2s — Polygon (137), Amoy (80002); Ethereum Classic Mordor (63) / ETC
(61) via self-deployed Semaphore (deferred). Browser SPA (fairwins.app). The Graph network.

**Project Type**: Multi-tier — Solidity contracts + React frontend + subgraph + a new
off-chain relayer/packer service (P2).

**Performance Goals**: Per-proof verification cost **constant** regardless of group size
(Groth16; SC-012). Create < 60s, join < 2 min (SC-001/SC-002). In-browser proof gen ≈2–15s
(spinner). Gateway resolution is an O(1) registry lookup.

**Constraints**: Bounded on-chain state per pool (FR-002, SC-011); ~1,000-member protocol cap
(FR-002a); funds never stuck — always a refund/timeout path (FR-019, SC-007); no escrow release
except claim/refund (FR-022); compliance enforced on the real wallet before anonymization
(FR-021d); honest, network-scoped state (constitution III); WCAG 2.1 AA (constitution V);
config from sync artifacts, never hardcoded.

**Scale/Scope**: Up to ~1,000 members/pool; unbounded pools (each an isolated clone). New
contracts: `ZKWagerPoolFactory`, `ZKWagerPool`, interfaces, mocks (~4–6 Solidity files + tests).
Frontend: quick action, create/join/pool pages, gateway + nickname libs, language selector
(~8–12 files + tests). Subgraph: 1 factory data source + 1 template + mappings + schema. P2:
relayer/packer service. P3: leaderboard UI + off-chain state channel.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Assessment |
|-----------|------------|
| **I. Security-First Smart Contracts (NON-NEGOTIABLE)** | **PASS (with mandated rigor)** — This is a value-bearing escrow with two highest-risk surfaces called out by the constitution: **fund custody** and **resolution**. Design controls: CEI + reentrancy guards on `join`/`approve`/`claim`/`refund`; **no escrow release outside claim (Resolved) or refund/cancel** (FR-022); creator cannot move others' stakes (FR-020b); **funds never stuck** via the `resolutionWindow` refund path (FR-019, SC-007); idempotent claims/refunds. Anonymity primitive is the **audited Semaphore V4** (PSE), with the critical invariant that **our contract is the group admin and the only path to `addMember`** (research §1) — joins screen the real wallet first. Factory is UUPS (`UUPSManaged`, `UPGRADER_ROLE`, `__gap`, `check:storage-layout`); pool clones immutable. Targets EthTrust-SL ≥ L2; Slither + Medusa + smart-contract security agent review before merge. **The `claim` winning-share proof is an open design spike (contracts/pool-contracts-interface.md) to settle in tasks** — does not weaken the custody invariants. |
| **II. Test-First & Comprehensive Coverage (NON-NEGOTIABLE)** | **PASS** — Unit + integration tests alongside behavior; **resolution, claim, refund, and timeout paths tested including failure/edge cases** (double-vote rejected, double-claim rejected, under-quorum refund, sanctioned-wallet rejection, expired gasless auth). Fork tests against the Semaphore singleton on Amoy. Frontend Vitest (gateway parse/resolve, nickname determinism, language selector); subgraph matchstick. Contract-interface changes ship with their tests in the same PR. |
| **III. Honest State, No Mocks in Shipped Paths** | **PASS** — Real on-chain state only; mocks (`MockSemaphoreVerifier`, `MockUSDCPermit`, `MockSanctionsOracle`) live strictly under test scopes. UX surfaces truthful finality: pending resolution, join-closed, refund-eligible, and **P3 interim leaderboards explicitly marked non-final/off-chain** (FR-031). Pool data is **network-scoped** (FR-033) and never leaks across testnet/mainnet. The privacy claim is stated honestly (governance footprint hidden, not pool membership). |
| **IV. Fail Loudly in CI** | **PASS** — No `continue-on-error` on lint/test/build/security. New gates added: contract tests, `check:storage-layout` for the factory, Slither/Medusa, subgraph build, frontend a11y. Security scans fail on critical findings. |
| **V. Accessible, Consistent Frontend** | **PASS** — New UI (quick action, create/join/pool pages, language selector, leaderboard) meets WCAG 2.1 AA; axe/Lighthouse in CI; ESLint clean. Addresses/ABIs/network config come from the sync artifacts via `getContractAddressForChain` (`zkWagerPoolFactory`, `paymentToken`), never hardcoded. |

**Additional constraints check**:
- **New core technology** (Semaphore/ZK, snarkjs, a relayer service) → justified in
  **Complexity Tracking** below (constitution requires justification in plan.md).
- **Parallel-system carve-out**: CLAUDE.md currently mandates routing escrow through
  `wagerRegistry`. This feature is an intentional, documented exception (a separate group-pool
  factory) — **CLAUDE.md will be updated** to record the carve-out and the new
  `zkWagerPoolFactory`/`poolImpl` deployment keys.
- **Key management / deployments**: floppy keystore flow unchanged; new addresses recorded in
  `deployments/*-v2.json`; deploy via `scripts/deploy/lib/upgradeable.js` (proxy) +
  deterministic template deploy, mirroring `deploy-token-factory.js`.

**Result**: PASS — no unjustified violations. New-technology justifications captured in
Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/034-zk-wager-pools/
├── plan.md              # This file (/speckit-plan)
├── research.md          # Phase 0 — Semaphore/USDC/clones/relayer/subgraph/repo decisions
├── data-model.md        # Phase 1 — on-chain + Semaphore + subgraph + client entities
├── quickstart.md        # Phase 1 — runnable validation guide
├── contracts/           # Phase 1 — interface contracts
│   ├── pool-contracts-interface.md       # Factory + Pool Solidity interfaces & invariants
│   ├── relayer-and-subgraph-interface.md # Payload Packer API + subgraph manifest/template
│   └── frontend-interface.md             # Quick action, gateway, nicknames, settings, proofs
├── checklists/
│   └── requirements.md  # from /speckit-specify (+ clarify)
└── tasks.md             # Phase 2 — /speckit-tasks (NOT created here)
```

### Source Code (repository root)

```text
contracts/
├── pools/                               # NEW feature area (parallel to wagers/)
│   ├── ZKWagerPoolFactory.sol           # UUPSManaged proxy; clones pools; phrase+pool registry; PoolCreated
│   ├── ZKWagerPool.sol                  # immutable clone; join/close/propose/approve/claim/refund; escrow
│   └── interfaces/
│       ├── IZKWagerPoolFactory.sol
│       └── IZKWagerPool.sol
├── interfaces/
│   ├── ISanctionsGuard.sol              # REUSE (checkBlocked on real wallet)
│   └── IMembershipManager.sol           # REUSE (checkCanCreate/recordCreate/recordClose)
├── upgradeable/UUPSManaged.sol          # REUSE base for the factory
└── mocks/
    ├── MockSemaphoreVerifier.sol        # NEW (test-only)
    └── MockUSDCPermit.sol               # NEW (EIP-2612/3009 test-only)

test/
├── pools/
│   ├── ZKWagerPoolFactory.test.js       # create, screening, phrase uniqueness, clone+registry
│   ├── ZKWagerPool.test.js              # join/close/propose/approve/lock/claim/refund + failures
│   └── ZKWagerPool.resolution.test.js   # threshold math, double-vote, under-quorum, timeout
├── pools/integration/
│   └── pool-lifecycle.test.js           # end-to-end with membership + sanctions gating
├── upgradeable/ZKWagerPoolFactory.upgrade.test.js  # storage-layout + upgrade safety
└── fork/Semaphore.fork.test.js          # against Amoy Semaphore singleton

frontend/src/
├── components/fairwins/Dashboard.jsx    # ADD 'create-pool' quick action + dispatch
├── components/pools/                    # NEW: CreatePoolPage, JoinPoolPage, PoolPage, Leaderboard(P3)
├── components/account/WalletUtilitiesPanel.jsx  # ADD word-list language selector
├── lib/pools/
│   ├── gateway.js                       # phraseToIndices/indicesToPhrase/resolvePool (BIP-39)
│   ├── nickname.js                      # deriveNickname (versioned adjective/noun arrays)
│   └── semaphoreProof.js                # in-browser proof gen (lazy wasm/zkey)
├── utils/wordListLanguage.js            # device-pref (qrColorPreference precedent), default 'en'
├── config/contracts.js                  # ADD zkWagerPoolFactory per network (via sync)
├── abis/ZKWagerPoolFactory.js + Pool    # ADD (sync emits .json for subgraph)
└── App.jsx                              # ADD /pools/create, /pools/join, /pools/:poolId routes

subgraph/
├── subgraph.yaml                        # ADD ZKWagerPoolFactory data source + ZKWagerPool template
├── networks.json                        # ADD factory address/startBlock per net
├── schema.graphql                       # ADD Pool/Join/Proposal/VoteEvent/Payout entities
└── src/mappings/{zkWagerPoolFactory,zkWagerPool}.ts   # NEW handlers

scripts/deploy/
└── deploy-zk-wager-pool-factory.js      # NEW (mirrors deploy-token-factory.js; appends to deployments)

services/relayer/ (P2)                   # NEW off-chain Payload Packer + relayer integration
deployments/*-v2.json                    # ADD zkWagerPoolFactory + ...Impl + poolImpl
CLAUDE.md                                # UPDATE: parallel-system carve-out + new deployment keys
```

**Structure Decision**: A new `contracts/pools/` area (parallel to `contracts/wagers/`),
reusing `UUPSManaged`, `ISanctionsGuard`, and `IMembershipManager`. The factory is the only
upgradeable piece; pools are immutable clones. Frontend adds a `components/pools/` area + small
`lib/pools/` utilities and an Account settings control, all resolving config through the
existing sync artifacts. Subgraph extends the proven `TokenFactory`/`TokenInstance` template
pattern. The P2 relayer/packer is a separate off-chain service. This maximizes reuse of
established repo patterns and isolates the genuinely new surface (Semaphore + clones).

## Complexity Tracking

> Constitution requires justifying new core technologies and any deviations.

| Item (new tech / deviation) | Why Needed | Simpler Alternative Rejected Because |
|------------------------------|------------|-------------------------------------|
| **Semaphore V4 + snarkjs (ZK)** | The headline requirement — anonymous membership + one-vote-per-member resolution unlinkable to wallets (FR-010/FR-013/FR-015) — has no non-ZK equivalent. | A plain on-chain tally would link votes to wallets, defeating the feature. Rolling our own ZK scheme adds a trusted-setup/audit burden with no benefit over the audited PSE Semaphore. |
| **ERC-1167 clones per pool** | Isolated per-pool storage and bounded on-chain state at scale (FR-002, SC-011); each group is sandboxed. | A single monolithic contract holding all pools' state grows unboundedly and couples pools — exactly what the spec rejects. Repo precedent (`TokenFactory`) already uses this pattern. |
| **EIP-3009 + relayer service (P2)** | Gasless join so members never hold a native gas token ("Web2 friction" — FR-025). | ERC-2771/4337 are heavier for a single funded join; making users acquire gas defeats the goal. P2 is isolated and deferrable. |
| **Parallel system to WagerRegistry (CLAUDE.md carve-out)** | The isolated-clone + Semaphore architecture is fundamentally different from the monolithic UUPS `WagerRegistry`; folding it in would fight both designs (spec Assumptions). | Extending `WagerRegistry` would bloat the highest-value contract and break its bounded-storage model. Carve-out is documented; shared interfaces preserve future convergence. |
| **New off-chain relayer/packer service (P2)** | Gas abstraction + compliance re-screening at the relay boundary (FR-021d, FR-028). | No in-repo equivalent exists; a managed relayer (OZ/Defender) avoids operating bespoke infra. Deferred to P2. |

*Note*: ETC self-deployment of Semaphore is **feasible** (research §3: Atlantis precompiles +
Spiral PUSH0) but **deferred** behind a Polygon/Amoy-first rollout to contain risk — not a
constitution deviation, a sequencing decision.
