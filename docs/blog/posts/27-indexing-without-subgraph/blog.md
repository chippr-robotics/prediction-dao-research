# Indexing Without a Subgraph

*Keeping every read path working on a chain The Graph has never heard of*

| | |
| --- | --- |
| **Series** | Multi-chain Infra (part 2) |
| **Part** | 2 |
| **Audience** | Data and infrastructure engineers |
| **Tags** | `the-graph`, `subgraph`, `indexing`, `rpc`, `graceful-degradation` |
| **Reading time** | ~8 minutes |

## The chain with no indexer

We were deploying FairWins to Ethereum Classic — specifically the Mordor
testnet, chain 63 — as a step toward broadening past Polygon. The contracts
compiled, deployed, and verified. A member could create a wager, an opponent
could accept it, and USDC moved exactly as it did on Polygon. Then someone
opened the "My Wagers" list and it was empty. Not an error. Just empty, on an
account that had three live wagers on-chain.

The cause was not in our code. It was that The Graph's hosted and decentralized
networks do not index Ethereum Classic. There is no provider you can deploy a
subgraph to for chain 63. We could — and do — keep a subgraph manifest with
Mordor's addresses and start blocks in `subgraph/networks.json`, but a manifest
is not an endpoint. Without a running indexer, `SubgraphSource` had nothing to
POST a GraphQL query to, so the list came back empty.

This is the recurring shape of a multi-chain app: the indexing layer you lean on
for one network simply does not exist on the next one. You can treat that as a
hard dependency and let features break on unsupported chains, or you can treat
the indexer as one of several interchangeable data sources and degrade to a
slower path that always works. FairWins takes the second route. The rule we
settled on: **every read path has an RPC-only fallback, and whether a chain uses
the fast path is per-network metadata, not a global flag.**

## "Does this chain have an indexer?" is per-chain data

The decision is encoded directly on each network. In
`frontend/src/config/networks.js` every entry declares a `subgraphUrl`, and two
helpers read it:

```js
export function getSubgraphUrl(chainId) {
  const net = getNetwork(chainId)
  return net?.subgraphUrl || null
}
export function hasSubgraph(chainId) {
  return Boolean(getSubgraphUrl(chainId))
}
```

Polygon (137) and Amoy (80002) carry a Studio endpoint; Mordor (63) and local
Hardhat (1337) carry `null`. Resolution is strictly per-chain, which matters for
correctness as much as for coverage: a Polygon endpoint is never queried while
the wallet is connected to Mordor, so a testnet session can never surface
mainnet wagers. Adding another un-indexed network later is a config change —
set `subgraphUrl: null` and record the contract addresses — not a code change.

## One boundary, two sources

The UI never talks to a data source directly. It goes through
`frontend/src/data/wagers/WagerRepository.js`, a thin boundary bound to a chain
id that picks a source for that chain:

```js
function resolveSourceKey(explicit, chainId) {
  if (explicit && SOURCE_REGISTRY[explicit]) return explicit
  const envSource = import.meta.env?.VITE_WAGER_SOURCE
  if (envSource && SOURCE_REGISTRY[envSource]) return envSource
  if (chainId != null) return hasSubgraph(chainId) ? 'subgraph' : 'registry'
  return 'subgraph'
}
```

Two live sources implement the same `WagerSource` interface —
`listPage`, `getById`, `syncIndex` — and both emit the identical mapped `Wager`
shape, so the list, detail, and report views are agnostic to which one produced
a page:

- **`SubgraphSource`** — GraphQL against the chain's `subgraphUrl`. Used when
  `hasSubgraph(chainId)` is true.
- **`RegistrySource`** — direct RPC reads of the v2 `WagerRegistry`. The default
  for any chain without a subgraph.

(A third, `EventsSource`, reads the retired `FriendGroupMarketFactory` and is no
longer in the automatic path; it survives only behind an explicit
`VITE_WAGER_SOURCE=events` override.)

## Why RPC reads are usually painful — and how the registry avoids it

The naive way to reconstruct a user's wagers over RPC is to scan event logs:
`eth_getLogs` for `WagerCreated` filtered by the user, from the deployment block
to head. This is exactly what breaks on public RPC nodes. Free endpoints for
Amoy and Mordor reject wide block ranges — "query returned more than N results,"
"block range too large" — so a from-genesis scan turns into a flood of
range-limited requests and rate-limit errors. It is the same problem that a
subgraph exists to solve.

`RegistrySource` sidesteps log scanning entirely because the v2 `WagerRegistry`
was built with a per-user index on-chain. The contract exposes purpose-built
pagination views (`contracts/wagers/WagerRegistry.sol`):

```solidity
function getUserWagerCount(address user) external view returns (uint256);
function getUserWagerIds(address user, uint256 offset, uint256 limit)
    external view returns (uint256[] memory);
function getUserWagers(address user, uint256 offset, uint256 limit)
    external view returns (Wager[] memory);
function getWager(uint256 wagerId) external view returns (Wager memory);
```

These are plain `view` calls — `eth_call`, not `eth_getLogs` — so no node
rejects them for range. `RegistrySource` reads the count, then pages through the
structs in fixed windows, capping the total pulled per account so a pathological
user can't stall the UI:

```js
async function fetchAllForUser(contract, userAddress) {
  const total = Number(await contract.getUserWagerCount(userAddress))
  if (!total) return []
  const count = Math.min(total, MAX_USER_WAGERS) // 500
  const wagers = []
  for (let offset = 0; offset < count; offset += PAGE) { // PAGE = 100
    const limit = Math.min(PAGE, count - offset)
    const [ids, structs] = await Promise.all([
      contract.getUserWagerIds(userAddress, offset, limit),
      contract.getUserWagers(userAddress, offset, limit),
    ])
    for (let i = 0; i < ids.length; i++) wagers.push(toWager(String(ids[i]), structs[i]))
  }
  return wagers
}
```

Sort, filter, and pagination then happen client-side over this bounded set. One
detail the RPC path actually improves on: v2 stores explicit `acceptDeadline`
and `resolveDeadline` on-chain, which the subgraph's events do not carry, so
`RegistrySource` populates deadlines directly instead of rehydrating them later.

## Fallback is automatic, not just configured

Missing configuration is only one way a subgraph becomes unavailable. The other
is a configured endpoint that errors or goes down. `SubgraphSource` handles both
by delegating to `RegistrySource` — and it labels the result so the difference
is observable in telemetry rather than silent:

```js
try {
  const data = await postGraphQL(subgraphUrl, PAGE_QUERY, variables)
  // ... map rows, return { ..., source: 'subgraph' }
} catch (err) {
  console.warn('[SubgraphSource] falling back to RegistrySource (RPC):', err?.message)
  const fallback = await RegistrySource.listPage({ userAddress, cursor, pageSize, sortKey, filter, chainId })
  return { ...fallback, source: 'subgraph-fallback' }
}
```

So a Mordor user hits `RegistrySource` because the chain has no `subgraphUrl`; a
Polygon user whose indexer is briefly unreachable transparently falls to
`subgraph-fallback` over RPC and still sees their wagers. The feature never
hard-fails on a data-source outage.

## The harder case: reports that need data the RPC can't cheaply give

Not everything degrades this cleanly. The tax/activity report
(`frontend/src/data/reports/reportDataSource.js`) needs per-transfer transaction
hashes and gas fees — data the pagination views don't return. On indexed chains
this is one query: spec 017 added an immutable `WagerTransfer` entity carrying
txHash, party, direction, token, amount, and timestamp, so `listTransfers` reads
a user's whole history from the index with no log scan at all.

On an un-indexed chain that path returns `null` and the report falls back to two
steps. First it *enumerates* the user's wagers over RPC through the same
`WagerRepository` (so enumeration always works). Then, because it still needs the
txHash and gas per value movement, it does a **bounded** event scan per wager —
but never from genesis. Each wager's `createdAt` gives a tight block window, and
the scan uses adaptive chunking with a hard request budget:

```js
if (budget.used >= budget.max) { // SCAN_BUDGET = 60 calls per wager
  throw new Error(
    'This report period is too large to read from the network without the ' +
    'indexing subgraph. Try a shorter period, or configure VITE_SUBGRAPH_URL...')
}
// on a range/limit error, shrink the chunk and retry; grow it back on success
if (/range|limit|exceed|too many|big/i.test(msg) && chunk > MIN_CHUNK) {
  chunk = Math.max(MIN_CHUNK, Math.floor(chunk / 4)); continue
}
```

This is degradation that stays honest about its limits: the report works on
Mordor, but when a requested window genuinely can't be scanned within budget it
says so and suggests a shorter period, rather than silently returning a partial
history that a member might file taxes against.

## Degrade honestly, or hide honestly

Some views can't be reconstructed over RPC at a reasonable cost, and the right
answer there is to tell the truth rather than fake it. The token holders and
activity panels are aggregate rollups that only a subgraph produces; on Mordor,
`tokenSubgraph.js` returns `{ available: false }` and `HoldersPanel` /
`ActivityPanel` render a plain "unavailable on this network" message
(`docs/developer-guide/token-mint.md`). The underlying balances and events are
still enforced on-chain — only the aggregated view is absent — so nothing about
the guarantee changes, only the convenience layer.

Membership and role reads never had this problem: `hasRoleOnChain` and the Quick
Start banner have always read `MembershipManager` over RPC and are chain-aware,
so they work identically on indexed and un-indexed networks.

## Design decisions

- **Per-chain source selection over a global switch.** Treating "has an indexer"
  as network metadata means the same code serves Polygon, Amoy, Mordor, and
  Hardhat, and a fifth network is a config entry. A global flag would have forced
  a branch at every call site.
- **A stable repository boundary.** Because the UI only knows `WagerRepository`
  and a mapped `Wager` shape, swapping The Graph for Envio, Ponder, or Goldsky
  later — or falling back to RPC today — is invisible above the data layer.
- **Contract-supported pagination instead of log scanning.** Investing in
  on-chain `getUserWager*` views is what makes the RPC path viable on nodes that
  reject wide `eth_getLogs` ranges. The fallback is only cheap because the
  contract was designed to be read directly.
- **Bounded work with honest failure.** The report scan carries an explicit
  request budget and a windowed range; when a request genuinely exceeds what a
  public RPC can serve, it surfaces an actionable error instead of a silent
  partial result. Correctness of a financial report outranks always returning
  something.

The trade-off is real: RPC reads are slower and coarser than an indexed query,
client-side pagination is bounded rather than unlimited, and a few aggregate
views are simply absent off the indexed chains. What we buy is that no member on
an un-indexed network hits a broken screen. Every feature either works, works
slower, or says plainly that it can't — and which of those happens is a property
of the network config, not a bug waiting on a chain The Graph may never support.

## Sources

- `docs/developer-guide/networks-without-subgraph.md` — the per-chain data-source strategy
- `frontend/src/data/wagers/WagerRepository.js` — the source-selection boundary
- `frontend/src/data/wagers/RegistrySource.js` — RPC reads via registry pagination views
- `frontend/src/data/wagers/SubgraphSource.js` — GraphQL source with automatic RPC fallback
- `frontend/src/data/reports/reportDataSource.js` — indexed vs. bounded-scan report paths
- `frontend/src/config/networks.js` — `subgraphUrl`, `getSubgraphUrl`, `hasSubgraph`
- `contracts/wagers/WagerRegistry.sol`, `contracts/interfaces/IWagerRegistry.sol` — `getUserWagerCount` / `getUserWagerIds` / `getUserWagers` / `getWager`
- `subgraph/README.md`, `subgraph/networks.json`, `subgraph/schema.graphql` — what the subgraph provides (`Wager`, `WagerTransfer`)
- `specs/017-subgraph-v2-wager-transfers/` — the `WagerTransfer` entity for reports
- `specs/015-mordor-network-deployment/` — Ethereum Classic / Mordor deployment
- `docs/developer-guide/token-mint.md` — truthful "unavailable here" fallback for aggregate panels
- The Graph documentation — supported networks and subgraph deployment: https://thegraph.com/docs/
