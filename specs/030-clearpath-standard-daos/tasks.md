# Tasks: ClearPath Standard DAOs & External DAO Connectors

**Feature**: spec 030 | **Branch**: `feat/clearpath-standard-daos-030`
**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Data model**: [data-model.md](./data-model.md) · **Contracts**: [contracts/](./contracts/)

Tests are REQUIRED (Constitution II): contract unit + integration + upgrade-lifecycle, subgraph Matchstick,
frontend Vitest incl. axe — covering authorized AND unauthorized paths, treasury-safety invariants INV-1..5,
and the external connector (read + a user-signed action) against a real Governor DAO. New contracts on
OpenZeppelin 5.4.0 only (paris-safe); treasury asset = platform USDC per network; ClearPath holds NO authority
over external DAOs (manage = user-signed actions). `[P]` = parallelizable (different files, no incomplete deps).

Phase ↔ plan mapping: Setup/Foundational → scaffolding · US1 → plan A · US2/US3 → plan B · US4/US5 → plan C ·
US6 → plan D · US7/US8 → plan E · Polish → plan F.

> **PIVOT (2026-06-24) — external-first; native DAOs deferred.** Implementing US1 surfaced a hard blocker:
> OZ 5.4.0 `GovernorUpgradeable` → `SignatureChecker` → `Bytes.sol` uses the Cancun `mcopy` opcode, so native
> OZ-Governor DAOs **cannot compile/deploy on pre-Cancun ETC/Mordor** (see memory `oz-governor-mcopy-mordor`).
> Per the user's decision, the **external-DAO connector ships first** (US3/US5 — `ExternalDAORegistry` is
> paris-safe: it imports only the `IGovernor` interface, no implementation; tracks Olympia + any Governor DAO on
> Mordor + Amoy). **Native DAO tasks (US1/US4/US6 — T010–T025, T039–T045, T050–T052) are DEFERRED** pending a
> governance-base choice (OZ Governor on Cancun chains / a custom paris-safe governor / vendor OZ 5.1). The
> drafted native OZ-Governor contracts were removed; their design remains in this spec's plan/contracts. New
> implementation order: **US3 (register/track) → US5 (manage) → US2 (unified discovery) → US7/US8 → polish.**

## Phase 1: Setup

- [ ] T001 Create the contract package skeleton `contracts/clearpath/` with subdirs `governance/`, `voting/`, `external/`, `interfaces/` and a short `contracts/clearpath/README.md` (purpose + "archive is reference-only")
- [X] T002 [P] Create the frontend module skeleton `frontend/src/components/clearpath/` (empty `clearpath.css` scoped under `.clearpath`, mapped onto `theme.css` variables) and `frontend/src/abis/` placeholders (`clearPathDAOFactory.js`, `externalDAORegistry.js`, `iGovernor.js`)
- [ ] T003 [P] Confirm OZ 5.4.0 governance availability + paris-safety: add a compile smoke contract `contracts/clearpath/governance/_GovImports.sol` importing `GovernorUpgradeable`/`TimelockControllerUpgradeable`/`ERC721VotesUpgradeable`/`ERC20VotesUpgradeable`; `npm run compile` green (delete after)

## Phase 2: Foundational (blocking prerequisites)

- [ ] T004 Add `contracts/clearpath/interfaces/IClearPathDAOFactory.sol` and `IExternalDAORegistry.sol` per `contracts/contracts.md` (events, structs, enums: `VotingKind`, `Framework`)
- [ ] T005 Add `DAO_MEMBER_ROLE = keccak256("DAO_MEMBER_ROLE")` gating helper usage notes; confirm `IMembershipManager.checkCanCreate/getActiveTier/recordCreate` + `ISanctionsGuard.checkBlocked` signatures wired (no new contract; reference `WagerRegistry` pattern)
- [ ] T006 [P] Extend `scripts/deploy/lib/upgradeable.js` usage in a new `scripts/deploy/deploy-clearpath.js` skeleton (resolve SanctionsGuard + MembershipManager + USDC from `deployments/<net>.json`; no deploy yet)
- [X] T007 [P] Add the ClearPath tab scaffold: register `{ id: 'clearpath', label: 'ClearPath' }` in `frontend/src/pages/WalletPage.jsx` `WALLET_TABS` + render a placeholder `<ClearPathPanel/>`; create `frontend/src/components/clearpath/ClearPathPanel.jsx` (self-disables via `useClearPath` when unsupported)
- [X] T008 [P] Add `frontend/src/components/clearpath/useClearPath.js` skeleton: per-chain factory/registry resolution via `getContractAddressForChain`, `isSupported`, honest tx-state wrapper, `useNotification` wiring (mirror `useTokenFactory`)
- [ ] T009 [P] Add subgraph base: append `DAO`, `ExternalDAO`, `Proposal`, `Vote`, `Member`, `GovernanceActivity` entities to `subgraph/schema.graphql` (no datasources yet)

## Phase 3: User Story 1 — Launch a native standard DAO (Priority: P1) 🎯 MVP

**Goal**: An authorized member creates a native OZ-Governor DAO (membership-NFT or token voting) with a USDC
treasury; it appears in My DAOs with its real on-chain governor + treasury.
**Independent test**: Create a token-voted DAO, confirm the deployed governor/timelock/treasury exist on-chain
and appear in My DAOs — no mock data.

- [ ] T010 [P] [US1] `contracts/clearpath/voting/MembershipNFT.sol` — `ERC721VotesUpgradeable` soulbound (transfers blocked except admin mint/burn), beacon-clone-ready, `__gap`
- [ ] T011 [P] [US1] `contracts/clearpath/governance/DAOTimelock.sol` — `TimelockControllerUpgradeable` wrapper (executor + USDC treasury holder), beacon-clone-ready
- [ ] T012 [US1] `contracts/clearpath/governance/StandardGovernor.sol` — `GovernorUpgradeable` + `GovernorSettings` + `GovernorCountingSimple` + `GovernorVotes` + `GovernorVotesQuorumFraction` + `GovernorTimelockControl` (OZ 5.4.0), beacon-clone-ready, `__gap`
- [ ] T013 [US1] `contracts/clearpath/ClearPathDAOFactory.sol` — UUPS (`UUPSManaged`), `createDAO` deploys beacon clones (governor/timelock/voting source), wires Timelock roles (governor = proposer/canceller, permissionless executor), tier (≥ Silver) + sanctions gated, network-scoped registry, `DAOCreated` event, append-only storage + `__gap`
- [ ] T014 [US1] Register `ClearPathDAOFactory` (+ beacon impls) in `npm run check:storage-layout` config
- [ ] T015 [P] [US1] Unit tests `test/clearpath/ClearPathDAOFactory.test.js` — create DAO (both voting kinds), tier gate (authorized + unauthorized), sanctions gate, registry rows, `DAOCreated`; treasury starts empty
- [ ] T016 [P] [US1] Unit tests `test/clearpath/StandardGovernor.test.js` + `MembershipNFT.test.js` — governor wiring (voting source, quorum, timelock), soulbound transfer-block
- [ ] T017 [P] [US1] Upgrade-lifecycle test `test/upgradeable/ClearPathDAOFactory.upgrade.test.js` — UUPS upgrade preserves registry; only `UPGRADER_ROLE` upgrades
- [ ] T018 [US1] Flesh out `scripts/deploy/deploy-clearpath.js` — deploy factory (UUPS) + beacons via `lib/upgradeable.js`, wire SanctionsGuard/MembershipManager/USDC, configure `DAO_MEMBER_ROLE` tier + authorize factory as MembershipManager caller; record proxies+impls in `deployments/`
- [ ] T019 [US1] Deploy to Mordor (63) + Amoy (80002); `npm run check:storage-layout` + `npm run sync:frontend-contracts`; verify via `scripts/deploy/verify.js`
- [ ] T020 [US1] Subgraph: `ClearPathDAOFactory` datasource in `subgraph/subgraph.yaml` + `src/mappings/clearpathFactory.ts` (`DAOCreated` → `DAO`); networks.json entry; codegen + build
- [ ] T021 [P] [US1] Matchstick `subgraph/tests/clearpath.test.ts` — `DAOCreated` indexes a `DAO` with governor/timelock/voting kind
- [ ] T022 [US1] Frontend `frontend/src/abis/clearPathDAOFactory.js` (create + reads) + extend `useClearPath.js` with `createDAO` (honest pending/confirmed/failed) + `listMyDAOs`
- [ ] T023 [US1] `frontend/src/components/clearpath/CreateDaoWizard.jsx` — name/purpose, voting source (membership-NFT default / token), USDC treasury, governance params, deployment summary, real create tx + `showNotification`
- [ ] T024 [US1] `frontend/src/components/clearpath/ClearPathPanel.jsx` — My Tokens-style "My DAOs" + Create tabs; summary strip; self-disable on unsupported networks (FR-016)
- [ ] T025 [P] [US1] Vitest `frontend/src/components/clearpath/__tests__/CreateDaoWizard.test.jsx` — create flow (both voting kinds), tier/sanctions block, honest state, no phantom rows

## Phase 4: User Story 2 — Discover, inspect & join DAOs (Priority: P1)

**Goal**: Browse native + external DAOs on the active network, open a detail view, join/follow.
**Independent test**: After creating a DAO, find it in Explorer, open detail (treasury/members match chain), join.

- [ ] T026 [US2] Extend `useClearPath.js` — `listAllDAOs` (native + external, network-scoped), `getDAO` live reads (treasury balance via USDC, member/holder count), `joinDAO`/follow
- [ ] T027 [US2] `frontend/src/components/clearpath/DaoDetailView.jsx` — Overview/Members/Treasury sub-tabs (capability-gated), real on-chain reads, inline `role="alert"` on load failure
- [ ] T028 [US2] Extend `ClearPathPanel.jsx` — Explorer tab (network-scoped) + unified My DAOs (native + external labeled by type)
- [ ] T029 [US2] Subgraph: index `Member` (join) + DAO list reads; extend `clearpathFactory.ts`; codegen + build
- [ ] T030 [P] [US2] Vitest `__tests__/DaoDetailView.test.jsx` + `ClearPathPanel.test.jsx` — explorer lists from chain/index, join flow, network-scope, truthful disable

## Phase 5: User Story 3 — Register & track an external DAO (Priority: P1)

**Goal**: Register an existing Governor DAO (Olympia) by address, validate it, track its real state read-only.
**Independent test**: Register Olympia on Mordor; treasury/proposals/membership shown match its on-chain state;
an EOA/non-Governor address is rejected; unreadable source → truthful "unavailable".

- [X] T031 [US3] `contracts/clearpath/external/ExternalDAORegistry.sol` — UUPS (`UUPSManaged`), `registerExternalDAO(dao, framework, label)` with ERC-165 `IGovernor` validation (+ defensive `COUNTING_MODE()`/`votingPeriod()` staticcalls), network-scoped, tier-gated, `ExternalDAORegistered`, duplicates rejected, NO authority over `dao`, `__gap`
- [ ] T032 [US3] Register `ExternalDAORegistry` in `check:storage-layout`; add to `deploy-clearpath.js`; deploy Mordor + Amoy; sync
- [X] T033 [P] [US3] Unit tests `test/clearpath/ExternalDAORegistry.test.js` — register valid Governor, reject EOA / non-Governor / duplicate / cross-network; tier gate; confers no authority (INV-4)
- [ ] T034 [US3] Subgraph: `ExternalDAORegistry` datasource + `src/mappings/externalRegistry.ts` (`ExternalDAORegistered` → `ExternalDAO`); codegen + build
- [ ] T035 [P] [US3] Matchstick: extend `clearpath.test.ts` — `ExternalDAORegistered` indexes an `ExternalDAO`
- [X] T036 [US3] `frontend/src/components/clearpath/connectors/governorConnector.js` — IGovernor read path (`state`, `proposalVotes`, `proposalDeadline`, `quorum`, voting token, timelock/treasury balance) + Olympia labeled addresses resolved per network (Mordor/ETC), verified not hardcoded blind
- [X] T037 [US3] `frontend/src/components/clearpath/RegisterExternalDao.jsx` (validate + register tx + `showNotification`) + `ExternalDaoView.jsx` (read-only tracking: treasury/proposals/members) + `clearpathSubgraph.js` (`fetchExternalDAOs`, truthful `{available:false}` fallback)
- [X] T038 [P] [US3] Vitest `__tests__/RegisterExternalDao.test.jsx` + `ExternalDaoView.test.jsx` — validation reject paths, tracked reads from mocked connector/subgraph, truthful disable (no fabricated rows)

## Phase 6: User Story 4 — Run a proposal on a native DAO (Priority: P2)

**Goal**: Propose a USDC treasury action, vote, queue after timelock, execute; treasury safety holds.
**Independent test**: Propose → reach quorum/success → queue → execute → recipient funded once; defeated → no action.

- [ ] T039 [US4] Extend `useClearPath.js` + `governorConnector.js` — `propose`, `castVote[WithReason]`, `queue`, `execute`, proposal `state`/tallies reads (shared native + external via IGovernor)
- [ ] T040 [US4] `frontend/src/components/clearpath/ProposalView.jsx` — submit proposal (USDC disbursement / param change), vote, queue, execute; live state + tallies; `showNotification`; recipient sanctions note
- [ ] T041 [US4] Extend `DaoDetailView.jsx` — Proposals sub-tab (list + open ProposalView)
- [ ] T042 [US4] Subgraph: per-DAO `Governor` data-source template (the spec-028 `TokenInstance` pattern), spawned on `DAOCreated`; `src/mappings/governor.ts` (`ProposalCreated`/`VoteCast`/`ProposalQueued`/`ProposalExecuted` → `Proposal`/`Vote`/`GovernanceActivity`); codegen + build
- [ ] T043 [P] [US4] Integration test `test/integration/clearpath/native-proposal.test.js` — full lifecycle on a real deployed native DAO: propose→vote→quorum→queue→execute funds recipient exactly once (INV-2); defeated → no action; over-treasury execute reverts (INV-1); sanctioned recipient blocked (INV-3); unauthorized propose rejected
- [ ] T044 [P] [US4] Matchstick: extend `clearpath.test.ts` — proposal/vote/execute events index `Proposal`/`Vote`/`GovernanceActivity`
- [ ] T045 [P] [US4] Vitest `__tests__/ProposalView.test.jsx` — propose/vote/queue/execute honest state, tallies, unauthorized + truthful disable

## Phase 7: User Story 5 — Manage an external DAO (Priority: P2)

**Goal**: Take user-signed governance actions (propose/vote/queue/execute) on a registered external DAO where its
own rules authorize the wallet; ClearPath holds no authority; deep-link fallback for unsupported frameworks.
**Independent test**: On a registered Olympia DAO, as a member-NFT holder, cast a vote through ClearPath (recorded
on Olympia); an unauthorized wallet is rejected by Olympia's rules.

- [ ] T046 [US5] Extend `ExternalDaoView.jsx` + `governorConnector.js` — user-signed `propose`/`castVote`/`queue`/`execute` against the external DAO; surface the external DAO's rejection reason; deep-link to the external app for unsupported frameworks
- [ ] T047 [US5] Sanctions on ClearPath-mediated external value moves (where applicable) + clear "externally deployed, ClearPath holds no authority" labeling (INV-4)
- [ ] T048 [P] [US5] Integration test `test/integration/clearpath/external-governor.test.js` — deploy a real OZ Governor (stand-in for Olympia), register it, cast a user-signed vote (authorized) and confirm it records on that governor; unauthorized wallet rejected by the governor; ClearPath holds no role on it
- [ ] T049 [P] [US5] Vitest `__tests__/ExternalDaoView.test.jsx` — management actions via mocked connector (authorized/rejected), deep-link fallback, no implied success

## Phase 8: User Story 6 — Administer a DAO: roles, parameters & ownership (Priority: P2)

**Goal**: Grant/revoke scoped roles, configure params, transfer/renounce ownership — least privilege, on-chain.
**Independent test**: Grant proposer to a 2nd wallet (only it+admin can propose), revoke (blocked), transfer ownership.

- [ ] T050 [US6] Extend `ClearPathDAOFactory`/governor wiring + `useClearPath.js` for role grant/revoke (Timelock/membership roles), param updates (GovernorSettings), ownership transfer/renounce
- [ ] T051 [US6] `frontend/src/components/clearpath/RolesPanel.jsx` (in `DaoDetailView` Roles sub-tab) — role table, grant/revoke, params, transfer/renounce (renounce behind confirm); `showNotification`
- [ ] T052 [P] [US6] Tests: `test/clearpath/dao-admin.test.js` (role gating authorized+unauthorized on-chain; param updates apply to new proposals; ownership moves) + Vitest `__tests__/RolesPanel.test.jsx`

## Phase 9: User Story 7 — Activity & event history (Priority: P3)

**Goal**: Per-DAO governance history (native + external), filterable, subgraph-sourced, truthful disable.

- [ ] T053 [US7] `frontend/src/components/clearpath/ActivityPanel.jsx` (in `DaoDetailView`) — event feed (type/actor/tx/time) + category filter (radiogroup); `clearpathSubgraph.js` `fetchActivity`; truthful subgraph-less disable
- [ ] T054 [P] [US7] Vitest `__tests__/ActivityPanel.test.jsx` — feed renders from mocked subgraph, filter, truthful disable (no fabricated rows)

## Phase 10: User Story 8 — Inspect the contract surface (Priority: P3)

**Goal**: Governor/treasury/token addresses, framework, per-network deployment, explorer links, copy address/ABI;
external DAOs labeled "externally deployed".

- [ ] T055 [US8] `frontend/src/components/clearpath/ContractPanel.jsx` (in `DaoDetailView`) — metadata + explorer deep links (explorer-aware) + copy address/ABI via shared `useClipboard` + `showNotification`; external label
- [ ] T056 [P] [US8] Vitest `__tests__/ContractPanel.test.jsx` — addresses/framework render truthfully, copy fires notification, external labeled, no implied authority

## Phase 11: Polish & cross-cutting

- [X] T057 [P] `frontend/src/test/clearpath.accessibility.test.jsx` — vitest-axe over ClearPath surfaces (CreateDaoWizard, DaoDetailView, ProposalView, ExternalDaoView, ContractPanel) — no violations; named to hit the gating CI a11y step
- [ ] T058 [P] `docs/developer-guide/clearpath-dao.md` (NEW) — native standard DAOs (OZ Governor/Timelock/Votes), external registry + connectors (Olympia/IGovernor), Account Center IA, no-authority posture, deploy/sync; note futarchy (spec 029) is the follow-on
- [ ] T059 [P] Update `docs/system-overview/governance.md` — "no DAO" → ClearPath as an opt-in module (native standard DAOs + external tracking)
- [ ] T060 Run Slither (proxy/clone/AccessControl/Governor detectors) + Medusa across `contracts/clearpath/`; axe/Lighthouse over the portal; resolve/justify — no new high/critical; record in `specs/030-clearpath-standard-daos/security-analysis.md`
- [ ] T061 Execute `quickstart.md` A–E on local + Mordor (incl. registering & tracking a REAL Olympia DAO and a user-signed external vote); record `validation-results.md`
- [ ] T062 Confirm `npm test`, `npm run test:frontend`, `npm run check:storage-layout`, and subgraph codegen+build+matchstick are green with no `continue-on-error` on test/lint/build/security gates (Principle IV)

## Dependencies

- Setup (T001–T003) → Foundational (T004–T009) → user stories.
- **US1 (T010–T025)** is the MVP and precedes all others (the factory + native DAO + tab).
- **US2 (T026–T030)** depends on US1 (DAOs to list) — establishes the unified explorer.
- **US3 (T031–T038)** depends on Foundational + the explorer (US2) for the unified list; the registry/connector are otherwise independent of US1's factory.
- **US4 (T039–T045)** depends on US1 (native DAO to propose on).
- **US5 (T046–T049)** depends on US3 (a registered external DAO) + the shared `governorConnector` (US3/US4).
- **US6 (T050–T052)** depends on US1.
- **US7 (T053–T054)** + **US8 (T055–T056)** depend on US1/US3 (data to show); read-only.
- Polish (T057–T062) last.

## Parallel execution examples

- Setup: T002, T003 in parallel with T001 done.
- US1 contracts: T010, T011 [P] (different files) before T012 (governor composes them) before T013 (factory).
- US1 tests: T015, T016, T017 [P] after their contracts compile.
- Cross-story [P]: Vitest tasks (T025/T030/T038/T045/T049/T052/T054/T056) are independent once their component exists.

## Implementation strategy

- **MVP = US1** (Phase 3): a member can create a native standard DAO with a USDC treasury and see it on-chain in
  the ClearPath tab — the smallest valuable, independently shippable slice (plan Phase A).
- Then **US2 + US3** (plan B) to land discovery + the external-DAO registry/tracking (Olympia) — the other P1 basics.
- Then **US4 + US5** (plan C) proposals + external management, **US6** (D) admin, **US7/US8** (E) activity/contract
  surface, **Polish** (F). Each phase ships with its tests + deploy/sync and is independently demoable.
