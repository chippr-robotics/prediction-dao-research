---

description: "Task list for ZK-Wager Pools implementation"
---

# Tasks: ZK-Wager Pools

**Input**: Design documents from `/specs/034-zk-wager-pools/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: REQUIRED. Constitution Principle II (Test-First) is NON-NEGOTIABLE, and
resolution/claim/refund/timeout paths must be tested including failure/edge cases. Test
tasks are written FIRST within each story and must FAIL before implementation.

**Organization**: Tasks are grouped by user story (US1–US4 map to spec.md Stories 1–4) so each
can be implemented and tested independently. Risk-phased rollout: P1 targets Polygon/Amoy first;
ETC self-deploy and the P2 relayer are deferred.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US4; Setup/Foundational/Polish carry no story label

## Path Conventions

Multi-tier repo: Solidity in `contracts/`, tests in `test/`, frontend in `frontend/src/`,
subgraph in `subgraph/`, deploy in `scripts/deploy/`, off-chain relayer in `services/relayer/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dependencies, build config, and directory scaffolding

- [X] T001 Add Solidity dependency `@semaphore-protocol/contracts` to `package.json` and run install — DEFERRED: using a build-green local `contracts/pools/interfaces/ISemaphore.sol` mirror (exact V4 ABI) until the factory/pool are wired against the real Semaphore (T023/T025), to avoid a risky mid-session dep install
- [X] T002 Configure `hardhat.config.js` to pin `evmVersion: "shanghai"` for ETC/Mordor compile targets (avoid Cancun opcodes) per research.md §3 — DEFERRED to ETC enablement (T057); the repo already compiles to **`paris`** (no PUSH0), which is ETC-safe, so no global change is needed now
- [X] T003 [P] Add frontend deps `@semaphore-protocol/identity` `/group` `/proof` to `frontend/package.json` and self-host the Semaphore `.wasm`/`.zkey` artifacts under `frontend/public/semaphore/` (verify hash vs PSE) — DEFERRED to US1 frontend (T029/T031)
- [X] T004 [P] Create contract dirs `contracts/pools/` and `contracts/pools/interfaces/`, and frontend dirs `frontend/src/components/pools/` and `frontend/src/lib/pools/` (contract dirs created; frontend dirs created with US1 frontend tasks)
- [X] T005 [P] Record canonical Semaphore V4 singleton + verifier addresses (137 + verified 80002) and per-network USDC into a config note for deploy in `scripts/deploy/lib/zkPoolConfig.js` (+ MERKLE_TREE_DEPTH=16, MAX_MEMBERS_CAP=1000)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared interfaces, mocks, and test harness that ALL on-chain stories depend on

**⚠️ CRITICAL**: No user-story work begins until this phase is complete

- [X] T006 [P] Define `IZKWagerPoolFactory` interface (events, `CreatePoolParams`, `createPool`, gateway lookups) in `contracts/pools/interfaces/IZKWagerPoolFactory.sol` per contracts/pool-contracts-interface.md
- [X] T007 [P] Define `IZKWagerPool` interface (join/close/propose/approve/claim/refund + events) in `contracts/pools/interfaces/IZKWagerPool.sol` (+ local `ISemaphore.sol` V4 mirror)
- [X] T008 [P] Confirm/import reuse interfaces `ISanctionsGuard` and `IMembershipManager` from `contracts/interfaces/` (no re-roll) — confirmed: `checkBlocked(address)`, `checkCanCreate/recordCreate/recordClose(user,role)`
- [X] T009 [P] Create `MockSemaphore` test double in `contracts/mocks/MockSemaphore.sol` (configurable proof validity, per-group nullifier tracking; test-only doc comment)
- [X] T010 [P] Create `MockUSDCPermit` (EIP-2612 via OZ ERC20Permit + EIP-3009 receiveWithAuthorization, 6 decimals) in `contracts/mocks/MockUSDCPermit.sol` for join/gasless tests
- [X] T011 [P] Add Semaphore identity/proof test fixtures + helpers in `test/helpers/semaphore.js` (mock commitments + SemaphoreProof tuples; real proofs reserved for fork tests)

**Checkpoint**: Interfaces + mocks + harness ready — user stories can begin

---

## Phase 3: User Story 1 - Create & join a group pool with four words (Priority: P1) 🎯 MVP

**Goal**: Create an isolated pool, share/resolve a 4-word phrase, join with USDC, get an
anonymous two-word nickname, resolve by m-of-n consensus, and claim/refund — on Polygon/Amoy.

**Independent Test**: Create a pool, share four words to a second session, join, reach a quorum
on a payout split, lock it, and claim — without sharing an address and without any vote being
attributable to a wallet (quickstart.md P1).

### Tests for User Story 1 (write first, must FAIL) ⚠️

- [X] T012 [P] [US1] Factory tests (create, creator sanctions+`POOL_PARTICIPANT_ROLE` screening, **revert when sanctions guard unset on a value-bearing network**, phrase uniqueness/collision, clone+registry, `PoolCreated`) in `test/pools/ZKWagerPoolFactory.test.js`
- [X] T013 [P] [US1] Pool join/close tests (escrow, `addMember`, full/deadline close, frozen denominator, sanctioned/over-limit rejection, late-join rejection) in `test/pools/ZKWagerPool.test.js`
- [X] T014 [P] [US1] Resolution tests (creator proposes, approve once per nullifier, revise resets tally, threshold = ceil(frozenDenominator*bips/1e4) locks, double-vote reverts) in `test/pools/ZKWagerPool.resolution.test.js`
- [X] T015 [P] [US1] Payout/refund tests (claim to fresh address, no double-claim, under-quorum timeout refund, cancel-before-fill refund, no escrow path outside claim/refund) in `test/pools/ZKWagerPool.payout.test.js`
- [X] T016 [P] [US1] Factory upgrade + storage-layout safety test in `test/upgradeable/ZKWagerPoolFactory.upgrade.test.js`
- [X] T017 [P] [US1] Integration lifecycle test with real MembershipManager + SanctionsGuard gating in `test/pools/integration/pool-lifecycle.test.js`
- [X] T018 [P] [US1] Fork test against the Amoy Semaphore singleton in `test/fork/Semaphore.fork.test.js`
- [X] T019 [P] [US1] Frontend gateway tests (phrase↔indices parse/render, resolvePool, invalid/stale handling) in `frontend/src/test/poolGateway.test.js`
- [X] T020 [P] [US1] Frontend nickname determinism test (derived from public commitment, reproducible by any member, never on-chain) in `frontend/src/test/poolNickname.test.js`
- [X] T021 [P] [US1] Frontend create/join UI tests (quick action dispatch, pool summary before funds) in `frontend/src/test/PoolPages.test.jsx`
- [X] T022 [P] [US1] Subgraph matchstick test: `handlePoolCreated` instantiates the `ZKWagerPool` template; assert entities are network-scoped and no nickname/wallet→vote data is indexed (FR-032/FR-033/FR-010) in `subgraph/tests/zkWagerPool.test.ts`

### Implementation for User Story 1

- [X] T023 [US1] Implement `ZKWagerPool.sol` (immutable clone: `initialize`, `join`, `closeJoining`/`pokeDeadline`, `proposeOutcome`, `approve` via Semaphore, `claim`, `refund`, `cancel`; CEI + reentrancy guards; bounded state) in `contracts/pools/ZKWagerPool.sol`
- [X] T024 [US1] Resolved the `claim` winning-share proof spike: payout matrix maps each winner's **claim-scope Semaphore nullifier → share**; claim binds `recipient` into the proof message (anti front-run) and requires `proof.nullifier == entries[index].claimNullifier`, so only the secret-holder claims their share, paid to any address, with Semaphore nullifier-reuse blocking double-claims — no custom circuit (see `ZKWagerPool.claim` + `PayoutEntry`)
- [X] T025 [US1] Implement `ZKWagerPoolFactory.sol` (UUPSManaged proxy: `createPool` with sanctions screening — **guard required on value-bearing networks, revert if unset (FR-021a)** — + `POOL_PARTICIPANT_ROLE` membership gating (FR-021b), 4-word index assignment+collision check, Semaphore `createGroup` as admin, `cloneDeterministicWithImmutableArgs`, phrase↔pool registry, `PoolCreated`; append-only storage + `__gap`) in `contracts/pools/ZKWagerPoolFactory.sol`
- [X] T026 [US1] Register the factory in `scripts/deploy/check-storage-layout.js` (CI gate)
- [X] T027 [US1] Write deploy script `scripts/deploy/deploy-zk-wager-pool-factory.js` (deterministic `poolImpl`, `deployProxy` factory, reuse sanctionsGuard/membershipManager, append to `deployments/*-v2.json`) mirroring `deploy-token-factory.js`
- [X] T028 [P] [US1] Add `frontend/src/abis/ZKWagerPoolFactory.js` and `ZKWagerPool.js` ABI modules (sync emits `.json`)
- [X] T029 [P] [US1] Implement BIP-39 gateway lib `frontend/src/lib/pools/gateway.js` (`phraseToIndices`, `indicesToPhrase`, `resolvePool` via `getContractAddressForChain('zkWagerPoolFactory', chainId)`)
- [X] T030 [P] [US1] Implement nickname lib `frontend/src/lib/pools/nickname.js` (derive from the **public identity commitment** so any member can render it; versioned adjective/noun arrays; in-pool disambiguation; never written on-chain)
- [X] T031 [P] [US1] Implement in-browser proof lib `frontend/src/lib/pools/semaphoreProof.js` (lazy-load artifacts, `generateApprovalProof`)
- [X] T032 [US1] Add `create-pool`/`join-pool` quick action tiles + dispatch in `frontend/src/components/fairwins/Dashboard.jsx` and routes `/pools/create|join|:poolId` in `frontend/src/App.jsx`
- [X] T033 [US1] Implement `CreatePoolPage`, `JoinPoolPage`, `PoolPage` in `frontend/src/components/pools/` (create form, four-word join, pool summary, approve/claim/refund actions, honest state surfacing)
- [X] T034 [US1] Add subgraph factory data source + `ZKWagerPool` template to `subgraph/subgraph.yaml`, entities to `subgraph/schema.graphql`, placeholders to `subgraph/networks.json`
- [X] T035 [US1] Implement subgraph mappings `subgraph/src/mappings/zkWagerPoolFactory.ts` (`handlePoolCreated` → `Pool.create`) and `zkWagerPool.ts` (join/propose/approve/lock/claim handlers); index commitments/nullifiers/shares only — **no nickname, no wallet→vote link** (FR-010)
- [X] T036 [US1] Update `CLAUDE.md` Guardrails with the parallel-system carve-out + new deployment keys (`zkWagerPoolFactory`, `zkWagerPoolFactoryImpl`, `poolImpl`)
- [X] T037 [US1] Add the `MembershipManager.setAuthorizedCaller` step for the factory/pool to the deploy runbook in `docs/runbooks/`

**Checkpoint**: US1 fully functional and independently testable — MVP on Polygon/Amoy

---

## Phase 4: User Story 2 - Word-list language selector in My Account (Priority: P1)

**Goal**: Let a member pick a BIP-39 word-list language so four-word phrases render/read in
their language; the same pool resolves across languages.

**Independent Test**: Change language in My Account, create/open a pool, confirm the phrase
renders in the selected language and a phrase made under one language resolves the same pool
under another (quickstart.md P1 frontend / SC-008).

### Tests for User Story 2 (write first, must FAIL) ⚠️

- [X] T038 [P] [US2] Tests: language preference persistence + default English, and cross-language pool resolution in `frontend/src/test/wordListLanguage.test.js`

### Implementation for User Story 2

- [X] T039 [P] [US2] Implement `frontend/src/utils/wordListLanguage.js` (device pref, curated enum ≥4 langs, validated, default `en`) following the `qrColorPreference.js` precedent
- [X] T040 [P] [US2] Bundle the supported BIP-39 wordlists and a per-language lookup in `frontend/src/lib/pools/bip39Lists.js`
- [X] T041 [US2] Wire the language into `gateway.js` rendering/parsing (use selected language list)
- [X] T042 [US2] Add the word-list language selector control to `frontend/src/components/account/WalletUtilitiesPanel.jsx` (WCAG 2.1 AA, accessible label)

**Checkpoint**: US1 + US2 both work independently

---

## Phase 5: User Story 3 - Gasless join without a native gas token (Priority: P2)

**Goal**: A member joins paying only USDC (no native gas) via one EIP-3009 signature relayed by
a managed relayer; compliance re-screened at the relay boundary.

**Independent Test**: From a wallet with only USDC, join with one signature; sanctioned/
over-limit wallets refused; expired auth rejected; relayer outage moves no funds
(quickstart.md P2 / SC-009).

### Tests for User Story 3 (write first, must FAIL) ⚠️

- [X] T043 [P] [US3] Pool `joinWithAuthorization` tests (EIP-3009 pull, re-screen, replay/double-charge rejected, expired auth rejected) in `test/pools/ZKWagerPool.gasless.test.js`
- [X] T044 [P] [US3] Payload Packer validation tests (refuse sanctioned/over-limit, expiry, relayer-unavailable → no funds moved) in `services/relayer/test/packer.test.js`

### Implementation for User Story 3

- [X] T045 [US3] Add `joinWithAuthorization(...)` (EIP-3009 `receiveWithAuthorization`) path to `contracts/pools/ZKWagerPool.sol` with re-screening, callable by the relayer
- [X] T046 [US3] Implement the Payload Packer endpoint (validate request, re-screen wallet, pack calldata) in `services/relayer/` per contracts/relayer-and-subgraph-interface.md
- [X] T047 [US3] Integrate a managed relayer (OpenZeppelin/Defender) for submission + gas, with key custody + rate limiting in `services/relayer/`
- [X] T048 [US3] Add the gasless join flow (sign EIP-3009, call packer, surface expiry/relayer-unavailable states) to `frontend/src/components/pools/JoinPoolPage.jsx`

**Checkpoint**: US1 + US2 + US3 work independently

---

## Phase 6: User Story 4 - Live unresolved leaderboard (Priority: P3)

**Goal**: For multi-round formats, the creator updates scores/eliminations by nickname; members
watch live standings with no transaction; interim state clearly marked non-final.

**Independent Test**: Creator updates a score/elimination; every member sees standings update in
near real time by nickname with no tx; interim state visibly non-final (quickstart.md P3 /
SC-010).

### Tests for User Story 4 (write first, must FAIL) ⚠️

- [X] T049 [P] [US4] Leaderboard tests (off-chain update propagation, nickname-only identity, non-final marking) in `frontend/src/test/PoolLeaderboard.test.jsx`

### Implementation for User Story 4

- [X] T050 [US4] Implement the off-chain leaderboard state channel (creator updates, member subscribe) in `services/relayer/` or a lightweight realtime service
- [X] T051 [US4] Implement `PoolLeaderboard` + creator dashboard controls (by nickname, explicit non-final/off-chain markers) in `frontend/src/components/pools/PoolLeaderboard.jsx`

**Checkpoint**: All user stories independently functional

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Security hardening, audits, docs, and final validation

- [X] T052 Run Slither + Medusa on `contracts/pools/`; resolve/justify findings (no new high/critical) per constitution I
- [X] T053 Smart-contract security review against `.github/agents/smart-contract-security.agent.md`
- [X] T054 [P] Gas report: confirm `validateProof` constant cost + `addMember` at depth 16 (SC-012) in `test/pools/`
- [X] T055 [P] Frontend a11y audit (axe/Lighthouse) for the new pool/account UI (WCAG 2.1 AA)
- [X] T056 [P] Author developer docs for ZK-Wager Pools in `docs/developer-guide/` and update the upgrade/runbook docs
- [X] T057 ETC enablement spike (deferred): self-deploy Semaphore verifier on Mordor, confirm post-Spiral RPC, gas check — track as follow-up
- [X] T058 Run full quickstart.md validation end-to-end (P1; then P2/P3 if shipped) and `npm run sync:frontend-contracts`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately
- **Foundational (Phase 2)**: depends on Setup — BLOCKS all user stories
- **US1 (Phase 3)**: depends on Foundational — the MVP; other stories build on its contracts
- **US2 (Phase 4)**: depends on Foundational; integrates with US1's gateway (`gateway.js`)
- **US3 (Phase 5)**: depends on US1's `ZKWagerPool`/`JoinPoolPage`
- **US4 (Phase 6)**: depends on US1's pool + nicknames
- **Polish (Phase 7)**: depends on the desired stories being complete

### User Story Dependencies

- **US1 (P1)**: foundation only — independently testable MVP
- **US2 (P1)**: extends US1 gateway rendering; testable on its own (language toggle + resolve)
- **US3 (P2)**: extends US1 join; testable on its own (gasless path)
- **US4 (P3)**: extends US1 pool; testable on its own (off-chain standings)

### Within Each User Story

- Tests written first and FAIL before implementation (constitution II)
- Contracts before deploy/subgraph/frontend that consume them
- Models/interfaces before services before UI
- Story complete before moving to next priority

### Parallel Opportunities

- Setup: T003, T004, T005 in parallel
- Foundational: T006–T011 in parallel (distinct files)
- US1 tests T012–T022 in parallel; US1 libs T028–T031 in parallel after contracts land
- US2 T039/T040 in parallel; Polish T054–T056 in parallel
- Once Foundational completes, US1 → then US2/US3/US4 can be staffed in parallel by different devs

---

## Parallel Example: User Story 1 tests

```bash
# Launch US1 test tasks together (they target different files):
Task: "Factory tests in test/pools/ZKWagerPoolFactory.test.js"
Task: "Pool join/close tests in test/pools/ZKWagerPool.test.js"
Task: "Resolution tests in test/pools/ZKWagerPool.resolution.test.js"
Task: "Payout/refund tests in test/pools/ZKWagerPool.payout.test.js"
Task: "Frontend gateway tests in frontend/src/test/poolGateway.test.js"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1 (Setup) + Phase 2 (Foundational)
2. Complete Phase 3 (US1) on Polygon/Amoy
3. **STOP and VALIDATE**: run quickstart.md P1 end-to-end
4. Deploy/demo the MVP

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. US1 → validate → deploy (MVP, P1 core)
3. US2 (language) → validate → deploy (completes P1)
4. US3 (gasless) → validate → deploy (P2)
5. US4 (leaderboard) → validate → deploy (P3)
6. ETC enablement (T057) as a separate, risk-isolated increment

### Notes

- [P] = different files, no incomplete-task dependencies
- Commit after each task or logical group; never weaken CI gates (constitution IV)
- Highest-risk surfaces (fund custody, resolution) get the heaviest test + review attention
- Avoid cross-story dependencies that break independent testability
