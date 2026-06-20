# Contract: Basic Stats Source (RPC fallback)

Defines how basic stats are produced on networks that are **not** configured to the
graph (`isGraphConfigured(chainId) === false`), satisfying FR-010/FR-011/FR-013/
FR-016. Reuses the proven subgraph→RPC fallback already in `useSiteStats.js`.

## Source priority

```
isGraphConfigured(chainId) ?  advanced (subgraph enumeration, existing behavior)
                           :  basic (direct RPC reads, this contract)
```

In `basic` mode the stats view MUST NOT attempt subgraph enumeration (which would
throw "requires indexing") and MUST NOT perform unbounded `eth_getLogs` scans.

## Basic stat reads (bounded)

| Stat | Read | Bound |
|------|------|-------|
| `totalWagers` | `WagerRegistry.nextWagerId()` then `max(0, n-1)` | Single contract call. |
| `activeWagers` | RPC-backed `WagerRepository` fallback (`EventsSource`) where derivable for the member | Existing bounded path; omit if unavailable rather than scan from genesis. |
| `walletBalances` | wallet context native + stablecoin `balanceOf` | Already RPC-sourced today (`useAccountStats.fetchStableBalance`). |

- Contract address via `getContractAddressForChain('wagerRegistry', chainId)`; when
  absent, return honest zeros (mirror `useSiteStats.fetchFromRpc`).
- ABI from the synced `WAGER_REGISTRY_ABI` (never hardcoded — constitution V).
- Provider via existing `getProvider(chainId)` / `NETWORK_CONFIG.rpcUrl`.

## Caching & scope

- Cache per chainId (e.g. `Map<chainId, { value, ts }>`, TTL 60s) so a network
  switch never shows another chain's figures within the window (constitution III;
  mirrors `useSiteStats` `cacheByChain`).

## Error & freshness semantics

- Read success → `source: 'rpc'`, `lastUpdated: now`, values as read (no padding/
  floor — honest state).
- Read failure → retain last-known values, mark freshness `stale`, surface a
  non-blocking message; never hang or throw to the UI (FR-013, SC-003).
- The basic tier MUST be labeled as basic and note that advanced metrics require an
  indexed network (FR-011).

## Labeling contract (UI)

- Summary tiles render in both modes; in `basic` mode they carry a basic-stats label.
- Advanced sections (P&L chart, breakdowns, valued activity feed) and report
  generation render a "requires indexing on this network" explanation in `basic`
  mode instead of an error or spinner (FR-008).

## Test expectations (Vitest)

- `isGraphConfigured=false` → stats view shows basic tiles (from RPC) + "requires
  indexing" notes on advanced sections; no subgraph fetch attempted.
- `nextWagerId` mocked → `totalWagers === n-1`; `nextWagerId=0/1` → `0`.
- No `wagerRegistry` address for chain → honest zeros, no throw.
- RPC read rejects → last-known retained, freshness `stale`, no unhandled error.
- Network switch indexed→un-indexed flips mode and does not show prior chain's
  figures (cache keyed by chain).
