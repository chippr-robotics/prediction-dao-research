---

description: "Task list for ClearPath Network-Agnostic Multi-Network DAO Support"
---

# Tasks: ClearPath Network-Agnostic Multi-Network DAO Support

**Input**: Design documents from `/specs/042-clearpath-multi-network/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: INCLUDED — Constitution II (test-first, NON-NEGOTIABLE) and SC-010/SC-012 require
Vitest (unit/integration + axe) coverage for all non-trivial logic. Test tasks precede the
implementation they cover within each phase.

**Scope note**: Frontend-only cut. **No** `contracts/`, `subgraph/`, `deployments/`, or
`scripts/` changes (registry-optional; no L1 deploy). All paths are under `frontend/`.

**Organization**: By user story (US1–US5) for independent implementation + testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US5 (user-story phases only)

## Path Conventions

Web app — frontend at `frontend/src/`; tests at `frontend/src/test/**` and
`frontend/src/components/clearpath/__tests__/**` (existing conventions).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Environment + scaffolding for the new modules.

- [X] T001 Add new frontend env vars to `.env.example`: `VITE_RPC_URL_MAINNET` (Ethereum mainnet read RPC) and `VITE_CLEARPATH_GRAPH_KEY` (The Graph gateway API key; optional — absence falls back to on-chain reads), with comments matching research.md D1/D6.
- [X] T002 [P] Create the connector package directory `frontend/src/components/clearpath/connectors/` and the config directory `frontend/src/config/clearpath/` with placeholder index files, per plan Project Structure.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared connector layer, capability flag, device-local store, data-source
router, and the decoupled `useClearPath` hook — every user story depends on these.

**⚠️ CRITICAL**: No user-story work begins until this phase is complete.

### Connector interface + resolver (OZ relocation)

- [X] T003 [P] Write Vitest for `detectFramework()` (OZ → returns 0; non-governor → 'unknown') and OZ-connector interface conformance in `frontend/src/components/clearpath/connectors/__tests__/resolver.test.js` (assert against mocked providers; MUST fail first).
- [X] T004 Relocate the existing OZ-Governor reader/action logic from `frontend/src/components/clearpath/governorConnector.js` into `frontend/src/components/clearpath/connectors/ozGovernor.js`, implementing the interface in `contracts/connector-interface.md` (framework 0). Reduce `governorConnector.js` to a thin re-export shim so existing imports keep working.
- [X] T005 Create `frontend/src/components/clearpath/connectors/index.js` exporting `detectFramework(reader, address)` (OZ probe + 'unknown'; Bravo branch added in US3) and `getConnector(framework)`.

### Per-chain `clearpath` capability

- [X] T006 [P] Write Vitest asserting `capabilities.clearpath` resolves per network and `getNetworkFeatures` exposes a `clearpath` tag, in `frontend/src/test/networkCapabilities.clearpath.test.js` (MUST fail first).
- [X] T007 Add a `clearpath` flag to each network's `capabilities` getter in `frontend/src/config/networks.js` (true where ClearPath runs — Mordor 63 at minimum; Amoy/Polygon opt-in per research D1), and add a `clearpath` entry to `NETWORK_FEATURES` in `frontend/src/config/networkCapabilities.js` (deployed = capability present).

### Device-local tracked-DAO store

- [X] T008 [P] Write Vitest for the tracked store (add/list/remove/has, dedupe, per-(chainId,wallet) scoping, versioned key) in `frontend/src/components/clearpath/__tests__/trackedDaoStore.test.js` (MUST fail first).
- [X] T009 [P] Implement `frontend/src/components/clearpath/trackedDaoStore.js` (localStorage key `clearpath.tracked.v1.<chainId>.<lowercased wallet>`) per data-model §3.

### Data-source router + config

- [X] T010 [P] Create config scaffolds `frontend/src/config/clearpath/knownDaos.js` (verified seeded DAOs per chain — start empty; ENS/Uniswap added in US2/US3) and `frontend/src/config/clearpath/daoSubgraphs.js` (per-(chainId,dao) gateway endpoints built from `VITE_CLEARPATH_GRAPH_KEY`; empty → on-chain fallback), per research D6.
- [X] T011 [P] Write Vitest for the data-source router precedence (subgraph when configured → on-chain otherwise; normalized proposal shape; truthful empty/partial/error) in `frontend/src/components/clearpath/__tests__/daoDataSource.test.js` (MUST fail first).
- [X] T012 Implement `frontend/src/components/clearpath/daoDataSource.js`: `resolveDataSource(chainId, address)` + a subgraph GraphQL reader that normalizes to the on-chain proposal shape (data-model §7; contracts/connector-interface.md NormalizedProposal).

### Decouple `useClearPath` from the registry

- [X] T013 Write Vitest for `useClearPath` availability = capability + reader (NOT registry), `hasRegistry` flag, merged+deduped network-scoped list, and read-route selection, in `frontend/src/components/clearpath/__tests__/useClearPath.test.js` (extend existing; MUST fail first).
- [X] T014 Edit `frontend/src/components/clearpath/useClearPath.js`: set `isSupported = capabilities.clearpath && !!reader`; expose `hasRegistry`/`registryAddress`/`hasSanctionsSource`; make `listExternalDAOs()` merge on-chain registry (iff `hasRegistry`) with `trackedDaoStore` entries deduped by lowercased address; add `readRoute`/`setReadRoute` (reads only) and `trackDAO`/`untrackDAO` routing to registry-or-store per ui-contract.md.

**Checkpoint**: Connector resolver (OZ), capability flag, tracked store, data-source router, and the decoupled hook are in place and unit-tested. User stories can begin.

---

## Phase 3: User Story 1 - Select a ClearPath-only network (Priority: P1) 🎯 MVP

**Goal**: Ethereum mainnet is selectable for DAO governance only; every non-ClearPath feature
self-discloses as unavailable there (no fabrication).

**Independent Test**: Switch to Ethereum mainnet → ClearPath tab enabled; wagers/swap/passkey
each show a truthful "not available on this network" state; no crash, no fabricated data.

- [X] T015 [P] [US1] Write Vitest for the Ethereum-mainnet (1) capability profile (`clearpath:true`, all others false; `wagerRegistry` address undefined) in `frontend/src/test/networks.mainnet.test.js` (MUST fail first).
- [X] T016 [P] [US1] Write Vitest asserting each non-ClearPath surface self-disables on chain 1 — wager create/list, swap/DEX, passkey option — in `frontend/src/test/reports/clearpathOnlyNetwork.test.jsx` (MUST fail first).
- [X] T017 [US1] Add the Ethereum mainnet entry (chainId 1) to `NETWORKS` in `frontend/src/config/networks.js` — `capabilities.clearpath:true`, dex/passkey/polymarket off, `subgraphUrl:null`, `stablecoin` = mainnet USDC, `rpcUrl` from `VITE_RPC_URL_MAINNET`, `explorer` Etherscan, `selectable:true` (research D1).
- [ ] T018 [US1] Audit + guard non-ClearPath surfaces so each gates on its per-chain address/capability and renders a truthful unavailable state when absent (research D8) — fix any surface that assumes a wager network unconditionally (touch the specific wager/swap/passkey gate components identified in the audit).
- [X] T019 [US1] Update `frontend/src/components/clearpath/ClearPathPanel.jsx` disabled state to key off `capabilities.clearpath` with network-accurate copy (drop the "switch to Mordor" wording); confirm the tab renders for a mainnet reader.
- [X] T020 [US1] Ensure the network switcher (`frontend/src/components/wallet/NetworkSettings.jsx` via `getSelectableNetworks`) labels mainnet by supported capabilities (DAO governance), and extend `frontend/src/test/NetworkSettings.test.jsx` accordingly.

**Checkpoint**: A ClearPath-only network works and every other feature is honestly disabled — MVP.

---

## Phase 4: User Story 2 - Track a DAO on a registry-less network (Priority: P1)

**Goal**: Register-by-address on Ethereum mainnet (no registry) tracks a real OZ Governor DAO
(ENS) device-locally, with truthful reads.

**Independent Test**: Register ENS Governor on mainnet → validates + detects OZ → appears in
list (device-local) → detail shows real treasury/proposals/membership with a source chip;
switching networks proves strict scoping.

- [X] T021 [P] [US2] Write Vitest for the registry-less register flow (client-side validate + `detectFramework` = 0 + write to `trackedDaoStore`; duplicate → "already tracked"; no phantom on invalid) in `frontend/src/components/clearpath/__tests__/RegisterExternalDao.test.jsx` (extend; MUST fail first).
- [ ] T022 [P] [US2] Write Vitest for `ExternalDaoView` reading through the resolved connector + `daoDataSource` and rendering a truthful source/status chip (subgraph/on-chain/partial/unavailable) in `frontend/src/components/clearpath/__tests__/ExternalDaoView.test.jsx` (MUST fail first).
- [X] T023 [US2] Edit `frontend/src/components/clearpath/RegisterExternalDao.jsx` to validate + framework-detect client-side and, on a registry-less network, persist via `trackDAO` (device-local) with an honest "tracked on this device" note; keep the on-chain register path where `hasRegistry`.
- [X] T024 [US2] Edit `frontend/src/components/clearpath/ExternalDaoView.jsx` to resolve the connector via `getConnector`/`detectFramework` and read via `daoDataSource` (per-DAO subgraph-first), rendering the source/status chip; remove direct `governorConnector` coupling.
- [X] T025 [US2] Edit `frontend/src/components/clearpath/ClearPathPanel.jsx` list rendering to show merged registry+local DAOs with framework badge (`DAO_FRAMEWORK_LABEL`) and network label; wire `untrackDAO` for device-local entries.
- [ ] T026 [P] [US2] Add the verified **ENS** Governor to `frontend/src/config/clearpath/knownDaos.js` (address + framework 0 + label) and, if available, its governance subgraph to `daoSubgraphs.js` — confirm both on-chain/gateway before committing (research VERIFY).
- [X] T027 [P] [US2] Add a `ReadRouteToggle` component `frontend/src/components/clearpath/ReadRouteToggle.jsx` (public-RPC vs wallet-managed; reads only) and its Vitest; wire it to `useClearPath.readRoute`/`setReadRoute` (FR-019).
- [ ] T028 [US2] Extend `frontend/src/test/clearpath.accessibility.test.jsx` to cover the registry-less register + tracked-list + detail states (axe, zero violations).

**Checkpoint**: Registry-less OZ-Governor tracking works end-to-end on mainnet, network-scoped and honest.

---

## Phase 5: User Story 3 - Track & act on a GovernorBravo DAO (Priority: P1)

**Goal**: Track and (where authorized) act on a GovernorBravo DAO (Uniswap) through the same UI.

**Independent Test**: Register Uniswap Governor → detects Bravo → proposals/tallies/states via
the Bravo connector; an authorized wallet casts a vote on Uniswap's own contract; an
unauthorized wallet gets the DAO's rejection reason.

- [X] T029 [P] [US3] Write Vitest for the GovernorBravo connector — reads (`proposals(id)` tallies, `getPriorVotes` power, Compound state 0–7) and action **encoding** (`castVote(id,support)`, `queue(id)`/`execute(id)` id-only, `propose` with `signatures`) — in `frontend/src/components/clearpath/connectors/__tests__/governorBravo.test.js` (MUST fail first).
- [X] T030 [P] [US3] Write Vitest extending `detectFramework` for the Bravo branch (proposalCount + quorumVotes → 1; OZ still 0; neither → 'unknown') in `frontend/src/components/clearpath/connectors/__tests__/resolver.test.js`.
- [X] T031 [US3] Add GovernorBravo read/write/proposal ABIs and a `GovernorBravo` entry to `DAO_FRAMEWORK`/`DAO_FRAMEWORK_LABEL` in `frontend/src/abis/externalDAORegistry.js` (data-model §5).
- [X] T032 [US3] Implement `frontend/src/components/clearpath/connectors/governorBravo.js` (framework 1) against the interface — encapsulating token `getPriorVotes`, `proposals()` tallies, id-based queue/execute, and `signatures` propose (research D5).
- [X] T033 [US3] Extend `detectFramework` in `frontend/src/components/clearpath/connectors/index.js` with the Bravo probe (order: OZ → Bravo → unknown).
- [X] T034 [US3] Wire framework-agnostic actions in `frontend/src/components/clearpath/ExternalDaoView.jsx` (vote/queue/execute) through the resolved connector; unknown-framework DAOs render read-only + deep-link (FR-011).
- [ ] T035 [US3] Enforce the sanctions posture in the action path: screen the signer when `hasSanctionsSource` (block sanctioned, fail-closed); otherwise proceed under the DAO's own rules with no fabricated "screened" claim (research D9 / FR-013); add Vitest for both branches in `frontend/src/test/clearpath.sanctions.test.js`.
- [ ] T036 [P] [US3] Add the verified **Uniswap** Governor (Bravo), UNI token, and Timelock to `frontend/src/config/clearpath/knownDaos.js` (+ subgraph in `daoSubgraphs.js` if available) — confirm on-chain before committing (research VERIFY).

**Checkpoint**: OZ (ENS) and Bravo (Uniswap) DAOs both track + act through one UI, labeled by framework.

---

## Phase 6: User Story 4 - Discover DAOs across networks in a unified list (Priority: P2)

**Goal**: Native + external DAOs on the active network appear together, labeled, strictly
network-scoped, including in the notification/activity source.

**Independent Test**: Track DAOs on two networks, switch between them, confirm each shows only
its own DAOs (framework + network labeled) with no bleed-through and a truthful disabled state
where ClearPath isn't configured.

- [ ] T037 [P] [US4] Write Vitest for `daoSource` enumerating BOTH registry (iff deployed) and device-local tracked DAOs via the connector resolver, strictly per chain, in `frontend/src/test/sources/daoSource.test.js` (extend; MUST fail first).
- [ ] T038 [US4] Edit `frontend/src/data/notifications/sources/daoSource.js` to enumerate registry + `trackedDaoStore` DAOs for the active chain and read each via the connector resolver + `daoDataSource` (replace the direct `externalDAORegistry`-only + `governorConnector` coupling); preserve honest degradation.
- [ ] T039 [US4] Add a cross-network scoping test (DAO on network A never appears/reads on network B; unified list labels framework + network) in `frontend/src/test/reports/networkScoping.test.js` (extend).

**Checkpoint**: Unified, network-scoped discovery holds across chains and in notifications.

---

## Phase 7: User Story 5 - Compose a proposal across frameworks (Priority: P3)

**Goal**: The calldata-free proposal builder produces the correct per-framework `propose`
encoding (OZ vs Bravo) with live preview + validation.

**Independent Test**: Compose a multi-action proposal on an OZ DAO and a Bravo DAO without
writing calldata; the encoded call matches each framework's `propose` signature; invalid input
or an unauthorized wallet surfaces a truthful reason.

- [ ] T040 [P] [US5] Write Vitest for per-framework propose encoding — OZ `(targets,values,calldatas,description)` vs Bravo `(targets,values,signatures,calldatas,description)` — plus field validation + duplicate detection, in `frontend/src/components/clearpath/__tests__/proposalEncoding.test.js` (extend; MUST fail first).
- [ ] T041 [US5] Extend `frontend/src/components/clearpath/proposalEncoding.js` to emit the framework-correct `propose` arguments (delegating framework specifics to the connector), preserving the OZ correctness invariants (byte-exact description, ERC-20 value=0, equal-length arrays, duplicate id detection).
- [ ] T042 [US5] Wire the builder's submit path through the resolved connector's `propose` in `frontend/src/components/clearpath/ExternalDaoView.jsx` (and the builder component), surfacing the DAO's own authorization/revert reason via `explainTxError` (no implied success).

**Checkpoint**: Proposal composition works across both frameworks with honest pre-sign guards.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Docs, full validation, and honesty/a11y hardening across stories.

- [ ] T043 [P] Update developer docs for the multi-network ClearPath model, connector-extension path (adding a framework), and the subgraph-first/read-route behavior in `docs/` (and note the ClearPath-only network concept).
- [ ] T044 [P] Migrate remaining internal imports off the `governorConnector.js` shim to `connectors/`; once no importer remains, remove the shim (or document why it stays).
- [ ] T045 Run `npm run lint --workspace frontend` and `npm run test:frontend` — resolve all ESLint errors and ensure Vitest + axe are green across the new states (Constitution IV/V; SC-009/SC-010/SC-012).
- [ ] T046 Execute the `quickstart.md` scenarios A–F against real contracts (ENS + Uniswap on mainnet; Olympia on Mordor) and record results; confirm no fabricated rows, no phantom entries, strict network scoping.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (P1)** → no deps.
- **Foundational (P2)** → depends on Setup; **BLOCKS all user stories**.
- **User Stories (P3–P7)** → depend on Foundational.
  - **US1 (P1)**, **US2 (P1)**, **US3 (P1)** are the MVP core. US2 depends on the connector
    resolver + store + `useClearPath` (Foundational). US3 depends on the connector resolver
    (Foundational) and shares `ExternalDaoView` with US2 — sequence US2 → US3 to avoid churn
    on that file, or split by developer with a merge point at T034.
  - **US4 (P2)** depends on the tracked store + resolver (Foundational); independent of US1's
    mainnet entry (works on any clearpath network).
  - **US5 (P3)** depends on the Bravo connector (US3) for the Bravo encoding path.
- **Polish (P8)** → after all targeted stories.

### Within a story

- Test tasks (marked MUST fail first) precede their implementation.
- Config/ABIs before the connector/consumer that uses them.
- Shared file `ExternalDaoView.jsx` is touched by US2 (reads), US3 (actions), US5 (propose) —
  keep those edits additive and sequence them.

### Parallel opportunities

- Setup: T002 with T001.
- Foundational: T003, T006, T008, T009, T010, T011 are `[P]` (different files); T004→T005,
  T012, T014 serialize on their targets.
- US1: T015, T016 `[P]`. US2: T021, T022, T026, T027 `[P]`. US3: T029, T030, T036 `[P]`.
- Different user stories can proceed in parallel once Foundational is done (mind the shared
  `ExternalDaoView.jsx`).

---

## Parallel Example: Foundational Phase

```bash
# Independent foundational tests + leaf modules (different files):
Task: "T003 detectFramework/OZ conformance tests (connectors/__tests__/resolver.test.js)"
Task: "T006 capability profile test (test/networkCapabilities.clearpath.test.js)"
Task: "T008 tracked store test (__tests__/trackedDaoStore.test.js)"
Task: "T009 trackedDaoStore.js implementation"
Task: "T010 knownDaos.js + daoSubgraphs.js config scaffolds"
Task: "T011 daoDataSource router test"
```

---

## Implementation Strategy

### MVP scope

The **MVP is the three P1 stories together**: US1 (ClearPath-only network) + US2 (registry-less
OZ tracking) + US3 (GovernorBravo act). US1 alone proves the network model; US2 delivers the
first real cross-network DAO (ENS); US3 covers the named non-OZ integration (Uniswap). Ship
US1→US2→US3, validating each independently, then US4 (P2) and US5 (P3) as increments.

### Incremental delivery

1. Setup + Foundational → shared layer ready.
2. US1 → validate → demo (mainnet selectable, others honestly off).
3. US2 → validate → demo (track ENS on mainnet, registry-less).
4. US3 → validate → demo (track + vote on Uniswap).
5. US4 → cross-network discovery + notifications.
6. US5 → cross-framework proposal builder.

### Notes

- `[P]` = different files, no incomplete-task dependency.
- Verify tests fail before implementing (Constitution II).
- Commit after each task or logical group; keep `contracts/`, `subgraph/`, `deployments/`
  untouched (frontend-only cut).
- Confirm every VERIFY address/subgraph on-chain before committing it to config (T026, T036).
