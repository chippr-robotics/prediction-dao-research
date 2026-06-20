---
description: "Task breakdown for Upgradeable WagerRegistry (Separate State from Logic)"
---

# Tasks: Upgradeable WagerRegistry (Separate State from Logic)

**Input**: Design documents from `/specs/025-upgradeable-registry/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: REQUIRED. Constitution Principle II is NON-NEGOTIABLE, and this is the highest-risk surface in the
repo (it governs replacement of fund-custody code) — contract tests are written **before** the code and must
fail first. The **entire existing `WagerRegistry` suite must also pass unchanged** against the proxied
contract (the behavior-neutrality gate, FR-003/SC-003).

**Documentation**: Per the requester, documentation is a **first-class** deliverable — Phase 6 is a dedicated
documentation phase (runbook, ADR, developer guide, system-overview, deploy README, root README, CLAUDE.md),
not an afterthought.

**Reusability (PR #724)**: The upgrade primitives are built generically so `MembershipManager` (sibling spec)
and the voucher feature reuse them. The reusable layer (Phase 2 + the developer guide T022) MUST NOT be
WagerRegistry-coupled.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 (setup, foundational, documentation, polish, deployment carry no story label)
- Exact file paths are included in every task.

## Path Conventions

Web3 monorepo (per plan.md): Solidity in `contracts/`, Hardhat tests in `test/`, deploy/CI tooling in
`scripts/` + `.github/workflows/`, docs in `docs/`, React app in `frontend/`, indexer in `subgraph/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Pull in the upgradeable toolchain. No behavior change.

- [X] T001 Add the upgradeable dependencies to `package.json`: `@openzeppelin/contracts-upgradeable` and
  `@openzeppelin/hardhat-upgrades`; run `npm install` and commit the lockfile. (plan.md Technical Context /
  new-dep justification) — **Done**: pinned BOTH `@openzeppelin/contracts` and
  `@openzeppelin/contracts-upgradeable` to **exactly `5.4.0`** (a loose `^5.4.0` resolved to 5.6.1, which
  bumped the main contracts package AND dropped `ReentrancyGuardUpgradeable`); added
  `@openzeppelin/hardhat-upgrades@^3.9.0`.
- [X] T002 [P] Wire the plugin and script: added `require("@openzeppelin/hardhat-upgrades");` to
  `hardhat.config.js` (composes with the floppy-keystore loader + `hardhat-toolbox`) and added
  `"check:storage-layout": "hardhat run scripts/deploy/check-storage-layout.js"` to `package.json`. Baseline
  `npx hardhat compile` is green (evm target: paris → persistent `ReentrancyGuardUpgradeable` is correct).

**Checkpoint**: `npm run compile` succeeds with the upgradeable toolchain available.

---

## Phase 2: Foundational (Blocking Prerequisites) — the reusable upgrade primitives

**Purpose**: The contract-agnostic machinery every upgradeable contract reuses (the PR #724 deliverable),
required by all three user stories.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete. These artifacts MUST stay generic
(contract name is a parameter) so the membership sibling spec adopts them by inheritance + one registry entry.

- [X] T003 [P] Base tests in `test/upgradeable/UUPSManaged.test.js`: UPGRADER_ROLE-gated upgrade,
  `_disableInitializers` on a bare impl, re-init rejection, non-brickable upgrade path, append-only
  state-preserving upgrade. **Done** — 6 passing (uses a `UUPSManagedHarness`/`V2` mock pair).
- [X] T004 Implement `contracts/upgradeable/UUPSManaged.sol`: abstract
  `Initializable + UUPSUpgradeable + AccessControlUpgradeable`; `UPGRADER_ROLE`; `constructor(){ _disableInitializers(); }`
  (annotated `@custom:oz-upgrades-unsafe-allow constructor`); `__UUPSManaged_init(admin)`;
  `_authorizeUpgrade onlyRole(UPGRADER_ROLE)`; `uint256[50] __gap`. **Done** — makes T003 pass.
- [X] T005 [P] Implement the generic storage-layout gate `scripts/deploy/check-storage-layout.js` (OZ
  `validateImplementation` first deploy / `validateUpgrade` thereafter, driven by a small upgradeable-contract
  registry list) and wire it as a **gating** step (no `continue-on-error`) into
  `.github/workflows/test.yml`. (contracts/deploy-upgrade-tooling.md; FR-010/SC-005, Principle IV)
- [X] T006 Implement the generic deploy/upgrade tooling `scripts/deploy/lib/upgradeable.js`:
  `deployProxy(hre,{name,initArgs,deploymentsKey})` (validate → deploy impl → `ERC1967Proxy(impl, initialize)`
  via the floppy signer → record `{key:proxy, key+"Impl":impl}` in `deployments/`) and
  `upgradeProxy(hre,{name,proxyAddress,deploymentsKey})` (validateUpgrade → deploy impl → `upgradeToAndCall`
  via the floppy signer → update `key+"Impl"`). Contract-agnostic. (contracts/deploy-upgrade-tooling.md;
  FR-014)

**Checkpoint**: `npm test -- --grep "UUPSManaged"` is green; `npm run check:storage-layout` runs. The reusable
primitives exist and are not WagerRegistry-coupled.

---

## Phase 3: User Story 1 - Stand up the registry at an upgrade-capable address with zero behavior change (Priority: P1) 🎯 MVP

**Goal**: Deploy `WagerRegistry` behind a UUPS proxy running the **current** logic. Every existing wager flow
behaves identically; funds are fully accounted for; the frontend/subgraph talk to the stable proxy address.

**Independent Test**: Deploy the proxy with current logic to a test network, run the full existing wager
lifecycle (create→accept→resolve→claim + cancel/decline/draw/refund), and confirm identical outcomes to the
non-upgradeable registry plus correct fund accounting. (spec US1 Independent Test)

### Tests for User Story 1 (write first, must fail) ⚠️

- [X] T007 [P] [US1] Added `test/helpers/proxy.js` (`deployWagerRegistry(initArgs)` — manual impl +
  `ERC1967Proxy` + `initialize`) and routed all 11 existing WagerRegistry-deploying test files through it
  (3 unit, 8 integration/oracle). Also fixed the Medusa harness `contracts/test/WagerRegistryFuzzTest.sol`
  to deploy via `ERC1967Proxy`. **Done.** (FR-003/SC-003)
- [X] T008 [P] [US1] Deploy/init tests in `test/upgradeable/WagerRegistry.deploy.test.js`:
  the proxy deploys and `initialize` runs exactly once; `_nextWagerId == 1`; a wager created via the proxy
  round-trips through `getWager`; the implementation address is recorded distinctly from the proxy; re-calling
  `initialize` on the proxy reverts. (FR-001/005/011, SC-008)

### Implementation for User Story 1

- [X] T009 [US1] Converted `contracts/wagers/WagerRegistry.sol`: inherits `UUPSManaged` +
  `ReentrancyGuardUpgradeable` + `PausableUpgradeable`; constructor → `initialize(...) external initializer`
  (`__UUPSManaged_init` → `__ReentrancyGuard_init` → `__Pausable_init` then the exact former body);
  `_nextWagerId` moved to `initialize` (`= 1`); appended `uint256[50] __gap`. No
  function/event/error/struct/behavior change. **Done** — compiles. (FR-002/003/006)
- [X] T010 [US1] Updated the `-------- WagerRegistry --------` section of `scripts/deploy/deploy.js` to deploy
  via `deployProxy(hre,{name:"WagerRegistry", initArgs:[admin, membershipManager, polymarketAdapter,
  allowedTokens], deploymentsKey:"wagerRegistry"})`; keep all downstream wiring unchanged.
- [X] T011 [US1] Updated `scripts/deploy/verify.js` to verify the **implementation** (empty constructor args)
  and record/link the proxy under `wagerRegistry`. (FR-014)
- [X] T012 [US1] Ran the FULL existing suite against the proxied registry: **254 passing, 5 pending
  (pre-existing fork/live-oracle), 0 failing** — zero regression. **Done.** (FR-003/SC-003)
- [X] T013 [US1] Defined the `deployments/<net>-chain<id>-v2.json` schema for the upgradeable
  registry — `wagerRegistry` (proxy), `wagerRegistryImpl`, `wagerRegistryLegacy` — in the deploy tooling, and
  run `npm run sync:frontend-contracts:*` so the frontend resolves the **proxy** as the stable address.
  (FR-014/FR-015; data-model.md "deployments record")
- [ ] T014 [P] [US1] Coexistence config (no logic change): point `frontend/` and `subgraph/` at the proxy
  address and surface the legacy registry as **settle-only** (existing wagers claimable/resolvable there, not
  implied to have moved). (FR-007, Principle III)

**Checkpoint**: The proxy is live with current logic on a test network; the full existing suite is green
through it; legacy coexistence is shown honestly. MVP delivered.

---

## Phase 4: User Story 2 - Upgrade the logic in place, preserving the address and all state (Priority: P1)

**Goal**: An admin replaces the registry logic; the on-chain address is unchanged and every wager, balance,
and mapping survives and stays operable under the new logic.

**Independent Test**: From the deployed proxy with live wagers, deploy a new implementation with an additive
change, upgrade as admin, and confirm the address is unchanged, all pre-existing state reads back correctly,
funds are intact, and the new logic is active. (spec US2 Independent Test)

### Tests for User Story 2 (write first, must fail) ⚠️

- [X] T015 [P] [US2] Upgrade-lifecycle tests in `test/upgradeable/WagerRegistry.upgrade.test.js`:
  deploy proxy → create Open and Active wagers (escrow funds) → upgrade to an additive implementation →
  assert the **proxy address is unchanged**, every pre-existing wager/balance/mapping reads back unchanged and
  remains operable, in-flight wagers continue (accept/resolve/claim), and the new function is callable while
  all prior functions/events still work. (FR-001/002/003/004, SC-001/SC-002)

### Implementation for User Story 2

- [X] T016 [US2] Finalized the `upgradeProxy` path in `scripts/deploy/lib/upgradeable.js` (validateUpgrade →
  deploy new impl → `upgradeToAndCall` via the floppy signer → update `wagerRegistryImpl` in `deployments/`,
  proxy key unchanged) and confirm it drives T015. (FR-014; contracts/deploy-upgrade-tooling.md)
- [X] T017 [US2] Added the additive test implementation
  `contracts/mocks/WagerRegistryUpgradeMock.sol` (extends the registry with one trivial view + appends one
  state var from `__gap`) used only by the upgrade tests to prove append-only, state-preserving upgrades.
  (test-only; mocks live under `contracts/mocks/` per the constitution)

**Checkpoint**: An in-place upgrade preserves the address and all state; the headline capability is proven.

---

## Phase 5: User Story 3 - Keep upgrades authorized, safe, and auditable (Priority: P2)

**Goal**: Only the admin can upgrade; a storage-incompatible upgrade is blocked before it applies; the upgrade
path can't be bricked; re-initialization fails; every upgrade is observable and recorded.

**Independent Test**: Attempt a non-admin upgrade (refused); attempt a storage-incompatible upgrade (blocked
pre-deploy); confirm re-init fails and the upgrade is observable on-chain + recorded in `deployments/`. (spec
US3 Independent Test)

### Tests for User Story 3 (write first, must fail) ⚠️

- [X] T018 [P] [US3] Authorization/safety tests in
  `test/upgradeable/WagerRegistry.upgrade.test.js`: a non-`UPGRADER_ROLE` upgrade reverts; `initialize`
  re-call (proxy) and `initialize` on a bare impl both revert; the upgrade entrypoint survives an upgrade
  (non-brickable); a deliberately **storage-incompatible** mock (reordered/removed var) is rejected by
  `check:storage-layout`; a successful upgrade emits the ERC1967 `Upgraded(impl)` event. (FR-009/010/011/012,
  SC-004/SC-005/SC-008)

### Implementation for User Story 3

- [X] T019 [US3] Confirmed gaps closed so T018 passes: the `UUPSManaged` role gate + `_disableInitializers`
  (T004) and the `check:storage-layout` gate (T005) cover auth, re-init, and storage safety; ensure each
  successful `upgradeProxy` records the new implementation address in `deployments/` (auditable trail). No new
  public surface. (FR-014)

**Checkpoint**: Upgrades are admin-only, storage-safe, non-brickable, and auditable.

---

## Phase 6: Documentation (first-class)

**Purpose**: Document the new upgradeable architecture, the operational upgrade procedure, and the **reusable**
pattern so the membership sibling spec adopts it without rediscovery. These are required deliverables, not
optional.

- [ ] T020 [P] Write the upgrade runbook `docs/runbooks/contract-upgrades.md`: how to deploy the proxy, how to
  perform an in-place upgrade via the floppy keystore (`upgradeProxy`), the append-only storage rules + the
  `check:storage-layout` gate, pre-flight validation, abort/rollback considerations, and recording proxy/impl
  in `deployments/`. (quickstart.md; FR-009/010/014)
- [ ] T021 [P] Add an ADR under `docs/adr/` (e.g. `adr/00NN-upgradeable-registry-uups.md`): the decision to
  adopt UUPS, the reusable `UUPSManaged` base, the coexistence cutover, the `UPGRADER_ROLE` least-privilege
  choice, and alternatives rejected (Transparent/Beacon/Diamond; drain-first/state-migration). (research.md)
- [ ] T022 [P] Write the reusability handoff guide `docs/developer-guide/upgradeable-contracts.md`: how to make
  any value-bearing contract upgradeable by inheriting `UUPSManaged`, converting constructor→`initialize`,
  keeping storage append-only with `__gap`, and deploying/validating via the shared tooling — explicitly
  citing `MembershipManager` (sibling spec) and the voucher feature as the next adopters. (PR #724 reuse ask)
- [ ] T023 [P] Update `docs/system-overview/security.md` and `docs/system-overview/roles-and-tiers.md` (and
  `governance.md` if roles are listed there): the registry is now UUPS-upgradeable; document `UPGRADER_ROLE`,
  the upgrade authorization model, `_disableInitializers`, and storage-layout safety. (FR-009/010)
- [ ] T024 [P] Update `scripts/deploy/README.md`: the proxy deploy + in-place upgrade flow, the
  `check:storage-layout` step, and the `deployments/` schema (proxy / impl / legacy). (FR-014)
- [ ] T025 [P] Update the root `README.md` and `docs/architecture/` to state that the core contracts are
  UUPS-upgradeable behind stable proxy addresses (logic swappable, state preserved). (FR-001/006)
- [ ] T026 Update `CLAUDE.md` Guardrails: the active wager contract is a **UUPS proxy at a stable address**;
  new value-bearing contracts inherit `contracts/upgradeable/UUPSManaged.sol`; contract storage is
  **append-only** (run `check:storage-layout`); `deployments/` records proxy + impl + legacy. (keeps the agent
  guide accurate post-migration)

**Checkpoint**: An operator can deploy/upgrade from the runbook alone; a developer can make the next contract
upgradeable from the guide alone; the agent guide reflects the new architecture.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: The security gates this funds-bearing, upgrade-control change requires.

- [ ] T027 [P] Run `npm run slither` (UUPS/proxy detectors) and confirm no new high/critical findings on the
  proxy/`initialize`/`_authorizeUpgrade` surface; document EthTrust-SL ≥ L2 reasoning in
  `specs/025-upgradeable-registry/research.md` if not already captured. (Principle I)
- [ ] T028 [P] Extend Medusa fuzzing (`contracts/test/`) with upgrade invariants: a bare implementation cannot
  be initialized; the upgrade entrypoint is always present; escrow is conserved across an upgrade. (Principle I)
- [ ] T029 Request the smart-contract security-agent review (`.github/agents/`) of the conversion + proxy
  surface (initializer once-only, `_authorizeUpgrade` gating, storage append-only, `_disableInitializers`,
  pause/upgrade interaction). (Principle I)
- [ ] T030 [P] Run `npm run test:coverage` and confirm the new upgrade/deploy/auth branches are covered; close
  gaps in `test/upgradeable/`. (Principle II)
- [ ] T031 Execute `specs/025-upgradeable-registry/quickstart.md` end-to-end on a local/Amoy deployment
  (behavior-neutrality, an additive upgrade preserving state, auth/re-init/storage-incompat rejection,
  coexistence) and record the result in the PR. (SC-001..SC-008)

---

## Phase 8: Deployment (Amoy first, Polygon after sign-off)

**Purpose**: Stand up the proxy on the live networks (running current logic). This is the cutover; feature 024
later ships as the first in-place upgrade on each.

- [ ] T032 Deploy the proxy (current logic) to **Amoy** (chainId 80002) via `npm run deploy:amoy` (floppy
  keystore, 25 gwei floor), `npm run verify:amoy`, `npm run sync:frontend-contracts:amoy`; confirm
  `deployments/amoy-chain80002-v2.json` records `wagerRegistry` (proxy) / `wagerRegistryImpl` /
  `wagerRegistryLegacy`. (plan.md Target Platform)
- [ ] T033 Validate on **Amoy**: full lifecycle parity through the proxy; coexistence shown honestly; perform
  an additive upgrade dry-run and confirm state preserved + address unchanged (SC-006 proof). Get maintainer
  sign-off before mainnet. Block T034 on sign-off.
- [ ] T034 After sign-off, deploy the proxy (current logic) to **Polygon** mainnet (chainId 137) via the
  floppy-keystore flow; `npm run verify:polygon`; `npm run sync:frontend-contracts:polygon`; record proxy/
  impl/legacy in `deployments/polygon-chain137-v2.json`; ship the frontend pointing at the proxy.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately.
- **Foundational (Phase 2)**: depends on Setup — **BLOCKS all user stories** (reusable base + tooling + CI gate).
- **US1 (Phase 3)**: depends on Foundational. The MVP (proxy with current logic).
- **US2 (Phase 4)**: depends on Foundational + US1 (an upgrade presupposes a deployed proxy).
- **US3 (Phase 5)**: depends on Foundational + US1; its assertions exercise the base/tooling gates.
- **Documentation (Phase 6)**: depends on the design being settled; T026 (CLAUDE.md) and T024 (deploy README)
  are most accurate after US1/US2 land, but the runbook/ADR/guide can be drafted in parallel once Phase 2 is done.
- **Polish (Phase 7)**: depends on US1–US3 complete.
- **Deployment (Phase 8)**: depends on Phase 7 gates; mainnet (T034) gated on T033 sign-off.

### Within Each User Story

- Tests are written FIRST and must FAIL before implementation (Principle II).
- Foundational base/tooling (Phase 2) → WagerRegistry conversion (US1) → deploy/verify/sync → upgrade path (US2)
  → safety/auth (US3).
- The proxy deploy helper (T007) must precede running the existing suite through the proxy (T012).

### Parallel Opportunities

- Setup: T002 ∥ T001 (after install).
- Foundational: T003 (base tests) ∥ T005 (storage-check) — different files; T004 follows T003; T006 ∥ T005.
- US1: T007 ∥ T008 (tests); T014 (frontend/subgraph config) ∥ the contract/deploy tasks.
- Documentation (Phase 6): T020/T021/T022/T023/T024/T025 are all `[P]` (separate doc files); T026 (CLAUDE.md)
  best last.
- Polish: T027/T028/T030 `[P]` (separate tools/files); T029/T031 are gates.

---

## Parallel Example: Phase 6 Documentation

```bash
# All documentation files are independent — draft them together:
Task T020: docs/runbooks/contract-upgrades.md
Task T021: docs/adr/00NN-upgradeable-registry-uups.md
Task T022: docs/developer-guide/upgradeable-contracts.md
Task T023: docs/system-overview/security.md + roles-and-tiers.md
Task T024: scripts/deploy/README.md
Task T025: README.md + docs/architecture/
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 Setup → Phase 2 Foundational (reusable base + tooling + CI gate).
2. Phase 3 US1 — proxy with current logic, full existing suite green through it, coexistence honest.
3. **STOP and VALIDATE**: the registry is upgrade-capable with zero behavior change.

### Incremental Delivery

1. Setup + Foundational → reusable primitives ready (also unblocks the membership sibling spec).
2. US1 → behavior-neutral proxy (MVP) → demo on local/Amoy.
3. US2 → in-place upgrade preserving state → demo (this is what feature 024 will ride).
4. US3 → authorized/safe/auditable upgrades.
5. Documentation (runbook/ADR/guide/system-overview/READMEs/CLAUDE.md).
6. Polish gates (Slither, Medusa, coverage, security review, quickstart).
7. Deploy: Amoy → validate → sign-off → Polygon. Then feature 024 ships as the first in-place upgrade.

### Notes

- [P] = different files, no dependency on an incomplete task.
- Tests fail before implementation; commit after each task or logical group.
- The migration is **behavior-neutral**: no function/event/error/struct change (FR-006); verify the
  backward-compat checklist in `contracts/wager-registry-uups.md` before merge.
- Keep the reusable layer (`UUPSManaged.sol`, `lib/upgradeable.js`, `check:storage-layout`, the developer
  guide) contract-agnostic so `MembershipManager` adopts it without reimplementation (PR #724).
- ABIs/addresses reach the frontend ONLY through `sync:frontend-contracts`; the proxy address is stable across
  upgrades (Principle V).
