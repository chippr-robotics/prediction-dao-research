# ZK-Wager Pools — Implementation Notes (remaining-task resolutions)

How the remaining spec-034 tasks were completed, including constraint-driven reframings. Honest record:
where a task was satisfied by reframe/CI/deferral rather than net-new code, it says so.

## No-backend reframe (US3 + leaderboard sync) — T044/T046/T047/T050

The standing **no-backend footprint** directive (FairWins ships only SPA+nginx, contracts, IPFS, edge,
logging — no app backend) overrides the spec's "Payload Packer service" + relayer service and the
off-chain leaderboard channel as originally written. Resolution:

- **Gasless join** is **client-side + a third-party relayer**, no FairWins server:
  - On-chain anchor: `ZKWagerPool.joinWithAuthorization` (EIP-3009), tested (T043).
  - Client signs the EIP-3009 authorization in `frontend/src/lib/pools/gasless.js`
    (`signReceiveAuthorization`); a **pluggable third-party relayer** (Gelato/Biconomy/OZ Defender, or
    the user's own) submits and pays gas (`relayGaslessJoin`). The signed authorization binds
    amount+recipient and is token-replay-protected, so the relayer is untrusted. **T046/T047 reframed**:
    no "Payload Packer" or relayer service is operated by FairWins. **T044**: client-side signing +
    relay-gating tests (`frontend/src/test/poolGasless.test.js`).
  - **T048**: gasless is config-gated — when a relayer is wired (env), the join flow uses it; otherwise
    members join normally (paying gas). Gasless is purely additive; the signing mechanism is implemented
    and tested.
- **Leaderboard sync (T050)** is **creator-local**, surfaced as explicitly non-final/off-chain
  (`PoolLeaderboard`, FR-031). Real-time cross-member sync, if desired, rides an optional **third-party
  realtime service** (no FairWins backend) — not built; documented as the no-backend-compatible path.

## ETC/Mordor enablement spike — T057 (folds in T001/T002)

Self-deploying Semaphore on Ethereum Classic is **feasible** (research.md §3: Atlantis bn128 precompiles
+ Spiral PUSH0). Steps (deferred increment):
1. **T001**: add `@semaphore-protocol/contracts` (Solidity) — only needed to compile Semaphore + its
   Groth16 verifier for self-deploy (Amoy/Polygon use the canonical singleton, so this is ETC-only).
2. **T002**: pin `evmVersion: "shanghai"` for the ETC compile profile. NOTE the repo already targets
   **paris** (no PUSH0 emitted), which is ETC-safe; shanghai is only needed if Semaphore's `solc`
   default pulls a post-paris opcode. Verify before the ETC build.
3. Deploy `SemaphoreVerifier` + `Semaphore` on Mordor/ETC; record the address; set
   `ZKPOOL_SEMAPHORE_<chainId>`; run `deploy-zk-wager-pool-factory.js`.
4. Confirm target RPC nodes are post-Spiral. The PSE trusted-setup artifacts are chain-agnostic.

## Security — T052 (Slither/Medusa) / T053 (review)

- **Slither** runs as a **gating CI check** ("Slither Static Analysis") over `contracts/` (the pool
  contracts are in scope); it passes on this branch. Local run is unavailable on this host (security
  tooling lives in the CI env / a venv).
- **Medusa** fuzzing runs in the CI/security env; add pool invariants to the fuzz suite before mainnet.
- **T053**: the contracts target EthTrust-SL ≥ L2 — CEI + reentrancy guards on all value paths, the
  no-escrow-exit-outside-claim/refund invariant, the our-contract-is-group-admin invariant, audited
  Semaphore V4. A formal smart-contract security review (`.github/agents/smart-contract-security`)
  **MUST** run before any mainnet (137) deploy; flagged in the deploy runbook.

## Gas — T054

Unit gas (Hardhat gas reporter, against MockSemaphore): `createPool` ≈432k, `join` ≈155k avg,
`approve` ≈102k, `claim` ≈102k, `refund` ≈73k, `closeJoining` ≈79k, `proposeOutcome` ≈53k. Real Groth16
`validateProof` cost is **constant** regardless of group size (Semaphore property, research.md §2) and is
confirmed against the real singleton via the Amoy fork test (T018) when a fork RPC is configured.

## Accessibility — T055

WCAG 2.1 AA axe checks cover the pool UI: `frontend/src/test/pools.axe.test.jsx` (CreatePool, JoinPool,
PoolPage, leaderboard, language selector) — no violations. CI Lighthouse + axe gates pass.

## Quickstart validation — T058

Verified locally on this branch: `npx hardhat compile` (OK), 38 pool contract tests pass (unit +
integration + gasless; fork skips without RPC), `graph codegen` + `graph build` green, 48 frontend pool
tests pass, `vite build` green (with the local `.env` `VITE_PINATA_JWT` unset — a known local-only
guard; CI is clean). Matchstick (T022) is Docker-gated on this host and runs in CI.

## Actual on-chain deployment (ops, post-merge)

Not a tasks.md code task. Sequence: adversarial pre-deploy audit → Amoy (`deploy-zk-wager-pool-factory.js`)
→ validate end-to-end → `sync:frontend-contracts` + add the factory address/startBlock to
`subgraph/networks.json` + publish the subgraph → Polygon mainnet (pause for explicit go; real POL;
requires the formal security review) → Mordor/ETC (self-deploy Semaphore first, T057).
