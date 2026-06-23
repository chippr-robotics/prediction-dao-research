---

description: "Task list for Token Mint & Compliant Token Administration"
---

# Tasks: Token Mint & Compliant Token Administration

**Input**: Design documents from `/specs/028-token-mint/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (all present)

**Tests**: Test tasks are **REQUIRED** — Constitution Principle II (Test-First, NON-NEGOTIABLE) mandates unit +
integration + (for external protocols) fork tests written alongside behavior. They are included throughout.

**Organization**: Tasks are grouped by user story (US1–US5 from spec.md) for independent implementation and
testing.

> **Implementation status (2026-06-23 — `/speckit-implement`).** The OZ-5-native contract layer is built and
> green: `TokenFactory` (UUPS, role+sanctions-gated, registry) + `OpenERC20`/`OpenERC721`/`RestrictedERC20`
> clone templates + interfaces + upgrade/bad-layout mocks, with 49 passing Hardhat tests (unit + integration +
> upgrade-lifecycle) and the factory registered in `check:storage-layout`. **Built on OpenZeppelin 5.4.0** —
> the user's "latest OZ across all features" directive resolves to *latest ETC-compatible* OZ (5.4.0), because
> OZ ≥5.5 pulls in the Cancun `mcopy` opcode (`EnumerableSet`→`Arrays`) and Mordor/ETC is pre-Cancun.
> **US4 (T-REX / ERC-3643) is DEFERRED** (T001 + T038–T047): the canonical T-REX suite only supports OZ 4.x +
> Solidity 0.8.17, incompatible with the repo's OZ pin. Remaining OZ-5-native work: deploy-script wiring,
> subgraph datasource, and the frontend module (wizard/list/admin + Vitest).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US5 (user-story phases only)
- Exact file paths included in each task

## Path Conventions

Web3 monorepo (per plan.md): contracts in `contracts/tokens/`, tests in `test/`, deploy in `scripts/deploy/`,
indexing in `subgraph/`, UI in `frontend/src/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and scaffolding shared by all stories.

- [ ] ⏸️ **DEFERRED (US4/T-REX — OZ-4 incompatible):** T001 Add the vendored ERC-3643 suite (`@tokenysolutions/t-rex`) and ONCHAINID (`@onchain-id/solidity`) as pinned dependencies in `package.json` and run install (sole new core dependency per plan Complexity Tracking)
- [X] T002 [P] Create the `contracts/tokens/` package skeleton (`interfaces/`, `templates/`, `compliance/`) with SPDX/pragma `^0.8.24` headers matching repo style
- [X] T003 [P] Add `{ name: "TokenFactory", deploymentsKey: "tokenFactory" }` to the contract list in `scripts/deploy/check-storage-layout.js`
- [X] T004 [P] Scaffold the frontend token module directory `frontend/src/components/tokens/` and a lazy route stub wired into the app shell (no logic yet)

**Checkpoint**: Package compiles empty; tooling recognizes the new contract + module.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The `TokenFactory` authority/registry that every issuance story builds on. **No user story can be
implemented until this phase is complete.**

**⚠️ CRITICAL**: Blocks US1–US5.

- [X] T005 [P] Define `TokenStandard` enum and `TokenRecord`/`TrexSuiteRef` structs and the `ITokenFactory` surface (events, create signatures, views) in `contracts/tokens/interfaces/ITokenFactory.sol` per `contracts/token-factory.md`
- [X] T006 Implement `TokenFactory` shell in `contracts/tokens/TokenFactory.sol`: inherit `UUPSManaged` + `ReentrancyGuardUpgradeable`; define `TOKEN_ISSUER_ROLE`; append-only storage (guard, template/gateway/module addresses, `tokenCount`, `tokens`, `issuerTokens`, `tokenAddressToId`) with trailing `__gap`; constructor disables initializers via base
- [X] T007 Implement `TokenFactory.initialize(admin, sanctionsGuard_, …)` (calls `__UUPSManaged_init` first, then `__ReentrancyGuard_init`; one-time `initializer`) and the `onlyRole(DEFAULT_ADMIN_ROLE)` admin setters (`setSanctionsGuard`, `setTemplate`, `setTrexGateway`, `setSanctionsComplianceModule`) in `contracts/tokens/TokenFactory.sol`
- [X] T008 Implement the shared issuance internals in `contracts/tokens/TokenFactory.sol`: a sanctions-screening check on `msg.sender` (fail-closed via `ISanctionsGuard`, `address(0)` disables), an append-only `_recordToken(...)` helper (CEI — write only after successful deploy) emitting `TokenCreated`, and the registry views (`getToken`, `getTokensByIssuer`, `getTokenIdByAddress`, `tokenCount`)
- [X] T009 [P] Write `test/tokens/TokenFactory.test.js`: role/sanctions gating on a stub `create`, registry append/views, network-scoped reads, no-write-on-revert (CEI), admin-setter authorization
- [X] T010 [P] Write `test/upgradeable/TokenFactory.upgrade.test.js`: deploy proxy → upgrade → state preserved → non-`UPGRADER_ROLE` rejected → re-init rejected → storage-incompatible impl rejected by OZ `validateUpgrade`
- [X] T011 Extend `scripts/deploy/deploy.js` to deploy `TokenFactory` as proxy+impl via `scripts/deploy/lib/upgradeable.js`, grant `TOKEN_ISSUER_ROLE`/wire `SanctionsGuard`, and record `tokenFactory` + `tokenFactoryImpl` in `deployments/*.json` (template/suite addresses filled by later phases)
- [X] T012 [P] Verify `npm run check:storage-layout` passes for the `TokenFactory` baseline and document the EthTrust-SL ≥ L2 reasoning stub in `contracts/tokens/TokenFactory.sol` NatSpec
- [X] T013 [P] Add a frontend network-gating utility in `frontend/src/components/tokens/useTokenFactory.js` that resolves the `tokenFactory` address from synced artifacts for the active chain and disables the feature when absent (FR-023)

**Checkpoint**: `TokenFactory` deploys, upgrades safely, gates issuance by role + sanctions, and records tokens — ready for per-class entrypoints.

---

## Phase 3: User Story 1 - Issue an open token (Priority: P1) 🎯 MVP

**Goal**: An authorized issuer creates an open ERC-20 (and ERC-721) token via a real on-chain transaction and sees it confirmed in their token list with its deployed address.

**Independent Test**: Connect an authorized wallet, create an ERC-20 (name/symbol/supply/decimals), confirm the tx, and verify the deployed token holds the expected supply and metadata — no mock data.

### Tests for User Story 1 ⚠️ (write first, ensure they fail)

- [X] T014 [P] [US1] `test/tokens/OpenERC20.test.js`: each variant (basic/burnable/pausable/burnable+pausable) initializes once, mints initial supply to owner, exposes only selected options; template itself cannot be re-initialized
- [X] T015 [P] [US1] `test/tokens/OpenERC721.test.js`: basic/burnable collection init, owner `mint(to,uri)`, holder `burn` (burnable only)
- [X] T016 [P] [US1] `test/integration/tokens/open-token-create.test.js`: `createOpenERC20`/`createOpenERC721` happy path (event, deployed token, single registry record, issuer list), unauthorized caller rejected, sanctioned issuer rejected (no registry write)

### Implementation for User Story 1

- [X] T017 [P] [US1] Implement `contracts/tokens/templates/OpenERC20.sol` (OZ `ERC20`/`ERC20Burnable`/`ERC20Pausable` + `Ownable`, initializable clone, `_initialized` lockout) with owner `mint`, `pause`/`unpause`, and a fail-closed `SanctionsGuard` check in `_update` per `contracts/open-tokens.md`
- [X] T018 [P] [US1] Implement `contracts/tokens/templates/OpenERC721.sol` (OZ `ERC721`+`ERC721URIStorage`(+`ERC721Burnable`) + `Ownable`, initializable clone) with owner `mint(to,uri)` and the `SanctionsGuard` transfer-hook check
- [X] T019 [US1] Add `createOpenERC20(...)` and `createOpenERC721(...)` to `contracts/tokens/TokenFactory.sol` (clone the matching template, `initialize` with `msg.sender` as owner + the guard, `_recordToken`) — depends on T008, T017, T018
- [X] T020 [US1] Extend `scripts/deploy/deploy.js` to deploy the open ERC-20 (4 variants) and ERC-721 (2 variants) implementation templates, pass them to `TokenFactory.initialize`, and record their addresses in `deployments/*.json`
- [X] T021 [P] [US1] Add the `TokenCreated` handler + `Token` entity (id, standard, address, issuer, name, symbol, createdAt) to `subgraph/` (schema + mapping + manifest datasource on `TokenFactory`) for subgraph-enabled networks (Amoy/Polygon); ensure the frontend reads fall back to on-chain factory-registry RPC reads on subgraph-less networks (Mordor)
- [X] T022 [US1] Build the open-token creation wizard step in `frontend/src/components/tokens/CreateTokenWizard.jsx` (choose ERC-20/721, configure name/symbol/decimals/supply/burnable/pausable, submit real tx) with honest pending/confirmed/failed state (no finalized-before-confirm) — uses `useTokenFactory`
- [X] T023 [US1] Render the issuer's token list in `frontend/src/components/tokens/TokenList.jsx` from the subgraph + on-chain reads, showing only the active network's tokens and never a token before its tx confirms
- [X] T024 [US1] Run `npm run sync:frontend-contracts` and wire the `TokenFactory`/template ABIs+addresses into the frontend via the synced artifacts (no hand-copied addresses)
- [X] T025 [P] [US1] `frontend` Vitest in `frontend/src/components/tokens/__tests__/CreateTokenWizard.test.jsx`: form validation (empty name/symbol, bad decimals/supply), pending→confirmed UI transitions, no phantom token on reject

**Checkpoint**: An authorized user can mint an open ERC-20/721 end-to-end against real chain state and see it listed — MVP deployable.

---

## Phase 4: User Story 2 - Administer a token I issued (Priority: P1)

**Goal**: An issuer administers an open token they own — mint more, pause/unpause, transfer ownership — through a surface that exposes only the controls the token supports.

**Independent Test**: As owner of a pausable token, pause it, confirm transfers are blocked, unpause, confirm they resume — observing real on-chain state.

### Tests for User Story 2 ⚠️

- [X] T026 [P] [US2] `test/integration/tokens/open-token-admin.test.js`: owner `mint` increases balance/supply (non-owner rejected); `pause` blocks transfers, `unpause` resumes; non-pausable token has no pause; ownership transfer moves authority (FR-018/FR-019/FR-020)

### Implementation for User Story 2

- [X] T027 [US2] Confirm/extend ownership-transfer support on the open templates in `contracts/tokens/templates/OpenERC20.sol` and `OpenERC721.sol` (OZ `Ownable` transfer; emit on transfer) — depends on T017/T018
- [X] T028 [US2] Build the per-token admin surface `frontend/src/components/tokens/TokenAdminPanel.jsx` that reads the token's standard/capabilities and renders **only** valid controls (mint always; pause/unpause if pausable; burn note if burnable; transfer ownership), each as a real tx with honest state
- [X] T029 [P] [US2] `frontend` Vitest in `frontend/src/components/tokens/__tests__/TokenAdminPanel.test.jsx`: capability-gated rendering (no pause control for non-pausable), unauthorized action surfaces the on-chain rejection reason

**Checkpoint**: US1 + US2 give a complete open-token issue→administer lifecycle.

---

## Phase 5: User Story 3 - Issue a restricted token with transfer rules (Priority: P2)

**Goal**: An issuer creates an ERC-1404 restricted token, configures eligibility/freeze, and gets human-readable reasons for blocked transfers with a pre-transfer eligibility check that matches the actual transfer.

**Independent Test**: Create a restricted token, mark an address ineligible, attempt a transfer to it, verify rejection with the expected reason, and verify the pre-check returns the same reason without moving tokens.

### Tests for User Story 3 ⚠️

- [X] T030 [P] [US3] `test/tokens/RestrictedERC20.test.js`: detector/transfer parity for SUCCESS/SENDER_NOT_ELIGIBLE/RECIPIENT_NOT_ELIGIBLE/SENDER_FROZEN/SANCTIONED; `messageForTransferRestriction` strings; sanctions dominates eligibility; eligibility/freeze admin owner-only
- [X] T031 [P] [US3] `test/integration/tokens/restricted-token.test.js`: `createRestrictedERC20` happy path + record; eligible↔eligible transfer succeeds; ineligible transfer reverts with reason

### Implementation for User Story 3

- [X] T032 [P] [US3] Define the Simple Restricted Token interface in `contracts/tokens/interfaces/IERC1404.sol` (`detectTransferRestriction`, `messageForTransferRestriction`)
- [X] T033 [US3] Implement `contracts/tokens/templates/RestrictedERC20.sol` per `contracts/erc1404-restricted.md`: eligibility + freeze + `SanctionsGuard` policy, fixed reason enum, detector and `_update` evaluating the **same** policy (sanctions→frozen→eligibility), owner admin (`setEligible[Batch]`, `setFrozen`, `mint`) — depends on T032
- [X] T034 [US3] Add `createRestrictedERC20(...)` to `contracts/tokens/TokenFactory.sol` (clone template, init with initial eligibility + guard, `_recordToken`) — depends on T008, T033
- [X] T035 [US3] Extend `scripts/deploy/deploy.js` to deploy the `RestrictedERC20` template and record its address; add the `RESTRICTED_ERC1404` standard to the subgraph mapping
- [X] T036 [US3] Add the restricted-token path to `CreateTokenWizard.jsx` and a policy admin section (eligibility list, freeze) plus an **eligibility pre-check** display calling `detectTransferRestriction` in `frontend/src/components/tokens/TokenAdminPanel.jsx`
- [X] T037 [P] [US3] `frontend` Vitest covering the eligibility pre-check display matching on-chain restriction codes/messages

**Checkpoint**: US1–US3 functional; compliant transfer restrictions with honest reasons.

---

## Phase 6: User Story 4 - Issue & administer a permissioned security token (T-REX / ERC-3643) (Priority: P2)

**Goal**: An issuer creates a permissioned security token (identity-verified holders, compliance modules, trusted issuers) and an agent administers it (freeze, forced transfer, recovery, mint/burn, pause).

**Independent Test**: Create a permissioned token, register two holders with valid claims, transfer between them; omit a recipient's required claim and confirm the transfer is blocked; as agent, freeze an account and confirm its tokens can't move until unfrozen.

### Tests for User Story 4 ⚠️ (fork + integration — vendored suite)

- [ ] ⏸️ **DEFERRED (US4/T-REX — OZ-4 incompatible):** T038 [P] [US4] `test/tokens/erc3643/SanctionsComplianceModule.test.js`: `moduleCheck`/`canTransfer` deny when `SanctionsGuard` denies sender or recipient; no-op hooks; fail-closed
- [ ] ⏸️ **DEFERRED (US4/T-REX — OZ-4 incompatible):** T039 [P] [US4] `test/fork/erc3643-permissioned.test.js`: identity/claim enforcement (verified↔verified succeeds; missing claim reverts); compliance-rule rejection
- [ ] ⏸️ **DEFERRED (US4/T-REX — OZ-4 incompatible):** T040 [P] [US4] `test/fork/erc3643-admin.test.js`: agent freeze (full + partial), forced transfer, recovery to same-identity wallet (and rejection without it), mint/burn, pause; non-agent/owner rejected; sanctioned holder blocked via module despite valid claims

### Implementation for User Story 4

- [ ] ⏸️ **DEFERRED (US4/T-REX — OZ-4 incompatible):** T041 [P] [US4] Implement `contracts/tokens/compliance/SanctionsComplianceModule.sol` implementing the T-REX Modular Compliance `IModule` interface, delegating `moduleCheck`/`canTransfer` to `ISanctionsGuard.isAllowed` (fail-closed), per `contracts/erc3643-trex.md`
- [ ] ⏸️ **DEFERRED (US4/T-REX — OZ-4 incompatible):** T042 [US4] Add T-REX suite deployment wiring to `scripts/deploy/deploy.js` (deploy/configure the TREX gateway/factory + ONCHAINID infra, deploy `SanctionsComplianceModule`, record gateway/module/suite addresses in `deployments/*.json`); pass gateway+module to `TokenFactory.initialize`
- [ ] ⏸️ **DEFERRED (US4/T-REX — OZ-4 incompatible):** T043 [US4] Add `createPermissionedERC3643(TrexParams)` to `contracts/tokens/TokenFactory.sol`: deploy the per-token suite via the gateway with issuer as owner + requested claim topics/trusted issuers, bind `sanctionsComplianceModule` to the token's Modular Compliance, `_recordToken` with suite refs — depends on T008, T041, T042
- [ ] ⏸️ **DEFERRED (US4/T-REX — OZ-4 incompatible):** T044 [US4] Add the `PERMISSIONED_ERC3643` standard + suite refs to the subgraph schema/mapping
- [ ] ⏸️ **DEFERRED (US4/T-REX — OZ-4 incompatible):** T045 [US4] Add the permissioned-token path to `CreateTokenWizard.jsx` (configure claim topics, trusted issuers, compliance options) with real tx + honest state
- [ ] ⏸️ **DEFERRED (US4/T-REX — OZ-4 incompatible):** T046 [US4] Build the permissioned admin surface in `frontend/src/components/tokens/PermissionedAdminPanel.jsx`: agent actions (freeze/unfreeze full+partial, forced transfer, recovery, mint/burn, pause) and registry management (register identity, claim topics, trusted issuers), each gated to the connected actor's authority
- [ ] ⏸️ **DEFERRED (US4/T-REX — OZ-4 incompatible):** T047 [P] [US4] `frontend` Vitest for capability/authority-gated rendering of the permissioned admin surface (agent-only controls hidden/blocked for non-agents)

**Checkpoint**: US1–US4 functional; institutional-grade compliant tokens with full agent administration.

---

## Phase 7: User Story 5 - Discover and inspect tokens (Priority: P3)

**Goal**: Any user can view a token's public profile (standard, metadata, live supply, governing-rule summary); issuers see all tokens they administer; data is strictly network-scoped.

**Independent Test**: After creating tokens of different standards, open the list and each detail view and confirm displayed standard/metadata/supply match real on-chain values, and switching networks shows only that network's tokens.

### Tests for User Story 5 ⚠️

- [X] T048 [P] [US5] `frontend` Vitest in `frontend/src/components/tokens/__tests__/TokenDetail.test.jsx`: detail view renders standard/metadata/live supply + rule summary from real data; network switch filters tokens; unsupported network shows disabled state (no mock list)
- [X] T049 [P] [US5] `subgraph` test/query check that `Token` entities are network-scoped and queryable by issuer and standard

### Implementation for User Story 5

- [X] T050 [US5] Implement the token detail view `frontend/src/components/tokens/TokenDetail.jsx` (standard, name/symbol, metadata, live supply via on-chain read, and for compliant tokens a truthful governing-rule summary) — reuses subgraph + `useTokenFactory`
- [X] T051 [US5] Finalize discovery in `TokenList.jsx`: issuer-administered list + public browse, standard badges, strict active-network scoping and unsupported-network disable (FR-023/FR-025)
- [X] T052 [P] [US5] Extend the subgraph mapping to populate live supply/rule-summary fields needed for discovery (or document the on-chain read path where indexing isn't appropriate)

**Checkpoint**: All five user stories independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Hardening, docs, and the constitution gates that span all stories.

> **Status (2026-06-23):** T053 (dev guide) + T059 (CI gates) done. T054 (Slither/Medusa), T056 (axe/
> Lighthouse), T057 (gas report) are **CI/tooling-gated** — Slither/Medusa/Lighthouse aren't installed locally;
> they run in CI (`test:gas` for gas). An adversarial multi-agent security review of the new contracts found
> **0 confirmed findings** (substitutes for, but does not replace, the `.github/agents` review in T055).
> T058's quickstart was validated on a **local** in-process deploy; Amoy/Mordor need the floppy key + RPC.
> Issuance gas is low by construction (EIP-1167 clones: one CREATE + initialize).

- [X] T053 [P] Add a developer guide `docs/developer-guide/token-mint.md` (standards supported, issuance flow, admin surfaces, sanctions integration, upgrade/deploy notes) and link it from the docs index
- [ ] T054 [P] Run Slither (clone/proxy/UUPS detectors) and Medusa fuzzing across `contracts/tokens/`; resolve or document (with rationale) any high/critical finding — no new high/critical may remain
- [ ] T055 Complete the smart-contract security-agent review (`.github/agents/`) for the token contracts and record EthTrust-SL ≥ L2 reasoning in plan/contract NatSpec
- [ ] T056 [P] Run axe/Lighthouse accessibility audits on the token module (WCAG 2.1 AA) and fix violations; ensure ESLint passes with no errors
- [ ] T057 [P] Add a gas report for issuance/admin paths (`npm run test:gas`) and confirm clone-based issuance stays within target (SC-001 < 3 min end-to-end)
- [ ] T058 Execute the full `specs/028-token-mint/quickstart.md` validation on local + Amoy + Mordor and confirm every scenario passes against real chain state (on Mordor, confirm discovery reads the factory registry over RPC since there is no subgraph)
- [X] T059 [P] Verify `npm test`, `npm run test:fork`, `npm run test:frontend`, and `npm run check:storage-layout` are green in CI with no `continue-on-error` on test/lint/build/security steps (Principle IV)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS all user stories** (the factory is the issuance authority).
- **User Stories (Phase 3–7)**: All depend on Foundational. US1 is the MVP; US2 depends on US1's templates; US3/US4/US5 depend only on the factory foundation and can proceed in parallel after Phase 2 (US5 is richer once US1–US4 produce tokens to display).
- **Polish (Phase 8)**: Depends on the desired stories being complete.

### User Story Dependencies

- **US1 (P1)**: After Foundational. No dependency on other stories.
- **US2 (P1)**: Builds on US1's open templates (admin surface over the same contracts).
- **US3 (P2)**: After Foundational. Independent of US1/US2 (own template + entrypoint).
- **US4 (P2)**: After Foundational. Independent (vendored suite + module + entrypoint).
- **US5 (P3)**: After Foundational; most valuable once US1–US4 exist to populate discovery. Independently testable with whatever tokens exist.

### Within Each User Story

- Tests written first and failing before implementation (Principle II).
- Interfaces → templates/modules → factory entrypoint → deploy/subgraph → frontend.
- Contract behavior before its frontend surface.

### Parallel Opportunities

- Setup: T002/T003/T004 in parallel.
- Foundational: T009/T010 (tests) parallel; T012/T013 parallel after the contract compiles.
- US1: T014/T015/T016 (tests) parallel; T017/T018 (templates) parallel; T021/T025 parallel.
- US3 and US4 can be developed by different contributors in parallel after Phase 2.
- Polish: T053/T054/T056/T057/T059 largely parallel.

---

## Parallel Example: User Story 1

```bash
# Tests first (parallel):
Task: "test/tokens/OpenERC20.test.js — variant init/mint/options + template lockout"
Task: "test/tokens/OpenERC721.test.js — collection init/mint/burn"
Task: "test/integration/tokens/open-token-create.test.js — create happy path + auth/sanctions rejection"

# Then templates (parallel, different files):
Task: "contracts/tokens/templates/OpenERC20.sol"
Task: "contracts/tokens/templates/OpenERC721.sol"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1: Setup.
2. Phase 2: Foundational `TokenFactory` (CRITICAL — blocks everything).
3. Phase 3: US1 (open ERC-20/721 issuance + list).
4. **STOP and VALIDATE**: create an ERC-20 end-to-end on a real chain; confirm no mock data and honest tx state.
5. Deploy/demo (MVP).

### Incremental Delivery

1. Setup + Foundational → factory live and upgrade-safe.
2. + US1 → issue open tokens (MVP).
3. + US2 → administer open tokens.
4. + US3 → ERC-1404 restricted tokens.
5. + US4 → T-REX/ERC-3643 permissioned tokens (the headline differentiator).
6. + US5 → discovery/inspection.
7. Polish → security review, audits, quickstart, CI gates.

### Parallel Team Strategy

After Phase 2: Dev A → US1→US2 (open + admin); Dev B → US3 (ERC-1404); Dev C → US4 (T-REX); US5 folds in once tokens exist. Each story is independently testable.

---

## Notes

- `[P]` = different files, no incomplete-task dependencies.
- Every admin action task pairs success and unauthorized-rejection coverage (SC-004).
- Sanctions screening is non-bypassable in every class (FR-021) — covered in each story's tests, not deferred.
- Issued tokens are immutable clones (open/1404); only `TokenFactory` is upgradeable (append-only storage, gated by `check:storage-layout`).
- Frontend addresses/ABIs come only from `sync:frontend-contracts`.
- Commit after each task or logical group; stop at any checkpoint to validate independently.

---

# EXPANSION — Administration portal (US6–US13)

> Appended 2026-06-23 (`/speckit-tasks`). Builds on the live MVP (T001–T059). Plan:
> `plan.md` "Expansion plan"; design: research R9–R16, `contracts/roles-controls-caps.md`,
> `contracts/indexing-and-frontend.md`. **OZ 5.4.0**, reuse platform primitives, no new
> deps. **Snapshots/dividends OUT OF SCOPE** (OZ 5.x removed ERC20Snapshot); **T-REX
> (US4) deferred**. Six independently-shippable phases, P2 before P3. v2 role-based
> templates are NEW (existing immutable v1 tokens are untouched; frontend detects model).

## Phase 9: P2-a — Role-based v2 templates + caps + factory slots (US6, US9 foundation)

**Goal**: New tokens issue on `AccessControlEnumerable` with optional `ERC20Capped` caps,
a shared transfer-policy, bounded batch ops, and role-based ownership — registered as new
factory template slots; existing v1 tokens unchanged.

**Independent test**: Create a v2 capped ERC-20 on a real chain; mint to cap (over-cap
reverts), grant/revoke MINTER, transfer + renounce ownership — all role-gated.

- [X] T060 [P] [US6] Define the shared transfer-policy + roles interface in `contracts/tokens/lib/TransferPolicy.sol` (eval order sanctions→paused→frozen→eligibility, restriction-code enum) and `contracts/tokens/interfaces/ITokenRolesV2.sol` (role ids, events) per `contracts/roles-controls-caps.md`
- [X] T061 [P] [US6] `test/tokens/OpenERC20V2.test.js`: role gating (minter/pauser/burner), `ERC20Capped` over-cap revert + uncapped(cap 0), `batchTransfer`/`batchMint` happy path + `MAX_BATCH` revert, sanctions hook both directions, ownership transfer/renounce, clone/template re-init lockout — write first, ensure fail
- [X] T062 [P] [US6] `test/tokens/OpenERC721V2.test.js`: roles, `mint(to,uri)`, holder/burner burn, batch mint bound, sanctions hook, lockout
- [X] T063 [P] [US6] `test/tokens/RestrictedERC20V2.test.js`: COMPLIANCE-gated eligibility/freeze, detector⇄`_update` parity for every code, settable default message, caps, batch, roles
- [X] T064 [US6] Implement `contracts/tokens/templates/OpenERC20V2.sol` (`AccessControlEnumerableUpgradeable` + `ERC20CappedUpgradeable` + `ERC20PausableUpgradeable` + `ERC20BurnableUpgradeable` + TransferPolicy + bounded batch; `_disableInitializers`; one-time `initialize` granting all roles to owner) — depends on T060
- [X] T065 [US6] Implement `contracts/tokens/templates/OpenERC721V2.sol` (AccessControlEnumerable + ERC721URIStorage(+Burnable) + policy + bounded batchMint) — depends on T060
- [X] T066 [US6] Implement `contracts/tokens/templates/RestrictedERC20V2.sol` (OpenERC20V2 + IERC1404 detector/message + COMPLIANCE eligibility/freeze + default message) — depends on T060, T064
- [X] T067 [US6] Extend `contracts/tokens/TokenFactory.sol`: append-only v2 template slots (`openERC20V2Impl`/`openERC721V2Impl`/`restrictedERC20V2Impl`, reducing `__gap`), `setTemplate` v2 cases, and `createOpenERC20V2/createOpenERC721V2/createRestrictedERC20V2(... cap, options ...)` entrypoints (clone+init owner-as-admin, `_recordToken`) — keep v1 entrypoints intact; depends on T008/T064/T065/T066
- [X] T068 [P] [US6] `test/integration/tokens/v2-create-admin.test.js`: factory creates each v2 class, issuer holds all roles, cap enforced, ownership transfer/renounce, unauthorized + sanctioned-issuer rejected (no registry write)
- [X] T069 [US6] Verify `npm run check:storage-layout` passes for the extended `TokenFactory` (append-only) and update `test/upgradeable/TokenFactory.upgrade.test.js` to cover the new slots — depends on T067
- [X] T070 [US6] Extend `scripts/deploy/deploy-token-factory.js` + `scripts/deploy/deploy.js` + `verify.js` to deploy/register/verify the three v2 templates and record their addresses; deploy to Mordor and `npm run sync:frontend-contracts`

**Checkpoint**: v2 role-based capped tokens issue + administer on a real chain (Mordor).

## Phase 10: P2-b — Transfer controls + compliance admin (US7, US8)

**Goal**: Pause + an enumerable freeze list, and full ERC-1404 allowlist management with a
configurable default restriction message — on the v2 templates.

**Independent test**: Pause blocks transfers; freeze an address (appears in the list) then
unfreeze; add/revoke allowlist entries and confirm detector parity + the default message.

- [X] T071 [US7] Add an enumerable frozen-address set + views (`frozenList`/`frozenCount`) to `contracts/tokens/lib/TransferPolicy.sol` / the v2 templates so the UI can list currently-frozen wallets (FR-033) — depends on T064
- [X] T072 [P] [US7] `test/tokens/v2-transfer-controls.test.js`: pause/unpause gating (PAUSER), freeze/unfreeze gating (COMPLIANCE) + frozen-list view, frozen balance cannot move, both authorized + unauthorized paths
- [X] T073 [US8] Finalize compliance setters on `RestrictedERC20V2.sol`: `setEligible`/`setEligibleBatch` (COMPLIANCE), `setDefaultRestrictionMessage`, fixed restriction-code map — depends on T066
- [X] T074 [P] [US8] `test/integration/tokens/v2-compliance.test.js`: allowlist add/batch/revoke changes eligibility; ineligible transfer reverts with code+message; default message settable; sanctions dominates eligibility
- [X] T075 [US8] Run Slither/Medusa locally where available (else document for CI) over the v2 templates + policy lib; resolve/justify any high/critical — no new high/critical

**Checkpoint**: v2 transfer controls + compliance fully enforced on-chain with tests.

## Phase 11: P2-c — Portal IA + capability detection + create flow + theme-aware UI (US9 UI, FR-027/028/045)

**Goal**: Restructure the Tokens tab to the My Tokens / Create / Explorer IA with a
per-token detail (sub-tabs gated by standard + authority + model), the standard-cards
create flow, and theme-aware styling mapped onto the app theme variables.

**Independent test**: In dark + light mode, the Tokens tab renders the tabs + detail
sub-tabs; only valid controls show per token; creating a v2 capped token works end-to-end.

- [X] T076 [US9] Add `frontend/src/components/tokens/tokens.css`: map the imported design (forest-green + IBM Plex, scoped) onto `theme.css` variables (`--brand-primary`, `--surface-color`, `--text-*`, `--border-color`, `--semantic-*`, `--radius-*`, `--shadow-*`) so it respects light/dark (R16)
- [X] T077 [US9] Extend `frontend/src/components/tokens/useTokenFactory.js` with per-token **capability detection** (probe v2 `hasRole`/`getRoleMember` vs v1 `owner()`, standard, flags, cap) → a capability profile driving control gating (FR-028, SC-014)
- [X] T078 [US9] Restructure `frontend/src/components/tokens/TokensPanel.jsx` into My Tokens / Create / Explorer sub-tabs + summary metric strip (FR-027) using `tokens.css`
- [X] T079 [US9] Rebuild `frontend/src/components/tokens/CreateTokenWizard.jsx` to the standard-cards + parameters + options (burnable/pausable/capped) + deployment-summary-rail flow calling the v2 `create*` entrypoints (real tx, honest state) (FR-045)
- [X] T080 [US9] Rebuild `frontend/src/components/tokens/TokenDetail.jsx` (or a new `TokenDetailPanel`) into the identity header + stat cards + capability-gated sub-tabs (Overview, Supply, Transfer Controls, Compliance, Roles & Ownership, Contract) — only sub-tabs valid for the token render
- [X] T081 [US9] Implement the Roles & Ownership sub-tab: role grant/revoke table (from `getRoleMember`), transfer ownership, renounce (confirm-gated) — real tx; non-admin controls disabled with surfaced reason
- [X] T082 [US9] Implement the Supply + Transfer-Controls sub-tabs: mint/burn (+ cap progress/headroom), pause/unpause, freeze list + freeze/unfreeze, ERC-1404 eligibility + default message + pre-check — wiring the v2 contract calls
- [X] T083 [P] [US9] `frontend` Vitest `frontend/src/components/tokens/__tests__/TokenDetailPanel.test.jsx`: capability-gated sub-tab rendering (v1 Ownable vs v2 roles; restricted vs open; capped vs uncapped), unauthorized controls disabled, theme tokens resolve in light + dark
- [X] T084 [P] [US9] `frontend` Vitest for the rebuilt CreateTokenWizard (standard cards, capped option, summary rail, real-tx pending/confirmed/failed, no phantom on reject)

**Checkpoint**: full theme-aware portal IA over the v2 tokens; capability-gated, dark-mode-aware.

## Phase 12: P3-a — Batch distribute / airdrop UI (US11)

**Goal**: An airdrop UI over the v2 `batchTransfer`/`batchMint` with a pre-submission
preview; honest handling of the `MAX_BATCH` bound.

**Independent test**: Paste recipients+amounts; preview shows count/total; submit updates
all balances in one tx; over-limit lists surface the bound (no silent truncation).

- [ ] T085 [US11] Implement the Distributions sub-tab `frontend/src/components/tokens/DistributePanel.jsx`: recipients+amounts input, computed count/total preview, `MAX_BATCH` surfaced, real `batchTransfer`/`batchMint` tx with honest state
- [ ] T086 [P] [US11] `frontend` Vitest: preview math, over-`MAX_BATCH` surfaces the limit (no truncation), pending→confirmed transitions

**Checkpoint**: batch airdrop usable end-to-end against a v2 token.

## Phase 13: P3-b — Holder cap table + activity via indexing (US10, US12)

**Goal**: Index per-token Transfer + admin events into Holder/TokenActivity and surface the
cap table + activity feed, with truthful disable on subgraph-less networks.

**Independent test**: On a subgraph network, the cap table + activity reflect real
balances/events; on Mordor they show a truthful "unavailable" state (no fabricated rows).

- [ ] T087 [US10] Add `Holder` + `TokenActivity` entities to `subgraph/schema.graphql` and a per-token **data-source template** in `subgraph/subgraph.yaml` (`templates:`) for the v2 token ABI
- [ ] T088 [US10] Add `subgraph/src/mappings/token.ts`: spawn the template from the `TokenCreated` handler; handle `Transfer` → `Holder` balances/firstHeldAt and admin events (mint/burn/Paused/Unpaused/Frozen/RoleGranted/RoleRevoked) → `TokenActivity`
- [ ] T089 [P] [US10] Matchstick `subgraph/tests/token.test.ts`: Transfer builds Holder balances + cap-table %; admin events build TokenActivity; codegen + build + matchstick green
- [ ] T090 [US10] Frontend Holders sub-tab `frontend/src/components/tokens/HoldersPanel.jsx`: ranked cap table (address/label/balance/%/since) + distribution bar + CSV export from the subgraph; truthful disabled state on subgraph-less nets (own `balanceOf` may show) — no fabricated rows
- [ ] T091 [US12] Frontend Activity sub-tab `frontend/src/components/tokens/ActivityPanel.jsx`: event feed (type/detail/actor/tx/time) with category filter from the subgraph; truthful disable where unindexed
- [ ] T092 [P] [US10] [US12] `frontend` Vitest: cap table + activity render from indexed data; truthful disabled state when indexing absent (assert no fabricated rows)

**Checkpoint**: holders + activity live where indexed; honest fallback elsewhere.

## Phase 14: P3-c — Contract surface (US13)

**Goal**: A read-only contract sub-tab: metadata, verification status + explorer links,
per-network deployments, copy address/ABI.

**Independent test**: The contract sub-tab shows real metadata/verification/deployments for
a deployed token; copy address + ABI produce correct values.

- [ ] T093 [US13] Implement the Contract sub-tab `frontend/src/components/tokens/ContractPanel.jsx`: metadata (standard, decimals, cap, deployed address), verification status + block-explorer/source links (from network config), per-network deployment list, copy address + copy ABI — all from synced artifacts/real reads
- [ ] T094 [P] [US13] `frontend` Vitest: contract metadata renders; verification reported truthfully (not implied verified); copy address/ABI correct

## Phase 15: Polish & cross-cutting (expansion)

- [ ] T095 [P] Update `docs/developer-guide/token-mint.md` for the v2 role model, caps, transfer controls, batch, holders/activity indexing, and the portal IA; note snapshots out-of-scope + T-REX deferred
- [ ] T096 [P] Run Slither (clone/proxy/AccessControl/cap detectors) + Medusa across the v2 contracts; axe/Lighthouse over the rebuilt portal (WCAG 2.1 AA, light + dark); resolve/justify findings — no new high/critical
- [ ] T097 Execute `quickstart.md` "Expansion validation" (A–E) on local + Mordor; confirm every scenario against real chain state and the truthful subgraph-less fallbacks
- [ ] T098 Confirm `npm test`, `npm run test:frontend`, `npm run check:storage-layout`, and subgraph codegen+build+matchstick are green in CI with no `continue-on-error` on test/lint/build/security (Principle IV)

---

## Expansion dependencies & MVP

- **Phase 9 (P2-a)** is the foundation for all expansion phases (v2 templates + factory
  slots). **Phase 10 (P2-b)** extends the same contracts. **Phase 11 (P2-c)** needs 9 (and
  reads 10's controls). **P3-a/b/c (12–14)** depend on 9/11; P3-b also needs the subgraph.
- **Expansion MVP = Phase 9 + Phase 11** (issue/administer v2 role-based capped tokens
  through the new portal IA). P2-b folds in immediately after.
- `[P]` = different files, no incomplete-task dependency. Each phase ships with tests +
  (where on-chain) a targeted Mordor deploy + `sync:frontend-contracts`.
