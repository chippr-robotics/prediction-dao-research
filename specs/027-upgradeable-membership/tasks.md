---
description: "Task breakdown for Upgradeable MembershipManager (Separate State from Logic)"
---

# Tasks: Upgradeable MembershipManager (Separate State from Logic)

**Input**: Design documents from `/specs/027-upgradeable-membership/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: REQUIRED. Constitution Principle II is NON-NEGOTIABLE, and this is a value-bearing, access-control
surface (it holds accrued USDC fees and gates wager participation) — upgrade tests are written **before** the
code and must fail first. The **entire existing `MembershipManager` suite must also pass unchanged** against the
proxied contract, and the **wager suite must pass** with `WagerRegistry` pointed at the membership proxy (the
behavior-neutrality gate, FR-003/FR-009/SC-003).

**Reuse (PR #724 / feature 025)**: This feature is the **second adopter** of the merged UUPS pattern. The base
(`contracts/upgradeable/UUPSManaged.sol`), the deploy/upgrade tooling (`scripts/deploy/lib/upgradeable.js`),
the storage-layout gate (`scripts/deploy/check-storage-layout.js` / `npm run check:storage-layout`), and the
upgradeable deps are **already present and MUST be reused unchanged** — not rebuilt.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 (setup, foundational, documentation, polish, deployment carry no story label)
- Exact file paths are included in every task.

## Path Conventions

Web3 monorepo (per plan.md): Solidity in `contracts/`, Hardhat tests in `test/`, deploy/CI tooling in
`scripts/`, docs in `docs/`, React app in `frontend/`, indexer in `subgraph/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the reused 025 toolchain is available and add the membership proxy test helper. No new deps.

- [ ] T001 Confirm the reused upgrade toolchain is present (no install needed): `@openzeppelin/contracts-upgradeable@5.4.0`, `@openzeppelin/hardhat-upgrades` in `package.json`; `contracts/upgradeable/UUPSManaged.sol`, `scripts/deploy/lib/upgradeable.js`, and the `check:storage-layout` script all exist. Run `npm run compile` as a baseline. (plan.md Technical Context; research.md R1)
- [ ] T002 [P] Add a `deployMembershipManager(initArgs)` helper to `test/helpers/proxy.js` (manual impl + `ERC1967Proxy` + `initialize`), alongside the existing `deployWagerRegistry`, so existing tests can deploy the proxied authority. (FR-003)

**Checkpoint**: `npm run compile` succeeds; the membership proxy test helper exists.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Register the membership authority with the existing storage-layout gate so every later upgrade is validated. Required before the conversion can be merged safely.

**⚠️ CRITICAL**: This wires the reused CI gate to cover `MembershipManager`. No rebuild of the gate itself.

- [ ] T003 Register the contract in the reused gate: add `{ name: "MembershipManager", deploymentsKey: "membershipManager" }` to `UPGRADEABLE_CONTRACTS` in `scripts/deploy/check-storage-layout.js` (the script already anticipates this). Confirm `npm run check:storage-layout` picks it up. (FR-010/FR-012/SC-005; research.md R5)

**Checkpoint**: `npm run check:storage-layout` evaluates `MembershipManager`; the reusable primitives are wired, not duplicated.

---

## Phase 3: User Story 1 - Stand up the authority at an upgrade-capable address with zero behavior change (Priority: P1) 🎯 MVP

**Goal**: Deploy `MembershipManager` behind a UUPS proxy running the **current** logic. Every existing
membership flow behaves identically; accrued fees are fully accounted for; the frontend/subgraph/`WagerRegistry`
talk to the stable proxy address.

**Independent Test**: Deploy the proxy with current logic to a test network, run the full existing membership
lifecycle (purchase/upgrade/extend/grant/revoke + create/close hooks) and a wager create/accept that depends on
membership, and confirm identical outcomes to the non-upgradeable contract plus correct fee accounting. (spec
US1 Independent Test)

### Tests for User Story 1 (write first, must fail) ⚠️

- [ ] T004 [P] [US1] Route all existing `MembershipManager`-deploying test files through `deployMembershipManager` (proxy helper) in `test/` (unit + integration), and fix the Medusa harness `contracts/test/MembershipManagerFuzzTest.sol` to deploy via `ERC1967Proxy`. The full existing membership suite must run through the proxy. (FR-003/SC-003)
- [ ] T005 [P] [US1] Deploy/init tests in `test/upgradeable/MembershipManager.deploy.test.js`: the proxy deploys and `initialize(admin, paymentToken, treasury)` runs exactly once; `DEFAULT_ADMIN_ROLE`/`UPGRADER_ROLE`/`ROLE_MANAGER_ROLE` are granted to admin; `paymentToken`/`treasury` set correctly; a tier set + membership purchased via the proxy round-trips through `getMembership`/`hasActiveRole`; the implementation address is recorded distinctly from the proxy; re-calling `initialize` on the proxy reverts. (FR-001/005/013, SC-008)

### Implementation for User Story 1

- [ ] T006 [US1] Convert `contracts/access/MembershipManager.sol`: inherit `UUPSManaged` (swap `AccessControl` → `AccessControlUpgradeable` via the base); replace the constructor with `initialize(address admin, address paymentToken_, address treasury_) external initializer` (same zero-address checks; `__UUPSManaged_init(admin)` first; set `paymentToken`/`treasury`; `_grantRole(ROLE_MANAGER_ROLE, admin)`); append `uint256[50] private __gap`. No function/event/error/struct/behavior change. (FR-002/003/006; contracts/membership-manager-uups.md; research.md R2/R3/R4)
- [ ] T007 [US1] Update `scripts/deploy/deploy.js` to deploy `MembershipManager` via `deployProxy(hre, { name: "MembershipManager", initArgs: [admin, paymentToken, treasury], deploymentsKey: "membershipManager" })`; keep all downstream wiring (sanctions guard, tiers, authorized callers) unchanged; record `membershipManager` (proxy) + `membershipManagerImpl`. (FR-014; contracts/membership-manager-uups.md)
- [ ] T008 [US1] In `scripts/deploy/deploy.js`, after the membership proxy is deployed, repoint the registry: call `WagerRegistry.setMembershipManager(membershipProxy)` (admin / floppy keystore on live nets) so membership gating resolves against the proxy. (FR-009; research.md R6)
- [ ] T009 [US1] Update `scripts/deploy/verify.js` to verify the membership **implementation** (empty constructor args) and record/link the proxy under `membershipManager`. (FR-014/FR-016)
- [ ] T010 [US1] Run the FULL existing membership suite against the proxied authority AND the wager suite with `WagerRegistry` pointed at the membership proxy: zero regression required. (FR-003/FR-009/SC-003)
- [ ] T011 [P] [US1] Coexistence config (no logic change): point `frontend/` and `subgraph/` at the membership proxy as the stable address and surface legacy memberships distinctly (existing memberships usable on the legacy address until expiry, not implied to have moved); refresh via `npm run sync:frontend-contracts:*`. (FR-007/FR-017, Principle III/V)

**Checkpoint**: The membership proxy is live with current logic on a test network; the full existing membership + wager suites are green through it; legacy coexistence is shown honestly. MVP delivered.

---

## Phase 4: User Story 2 - Upgrade the logic in place, preserving the address and all state (Priority: P1)

**Goal**: An admin replaces the membership logic; the on-chain address is unchanged and every membership,
accrued fee, and config mapping survives and stays operable under the new logic.

**Independent Test**: From the deployed proxy with live memberships + accrued fees, deploy a new implementation
with an additive change, upgrade as admin, and confirm the address is unchanged, all pre-existing state reads
back correctly, fees are intact, and the new logic is active. (spec US2 Independent Test)

### Tests for User Story 2 (write first, must fail) ⚠️

- [ ] T012 [P] [US2] Upgrade-lifecycle tests in `test/upgradeable/MembershipManager.upgrade.test.js`: deploy proxy → set tiers, purchase memberships, accrue fees → upgrade to an additive implementation → assert the **proxy address is unchanged**, every pre-existing membership/accrued-fee/config mapping reads back unchanged and remains operable, active memberships continue (expiry/limits/revoke), and the new function is callable while all prior functions/events still work. (FR-001/002/003/004, SC-001/SC-002)

### Implementation for User Story 2

- [ ] T013 [US2] Confirm the reused `upgradeProxy` path in `scripts/deploy/lib/upgradeable.js` drives the membership upgrade (validateUpgrade → deploy new impl → `upgradeToAndCall` via floppy signer → update `membershipManagerImpl`, proxy key unchanged). No changes to the generic tooling expected; add only membership-specific deploy-script wiring if needed. (FR-014)
- [ ] T014 [US2] Add the additive test implementation `contracts/mocks/MembershipManagerUpgradeMock.sol` (extends the authority with one trivial view + appends one state var from `__gap`) used only by the upgrade tests to prove append-only, state-preserving upgrades. (test-only; mocks live under `contracts/mocks/` per the constitution)

**Checkpoint**: An in-place upgrade preserves the address and all membership state; the headline capability — and feature 026's landing pad — is proven.

---

## Phase 5: User Story 3 - Keep upgrades authorized, safe, and auditable (Priority: P2)

**Goal**: Only the admin can upgrade; a storage-incompatible upgrade is blocked before it applies; the upgrade
path can't be bricked; re-initialization fails; every upgrade is observable and recorded.

**Independent Test**: Attempt a non-admin upgrade (refused); attempt a storage-incompatible upgrade (blocked
pre-deploy); confirm re-init fails and the upgrade is observable on-chain + recorded in `deployments/`. (spec
US3 Independent Test)

### Tests for User Story 3 (write first, must fail) ⚠️

- [ ] T015 [P] [US3] Authorization/safety tests in `test/upgradeable/MembershipManager.upgrade.test.js`: a non-`UPGRADER_ROLE` upgrade reverts; `initialize` re-call (proxy) and `initialize` on a bare impl both revert; the upgrade entrypoint survives an upgrade (non-brickable); a deliberately **storage-incompatible** mock (reordered/removed var) is rejected by `check:storage-layout`; a successful upgrade emits the ERC1967 `Upgraded(impl)` event. (FR-011/012/013/014/015, SC-004/SC-005/SC-008)

### Implementation for User Story 3

- [ ] T016 [US3] Confirm gaps closed so T015 passes: the reused `UUPSManaged` role gate + `_disableInitializers` and the `check:storage-layout` gate (registered in T003) cover auth, re-init, and storage safety; ensure each successful `upgradeProxy` records the new implementation address in `deployments/` (auditable trail). No new public surface. (FR-014/FR-016)

**Checkpoint**: Membership upgrades are admin-only, storage-safe, non-brickable, and auditable.

---

## Phase 6: Documentation

**Purpose**: Reflect that `MembershipManager` is now UUPS-upgradeable. Most upgrade docs already exist (025's
runbook/ADR/developer-guide are generic and already cite membership as the next adopter) — these are targeted updates.

- [ ] T017 [P] Update `docs/developer-guide/upgradeable-contracts.md` to mark `MembershipManager` as an adopter of `UUPSManaged` (it is already named as a next adopter), referencing this feature. (PR #724 reuse)
- [ ] T018 [P] Update `docs/system-overview/security.md` and `docs/system-overview/roles-and-tiers.md`: `MembershipManager` is now UUPS-upgradeable; document its `UPGRADER_ROLE`, the upgrade authorization model, `_disableInitializers`, and append-only storage. (FR-011/FR-012)
- [ ] T019 [P] Update `scripts/deploy/README.md` and the `deployments/` schema notes to include the membership proxy/impl keys and the `WagerRegistry` repoint step at cutover. (FR-014/FR-016)
- [ ] T020 Update `CLAUDE.md` Guardrails: `MembershipManager` is now a **UUPS proxy at a stable address** (logic swappable, state preserved); `deployments/` records `membershipManager` (proxy) + `membershipManagerImpl`; storage is append-only (run `check:storage-layout`). (keeps the agent guide accurate post-migration)

**Checkpoint**: Docs reflect the membership migration; an operator/developer can act from them.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: The security gates this funds-bearing, upgrade-control change requires.

- [ ] T021 [P] Slither static analysis (UUPS/proxy detectors) on the converted `MembershipManager` — no new high/critical on the `initialize`/`_authorizeUpgrade`/proxy surface; EthTrust-SL ≥ L2. (Principle I; research.md R8)
- [ ] T022 [P] Extend the Medusa harness `contracts/test/MembershipManagerFuzzTest.sol` with upgrade invariants: deploy via `ERC1967Proxy`, retain the existing tier/price/limit invariants, and add `property_cannot_reinitialize`. (Principle I; FR-013)
- [ ] T023 ⏳ REVIEW-GATED — Request the smart-contract security-agent review (`.github/agents/`) of the conversion + proxy surface (initializer once-only, `_authorizeUpgrade` gating, storage append-only, `_disableInitializers`). (Principle I)
- [ ] T024 [P] Coverage — confirm the new branches are exercised by `test/upgradeable/MembershipManager.*` (deploy, in-place upgrade, auth gate, re-init, storage-incompat). (Principle II)
- [ ] T025 Validate the quickstart locally (parts runnable without a live network): full existing membership suite green through the proxy; wager suite green with the proxy-pointed registry; `npm run check:storage-layout` passes and **rejects** a storage-incompatible upgrade; the in-place upgrade test proves address-unchanged + state-preserved; auth/re-init rejection proven; `hardhat run scripts/deploy/deploy.js` deploys the proxy + repoints the registry end-to-end. (SC-001..SC-005, SC-008; quickstart.md)

**Checkpoint**: Security gates pass; the migration is behavior-neutral and upgrade-safe.

---

## Phase 8: Deployment (Amoy first, Polygon after sign-off)

**Purpose**: Stand up the membership proxy on the live networks (current logic) and repoint `WagerRegistry`.
This is the cutover; feature 026 later ships as the first in-place upgrade on each.

> ⏳ **NETWORK-GATED — not runnable in this dev environment.** Requires the live RPCs + the air-gapped floppy
> keystore (`npm run floppy:mount`) and maintainer sign-off. Execute on the operator workstation per
> `docs/runbooks/contract-upgrades.md`.

- [ ] T026 Deploy the membership proxy (current logic) to **Amoy** (chainId 80002) via the floppy-keystore flow; repoint `WagerRegistry.setMembershipManager(proxy)`; `npm run verify:amoy`; `npm run sync:frontend-contracts:amoy`; confirm `deployments/amoy-chain80002-v2.json` records `membershipManager` (proxy) + `membershipManagerImpl`. (plan.md Target Platform; FR-009)
- [ ] T027 Validate on **Amoy**: full membership lifecycle parity through the proxy; wager gating works via the repointed registry; coexistence shown honestly; perform an additive upgrade dry-run and confirm state preserved + address unchanged (SC-006 proof). Get maintainer sign-off before mainnet. Block T028 on sign-off.
- [ ] T028 After sign-off, deploy the membership proxy (current logic) to **Polygon** mainnet (chainId 137) via the floppy-keystore flow; repoint `WagerRegistry`; `npm run verify:polygon`; `npm run sync:frontend-contracts:polygon`; record proxy/impl in `deployments/polygon-chain137-v2.json`; withdraw accrued fees from the legacy authority via its admin path. Then feature 026 ships as the first in-place upgrade.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately (toolchain already merged).
- **Foundational (Phase 2)**: depends on Setup — registers the contract with the reused CI gate; precedes merge.
- **US1 (Phase 3)**: depends on Setup + Foundational. The MVP (proxy with current logic + registry repoint).
- **US2 (Phase 4)**: depends on US1 (an upgrade presupposes a deployed proxy).
- **US3 (Phase 5)**: depends on US1; its assertions exercise the reused base/tooling gates.
- **Documentation (Phase 6)**: can be drafted once the design is settled; T020 (CLAUDE.md) best after US1/US2 land.
- **Polish (Phase 7)**: depends on US1–US3 complete.
- **Deployment (Phase 8)**: depends on Phase 7 gates; mainnet (T028) gated on T027 sign-off.

### Within Each User Story

- Tests are written FIRST and must FAIL before implementation (Principle II).
- Proxy test helper (T002) precedes routing the existing suite through the proxy (T004/T010).
- Conversion (T006) precedes deploy/verify (T007–T009) and the upgrade path (US2).

### Parallel Opportunities

- Setup: T002 ∥ (after T001 baseline compile).
- US1 tests: T004 ∥ T005 (different files). US1 config: T011 ∥ the contract/deploy tasks.
- Documentation: T017/T018/T019 are `[P]` (separate files); T020 (CLAUDE.md) best last.
- Polish: T021/T022/T024 `[P]` (separate tools/files); T023/T025 are gates.

---

## Parallel Example: User Story 1 tests

```bash
# Write US1 tests together (must fail before T006 conversion):
Task T004: route existing MembershipManager tests through deployMembershipManager + fix fuzz harness
Task T005: test/upgradeable/MembershipManager.deploy.test.js (deploy/init/roles/round-trip/re-init revert)
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 Setup → Phase 2 Foundational (register with the reused gate).
2. Phase 3 US1 — proxy with current logic, registry repointed, full existing membership + wager suites green through it, coexistence honest.
3. **STOP and VALIDATE**: the membership authority is upgrade-capable with zero behavior change.

### Incremental Delivery

1. Setup + Foundational → reused primitives wired for membership.
2. US1 → behavior-neutral proxy (MVP) + registry repoint → demo on local/Amoy.
3. US2 → in-place upgrade preserving state → demo (this is what feature 026 will ride).
4. US3 → authorized/safe/auditable upgrades.
5. Documentation + Polish gates (Slither, Medusa, security review, coverage, quickstart).
6. Deploy: Amoy → validate → sign-off → Polygon. Then feature 026 ships as the first in-place upgrade.

### Notes

- [P] = different files, no dependency on an incomplete task.
- Tests fail before implementation; commit after each task or logical group.
- The migration is **behavior-neutral**: no function/event/error/struct change (FR-006); verify the
  backward-compat checklist in `contracts/membership-manager-uups.md` before merge.
- **Reuse, do not rebuild** the 025 primitives (`UUPSManaged.sol`, `lib/upgradeable.js`, `check:storage-layout`).
- ABIs/addresses reach the frontend ONLY through `sync:frontend-contracts`; the proxy address is stable across
  upgrades (Principle V).
