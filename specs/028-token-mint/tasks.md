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

- [ ] T001 Add the vendored ERC-3643 suite (`@tokenysolutions/t-rex`) and ONCHAINID (`@onchain-id/solidity`) as pinned dependencies in `package.json` and run install (sole new core dependency per plan Complexity Tracking)
- [ ] T002 [P] Create the `contracts/tokens/` package skeleton (`interfaces/`, `templates/`, `compliance/`) with SPDX/pragma `^0.8.24` headers matching repo style
- [ ] T003 [P] Add `{ name: "TokenFactory", deploymentsKey: "tokenFactory" }` to the contract list in `scripts/deploy/check-storage-layout.js`
- [ ] T004 [P] Scaffold the frontend token module directory `frontend/src/components/tokens/` and a lazy route stub wired into the app shell (no logic yet)

**Checkpoint**: Package compiles empty; tooling recognizes the new contract + module.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The `TokenFactory` authority/registry that every issuance story builds on. **No user story can be
implemented until this phase is complete.**

**⚠️ CRITICAL**: Blocks US1–US5.

- [ ] T005 [P] Define `TokenStandard` enum and `TokenRecord`/`TrexSuiteRef` structs and the `ITokenFactory` surface (events, create signatures, views) in `contracts/tokens/interfaces/ITokenFactory.sol` per `contracts/token-factory.md`
- [ ] T006 Implement `TokenFactory` shell in `contracts/tokens/TokenFactory.sol`: inherit `UUPSManaged` + `ReentrancyGuardUpgradeable`; define `TOKEN_ISSUER_ROLE`; append-only storage (guard, template/gateway/module addresses, `tokenCount`, `tokens`, `issuerTokens`, `tokenAddressToId`) with trailing `__gap`; constructor disables initializers via base
- [ ] T007 Implement `TokenFactory.initialize(admin, sanctionsGuard_, …)` (calls `__UUPSManaged_init` first, then `__ReentrancyGuard_init`; one-time `initializer`) and the `onlyRole(DEFAULT_ADMIN_ROLE)` admin setters (`setSanctionsGuard`, `setTemplate`, `setTrexGateway`, `setSanctionsComplianceModule`) in `contracts/tokens/TokenFactory.sol`
- [ ] T008 Implement the shared issuance internals in `contracts/tokens/TokenFactory.sol`: a sanctions-screening check on `msg.sender` (fail-closed via `ISanctionsGuard`, `address(0)` disables), an append-only `_recordToken(...)` helper (CEI — write only after successful deploy) emitting `TokenCreated`, and the registry views (`getToken`, `getTokensByIssuer`, `getTokenIdByAddress`, `tokenCount`)
- [ ] T009 [P] Write `test/tokens/TokenFactory.test.js`: role/sanctions gating on a stub `create`, registry append/views, network-scoped reads, no-write-on-revert (CEI), admin-setter authorization
- [ ] T010 [P] Write `test/upgradeable/TokenFactory.upgrade.test.js`: deploy proxy → upgrade → state preserved → non-`UPGRADER_ROLE` rejected → re-init rejected → storage-incompatible impl rejected by OZ `validateUpgrade`
- [ ] T011 Extend `scripts/deploy/deploy.js` to deploy `TokenFactory` as proxy+impl via `scripts/deploy/lib/upgradeable.js`, grant `TOKEN_ISSUER_ROLE`/wire `SanctionsGuard`, and record `tokenFactory` + `tokenFactoryImpl` in `deployments/*.json` (template/suite addresses filled by later phases)
- [ ] T012 [P] Verify `npm run check:storage-layout` passes for the `TokenFactory` baseline and document the EthTrust-SL ≥ L2 reasoning stub in `contracts/tokens/TokenFactory.sol` NatSpec
- [ ] T013 [P] Add a frontend network-gating utility in `frontend/src/components/tokens/useTokenFactory.js` that resolves the `tokenFactory` address from synced artifacts for the active chain and disables the feature when absent (FR-023)

**Checkpoint**: `TokenFactory` deploys, upgrades safely, gates issuance by role + sanctions, and records tokens — ready for per-class entrypoints.

---

## Phase 3: User Story 1 - Issue an open token (Priority: P1) 🎯 MVP

**Goal**: An authorized issuer creates an open ERC-20 (and ERC-721) token via a real on-chain transaction and sees it confirmed in their token list with its deployed address.

**Independent Test**: Connect an authorized wallet, create an ERC-20 (name/symbol/supply/decimals), confirm the tx, and verify the deployed token holds the expected supply and metadata — no mock data.

### Tests for User Story 1 ⚠️ (write first, ensure they fail)

- [ ] T014 [P] [US1] `test/tokens/OpenERC20.test.js`: each variant (basic/burnable/pausable/burnable+pausable) initializes once, mints initial supply to owner, exposes only selected options; template itself cannot be re-initialized
- [ ] T015 [P] [US1] `test/tokens/OpenERC721.test.js`: basic/burnable collection init, owner `mint(to,uri)`, holder `burn` (burnable only)
- [ ] T016 [P] [US1] `test/integration/tokens/open-token-create.test.js`: `createOpenERC20`/`createOpenERC721` happy path (event, deployed token, single registry record, issuer list), unauthorized caller rejected, sanctioned issuer rejected (no registry write)

### Implementation for User Story 1

- [ ] T017 [P] [US1] Implement `contracts/tokens/templates/OpenERC20.sol` (OZ `ERC20`/`ERC20Burnable`/`ERC20Pausable` + `Ownable`, initializable clone, `_initialized` lockout) with owner `mint`, `pause`/`unpause`, and a fail-closed `SanctionsGuard` check in `_update` per `contracts/open-tokens.md`
- [ ] T018 [P] [US1] Implement `contracts/tokens/templates/OpenERC721.sol` (OZ `ERC721`+`ERC721URIStorage`(+`ERC721Burnable`) + `Ownable`, initializable clone) with owner `mint(to,uri)` and the `SanctionsGuard` transfer-hook check
- [ ] T019 [US1] Add `createOpenERC20(...)` and `createOpenERC721(...)` to `contracts/tokens/TokenFactory.sol` (clone the matching template, `initialize` with `msg.sender` as owner + the guard, `_recordToken`) — depends on T008, T017, T018
- [ ] T020 [US1] Extend `scripts/deploy/deploy.js` to deploy the open ERC-20 (4 variants) and ERC-721 (2 variants) implementation templates, pass them to `TokenFactory.initialize`, and record their addresses in `deployments/*.json`
- [ ] T021 [P] [US1] Add the `TokenCreated` handler + `Token` entity (id, standard, address, issuer, name, symbol, createdAt) to `subgraph/` (schema + mapping + manifest datasource on `TokenFactory`)
- [ ] T022 [US1] Build the open-token creation wizard step in `frontend/src/components/tokens/CreateTokenWizard.jsx` (choose ERC-20/721, configure name/symbol/decimals/supply/burnable/pausable, submit real tx) with honest pending/confirmed/failed state (no finalized-before-confirm) — uses `useTokenFactory`
- [ ] T023 [US1] Render the issuer's token list in `frontend/src/components/tokens/TokenList.jsx` from the subgraph + on-chain reads, showing only the active network's tokens and never a token before its tx confirms
- [ ] T024 [US1] Run `npm run sync:frontend-contracts` and wire the `TokenFactory`/template ABIs+addresses into the frontend via the synced artifacts (no hand-copied addresses)
- [ ] T025 [P] [US1] `frontend` Vitest in `frontend/src/components/tokens/__tests__/CreateTokenWizard.test.jsx`: form validation (empty name/symbol, bad decimals/supply), pending→confirmed UI transitions, no phantom token on reject

**Checkpoint**: An authorized user can mint an open ERC-20/721 end-to-end against real chain state and see it listed — MVP deployable.

---

## Phase 4: User Story 2 - Administer a token I issued (Priority: P1)

**Goal**: An issuer administers an open token they own — mint more, pause/unpause, transfer ownership — through a surface that exposes only the controls the token supports.

**Independent Test**: As owner of a pausable token, pause it, confirm transfers are blocked, unpause, confirm they resume — observing real on-chain state.

### Tests for User Story 2 ⚠️

- [ ] T026 [P] [US2] `test/integration/tokens/open-token-admin.test.js`: owner `mint` increases balance/supply (non-owner rejected); `pause` blocks transfers, `unpause` resumes; non-pausable token has no pause; ownership transfer moves authority (FR-018/FR-019/FR-020)

### Implementation for User Story 2

- [ ] T027 [US2] Confirm/extend ownership-transfer support on the open templates in `contracts/tokens/templates/OpenERC20.sol` and `OpenERC721.sol` (OZ `Ownable` transfer; emit on transfer) — depends on T017/T018
- [ ] T028 [US2] Build the per-token admin surface `frontend/src/components/tokens/TokenAdminPanel.jsx` that reads the token's standard/capabilities and renders **only** valid controls (mint always; pause/unpause if pausable; burn note if burnable; transfer ownership), each as a real tx with honest state
- [ ] T029 [P] [US2] `frontend` Vitest in `frontend/src/components/tokens/__tests__/TokenAdminPanel.test.jsx`: capability-gated rendering (no pause control for non-pausable), unauthorized action surfaces the on-chain rejection reason

**Checkpoint**: US1 + US2 give a complete open-token issue→administer lifecycle.

---

## Phase 5: User Story 3 - Issue a restricted token with transfer rules (Priority: P2)

**Goal**: An issuer creates an ERC-1404 restricted token, configures eligibility/freeze, and gets human-readable reasons for blocked transfers with a pre-transfer eligibility check that matches the actual transfer.

**Independent Test**: Create a restricted token, mark an address ineligible, attempt a transfer to it, verify rejection with the expected reason, and verify the pre-check returns the same reason without moving tokens.

### Tests for User Story 3 ⚠️

- [ ] T030 [P] [US3] `test/tokens/RestrictedERC20.test.js`: detector/transfer parity for SUCCESS/SENDER_NOT_ELIGIBLE/RECIPIENT_NOT_ELIGIBLE/SENDER_FROZEN/SANCTIONED; `messageForTransferRestriction` strings; sanctions dominates eligibility; eligibility/freeze admin owner-only
- [ ] T031 [P] [US3] `test/integration/tokens/restricted-token.test.js`: `createRestrictedERC20` happy path + record; eligible↔eligible transfer succeeds; ineligible transfer reverts with reason

### Implementation for User Story 3

- [ ] T032 [P] [US3] Define the Simple Restricted Token interface in `contracts/tokens/interfaces/IERC1404.sol` (`detectTransferRestriction`, `messageForTransferRestriction`)
- [ ] T033 [US3] Implement `contracts/tokens/templates/RestrictedERC20.sol` per `contracts/erc1404-restricted.md`: eligibility + freeze + `SanctionsGuard` policy, fixed reason enum, detector and `_update` evaluating the **same** policy (sanctions→frozen→eligibility), owner admin (`setEligible[Batch]`, `setFrozen`, `mint`) — depends on T032
- [ ] T034 [US3] Add `createRestrictedERC20(...)` to `contracts/tokens/TokenFactory.sol` (clone template, init with initial eligibility + guard, `_recordToken`) — depends on T008, T033
- [ ] T035 [US3] Extend `scripts/deploy/deploy.js` to deploy the `RestrictedERC20` template and record its address; add the `RESTRICTED_ERC1404` standard to the subgraph mapping
- [ ] T036 [US3] Add the restricted-token path to `CreateTokenWizard.jsx` and a policy admin section (eligibility list, freeze) plus an **eligibility pre-check** display calling `detectTransferRestriction` in `frontend/src/components/tokens/TokenAdminPanel.jsx`
- [ ] T037 [P] [US3] `frontend` Vitest covering the eligibility pre-check display matching on-chain restriction codes/messages

**Checkpoint**: US1–US3 functional; compliant transfer restrictions with honest reasons.

---

## Phase 6: User Story 4 - Issue & administer a permissioned security token (T-REX / ERC-3643) (Priority: P2)

**Goal**: An issuer creates a permissioned security token (identity-verified holders, compliance modules, trusted issuers) and an agent administers it (freeze, forced transfer, recovery, mint/burn, pause).

**Independent Test**: Create a permissioned token, register two holders with valid claims, transfer between them; omit a recipient's required claim and confirm the transfer is blocked; as agent, freeze an account and confirm its tokens can't move until unfrozen.

### Tests for User Story 4 ⚠️ (fork + integration — vendored suite)

- [ ] T038 [P] [US4] `test/tokens/erc3643/SanctionsComplianceModule.test.js`: `moduleCheck`/`canTransfer` deny when `SanctionsGuard` denies sender or recipient; no-op hooks; fail-closed
- [ ] T039 [P] [US4] `test/fork/erc3643-permissioned.test.js`: identity/claim enforcement (verified↔verified succeeds; missing claim reverts); compliance-rule rejection
- [ ] T040 [P] [US4] `test/fork/erc3643-admin.test.js`: agent freeze (full + partial), forced transfer, recovery to same-identity wallet (and rejection without it), mint/burn, pause; non-agent/owner rejected; sanctioned holder blocked via module despite valid claims

### Implementation for User Story 4

- [ ] T041 [P] [US4] Implement `contracts/tokens/compliance/SanctionsComplianceModule.sol` implementing the T-REX Modular Compliance `IModule` interface, delegating `moduleCheck`/`canTransfer` to `ISanctionsGuard.isAllowed` (fail-closed), per `contracts/erc3643-trex.md`
- [ ] T042 [US4] Add T-REX suite deployment wiring to `scripts/deploy/deploy.js` (deploy/configure the TREX gateway/factory + ONCHAINID infra, deploy `SanctionsComplianceModule`, record gateway/module/suite addresses in `deployments/*.json`); pass gateway+module to `TokenFactory.initialize`
- [ ] T043 [US4] Add `createPermissionedERC3643(TrexParams)` to `contracts/tokens/TokenFactory.sol`: deploy the per-token suite via the gateway with issuer as owner + requested claim topics/trusted issuers, bind `sanctionsComplianceModule` to the token's Modular Compliance, `_recordToken` with suite refs — depends on T008, T041, T042
- [ ] T044 [US4] Add the `PERMISSIONED_ERC3643` standard + suite refs to the subgraph schema/mapping
- [ ] T045 [US4] Add the permissioned-token path to `CreateTokenWizard.jsx` (configure claim topics, trusted issuers, compliance options) with real tx + honest state
- [ ] T046 [US4] Build the permissioned admin surface in `frontend/src/components/tokens/PermissionedAdminPanel.jsx`: agent actions (freeze/unfreeze full+partial, forced transfer, recovery, mint/burn, pause) and registry management (register identity, claim topics, trusted issuers), each gated to the connected actor's authority
- [ ] T047 [P] [US4] `frontend` Vitest for capability/authority-gated rendering of the permissioned admin surface (agent-only controls hidden/blocked for non-agents)

**Checkpoint**: US1–US4 functional; institutional-grade compliant tokens with full agent administration.

---

## Phase 7: User Story 5 - Discover and inspect tokens (Priority: P3)

**Goal**: Any user can view a token's public profile (standard, metadata, live supply, governing-rule summary); issuers see all tokens they administer; data is strictly network-scoped.

**Independent Test**: After creating tokens of different standards, open the list and each detail view and confirm displayed standard/metadata/supply match real on-chain values, and switching networks shows only that network's tokens.

### Tests for User Story 5 ⚠️

- [ ] T048 [P] [US5] `frontend` Vitest in `frontend/src/components/tokens/__tests__/TokenDetail.test.jsx`: detail view renders standard/metadata/live supply + rule summary from real data; network switch filters tokens; unsupported network shows disabled state (no mock list)
- [ ] T049 [P] [US5] `subgraph` test/query check that `Token` entities are network-scoped and queryable by issuer and standard

### Implementation for User Story 5

- [ ] T050 [US5] Implement the token detail view `frontend/src/components/tokens/TokenDetail.jsx` (standard, name/symbol, metadata, live supply via on-chain read, and for compliant tokens a truthful governing-rule summary) — reuses subgraph + `useTokenFactory`
- [ ] T051 [US5] Finalize discovery in `TokenList.jsx`: issuer-administered list + public browse, standard badges, strict active-network scoping and unsupported-network disable (FR-023/FR-025)
- [ ] T052 [P] [US5] Extend the subgraph mapping to populate live supply/rule-summary fields needed for discovery (or document the on-chain read path where indexing isn't appropriate)

**Checkpoint**: All five user stories independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Hardening, docs, and the constitution gates that span all stories.

- [ ] T053 [P] Add a developer guide `docs/developer-guide/token-mint.md` (standards supported, issuance flow, admin surfaces, sanctions integration, upgrade/deploy notes) and link it from the docs index
- [ ] T054 [P] Run Slither (clone/proxy/UUPS detectors) and Medusa fuzzing across `contracts/tokens/`; resolve or document (with rationale) any high/critical finding — no new high/critical may remain
- [ ] T055 Complete the smart-contract security-agent review (`.github/agents/`) for the token contracts and record EthTrust-SL ≥ L2 reasoning in plan/contract NatSpec
- [ ] T056 [P] Run axe/Lighthouse accessibility audits on the token module (WCAG 2.1 AA) and fix violations; ensure ESLint passes with no errors
- [ ] T057 [P] Add a gas report for issuance/admin paths (`npm run test:gas`) and confirm clone-based issuance stays within target (SC-001 < 3 min end-to-end)
- [ ] T058 Execute the full `specs/028-token-mint/quickstart.md` validation on local + Amoy and confirm every scenario passes against real chain state
- [ ] T059 [P] Verify `npm test`, `npm run test:fork`, `npm run test:frontend`, and `npm run check:storage-layout` are green in CI with no `continue-on-error` on test/lint/build/security steps (Principle IV)

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
