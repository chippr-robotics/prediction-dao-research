# Phase 0 Research: ClearPath Network-Agnostic Multi-Network DAO Support

All decisions below resolve the Technical Context. Addresses/endpoints marked **VERIFY**
are canonical, well-known values documented here for design; the constitution requires them
to be **confirmed on-chain during implementation** (a dedicated task) and never guessed —
they are config, not sync artifacts (see plan Constitution Check V + Complexity Tracking).

---

## D1 — Opening the network model to ClearPath-only networks

**Decision.** Add a `clearpath` boolean to each network's `capabilities` getter in
`config/networks.js`, and add an **Ethereum mainnet (chainId 1)** entry whose only enabled
capability is `clearpath` (`polymarketSidebets:false, dex:false, friendMarkets:false,
passkeyAccounts:false, clearpath:true`). Existing wager networks (137/80002/63/61) also gain
`clearpath` where the module should run (Mordor already has the registry; Amoy/Polygon can
opt in). The mainnet entry sets `subgraphUrl:null` (that field is the **wager** subgraph, not
a governance subgraph), `stablecoin` = native USDC on mainnet (for treasury USDC balances),
`dex:null`, `passkey:null`, `selectable:true`, `polymarket:null`.

**Rationale.** The `capabilities` getter + `ChainCapabilityGate` + `networkCapabilities.js`
pattern already exists precisely for per-chain feature gating; extending it is the smallest,
most consistent change. `getContractAddressForChain('wagerRegistry', 1)` returns `undefined`
(no `NETWORK_CONTRACTS[1]`), which is already the app's "not available on this network"
signal — so wager surfaces self-disable without new logic, provided they gate on the
capability/address (audited in D8).

**Alternatives rejected.** (a) A separate "governance networks" registry parallel to
`NETWORKS` — duplicates metadata (RPC, explorer, USDC) and breaks the single-source-of-truth.
(b) Treating mainnet as a full network with stubbed wager infra — violates Constitution III
(no mocks/placeholders in shipped paths).

**Follow-ons.** Base (8453), Arbitrum (42161), Optimism (10) are later entries that opt in
identically (declare `clearpath` + a read RPC + USDC address). No code change beyond config.

---

## D2 — ClearPath availability decoupled from the on-chain registry

**Decision.** In `useClearPath.js`, replace `isSupported = isAddress(registryAddress)` with
`isSupported = getNetwork(chainId)?.capabilities?.clearpath === true && !!reader`. Expose
`registryAddress` separately (may be `undefined`); the registry becomes an **optional overlay**
consulted only when present. `ClearPathPanel`'s disabled state keys off the capability, and its
copy stops naming Mordor as the only option.

**Rationale.** ClearPath's reads are pure client-side RPC/subgraph; the registry is a shared
discovery convenience, not a functional dependency (spec clarification, Session 2026-07-06).
Gating the whole tab on it wrongly disabled every non-Mordor network.

**Alternatives rejected.** Deploying the registry to mainnet to keep the gate — explicitly out
of scope (L1 cost) and unnecessary.

---

## D3 — Device-local tracked-DAO store + merge with the registry

**Decision.** New `trackedDaoStore.js` backed by `localStorage`, one key per scope:
`clearpath.tracked.v1.<chainId>.<lowercased wallet>` → JSON array of
`{ address, framework, label, addedAt }`. API: `list(chainId, account)`,
`add(chainId, account, entry)`, `remove(chainId, account, address)`,
`has(chainId, account, address)`. `useClearPath.listExternalDAOs()` becomes:
read on-chain registry entries **iff** `registryAddress` is set, read the device-local list,
**merge** by lowercased address (registry wins on conflict for label/framework provenance),
and return one network-scoped list. Registration on a registry network writes on-chain (as
today); on a registry-less network it writes to the store. De-dupe + "already tracked" is
enforced in both `add()` and the register flow.

**Rationale.** Satisfies FR-005/FR-006 within the no-backend footprint; keys include chainId
+ wallet so nothing leaks across networks or accounts (FR-014). Versioned key prefix (`v1`)
allows a future migration to spec-032 sync without clobbering.

**Alternatives rejected.** IndexedDB (overkill for a small list); a single global key filtered
in memory (risks cross-network/account leakage bugs — explicit per-scope keys are safer).

---

## D4 — Pluggable connector interface + framework detection

**Decision.** Introduce `components/clearpath/connectors/` with a **connector interface**
(documented in `contracts/connector-interface.md`): `{ framework, matches(reader,address),
readSummary, readTreasuries, fetchProposals, readVoterState, castVote, queue, execute,
propose, explainTxError, extraTreasuries }`. Relocate today's `governorConnector.js` logic to
`connectors/ozGovernor.js`; add `connectors/governorBravo.js`. `connectors/index.js` exports
`detectFramework(reader, address)` and `getConnector(framework)`.

`detectFramework` probes, in order:
1. **OZ Governor** — `COUNTING_MODE()` returns a non-empty string **and** `CLOCK_MODE()` or
   `votingPeriod()` answers. (OZ `IGovernor` mandates `COUNTING_MODE`.)
2. **GovernorBravo/Compound** — `proposalCount()` **and** `quorumVotes()` answer (Bravo
   exposes both; OZ Governor exposes neither).
3. **Unknown** — neither matches → tracked read-only where a summary is partially readable,
   else rejected for tracking; management offers a deep-link (FR-011).

`governorConnector.js` remains as a **thin re-export shim** so existing imports
(`daoSource.js`, `ExternalDaoView.jsx`, tests) keep working during the migration; imports are
then repointed to the resolver.

**Rationale.** Mirrors spec 030's "design against a standard interface" so the same ClearPath
UI serves every framework (FR-009, SC-006). Detection uses cheap view calls already used by
the existing validator.

**Alternatives rejected.** A single mega-connector with `if (framework)` branches — the exact
non-extensible shape this refactor removes. ERC-165-only detection — many Bravo governors and
some OZ governors don't implement `supportsInterface` cleanly (the registry already needs the
view-probe fallback), so view-probing is the reliable primary.

---

## D5 — GovernorBravo/Compound connector specifics

**Decision.** Add Bravo ABIs to `abis/externalDAORegistry.js` and implement `governorBravo.js`
against them. Key differences from OZ, handled explicitly:

- **Reads.** `proposalCount()`, `quorumVotes()`, `proposalThreshold()`, `votingDelay()`,
  `votingPeriod()`, `state(id)` (Compound `ProposalState` — **same 0–7 order** as OZ:
  Pending/Active/Canceled/Defeated/Succeeded/Queued/Expired/Executed, so the existing
  state→event mapping in `daoSource.js` is reused unchanged), `proposals(id)` →
  `{ id, proposer, eta, startBlock, endBlock, forVotes, againstVotes, abstainVotes, canceled,
  executed }`, `getReceipt(id, voter)` → `{ hasVoted, support, votes }`, `getActions(id)`.
- **Proposal discovery.** `ProposalCreated(id, proposer, targets, values, signatures[],
  calldatas[], startBlock, endBlock, description)` — same topic shape; reuse the bounded
  chunked `getLogsRange` scanner. Vote tallies come from `proposals(id)` (not
  `proposalVotes`).
- **Voting power / snapshot.** Bravo is **block-number clocked**; voting power reads via the
  UNI/COMP token's `getPriorVotes(account, startBlock)` (not the Governor's `getVotes`); the
  connector owns this so the UI stays framework-agnostic.
- **Actions.** `castVote(id, support)`; **`queue(id)`** and **`execute(id)`** take only the
  proposal id (contrast OZ's `(targets,values,calldatas,descriptionHash)`); `propose(targets,
  values, signatures[], calldatas[], description)` (note the extra `signatures` array vs OZ).
- **Timelock/treasury.** Bravo exposes `timelock()` (the Timelock holds funds); treasury reads
  reuse the OZ treasury logic against that address; `extraTreasuries` overlay stays available.

**VERIFY (implementation).** Uniswap Governor Bravo `0x408ED6354d4973f66138C91495F2f2FCbd8724C3`,
UNI token `0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984`, Timelock
`0x1a9C8182C09F50C8318d769245beA52c32BE35BC` (Ethereum mainnet). Confirm on-chain.

**Rationale.** Encapsulating every Bravo/OZ difference (id-based queue/execute, token-based
voting power, `proposals()` tallies) inside the connector is exactly what keeps the shared UI
and `daoSource.js` unchanged.

---

## D6 — Subgraph-first per-DAO data-source router

**Decision.** New `daoDataSource.js` resolves a tracked DAO's proposals/tallies/states via a
precedence: (1) **The Graph governance subgraph** if `daoSubgraphs.js` has an entry for
`(chainId, lowercased dao)` **and** its endpoint is configured (URL present, incl. any required
API key from env); (2) the connector's **on-chain live indexer** (`fetchProposals`) otherwise;
(3) **truthful empty/partial/error** when neither yields data. The subgraph reader normalizes
GraphQL results into the same proposal shape the on-chain path returns, so `ExternalDaoView`
and `daoSource.js` are source-agnostic.

**Config shape.** `daoSubgraphs.js` maps `(chainId → { <dao lowercased> → { url, idKind } })`
where `url` is built from `import.meta.env.VITE_CLEARPATH_GRAPH_KEY` + the subgraph id (The
Graph decentralized-network gateway: `https://gateway.thegraph.com/api/<key>/subgraphs/id/<id>`).
When the key/env is absent the entry resolves to "no subgraph" → on-chain fallback (never a
silent disable).

**VERIFY (implementation).** ENS and Uniswap publish governance subgraphs on The Graph's
decentralized network; capture their subgraph IDs and confirm the queried schema
(proposals, votes, proposalCanceled/Queued/Executed) during implementation. The **hosted
service is deprecated**, so the gateway + API key path is the supported one.

**Rationale.** Directly satisfies the user's "if a DAO is indexed by The Graph, use it over
chain reads" plus FR-008/SC-011; avoids wide `eth_getLogs` on mainnet public RPCs for the
big DAOs while keeping the honest on-chain fallback for everything else.

**Alternatives rejected.** Always-on-chain (slow/RPC-capped on mainnet for ENS/Uniswap);
always-subgraph (fails for member-added DAOs with no subgraph — would force fabrication or a
dead end, violating Constitution III).

---

## D7 — Read-route default (public RPC) + wallet-managed option

**Decision.** Reads default to the network's `rpcUrl` via the cached `makeReadProvider`
(today's behavior). Add a `ReadRouteToggle` writing `clearpath.readRoute.v1` = `'public' |
'wallet'` to `localStorage`; when `'wallet'`, `useClearPath.reader` uses the wallet provider
(`provider || signer?.provider`). Writes are **unchanged** — always the `signer`. A one-line
honest note explains that wallet routing may reject wide log scans (in which case the indexer
degrades to partial, or subgraph-first sidesteps it).

**Rationale.** Matches the user's "public RPC by default or let the wallet manage routing,"
keeps the existing wide-scan reliability default, and never entangles routing with signing.

**Alternatives rejected.** Wallet-routing as the default — injected/mobile RPC backends
routinely reject wide `getLogs` (the very reason `useClearPath` reads over the public node
today); making it opt-in preserves reliability.

---

## D8 — Audit: do non-ClearPath surfaces self-disable on a ClearPath-only network?

**Decision / task.** Before enabling mainnet, audit each feature surface (wager create/list,
swap/DEX, passkey login option, membership actions, oracle tags) to confirm each gates on its
per-chain address/capability and renders a **truthful unavailable** state when
`getContractAddressForChain(name, 1)` is `undefined` / `capabilities.<x>` is false — not a
crash or a fabricated zero. Where a surface assumes a wager network unconditionally, add a
capability/address guard. This is FR-002/FR-003/SC-001 and a Phase-2 task with tests.

**Rationale.** The honesty guarantee for the *other* features is as important as enabling
ClearPath; the switcher must not imply mainnet is a wager network.

---

## D9 — Sanctions posture wiring

**Decision.** External-DAO governance actions screen the connected signer against the platform
sanctions source **only on networks where that source is deployed** (`getContractAddressForChain
('sanctionsGuard', chainId)` present). On a source-less network (mainnet), member-signed
external-DAO actions proceed under the DAO's own rules; ClearPath renders no "screened" claim
it cannot back. ClearPath-custodial value-moving flows are not offered on new networks in this
cut. Encapsulated in the action path so a future per-network sanctions source is a config flip.

**Rationale.** Implements FR-013 / SC-007 exactly as clarified; non-custodial + honest.

---

## Summary of decisions

| # | Decision |
|---|----------|
| D1 | `clearpath` capability + Ethereum mainnet (1) ClearPath-only network in `networks.js` |
| D2 | Availability = capability + reader; registry is an optional overlay |
| D3 | Device-local per-(chainId,wallet) tracked-DAO store; merged with registry where present |
| D4 | Pluggable connector interface + `detectFramework()` (OZ → Bravo → unknown) |
| D5 | GovernorBravo connector (id-based queue/execute, token `getPriorVotes`, `proposals()` tallies) |
| D6 | Subgraph-first per-DAO data-source router → on-chain live indexer → truthful empty/partial/error |
| D7 | Public-RPC read route by default; wallet-managed routing opt-in (reads only) |
| D8 | Audit + guard non-ClearPath surfaces to self-disable truthfully on a ClearPath-only network |
| D9 | Screen signer where a sanctions source exists; else external DAO's own rules (non-custodial) |

**All NEEDS CLARIFICATION resolved.** Remaining VERIFY items (external addresses, subgraph
IDs/schemas) are on-chain confirmations owned by implementation tasks, not open design questions.
