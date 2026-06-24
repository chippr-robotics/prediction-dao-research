# Implementation Plan: ClearPath Standard DAOs & External DAO Connectors

**Branch**: `feat/clearpath-standard-daos-030` | **Date**: 2026-06-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/030-clearpath-standard-daos/spec.md`

## Summary

ClearPath's standard-DAO foundation: members **launch native traditional-governance
DAOs** (OpenZeppelin Governor + TimelockController + a Votes voting source — a
governance token `ERC20Votes` or a membership NFT `ERC721Votes`, default membership-
NFT — with a USDC treasury held by the timelock) and **register/track/manage DAOs
deployed by other platforms** via an on-chain network-scoped `ExternalDAORegistry`
and per-framework connectors. The first connector targets **Olympia DAO** (OZ
Governor on ETC/Mordor) and is built against the standard **IGovernor** interface so
it generalizes to any Governor-based DAO — and so the **same governance UI serves
native and external DAOs**. Signed management actions (propose/vote/queue/execute)
are in scope from the start; ClearPath holds **no authority** over external DAOs
(the member signs every action with their own wallet).

Embedded as a My Account (Account Center) tab (the spec-028 pattern), gated by
`MembershipManager` tiers, every action through the app notification system,
`SanctionsGuard` non-bypassable on value-moving actions, theme-aware/accessible,
within the no-backend footprint, real on-chain state only. New UUPS contracts on
OZ 5.4.0 / Solidity ^0.8.24 / EVM `paris`, deployed to Mordor (63) + Amoy (80002)
first. The futarchy governance mode (spec 029) layers on this foundation later.

## Technical Context

**Language/Version**: Solidity ^0.8.24 (EVM `paris`); JavaScript/JSX (React 18 + Vite); AssemblyScript (subgraph).

**Primary Dependencies**: OpenZeppelin Contracts (Upgradeable) **5.4.0** — confirmed to ship `GovernorUpgradeable`, `TimelockControllerUpgradeable`, `Governor{CountingSimple,Settings,Votes,VotesQuorumFraction,TimelockControl}Upgradeable`, `ERC20VotesUpgradeable`, `ERC721VotesUpgradeable`, with **no Cancun opcodes** (paris-safe). Existing platform contracts (`UUPSManaged`, `MembershipManager`, `SanctionsGuard`). No new third-party dependency (unlike spec 029's LMSR `@prb/math`).

**Storage**: On-chain (UUPS proxies + beacon clones, append-only + `__gap`); The Graph subgraph for enumeration; no app database.

**Testing**: Hardhat (`test/clearpath/`, `test/integration/clearpath/`, `test/upgradeable/`); subgraph Matchstick; frontend Vitest + `vitest-axe`.

**Target Platform**: EVM — Mordor (63) + Amoy (80002) first, Polygon (137) later. Olympia (the first external connector) is live on Mordor + ETC mainnet.

**Project Type**: Web (contracts + React frontend + subgraph) — extends the monorepo.

**Performance Goals**: DAO creation end-to-end < 3 min (SC-001); standard Governor gas; honest tx state.

**Constraints**: OZ 5.4.0 / paris (ETC/Mordor); no-backend; sanctions non-bypassable + fail-closed on value moves; append-only upgradeable storage (CI-gated); WCAG 2.1 AA; network-scoped + truthful subgraph-less fallback; ClearPath holds no authority over external DAOs.

**Scale/Scope**: Multiple native + external DAOs per network; standard Governor proposal volumes; the standard-DAO foundation delivered across phases A–F.

## Constitution Check

*GATE: must pass before Phase 0 and re-check after Phase 1.*

- **I. Security-First (NON-NEGOTIABLE)** — PASS. New contracts inherit `UUPSManaged` (CEI, `_disableInitializers`, one-time `initialize`, non-brickable upgrade gate, append-only storage + `__gap`, `check:storage-layout`), reuse the fail-closed `SanctionsGuard` (non-bypassable on value moves), and build native governance on **audited OpenZeppelin Governor + Timelock** rather than bespoke code — materially lower risk than spec 029 (no new math primitive). External-DAO interaction is read + **user-signed** actions through the external DAO's own access control; ClearPath custodies nothing. Slither/Medusa must report no new high/critical.
- **II. Test-First & Coverage (NON-NEGOTIABLE)** — PASS. Each phase ships unit + integration + upgrade-lifecycle + Matchstick + Vitest, covering authorized/unauthorized paths, treasury safety (SC-004), and the external connector (read + a signed action) against a real Governor DAO.
- **III. Honest State, No Mocks** — PASS. Real on-chain tx, honest pending/confirmed/failed; network-scoped; subgraph-less views fall back to on-chain reads or disable truthfully (never fabricate DAOs/proposals/members). External DAOs clearly labeled as externally deployed; "manage" never implies authority ClearPath lacks.
- **IV. Fail Loudly in CI** — PASS. New test/lint/build/security/storage/subgraph gates fail the pipeline; no `continue-on-error` on gates.
- **V. Accessible Frontend** — PASS. ClearPath UI on `theme.css` light/dark variables (the `tokens.css` approach), WCAG 2.1 AA, gating axe tests.
- **Additional constraints** — PASS. No secrets (floppy keystore); `contracts-archive/` reference-only; no-backend preserved; `governance.md` updated.

**Result:** PASS. No constitution deviation requiring justification (contrast spec 029's LMSR). Complexity Tracking notes the minor patterns below.

## Project Structure

### Documentation (this feature)

```text
specs/030-clearpath-standard-daos/
├── plan.md · research.md · data-model.md · quickstart.md
├── contracts/{contracts.md, ui-contract.md}
├── checklists/requirements.md
└── tasks.md   # /speckit-tasks — not created here
```

### Source Code (repository root)

```text
contracts/clearpath/                        # NEW — all state/authority contracts inherit UUPSManaged (append-only + __gap)
├── ClearPathDAOFactory.sol                 # creates native DAOs (Governor+Timelock+Votes+USDC treasury); registry; tier+sanctions gate
├── governance/StandardGovernor.sol         # OZ Governor (CountingSimple+Settings+Votes+QuorumFraction+TimelockControl) — beacon impl
├── governance/DAOTimelock.sol              # OZ TimelockController = executor + USDC treasury holder — beacon impl
├── voting/MembershipNFT.sol                # ERC721Votes soulbound membership (default voting source) — beacon impl
│                                            # token voting reuses spec-028 ERC20Votes token factory
├── external/ExternalDAORegistry.sol        # UUPS: network-scoped register/validate (ERC-165 IGovernor probe); no authority over externals
└── interfaces/                             # IClearPathDAOFactory, IExternalDAORegistry (+ reuse OZ IGovernor)
# Reused as-is: contracts/upgradeable/UUPSManaged.sol, contracts/access/{MembershipManager,SanctionsGuard}.sol, per-network USDC

test/clearpath/ · test/integration/clearpath/ · test/upgradeable/ClearPath*.upgrade.test.js
scripts/deploy/deploy-clearpath.js          # UUPS proxies + beacons via lib/upgradeable.js; wires SanctionsGuard+MembershipManager+USDC

subgraph/                                   # DAO/Proposal/Vote/Member/ExternalDAO/Activity entities
├── schema.graphql (append) · subgraph.yaml (ClearPathDAOFactory + ExternalDAORegistry datasources + Governor template)
├── src/mappings/clearpath*.ts · tests/clearpath.test.ts (Matchstick)

frontend/src/
├── pages/WalletPage.jsx                    # add { id: 'clearpath', label: 'ClearPath' } to WALLET_TABS + panel
└── components/clearpath/
    ├── ClearPathPanel.jsx (My DAOs / Create / Explorer) · useClearPath.js (gating, reads, writes w/ honest state)
    ├── CreateDaoWizard.jsx · DaoDetailView.jsx (Overview/Proposals/Treasury/Members/Roles/Activity/Contract)
    ├── ProposalView.jsx (propose/vote/queue/execute) · RegisterExternalDao.jsx · ExternalDaoView.jsx
    ├── connectors/ (governorConnector.js — IGovernor read+act; olympia label/addresses) · clearpathSubgraph.js
    └── clearpath.css (mapped onto theme.css variables)

docs/developer-guide/clearpath-dao.md (NEW) · docs/system-overview/governance.md (UPDATE "no DAO")
```

**Structure Decision**: Extend the monorepo. Native DAOs are assembled from **audited OZ Governor + Timelock + Votes** sub-contracts deployed per-DAO as **beacon clones** (one upgradeable impl per type, all upgrade together; the timelock is the executor + USDC treasury — the standard OZ pattern). A single `ClearPathDAOFactory` (UUPS) creates them + keeps the native registry; a separate `ExternalDAORegistry` (UUPS) holds the network-scoped external-DAO list. The frontend embeds a **ClearPath My Account tab** (spec-028 pattern); a single `governorConnector` serves both native and external Governor DAOs via the standard IGovernor ABI. Subgraph indexes both factories + a per-DAO Governor template.

## Complexity Tracking

| Pattern | Why Needed | Simpler Alternative Rejected Because |
|---------|------------|--------------------------------------|
| **Beacon-clone DAO sub-contracts** (Governor/Timelock/MembershipNFT) | Each native DAO needs isolated governance + treasury while all upgrade together; cheap deploys. | Independent UUPS proxies per DAO = far costlier deploy/upgrade; a single shared Governor can't isolate per-DAO membership/treasury. Storage-gate the beacon impls. |
| **External-DAO interaction with no on-chain authority** | "Manage" must not give ClearPath custody/keys over a foreign DAO. | An on-chain adapter holding delegated authority would be a custody + security liability; instead the frontend connector builds calls the **user signs** against the external DAO's own contract. |
| **On-chain `ExternalDAORegistry`** | Shared, indexable, no-backend-persistent discovery of registered external DAOs. | A frontend-only watchlist isn't shareable/indexable and can't persist within the no-backend footprint. |

*No constitution-level deviation* — native governance is audited OZ Governor (contrast spec 029's new LMSR primitive).

## Phasing (incremental delivery, by spec priority)

- **Phase A — native DAO + treasury + membership (P1, US1):** `ClearPathDAOFactory` + beacon Governor/Timelock/MembershipNFT (+ token-voting via the spec-028 ERC20Votes factory), USDC treasury, tier+sanctions gating; deploy Mordor+Amoy; subgraph `DAO` entity; ClearPath tab + Create + My DAOs.
- **Phase B — external registry + tracking + Explorer (P1, US2/US3):** `ExternalDAORegistry` (register + ERC-165/IGovernor validate), the `governorConnector` read path, unified My DAOs/Explorer (native + external labeled), Olympia tracked on Mordor.
- **Phase C — proposal lifecycle + external management (P2, US4/US5):** native propose→vote→queue→execute UI; external signed actions (propose/vote/queue/execute) via the connector where authorized; deep-link fallback for unsupported frameworks.
- **Phase D — roles, params & ownership (P2, US6):** native DAO role grants/revokes, parameter config, ownership transfer/renounce.
- **Phase E — activity & contract surface (P3, US7/US8):** subgraph-sourced activity history + the contract surface, with truthful subgraph-less disable.
- **Phase F — polish & cross-cutting:** `docs/developer-guide/clearpath-dao.md` + update `governance.md`; Slither/Medusa + axe/Lighthouse; quickstart A–E validation on local + Mordor (incl. tracking real Olympia); CI green.
