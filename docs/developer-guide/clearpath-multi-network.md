# ClearPath: network-agnostic multi-network DAOs

ClearPath (spec 030) is the platform's DAO governance module — a registry, dashboard, and
action-router embedded as a My Account tab. Spec **042** made it **network-agnostic**: it can
discover, track, and (where authorized) act on governance DAOs on chains beyond the app's wager
networks — starting with **Ethereum mainnet** (ENS, Uniswap), with Base/Arbitrum/Optimism as
config-only follow-ons.

This is a **frontend-only** capability: there is **no new or changed on-chain contract**. The
existing `ExternalDAORegistry` remains deployed only where it already is (Mordor); everywhere
else ClearPath works registry-less.

## The three pillars

### 1. Open network model — a `clearpath` capability

Networks are declared in `frontend/src/config/networks.js`. Each network's `capabilities`
getter now carries a **`clearpath`** flag. A **ClearPath-only network** (e.g. Ethereum mainnet,
chainId 1) declares `clearpath: true` while `dex`/`passkeyAccounts`/`polymarketSidebets`/
`friendMarkets` are false and it has no wager deployment — so wagers/swaps/passkey each
self-disclose as unavailable (`networkCapabilities.js` exposes a `clearpath` feature tag).
**Adding a network is pure config** — declare the entry (RPC, USDC, explorer) and set
`clearpath: true`.

### 2. Registry-optional tracking

ClearPath availability is **capability-driven, not registry-gated**:
`useClearPath().isSupported = capabilities.clearpath && !!reader`. The on-chain
`ExternalDAORegistry` is an **optional shared-discovery overlay** used where deployed. On a
registry-less network a member tracks a DAO by address into a **device-local** store
(`trackedDaoStore.js`, `localStorage` keyed by `chainId + wallet` — no backend, no cross-device
sync in this cut). `listExternalDAOs()` merges, de-duplicated and strictly network-scoped:

```
on-chain registry entries  (iff a registry is deployed)
+ device-local tracked DAOs (per chainId + wallet)
+ curated known DAOs        (config/clearpath/knownDaos.js — ENS, Uniswap on mainnet)
```

### 3. Pluggable per-framework connectors

`components/clearpath/connectors/` holds one adapter per governance framework behind a common
interface (see `specs/042-clearpath-multi-network/contracts/connector-interface.md`):

- `ozGovernor.js` (framework **0**) — OpenZeppelin `IGovernor` (ENS, Olympia, …)
- `governorBravo.js` (framework **1**) — Compound/Bravo (Uniswap): `proposals()` tallies, token
  `getPriorVotes` voting power, **id-based** `queue`/`execute`, `propose` with the extra
  `signatures` array, block clock.

`connectors/index.js` exports `detectFramework(reader, address)` (probes OZ via `COUNTING_MODE`,
then Bravo via `proposalCount`+`quorumVotes`, else `'unknown'`) and `getConnector(framework)`.
**Adding a framework** (Morpho, Aragon, …) is a new module plus one entry in `ORDERED` — no
change to the ClearPath UI, the data-source router, or the notification source.

## Data sourcing & read routing

`daoDataSource.js` resolves a tracked DAO's proposals **subgraph-first**: a The Graph governance
subgraph when one is configured for `(chainId, dao)` in `config/clearpath/daoSubgraphs.js` and a
gateway key (`VITE_CLEARPATH_GRAPH_KEY`) is present, otherwise the connector's **bounded, chunked
on-chain live indexer**, otherwise a truthful **empty/partial/error** state — never fabricated.

Reads default to the network's **public RPC** (`VITE_RPC_URL_MAINNET` etc.); a member can opt
into **wallet-managed routing** (`ReadRouteToggle`). Routing affects **reads only** — every write
is always signed by the connected wallet.

## Honesty, scoping & sanctions (unchanged invariants)

- **Network-scoped**: every store, list, and read is keyed by `chainId` (tracked list also by
  wallet) — nothing crosses networks.
- **Non-custodial**: ClearPath constructs actions the member signs against the DAO's own
  contract; it holds no keys, roles, or funds.
- **Sanctions (FR-013)**: the action path screens the connected signer; a confirmed `restricted`
  result (only where a `SanctionsGuard` is deployed) blocks fail-closed, while `uncertain` (no
  source on the network, e.g. mainnet) proceeds under the DAO's own rules — ClearPath never
  fabricates a screening result it cannot produce.

## Adding a network or a DAO

- **New network**: add a `NETWORKS` entry in `networks.js` with `capabilities.clearpath: true`
  and a usable `rpcUrl` (+ USDC for treasury reads). Optionally seed known DAOs and subgraphs.
- **New known DAO**: add `{ address, framework, label }` to `config/clearpath/knownDaos.js` —
  **verify the address on-chain first** (probe `COUNTING_MODE` for OZ, or
  `proposalCount`+`quorumVotes` for Bravo); never guess.
- **New framework**: add `connectors/<framework>.js` implementing the interface and register it
  in `connectors/index.js#ORDERED`.

See `specs/042-clearpath-multi-network/` for the full spec, plan, and task breakdown.
