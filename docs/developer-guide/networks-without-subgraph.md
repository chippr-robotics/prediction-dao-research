# Reading data on networks without a subgraph

Not every network FairWins deploys to has a hosted Graph indexer. **Ethereum
Classic / Mordor (chain 63)** is the motivating case: no Graph provider supports
it, so the app cannot read wagers from a subgraph and must read directly from
the chain over RPC.

This document describes the strategy the frontend uses to serve those networks
transparently, so adding another un-indexed chain in the future is a config
change rather than a code change.

## Strategy: per-chain data-source selection

The "does this chain have an indexer?" decision is **per-network metadata**, not
a global flag. Each network in [`frontend/src/config/networks.js`](../../frontend/src/config/networks.js)
declares a `subgraphUrl`:

| Chain | `subgraphUrl` | Wager reads served by |
| --- | --- | --- |
| Polygon (137) | Studio endpoint (default/env) | `SubgraphSource` (The Graph) |
| Polygon Amoy (80002) | Studio endpoint (default/env) | `SubgraphSource` (The Graph) |
| Ethereum Classic Mordor (63) | `null` | `RegistrySource` (RPC) |
| Hardhat (1337) | `null` | `RegistrySource` (RPC) |

Two helpers expose this:

```js
import { getSubgraphUrl, hasSubgraph } from '../config/networks'

getSubgraphUrl(63) // → null  (Mordor has no subgraph)
hasSubgraph(137)   // → true
```

Resolution is **strictly per-chain**: a subgraph URL configured for one network
can never be queried while the wallet is on another (so a Polygon endpoint is
never hit while connected to Mordor).

## The data sources

The UI never talks to a source directly — it goes through
[`WagerRepository`](../../frontend/src/data/wagers/WagerRepository.js), which is
bound to a chain id and picks the source for that chain:

- **`SubgraphSource`** — GraphQL against the chain's `subgraphUrl`. Used when
  `hasSubgraph(chainId)` is true. If the endpoint errors or is unreachable, it
  **falls back to `RegistrySource`** (not the retired events source).
- **`RegistrySource`** — direct RPC reads of the v2 `WagerRegistry` using its
  purpose-built pagination views (`getUserWagerCount`, `getUserWagerIds`,
  `getUserWagers`, `getWager`). No `eth_getLogs` block-range scanning, so it
  works on public RPCs (Amoy, Mordor) that reject wide log ranges. This is the
  default for any chain without a subgraph.
- **`EventsSource`** — *legacy*. Reads the retired `FriendGroupMarketFactory`
  and is no longer wired into the automatic fallback path. Retained only behind
  an explicit `VITE_WAGER_SOURCE=events` override.

Both live sources emit the same mapped `Wager` shape, so the list, detail, and
report views are agnostic to which one produced a page.

```
useMyWagers / useAccountStats / reportDataSource
        │  (chainId)
        ▼
   WagerRepository(chainId)
        │
  hasSubgraph(chainId) ? SubgraphSource ─(on error)─▶ RegistrySource (RPC)
                       : RegistrySource (RPC)
```

## Threading the chain id

Reads are keyed on the wallet's connected chain so a user on testnet never sees
mainnet wagers (or vice versa):

- `useMyWagers` reads the active chain from `wagmi`'s `useChainId()` (override
  with the `chainId` option) and builds a per-chain repository.
- `useAccountStats` and `reportDataSource` pass their `chainId` to
  `getDefaultWagerRepository(chainId)`.

## Reporting

The tax/activity report (`reportDataSource`) prefers the indexed
`listTransfers` path where a subgraph exists. On a chain without one it returns
`null` from `listTransfers` and enumerates wagers via the RPC repository
(`enumerateWagers`), then does a **bounded** on-chain event scan per wager. No
hard dependency on the subgraph remains.

## Membership / roles

Role reads (`hasRoleOnChain`) and the Quick Start membership banner have always
read from the `MembershipManager` over RPC and are already chain-aware, so they
work on un-indexed networks. The banner is additionally gated on
`blockchainSynced` so it only renders once the wallet's roles are confirmed
on-chain — it won't linger for a member while the RPC read resolves.

## Adding another un-indexed network

1. Add the network to `networks.js` with `subgraphUrl: null` (or a
   `VITE_SUBGRAPH_URL_<NET>` override if you stand up your own indexer later).
2. Ensure `wagerRegistry` (and `membershipManager`) addresses are recorded for
   the chain in `contracts.js` / `deployments/`.

No source code changes are required — `WagerRepository` will route the chain to
`RegistrySource` automatically.
