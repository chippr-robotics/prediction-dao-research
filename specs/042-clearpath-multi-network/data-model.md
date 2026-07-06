# Phase 1 Data Model: ClearPath Network-Agnostic Multi-Network DAO Support

No on-chain schema changes in this cut. The entities below are **frontend runtime + config +
device-local storage** shapes. All are strictly scoped by `chainId` (and, for the tracked
list, by wallet) so nothing leaks across networks or accounts (FR-014).

---

## 1. Network Capability Profile (extends `config/networks.js`)

The per-network `capabilities` getter, extended with a `clearpath` flag.

| Field | Type | Notes |
|-------|------|-------|
| `polymarketSidebets` | bool | existing |
| `dex` | bool | existing (`Boolean(this.dex)`) |
| `friendMarkets` | bool | existing |
| `passkeyAccounts` | bool | existing |
| `clearpath` | bool | **NEW** — ClearPath DAO governance available on this network |

**ClearPath-only network** = `capabilities.clearpath === true` while wager/dex/passkey flags
are false and `NETWORK_CONTRACTS[chainId]` has no `wagerRegistry`. Ethereum mainnet (1) is the
first: `{ clearpath:true, dex:false, passkeyAccounts:false, polymarketSidebets:false,
friendMarkets:false }`, `subgraphUrl:null` (wager subgraph), `stablecoin` = mainnet USDC,
`selectable:true`.

**Validation.** A network offered in the switcher must have a resolvable `rpcUrl`; a
`clearpath` network with no usable reader is shown disabled with a truthful reason (never
crashes). `capabilities.clearpath` gates the ClearPath tab; every other feature gates on its
own flag/address (D8).

---

## 2. ClearPath-Capable Network (derived)

Not stored — derived from the profile: `isClearPathCapable(chainId) =
getNetwork(chainId)?.capabilities?.clearpath === true`. Independent of whether an
`ExternalDAORegistry` is deployed. Used by `useClearPath.isSupported` (with a live reader).

---

## 3. Tracked DAO — device-local (NEW: `trackedDaoStore.js`)

One record per DAO a member tracks on a **registry-less** network (also usable as a local
overlay on registry networks).

| Field | Type | Rules |
|-------|------|-------|
| `address` | string (EVM address) | required, checksum-validatable; stored lowercased as the key; unique per scope |
| `framework` | int enum | detected at add time — `0` OZ Governor, `1` GovernorBravo (see §5); `null` allowed only for read-only "unknown" tracking |
| `label` | string | optional, member-supplied; trimmed; bounded length |
| `addedAt` | int (unix seconds) | set on add |

**Storage key**: `clearpath.tracked.v1.<chainId>.<lowercased wallet>` → `Array<Tracked DAO>`.

**Operations**: `list / add / remove / has`. `add` rejects duplicates (returns "already
tracked") and validates the address is a recognized governance contract on the active network
before persisting. Scope key guarantees per-network + per-account isolation.

**Lifecycle**: added → (optionally) revalidated on load; an entry that fails validation later
(self-destructed / wrong-network) is shown in an **error** state and is removable — never
silently dropped or fabricated back.

---

## 4. External DAO Registry entry (existing on-chain, unchanged)

`ExternalDAORegistry.Entry { dao, framework, registrant, registeredAt, label }` on networks
where it is deployed (Mordor). Now one of **two** discovery sources. The merge (§ useClearPath)
unions registry entries with device-local entries by lowercased `address`, de-duplicated,
strictly within the active `chainId`. The registry's `framework` enum gains `GovernorBravo`
in the **frontend ABI mirror** only (`DAO_FRAMEWORK`) — the Solidity enum is not changed in
this cut (no contract change); registry-network registrations continue to use `OZGovernor`.

---

## 5. Governance Framework (enum, frontend)

`abis/externalDAORegistry.js` `DAO_FRAMEWORK` / `DAO_FRAMEWORK_LABEL`, extended:

| Value | Key | Label | Connector |
|-------|-----|-------|-----------|
| 0 | `OZGovernor` | OpenZeppelin Governor | `connectors/ozGovernor.js` |
| 1 | `GovernorBravo` | Governor Bravo (Compound) | `connectors/governorBravo.js` |
| — | `Unknown` | Unknown / unsupported | none → read-only + deep-link |

Detected by `detectFramework(reader, address)` (research D4). Persisted in the tracked record;
for registry entries, read from the on-chain enum (currently always `0`).

---

## 6. DAO Connector (interface, NEW: `connectors/`)

A pluggable per-framework adapter behind one interface (full contract in
`contracts/connector-interface.md`). Shape (read + act):

| Member | Kind | Purpose |
|--------|------|---------|
| `framework` | field | enum value it serves |
| `matches(reader, address)` | async | framework probe (backs `detectFramework`) |
| `readSummary(reader, address)` | async | name/token/timelock/params/treasuryNative |
| `readTreasuries(reader, vaults, usdc)` | async | native + USDC balances per vault |
| `fetchProposals(reader, address, opts)` | async | on-chain live-indexer proposals (bounded/chunked) |
| `readVoterState(reader, address, proposal, account)` | async | hasVoted / votingPower / support |
| `castVote / queue / execute / propose` | async (write) | member-signed actions (framework-correct encoding) |
| `explainTxError(e)` | sync | human message incl. framework custom errors |
| `extraTreasuries(chainId, address)` | sync | known non-timelock vaults overlay |

Two implementations ship (OZ, Bravo). Adding a third framework = new file + resolver entry,
**no UI/`daoSource` change** (SC-006).

---

## 7. DAO Data Source (resolved, NEW: `daoDataSource.js`)

Per (chainId, DAO) read source with precedence (research D6):

| Field | Type | Notes |
|-------|------|-------|
| `kind` | `'subgraph' \| 'onchain'` | resolved tier |
| `endpoint` | string \| null | gateway URL for `subgraph` (env-keyed), else null |
| `status` | `'ok' \| 'partial' \| 'empty' \| 'error'` | truthful; never fabricated |

`resolveDataSource(chainId, address)` → subgraph iff `daoSubgraphs.js` has a configured entry,
else on-chain. Both paths return the **same normalized proposal shape** (id, proposer,
description, targets/values/calldatas, descriptionHash, voteStart/voteEnd, state, votes).

---

## 8. Read Route (device-local setting, NEW)

| Field | Type | Values | Default |
|-------|------|--------|---------|
| `readRoute` | string | `'public'` \| `'wallet'` | `'public'` |

Storage key `clearpath.readRoute.v1`. Controls **read** transport only (public `rpcUrl` vs
wallet provider); writes always use the signer. Subgraph reads are unaffected by this setting.

---

## Relationships

```text
Network Capability Profile ──has──> capabilities.clearpath ──gates──> ClearPath tab
        │
        └── ClearPath-Capable Network ──feeds──> useClearPath.isSupported (+ live reader)

useClearPath.listExternalDAOs()
        ├── External DAO Registry entry[]   (iff registry deployed on chainId)
        └── Tracked DAO (device-local)[]     (per chainId + wallet)
                    └── merge by lowercased address (network-scoped) ──> unified DAO list

DAO (address, framework)
        ├── detectFramework ──> Governance Framework ──> getConnector ──> DAO Connector
        └── resolveDataSource ──> DAO Data Source (subgraph|onchain) ──> proposals/tallies/states

Read Route ──selects──> reader (public rpc | wallet provider)  [reads only]
```

## Validation & scoping rules (cross-cutting)

- Every store key and every read is parameterized by `chainId` (tracked list also by wallet):
  no cross-network/account leakage (FR-014, SC-004/SC-005).
- Framework/address validation happens **before** persist or action; unknown/unreadable →
  truthful state, never a fabricated row (Constitution III, FR-007/FR-008).
- Sanctions: signer screened where a source exists on `chainId`, else external-DAO rules
  (FR-013). Writes always via signer; routing never affects signing.
