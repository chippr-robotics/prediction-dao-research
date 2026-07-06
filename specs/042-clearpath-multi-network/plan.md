# Implementation Plan: ClearPath Network-Agnostic Multi-Network DAO Support

**Branch**: `042-clearpath-multi-network` | **Date**: 2026-07-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/042-clearpath-multi-network/spec.md`

## Summary

Make ClearPath reach governance DAOs on chains beyond the app's wager networks
(ENS/Uniswap/Morpho, principally on Ethereum mainnet) by removing two structural
blockers and generalizing the connector layer — **entirely in the frontend, with no
new or changed on-chain contract in this cut**.

Three moves:

1. **Open the network model.** Add a `clearpath` per-chain capability and introduce
   **ClearPath-only, read-capable networks** (Ethereum mainnet first). Every non-ClearPath
   surface (wagers, DEX/swaps, passkey, memberships) already resolves its address/flag
   per-chain; we make each self-disable honestly where the capability/deployment is
   absent, so mainnet exposes only ClearPath.
2. **Decouple ClearPath from the on-chain registry.** Change availability from "an
   `ExternalDAORegistry` is deployed" to "the network declares `clearpath` + has a
   read RPC." Add a **device-local tracked-DAO store** (browser storage keyed by
   wallet + chainId) that supplies the DAO list on registry-less networks, **merged**
   with the on-chain registry where it exists (Mordor). No L1 contract deploy.
3. **Pluggable multi-framework connectors + data-source routing.** Refactor the single
   OZ-Governor reader into a **connector interface** with `detectFramework()` + a
   resolver; ship an **OZ Governor** connector (existing logic) and a **GovernorBravo**
   connector (Uniswap/Compound). Route reads **subgraph-first** (a known/configured The
   Graph governance subgraph per DAO) → **bounded on-chain live indexer** → **truthful
   empty/partial/error**, over the network's **public RPC by default** with a
   **wallet-managed routing** option (reads only; writes always via the signer).

All spec-030 invariants hold: honest state, strict network scoping, non-custodial, no
backend, theme-aware + WCAG 2.1 AA. Sanctions: screen the signer where the platform
source exists; on a source-less network, external-DAO governance proceeds under the DAO's
own rules (ClearPath adds no gate it cannot honestly enforce); ClearPath-custodial flows
are out of scope for new networks.

## Technical Context

**Language/Version**: JavaScript (ES modules), React 18, Vite; Solidity ^0.8.24 present
in-repo but **not modified by this cut**.

**Primary Dependencies**: `ethers` v6 (reads/writes + `eth_getLogs` live indexer), The
Graph GraphQL over HTTPS (per-DAO governance subgraphs, gateway API-key’d), existing
app systems: `config/networks.js`, `config/contracts.js`, `config/networkCapabilities.js`,
notification engine (`data/notifications`), `hooks/useWalletManagement`, `useChainTokens`,
`utils/rpcProvider` (`makeReadProvider`), `ChainCapabilityGate`.

**Storage**: Browser storage (device-local), one namespaced key per (chainId, wallet) for
the tracked-DAO list and one for the read-route preference. No server, no database.

**Testing**: Vitest (unit/integration incl. `jest-axe` accessibility) for connectors,
framework detection, tracked-list store, data-source router, capability gating, and the
network switcher; Cypress fast-e2e unaffected. Contract suites untouched (no contract
change).

**Target Platform**: Browser SPA (the existing FairWins frontend), all supported EVM
networks plus the new ClearPath-only networks.

**Project Type**: Web application (frontend-only change within `frontend/`).

**Performance Goals**: Reads must stay responsive on public RPCs that cap `eth_getLogs`
— subgraph-first avoids wide scans for indexed DAOs; the on-chain fallback is bounded +
chunked with truthful partial states (reuse of the spec-030 scanner). No hard latency SLA
(governance data is not high-frequency); UI must never block on a failed source.

**Constraints**: No backend; no new/changed on-chain contract in this cut; no fabricated
data at any source tier; strict per-(chainId) scoping of every store, list, and read;
mainnet governance subgraphs on The Graph gateway require an **API key via env** — when
absent the DAO falls back to on-chain reads (truthful, never disabled silently).

**Scale/Scope**: 1 new network in cut 1 (Ethereum mainnet, chainId 1; Base/Arbitrum/
Optimism opt in later via the same config); 2 framework connectors (OZ Governor +
GovernorBravo); a handful of seeded well-known DAOs (ENS, Uniswap) plus unlimited
member register-by-address. ~10–14 frontend modules touched/added; no data migration.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Security-First Smart Contracts (NON-NEGOTIABLE)** — **N/A / PASS.** This cut adds
  and changes **no `contracts/` code** (registry-optional; no L1 deploy). ClearPath remains
  **non-custodial**: it constructs actions the member signs against the external DAO's own
  contract and holds no keys/roles/funds. No new value-bearing contract, no fund-custody or
  oracle path introduced. If a later increment deploys a registry to a new network, that is a
  separate spec/plan with its own security review.
- **II. Test-First & Comprehensive Coverage (NON-NEGOTIABLE)** — **PASS (committed).** Every
  new module ships Vitest coverage: framework detection (OZ vs Bravo vs unknown), each
  connector's read + action encoding, the data-source router precedence (subgraph → on-chain
  → empty), the device-local store (add/merge/dedupe/scope/remove), capability gating, and
  the switcher. Accessibility (axe) tests extend the existing `clearpath.accessibility.test`.
- **III. Honest State, No Mocks in Shipped Paths** — **PASS (core of the feature).** Every
  source tier degrades truthfully (empty/partial/error), never fabricating DAOs/proposals/
  members; all stores and reads are strictly per-(chainId); a ClearPath-only network shows
  the other features as honestly unavailable, not mocked.
- **IV. Fail Loudly in CI** — **PASS.** No `continue-on-error` added to lint/test/build; new
  tests gate the pipeline.
- **V. Accessible, Consistent Frontend** — **PASS with one documented nuance.** New UI meets
  WCAG 2.1 AA (axe in CI) and is theme-aware. Constitution V says frontend addresses/config
  come from **generated sync artifacts, never hand-copied**. That rule governs **our own
  deployed contracts**; it does not cover **external third-party DAO addresses** (ENS/Uniswap
  governors) or **third-party subgraph endpoints**, which are not part of our deploy/sync
  pipeline. These live as **verified configuration** (checked on-chain during implementation,
  never guessed) in the network/known-DAO config, and members supply further DAOs by address
  at runtime. Logged in Complexity Tracking.

Initial gate: **PASS.** Post-design re-check: **PASS** (see end of Phase 1; no new violations).

## Project Structure

### Documentation (this feature)

```text
specs/042-clearpath-multi-network/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions (network model, connectors, subgraph routing, mainnet addresses)
├── data-model.md        # Phase 1 — entities: capability profile, tracked DAO, connector, data source, read route
├── quickstart.md        # Phase 1 — runnable validation scenarios (ENS + Uniswap on mainnet, Mordor merge)
├── contracts/
│   ├── connector-interface.md   # The pluggable per-framework connector contract (read + act surface)
│   └── ui-contract.md           # ClearPath UI/state contract for multi-network + registry-less tracking
├── checklists/
│   └── requirements.md  # (from /speckit-specify)
└── tasks.md             # Phase 2 — /speckit-tasks (NOT created here)
```

### Source Code (repository root)

```text
frontend/src/
├── config/
│   ├── networks.js                 # ADD: `clearpath` capability + Ethereum mainnet (1) entry (ClearPath-only)
│   ├── networkCapabilities.js      # ADD: a `clearpath` NETWORK_FEATURES entry (capability tag)
│   └── clearpath/
│       ├── knownDaos.js            # NEW: verified seeded DAOs (ENS, Uniswap) per chain — {address, framework, label, subgraph?}
│       └── daoSubgraphs.js         # NEW: per-(chainId,dao) governance subgraph endpoints (env-keyed) for the data-source router
├── components/clearpath/
│   ├── connectors/
│   │   ├── index.js                # NEW: detectFramework() + getConnector(framework) resolver + shared interface
│   │   ├── ozGovernor.js           # NEW: OZ Governor connector (relocated from governorConnector.js)
│   │   └── governorBravo.js        # NEW: GovernorBravo/Compound connector (Uniswap)
│   ├── governorConnector.js        # KEEP as a thin re-export shim (back-comp for existing imports) or migrate imports
│   ├── daoDataSource.js            # NEW: subgraph-first → on-chain router feeding the DAO list/detail
│   ├── trackedDaoStore.js          # NEW: device-local per-(chainId,wallet) tracked-DAO list (add/list/remove/merge)
│   ├── useClearPath.js             # EDIT: availability = capability + reader (not registry); merge registry + local; read-route
│   ├── ClearPathPanel.jsx          # EDIT: capability-based disabled copy; framework labels; register works registry-less
│   ├── RegisterExternalDao.jsx     # EDIT: validate + detect framework client-side; write to registry OR local store
│   ├── ExternalDaoView.jsx         # EDIT: read/act through the resolved connector; per-DAO data source
│   └── ReadRouteToggle.jsx         # NEW: public-RPC vs wallet-managed routing control (reads only)
├── data/notifications/sources/
│   └── daoSource.js                # EDIT: enumerate registry + device-local DAOs; read via connector resolver
├── abis/
│   └── externalDAORegistry.js      # EDIT: add GovernorBravo read/write/proposal ABIs + DAO_FRAMEWORK{,_LABEL} entry
└── (tests) src/test/**, components/clearpath/__tests__/**   # NEW/EDIT: Vitest + axe per module above
```

**Structure Decision**: Web-application layout; **all changes live under `frontend/src/`**.
No `contracts/`, `subgraph/`, `scripts/`, or `deployments/` changes in this cut (registry-
optional). The connector layer is factored under `components/clearpath/connectors/` so a
third framework (Morpho, Aragon, …) is a new file + a `detectFramework`/resolver entry with
zero UI change. New networks are pure `config/networks.js` additions.

## Complexity Tracking

> Only deviations from a strict reading of the constitution are logged here.

| Item | Why Needed | Simpler Alternative Rejected Because |
|------|------------|--------------------------------------|
| External DAO addresses + third-party subgraph endpoints held as verified config (not sync artifacts) — nuance to Constitution V | ENS/Uniswap governors and their subgraphs are **not our deployments**, so the sync pipeline cannot and should not own them; members also add DAOs by address at runtime | Forcing them through `sync:frontend-contracts` would misuse a pipeline scoped to our own contracts and still couldn't cover runtime member-added DAOs. Config values are verified on-chain during implementation and never guessed. |
| Device-local (browser) tracked-DAO store instead of on-chain/synced | The spec's no-L1-deploy + no-backend constraints (clarified) require a client-side list on registry-less networks | On-chain registry on mainnet is explicitly out of scope (cost); cross-device sync (spec 032) is a deliberate follow-on. Device-local is the smallest change that satisfies the cut. |
