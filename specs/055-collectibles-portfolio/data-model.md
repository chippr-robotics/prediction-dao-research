# Data Model: Collectibles Portfolio (Read-Only NFT Display)

**Feature**: 055-collectibles-portfolio | **Date**: 2026-07-13

No persistent storage is introduced. All entities are transient DTOs: normalized
by the gateway from OpenSea API v2 responses, cached in-process with TTLs, and
held in frontend hook state. Field names below are the gateway DTO contract
(camelCase); see `contracts/gateway-opensea-api.md` for the endpoint envelopes.

## CollectibleItem

One owned NFT (unique or multi-copy) on a specific network.

| Field | Type | Source (OpenSea v2) | Notes |
|---|---|---|---|
| `chainId` | number | request context | 1 or 137 only |
| `contract` | string (address) | `nft.contract` | checksummed by gateway |
| `identifier` | string | `nft.identifier` | token id; string — may exceed 2^53 |
| `name` | string | `nft.name` | fallback: `#<identifier>` applied by gateway (FR: missing metadata never crashes grid) |
| `collectionSlug` | string | `nft.collection` | join key to Collection |
| `imageUrl` | string \| null | `nft.display_image_url \|\| nft.image_url` | null → frontend placeholder |
| `standard` | string | `nft.token_standard` | `erc721` \| `erc1155` |
| `quantity` | number | ownership count | ≥ 1; shown when > 1 (multi-copy) |
| `isFlagged` | boolean | `nft.is_disabled \|\| nft.is_nsfw` | drives hidden-items toggle (FR-012) |
| `openseaUrl` | string | `nft.opensea_url` or constructed | deep-link target (FR-004) |

**Validation**: `contract` must be a valid address; `identifier` non-empty string;
items failing validation are dropped by the gateway (logged, never 500).

## CollectibleItemDetail

Extends `CollectibleItem` for the detail sheet. Returned by the composed
item-detail endpoint (item + collection + best offer in one response).

| Field | Type | Source | Notes |
|---|---|---|---|
| `description` | string \| null | `nft.description` | |
| `traits` | `Array<{traitType, value}>` | `nft.traits` | empty array when none |
| `owner` | string \| null | `nft.owners[0].address` | display only |
| `collection` | `Collection` | embedded | see below |
| `bestOffer` | `PriceQuote` \| null | best-offer endpoint | null → "none yet" (FR-003) |

## Collection

| Field | Type | Source | Notes |
|---|---|---|---|
| `slug` | string | `collection.collection` | |
| `name` | string | `collection.name` | |
| `imageUrl` | string \| null | `collection.image_url` | |
| `openseaUrl` | string | constructed | |
| `floorPrice` | `PriceQuote` \| null | `stats.total.floor_price` + `floor_price_symbol` | null → excluded from estimates (FR-006) |

## PriceQuote

Every price carries its denomination explicitly (FR-013 — no bare numbers).

| Field | Type | Notes |
|---|---|---|
| `amount` | string | decimal string, never float-rounded by gateway |
| `currency` | string | e.g. `ETH`, `WETH`, `POL`, `USDC` |

## AccountCollectiblesPage

Envelope for the paginated owned-items list.

| Field | Type | Notes |
|---|---|---|
| `items` | `CollectibleItem[]` | one page |
| `next` | string \| null | opaque cursor; null = last page |
| `fetchedAt` | string (ISO-8601) | staleness display (FR-013) |
| `stale` | boolean | true when served from cache after upstream failure (FR-008) |

`fetchedAt`/`stale` appear on every gateway response envelope (list, detail, stats).

## CollectiblesValuation (frontend-computed)

Per-wallet, per-network aggregate for the Portfolio line (FR-006). Computed in
`useCollectibles` from loaded pages + collection floor prices; never persisted.

| Field | Type | Notes |
|---|---|---|
| `estimatedUsd` | number \| null | Σ (floorPrice × quantity) over priced collections, converted with the existing portfolio price sources; null when nothing priced or prices unavailable |
| `pricedItems` / `unpricedItems` | number | drives the "priced items only" label |
| `truncated` | boolean | true when holdings exceed the bounded page/collection scan (edge case: very large holdings) |
| `stale` | boolean | propagated from underlying responses |

**Rule**: `estimatedUsd` is never added into `usePortfolio`'s `totalUsd`
(research D8 — honest state).

## Gateway cache entry (internal)

`Map<cacheKey, { at: number, value: object, inflight: Promise|null }>` —
`cacheKey` = normalized route + params. TTLs: list/detail 60 s, stats 300 s.
Bounded size with oldest-entry eviction. Not part of any external contract.

## State transitions

`useCollectibles` status machine (mirrors `usePortfolio` conventions):

```
idle → loading → ready            (items rendered; may carry stale=true)
              ↘ empty             (zero items)
              ↘ degraded          (no data + upstream unavailable → FR-008 state)
any → loading                      (refresh / chain switch / account switch)
chain/account switch: state fully reset before refetch (FR-010 — no cross-leak)
unsupported chain or gateway unconfigured: hook returns {supported:false} and
  performs no fetches (FR-007)
```
