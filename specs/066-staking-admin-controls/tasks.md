# Tasks: Staking Fee Router, Admin Controls & Emergency Pause

**Input**: Design documents from `/specs/066-staking-admin-controls/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: included — constitution I/II make Hardhat unit + fork tests + Slither/Medusa mandatory for a
value-bearing contract, and Vitest for the frontend. **Security-gated**: the new `StakingRouter` is
value-bearing (transient custody to skim the fee), so Phase 2 is a blocking foundation that MUST pass the
smart-contract security review before any story merges.

**Organization**: grouped by user story (US1 treasury fee · US2 emergency pause · US3 provider addresses ·
US4 validator allowlist · US5 least-privilege + audit). Launch network: Ethereum mainnet. **Liquid staking
only is fee-bearing** (per-provider `stake.lido`/`stake.polygon`, cap 250 bps); **delegated is fee-free in
v1**. The fee **rate** stays in the spec-060 FeeRouter (edited via the existing Fees tab); the StakingRouter
reads it. Member app reads the router at runtime with a safe fallback to the merged spec-065 defaults.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependencies)
- **[Story]**: US1–US5 (setup, foundational, polish carry no story label)

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: fee-service + contract-address + ABI plumbing all stories depend on. No contract logic yet.

- [ ] T001 [P] Add the per-provider staking fee services to `scripts/deploy/lib/feeServices.js`
      `LAUNCH_FEE_SERVICES`: `{ label: 'stake.lido', capBps: 250, kind: ConfigOnly }` and
      `{ label: 'stake.polygon', capBps: 250, kind: ConfigOnly }` (rate 0 until set) per contracts/fee-integration.md
- [ ] T002 [P] Add `FEE_SERVICES.STAKE_LIDO` / `STAKE_POLYGON` (keccak of `stake.lido`/`stake.polygon`) to
      `frontend/src/lib/fees/feeQuote.js`
- [ ] T003 [P] Add the staking service ids + a `stakingRouterServiceIdFor(providerKind)` helper to
      `frontend/src/config/staking.js` (keep the existing constants as the fee-free fallback default)
- [ ] T004 [P] Add a `stakingRouter` contract key to the per-chain maps in `frontend/src/config/contracts.js`
      (+ `VITE_STAKING_ROUTER_ADDRESS` env override), resolving `undefined` until deployed
- [ ] T005 [P] Add `{ name: 'StakingRouter', deploymentsKey: 'stakingRouter' }` to the `UPGRADEABLE_CONTRACTS`
      list in `scripts/deploy/check-storage-layout.js`, and add `stakingRouter` to the copied-keys mapping in
      `scripts/utils/sync-frontend-contracts.js`
- [ ] T006 [P] Add `frontend/src/abis/StakingRouter.js` — minimal ABI (config setters, getters,
      validator enumeration, pause/unpause, `stakeLido`/`stakeSpol`, and the setter/pause/`LiquidStaked` events)
      per contracts/staking-router.md
- [ ] T007 Unit tests `frontend/src/test/staking-admin/feeServices.test.js` (service-id keccak values,
      `stakingRouterServiceIdFor` mapping, `contracts.js` returns undefined pre-deploy) and a deploy-lib test
      asserting `feeServices.js` carries both staking services at cap 250

**Checkpoint**: fee-service + address + ABI plumbing exists; no contract or UI yet.

---

## Phase 2: Foundational — the StakingRouter contract (SECURITY-GATED, Blocking Prerequisites)

**Purpose**: the value-bearing contract + its full test/security gate + deploy wiring + the frontend read
layer + admin-tab shell that EVERY user story rides on. **⚠️ No user story may merge until this phase passes
the smart-contract security review.**

- [ ] T008 Author `contracts/staking/IStakingRouter.sol` — structs, events (`FeeRouterUpdated`,
      `LidoContractsUpdated`, `SpolContractsUpdated`, `PolygonContractsUpdated`, `ValidatorAdded`,
      `ValidatorRemoved`, `LiquidStaked`), and errors (`ZeroAmount`, `ZeroAddress`, `FeeAboveQuoted`,
      `ResidualFunds`, `ProviderCallFailed`, `AlreadyListed`, `NotListed`) per contracts/staking-router.md
- [ ] T009 Implement `contracts/staking/StakingRouter.sol` — `UUPSManaged + ReentrancyGuardUpgradeable +
      PausableUpgradeable`; `STAKING_ADMIN_ROLE` + `GUARDIAN_ROLE`; `initialize(admin, feeRouter, providers…)`
      storing per-provider service ids (`stake.lido`/`stake.polygon`); config setters + `EnumerableSet`
      validator allowlist (each `onlyRole(STAKING_ADMIN_ROLE)` + event); `pause()/unpause()` (`GUARDIAN_ROLE`);
      append-only storage + `__gap` per contracts/staking-router.md
- [ ] T010 Implement the liquid fee-and-forward entrypoints in `StakingRouter.sol` — `stakeLido(maxFeeBps)`
      (ETH→wstETH) and `stakeSpol(amount, maxFeeBps)` (POL→sPOL), each `nonReentrant whenNotPaused`, reading
      `quoteFee`/`feeBps`/`treasury()` from the FeeRouter, CEI ordering, exact-amount `forceApprove`→0, the
      `FeeAboveQuoted` consent guard, and the `ResidualFunds` no-leftover assertion (FR-016)
- [ ] T011 Hardhat unit tests `test/staking/StakingRouter.test.js` — every setter + role gate + pause/unpause;
      fee split to treasury + net forward; `FeeAboveQuoted` on rate-above-quote; zero-fee = passthrough;
      treasury-unset skip; `whenNotPaused` blocks stake while exits are untouched; `EnumerableSet` add/remove
      (dup/absent revert); `ResidualFunds`/reentrancy guard; unauthorized-caller reverts
- [ ] T012 [P] Fork tests `test/fork/StakingRouterFork.test.js` — against real Lido + sPOL on a mainnet fork:
      `stakeLido`/`stakeSpol` skim the fee to the treasury, forward the net, return wstETH/sPOL to the member,
      and leave no residual; treasury balance grows by exactly the disclosed fee
- [ ] T013 [P] Storage-layout test + run: `npm run check:storage-layout` passes for `StakingRouter`
      (append-only + `__gap`); document the layout baseline
- [ ] T014 Run Slither + Medusa on `contracts/staking/` — resolve or document (with rationale) any
      high/critical findings; ensure the CI security jobs cover the new contract
- [ ] T015 Smart-contract security-agent review of `StakingRouter.sol`
      (`.github/agents/smart-contract-security.agent.md`) — address findings; **gate for all downstream merges**
- [ ] T016 Author `scripts/deploy/deploy-staking-router.js` — `deployProxy(StakingRouter, [admin, feeRouter,
      providers…])`, record `stakingRouter`/`stakingRouterImpl` (append, never overwrite), then register
      `stake.lido` + `stake.polygon` on the existing FeeRouter (idempotent); admin/guardian = the multisig
- [ ] T017 Implement `frontend/src/lib/staking/stakingRouter.js` — read the router's provider addresses,
      validator allowlist, and `paused()` over a read provider; build the liquid router stake calls
      (`stakeLido` native `value`; `stakeSpol` approve-router + call); safe-degrade to null when the router
      is undeployed/unreadable, per contracts/admin-and-runtime.md
- [ ] T018 Define the `STAKING_ADMIN` role + wire the admin tab shell: add `ROLES.STAKING_ADMIN` + `ROLE_INFO`
      + `ADMIN_ROLES` in `frontend/src/contexts/RoleContext.js`; `STAKING_ADMIN` `ROLE_HASHES` +
      `roleHomeContract → stakingRouter` + `isStakingAdmin` flag + nav item (`adminNav.js`) + gated render of a
      new `frontend/src/components/admin/StakingTab.jsx` shell (empty, resolves the contract, honest "not
      deployed" state) in `frontend/src/components/AdminPanel.jsx`
- [ ] T019 [P] Unit tests `frontend/src/test/staking-admin/stakingRouterLib.test.js` (read overlay + safe
      fallback; liquid stake-call encoding) and `frontend/src/test/staking-admin/StakingTab.shell.test.jsx`
      (role-gated visibility; "not deployed" empty state; axe clean)

**Checkpoint**: audited contract deployed-ready, frontend read layer + role + tab shell exist; stories can begin.

---

## Phase 3: User Story 1 — Grow the treasury with a platform fee on liquid staking (P1) 🎯 MVP

**Goal**: liquid stakes route through the router, disclose the fee, and grow the treasury; zero fee = today.

**Independent test**: quickstart.md Scenario 1 (and Scenario 5 fallback).

- [ ] T020 [US1] Branch `frontend/src/lib/staking/stakingActions.js#buildStakeForOption` (mirroring
      `lib/earn/vaultActions.buildDepositCalls`): when a router + non-zero fee apply, build the liquid router
      path (`stakeLido`/`stakeSpol` with `maxFeeBps`); else the byte-identical spec-065 direct calls. Delegated
      always uses the direct path (fee-free)
- [ ] T021 [US1] Thread the fee quote into `frontend/src/hooks/useStakingActions.js` (`stake` ctx) and overlay
      the per-provider `stakingFeeBps` in `frontend/src/hooks/useStakingOptions.js` from
      `fetchFeeQuote(STAKE_LIDO/STAKE_POLYGON)` (liquid options only; delegated shows no fee)
- [ ] T022 [US1] Add the fee line to `frontend/src/components/earn/StakeSheet.jsx` — mirror `VaultSheet`:
      `fetchFeeQuote` state, `feeApplies`/`feeBlocked`/`feeSplit`, a "FairWins platform fee ({bpsToPercent}) /
      You stake {net}" disclosure before signing, pass `bps` as `maxFeeBps`, and block submit on `feeBlocked`
      (router present but rate unreadable). Zero/unavailable ⇒ no fee line (byte-identical to fee-free)
- [ ] T023 [P] [US1] Component tests `frontend/src/test/staking-admin/StakeSheet.fee.test.jsx` (fee line shows
      rate + net; delegated shows none; `feeBlocked` disables submit; zero-fee = no line) and
      `stakingActions.fee.test.js` (router branch vs direct; maxFeeBps passed; delegated stays direct)

**Checkpoint**: MVP — a member's liquid stake discloses and pays the fee to the treasury; delegated is fee-free.

---

## Phase 4: User Story 2 — Emergency pause and resume (P1)

**Goal**: an authorized responder pauses staking per network at runtime; new stakes stop, exits keep working.

**Independent test**: quickstart.md Scenario 2.

- [ ] T024 [US2] Add pause/resume controls to `frontend/src/components/admin/StakingTab.jsx` — GUARDIAN-gated
      `pause()`/`unpause()` via the shared `runTx`, showing the live `paused()` state (mirrors the Emergency
      tab handlers)
- [ ] T025 [US2] Honor the router `paused` flag in the member app: overlay it in
      `frontend/src/hooks/useStakingOptions.js` and hide **new**-stake in `StakeView`/`StakeSheet` behind the
      existing honest unavailable state (exits/unstake/withdraw stay available)
- [ ] T026 [P] [US2] Tests `frontend/src/test/staking-admin/StakingTab.pause.test.jsx` (guardian-only
      pause/resume; non-guardian cannot) and `frontend/src/test/staking-admin/pausedMember.test.jsx` (paused ⇒
      new-stake hidden with the unavailable state; exits still offered)

**Checkpoint**: staking can be stopped/resumed per network without a redeploy; funds never trapped.

---

## Phase 5: User Story 3 — Manage staking provider addresses per network (P2)

**Goal**: an operator updates provider addresses at runtime; the member flow uses them.

**Independent test**: quickstart.md Scenario 3 (addresses).

- [ ] T027 [US3] Add provider-address controls to `frontend/src/components/admin/StakingTab.jsx` —
      STAKING_ADMIN-gated `setLidoContracts`/`setSpolContracts`/`setPolygonContracts`/`setFeeRouter` with
      current-value display and `ethers.isAddress` + non-zero validation before send (mirror ProtocolConfigTab)
- [ ] T028 [US3] Ensure `frontend/src/hooks/useStakingOptions.js` overlays the router's provider addresses
      onto the options when the router is deployed (member flow resolves the updated addresses), with the
      spec-065 constants as the fallback
- [ ] T029 [P] [US3] Tests `frontend/src/test/staking-admin/StakingTab.addresses.test.jsx` (current value
      shown; invalid/zero rejected pre-send; setter dispatched) and an overlay test (member reads router
      address over the constant)

**Checkpoint**: provider addresses are operator-managed at runtime.

---

## Phase 6: User Story 4 — Curate the validator allowlist (P2)

**Goal**: an operator adds/removes curated validators; new delegations reflect it; existing positions exit.

**Independent test**: quickstart.md Scenario 3 (validator lifecycle).

- [ ] T030 [US4] Add validator allowlist controls to `frontend/src/components/admin/StakingTab.jsx` —
      STAKING_ADMIN-gated `addValidator`/`removeValidator` with the current list (`validatorCount`/`validatorAt`)
      and address validation (contract rejects dup/absent)
- [ ] T031 [US4] Overlay the router's validator allowlist in `frontend/src/hooks/useStakingOptions.js` so a
      removed validator drops from **new**-delegation options while an existing delegated position stays
      visible/exitable (via `useStakingPositions`), falling back to `CURATED_POLYGON_VALIDATORS`
- [ ] T032 [P] [US4] Tests `frontend/src/test/staking-admin/StakingTab.validators.test.jsx` (add/remove;
      dup/absent rejected) and `frontend/src/test/staking-admin/allowlistOverlay.test.jsx` (removed validator
      not offered for new delegation; existing position still exitable)

**Checkpoint**: the delegation validator set is operator-curated as a lifecycle activity.

---

## Phase 7: User Story 5 — Least-privilege operator access & audit (P3)

**Goal**: exactly-scoped operator access and a reviewable on-chain history of every control action.

**Independent test**: quickstart.md Scenario 4.

- [ ] T033 [US5] Add the STAKING_ADMIN grantable-role `<option>` to the admin-roles select in
      `frontend/src/components/AdminPanel.jsx` (grant/revoke via the `stakingRouter` home contract) and confirm
      the least-privilege split: config = STAKING_ADMIN, pause = GUARDIAN, fee rate = FEE_ADMIN (Fees tab)
- [ ] T034 [US5] Render the on-chain audit history in `frontend/src/components/admin/StakingTab.jsx` —
      `queryFilter` the router's setter/pause events (+ FeeRouter `FeeBpsChanged` for the rate), newest-first
      table with a Blockscout fallback link (mirror FeesTab history), showing actor + before/after + time
- [ ] T035 [P] [US5] Tests `frontend/src/test/staking-admin/StakingTab.roles.test.jsx` (no-role sees nothing;
      guardian-only = pause only; staking-admin = config only; fee rate read-only) and
      `StakingTab.history.test.jsx` (events → rows; range-limited RPC degrades gracefully) + axe on the full tab

**Checkpoint**: spec 066 acceptance scenarios across US1–US5 all pass.

---

## Phase 8: Polish & Cross-Cutting

- [ ] T036 [P] Write `docs/runbooks/staking-operations.md` — operator guide + the **emergency pause runbook**
      (who is authorized, how to pause/resume, set the fee in the Fees tab, change addresses, curate
      validators, read the audit history) and register it under Runbooks in `mkdocs.yml`
- [ ] T037 [P] Extend `docs/developer-guide/staking-integration.md` (spec 065 doc) with the StakingRouter +
      fee + admin architecture, the per-provider fee services, the delegated-fee-free decision, and the
      multisig/no-timelock governance
- [ ] T038 Run the full gate: `npm run compile` + `npm test` + `npm run test:fork` + Slither/Medusa +
      `npm run check:storage-layout` (contracts) and `npm run test:frontend` + `npm run lint --workspace
      frontend` + `npm run build --workspace frontend` (frontend); fix regressions (incl. existing
      StakeSheet/AdminPanel/RoleContext tests affected by the new surfaces)
- [ ] T039 Validate the automatable quickstart.md scenarios (fee disclosure + zero-fee identical; paused
      new-stake hidden while exits work; address/validator overlay; role gating; undeployed-router fallback)
      and **assert per-network isolation (FR-012/SC-009): router config/fee/pause/paused read for one
      chainId never bleeds into another and never crosses the testnet/mainnet boundary** (add the assertion
      to the `useStakingOptions` overlay test), then update `specs/066-staking-admin-controls/checklists`

## Dependencies

- **Phase 1 → Phase 2 (SECURITY-GATED) → US1..US5 → Polish.** No story merges before T015 (security review)
  passes. US1 (fee) needs T017/T020-T022; US2 (pause) needs T018/T024-T025; US3/US4 need T017/T027-T031;
  US5 needs T018/T033-T034. The admin-tab shell (T018) is shared by US2–US5 (each adds its own controls to it).
- **Parallel opportunities**: T001–T006 (Setup); T012/T013 alongside T011; T019 after T017/T018; the
  `[P]` test tasks per story; T036/T037 docs once copy stabilizes. The contract (T008–T010) is sequential
  (one file), and its tests (T011) gate the fork/Slither/review chain.

## Implementation Strategy

- **MVP** = Phases 1–3 (Setup + the audited StakingRouter + US1 fee/treasury): a liquid stake discloses and
  pays the platform fee to the treasury, with delegated fee-free and a safe fallback. US2 (pause) is the
  co-equal P1 safety lever and should follow immediately.
- Ship incrementally in story order; the admin tab grows control-by-control (pause → addresses → validators →
  audit) on the shared shell. Every checkpoint leaves the app releasable and honest-state.
- **Security first**: Phase 2 is the gate — the value-bearing contract must clear unit + fork + Slither/Medusa
  + the security-agent review before any frontend story merges. Delegated staking stays a direct member call
  (fee-free v1); a robust delegated-fee path is a future revisit.
