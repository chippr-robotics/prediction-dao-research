# Gateway contract: Perps read proxy (`/v1/perps/*`)

> ## ⚠️ SUPERSEDED for the response shape — this is the record of what 082 shipped
>
> The current contract is
> [`specs/083-perps-position-management/contracts/gateway-perps-api.md`](../../083-perps-position-management/contracts/gateway-perps-api.md).
> **Read that one when writing or reviewing a consumer.** This document is kept as the historical
> record of the phase-0 (read-only trade view) API and is not maintained.
>
> Everything below still describes real behaviour that spec 083 did not remove, but it is
> **incomplete and wrong in places**. Known divergences from the live producer:
>
> - **No `venueRef`** — Gains positions and pending orders now carry the venue's own handles, with
>   the two Gains index spaces named `tradeIndex` and `pendingOrderIndex` (never a bare `index`), and
>   `tradeIndex` deliberately `null` on a `MARKET_OPEN`.
> - **No `pendingOrders`** — `/v1/perps/positions` now returns the member's stuck Gains market orders
>   alongside positions, plus `asOf`.
> - **No `sources.gains.pendingOrderChains`** — the recovery facet resolves independently of the
>   position facet, and an empty `pendingOrders` for a chain that did not answer means *unknown*, not
>   "you have no stuck orders".
> - **No `pairIndex` / `minLeverage` / `collaterals` (Gains) or `market` / `collaterals` (GMX)** — the
>   handles the open path builds calldata from.
> - **The 502 rule has an exception** that is not recorded here: when every position read fails but
>   the pending-order read succeeded, the route answers `200` with those orders, because an outage is
>   not a licence to bury a recovery handle behind an error screen.
> - **Quotas are per-IP and global only** — the "per address" quota described below never existed in
>   the shipped code.

Mirrors the Polymarket proxy's cross-cutting behavior: mounted unconditionally;
killswitch → config check → param validation → quota → cached fetch; reads may retry,
there are no writes; errors are `{ error: { code, reason } }` (the gateway-wide shape,
`src/errors.js`) with honest codes (`503 perps_killed` for the module killswitch,
`503 killswitch_active` for the global one, `503 perps_unconfigured`,
`429 quota_exceeded`, `400 invalid_address`, and `502 upstream_failed` only when
*every* venue fails — a `200` with empty rows always means the venues answered).

Per-venue isolation is the core rule: each venue resolves independently to
`read | degraded`; a degraded venue contributes no rows and is reported in `sources`.
The proxy never fabricates: a metric a venue did not report is `null`, never 0.

## `GET /v1/perps/pairs`

Merged normalized pairs from all configured venues. Cache ~`PERPS_CACHE_TTL_MS`
(default 15000), single-flight; stale cache is served (marked `stale: true`) only for
venues currently failing, up to 10× TTL, else the venue is `degraded`.

```jsonc
{
  "pairs": [PerpPair],
  "sources": {
    "gains":       { "status": "read" | "degraded", "chains": [42161, 8453, 137] },
    "gmx":         { "status": "read" | "degraded", "chains": [42161] },
    "hyperliquid": { "status": "read" | "degraded", "chains": [] }   // non-EVM venue
  },
  "asOf": "2026-08-11T23:35:00.000Z"   // ISO-8601 server time of the response
}
```

**PerpPair** (normalize.js is the only module that knows upstream shapes):

```jsonc
{
  "id": "gains:137:BTC/USD",          // venue:chainOrVenueScope:symbol — stable row key
  "venue": "gains" | "gmx" | "hyperliquid",
  "chainId": 137,                      // number for EVM venues; null for hyperliquid
  "symbol": "BTC/USD",
  "base": "BTC", "quote": "USD",
  "price": 118432.5,                   // number | null — mid/oracle per venue docs
  "fundingRate": -0.0000125,           // per-interval fraction | null
  "fundingIntervalHours": 1,           // 1 (HL, gains v10 hourly) | 8 … always explicit
  "openInterestUsd": 182000000,        // number | null
  "maxLeverage": 150,                  // number | null
  "volume24hUsd": 42000000             // number | null (HL + GMX expose; gains null)
}
```

## `GET /v1/perps/positions?address=0x…`

Per-venue open positions for one EVM address (also used as the Hyperliquid account
address). Address validated (`ADDRESS_RE`), quota per address + per IP, cache ~10s
keyed by address. `Promise.allSettled` across venues.

```jsonc
{
  "positions": [PerpPosition],
  "sources": { "gains": {"status": "read"}, "gmx": {"status": "degraded"}, "hyperliquid": {"status": "read"} }
}
```

**PerpPosition**:

```jsonc
{
  "id": "hyperliquid:ETH:long",
  "venue": "hyperliquid", "chainId": null,
  "symbol": "ETH/USD",
  "direction": "long" | "short",
  "sizeUsd": 2500.0,                   // notional | null
  "collateralUsd": 250.0,              // | null
  "entryPrice": 3120.4,                // | null
  "leverage": 10,                      // | null
  "unrealizedPnlUsd": -12.6            // | null — venue-reported only, never derived
}
```

## `GET /v1/perps/config`

Public attribution + fee config for link-out surfaces. Never contains secrets.

```jsonc
{
  "attribution": {
    "gains":       { "referrer": "0x…" | null },
    "gmx":         { "refCode": "fairwins" | null },
    "hyperliquid": { "builderAddress": "0x…" | null }
  },
  "hyperliquidBuilderFee": {
    "bps": 0,                          // live FeeRouter perps.hyperliquid.builder, clamped ≤ 10
    "capBps": 10,
    "source": "chain" | "env-fallback"
  }
}
```

## Config & boot

Env block `perps` in `src/config/index.js`: `PERPS_ENABLED` (default false ⇒ routes
503 `perps_unconfigured`), per-venue base URLs (`PERPS_GAINS_URL_ARBITRUM/_BASE/_POLYGON`,
`PERPS_GMX_URL`, `PERPS_HL_URL` — each defaulting to the public host, unset-able to
disable one venue), `PERPS_CACHE_TTL_MS`, `PERPS_TIMEOUT_MS`, `PERPS_RETRIES`,
`PERPS_QUOTA_PER_IP/_PER_ADDRESS/_GLOBAL/_WINDOW_MS`, `PERPS_KILLSWITCH`,
`PERPS_GMX_REF_CODE`, `PERPS_GAINS_REFERRER` (ADDRESS_RE),
`PERPS_HL_BUILDER_ADDRESS` (ADDRESS_RE), `PERPS_HL_BUILDER_FEE_BPS` (int, **boot
throws above 10** — mirrors the Polymarket cap check).

`GET /status` gains `perps: { enabled, venues: {…status}, attribution: {…configured
booleans}, fee: { bps, source } }`.
