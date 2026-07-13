# Gateway Contract: `/v1/opensea/*` (read-only OpenSea proxy)

**Service**: `services/relay-gateway` | **Feature**: 055-collectibles-portfolio

All routes are **GET**, read-only, and inherit the gateway's standard middleware:
CORS allow-list, `X-Origin-Auth` origin-lock (403 `origin_denied` without it),
and the JSON error envelope `{ "error": { "code", "message" } }`.

Common behavior:

- **Killswitch**: active killswitch → `503 { error: { code: "killswitch_active" } }`.
- **Fail-closed config**: `OPENSEA_API_KEY` unset → `503 { error: { code: "collectibles_unconfigured" } }`.
- **Chain mapping**: `:chainId` `1` → OpenSea slug `ethereum`, `137` → `matic`.
  Any other value → `404 { error: { code: "unsupported_chain" } }`.
- **Quotas**: per requested address + global sliding window. Exceeded →
  `429 { error: { code: "quota_exceeded" } }` + `Retry-After` seconds.
- **Caching**: in-process TTL + single-flight. Fresh-miss upstream failure with a
  cached value → serve cached value with `stale: true`; without a cached value →
  `503 { error: { code: "upstream_unavailable" } }`.
- **Envelope**: every 200 body carries `fetchedAt` (ISO-8601, time of upstream
  fetch) and `stale` (boolean).
- **No mutation**: the gateway never calls a non-GET OpenSea endpoint from this
  route group and never forwards client-supplied headers upstream (only path/query
  params validated against the schemas below).

DTO field definitions: see `../data-model.md`.

---

## 1. List owned collectibles

```
GET /v1/opensea/:chainId/account/:address/nfts?next=<cursor>
```

| Param | Rule |
|---|---|
| `chainId` | `1` or `137` |
| `address` | valid 0x address (else `400 invalid_address`) |
| `next` | optional opaque cursor from a prior response; max 512 chars |

**200 response** (`AccountCollectiblesPage`):

```json
{
  "items": [
    {
      "chainId": 137,
      "contract": "0xAbC…",
      "identifier": "1234",
      "name": "Cool Cat #1234",
      "collectionSlug": "cool-cats",
      "imageUrl": "https://…",
      "standard": "erc721",
      "quantity": 1,
      "isFlagged": false,
      "openseaUrl": "https://opensea.io/assets/matic/0xAbC…/1234"
    }
  ],
  "next": "LXBrPTEyMzQ1Njc4OQ",
  "fetchedAt": "2026-07-13T20:31:07Z",
  "stale": false
}
```

Upstream: `GET /api/v2/chain/{chain}/account/{address}/nfts` (page size 50).
Cache key: `nfts:{chainId}:{address}:{next}` — TTL `OPENSEA_CACHE_TTL_MS` (60 s).
Quota key: `address`.

## 2. Item detail (composed)

```
GET /v1/opensea/:chainId/contract/:contract/nfts/:identifier
```

| Param | Rule |
|---|---|
| `chainId` | `1` or `137` |
| `contract` | valid 0x address (else `400 invalid_address`) |
| `identifier` | non-empty, ≤ 128 chars, digits only (else `400 invalid_identifier`) |

**200 response** (`CollectibleItemDetail`): item fields as above plus:

```json
{
  "description": "…",
  "traits": [ { "traitType": "Fur", "value": "Golden" } ],
  "owner": "0xDeF…",
  "collection": {
    "slug": "cool-cats",
    "name": "Cool Cats",
    "imageUrl": "https://…",
    "openseaUrl": "https://opensea.io/collection/cool-cats",
    "floorPrice": { "amount": "0.85", "currency": "ETH" }
  },
  "bestOffer": { "amount": "0.79", "currency": "WETH" },
  "fetchedAt": "2026-07-13T20:31:07Z",
  "stale": false
}
```

`floorPrice` and `bestOffer` are `null` when the upstream has none — the client
renders explicit "unavailable"/"none yet" states (never zero).
Composition: item detail + collection + stats + best offer fetched concurrently;
a failure in the floor/offer legs degrades that field to `null` (with `stale`
untouched) rather than failing the whole response — only an item-detail failure
produces an error.
Cache key: `item:{chainId}:{contract}:{identifier}` — TTL 60 s.
Quota key: `contract`.

## 3. Collection stats

```
GET /v1/opensea/collections/:slug/stats
```

| Param | Rule |
|---|---|
| `slug` | `[a-z0-9-]{1,128}` (else `400 invalid_slug`) |

**200 response**:

```json
{
  "slug": "cool-cats",
  "floorPrice": { "amount": "0.85", "currency": "ETH" },
  "fetchedAt": "2026-07-13T20:31:07Z",
  "stale": false
}
```

Used by the frontend to price collections for the Portfolio estimate without
re-fetching item details. Cache key: `stats:{slug}` — TTL
`OPENSEA_STATS_CACHE_TTL_MS` (300 s). Quota key: `slug`.

---

## Error codes (route group summary)

| HTTP | `error.code` | Meaning |
|---|---|---|
| 400 | `invalid_address` / `invalid_identifier` / `invalid_slug` | parameter validation |
| 403 | `origin_denied` | missing/wrong `X-Origin-Auth` |
| 404 | `unsupported_chain` | chainId not 1/137 |
| 429 | `quota_exceeded` | per-address or global quota (with `Retry-After`) |
| 503 | `collectibles_unconfigured` | `OPENSEA_API_KEY` unset |
| 503 | `killswitch_active` | gateway killswitch engaged |
| 503 | `upstream_unavailable` | OpenSea unreachable and no cached value |

## Frontend client contract

`frontend/src/lib/collectibles/gatewayClient.js`:

- Base URL from `VITE_RELAYER_URL`; when unset the factory returns `null` and the
  feature hides (soft-fail, mirrors `makeRelayer()`).
- Bounded fetch (AbortController, 10 s) mapping transport failures and 5xx to a
  `CollectiblesUnavailable` error consumed by the hook's `degraded` state; 429 is
  retried once after `Retry-After`, then treated as unavailable.
- Never sends wallet signatures, cookies, or auth material other than the
  edge-injected `X-Origin-Auth`.
