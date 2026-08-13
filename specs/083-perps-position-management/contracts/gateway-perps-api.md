# Contract: Perps read proxy (`/v1/perps/*`) — spec 083

**Supersedes** [`specs/082-perps-trade-view/contracts/gateway-perps-api.md`](../../082-perps-trade-view/contracts/gateway-perps-api.md)
**for the response shape**. That document is the record of what 082 shipped; it predates `venueRef`,
`pendingOrders`, `pairIndex`/`minLeverage`/`collaterals`, `market`, `sources.gains.pendingOrderChains`
and the one documented exception to the total-outage 502. Read this one as current.

Producer: `services/relay-gateway/src/perps/{routes,normalize,client}.js`, config block `perps` in
`src/config/index.js`, mounted in `src/server.js`. Every statement below was checked against that
code and `services/relay-gateway/test/perps.test.js` on 2026-08-12.

> **The module is READ-ONLY and stays that way.** There is no write route, and spec 083 did not add
> one: position management is **member-direct** — the member's wallet is `msg.sender` on every venue
> call, calldata is built in the SPA (`frontend/src/lib/perps/venues/*`), and the gateway never sees
> a signature, a key or a transaction. It serves market data, the member's own venue state, and
> public attribution config. A total perps outage therefore cannot touch a value path, and cannot
> prevent an exit that the member's own wallet performs.

---

## 1. Cross-cutting behaviour

Mounted **unconditionally** (`server.js`), so a disabled module answers `503 perps_unconfigured`
rather than a bare 404 — "off" is a stated fact, not a missing route.

Request pipeline, in this order:

| # | Stage | Failure |
|---|---|---|
| 0 | CORS / preflight (`OPTIONS` → 204, before the origin lock) | — |
| 1 | Origin lock (`X-Origin-Auth`, injected zone-wide by Cloudflare) | `403 origin_denied` |
| 2 | Route param validation — **`/positions` only, and it runs BEFORE the guard** | `400 invalid_address` |
| 3 | Module killswitch (`PERPS_KILLSWITCH`) | `503 perps_killed` |
| 4 | Global gateway killswitch | `503 killswitch_active` |
| 5 | `perps.enabled` | `503 perps_unconfigured` |
| 6 | Quota (per caller IP, then global) | `429 quota_exceeded` + `Retry-After` |
| 7 | Per-venue cached fetch, `Promise.all` / `allSettled` | per-venue `degraded`, never a request failure |
| 8 | Total-outage check (§6) | `502 upstream_failed` |

> **Ordering note that matters.** On `/v1/perps/positions` the address is validated *before* the
> killswitch/enabled/quota guard, so a malformed address answers `400 invalid_address` even on a
> killed or unconfigured module. `/pairs` and `/config` guard first. This is the code's behaviour,
> not an accident to be "fixed" without a reason — a caller that sent nonsense learns it sent
> nonsense.

**Error body** is the gateway-wide shape (`src/errors.js`), always exactly:

```jsonc
{ "error": { "code": "…", "reason": "…" } }
```

Unhandled (non-`GatewayError`) throws map to `503 upstream_unavailable` — the catch-all in
`handleError`, never a 500 with a stack.

### Error codes

| Status | `code` | Meaning |
|---|---|---|
| 400 | `invalid_address` | `address` is not a 0x-prefixed 20-byte hex string (`/positions` only) |
| 403 | `origin_denied` | request did not arrive through the platform edge (middleware, before the router) |
| 429 | `quota_exceeded` | IP or global read quota exhausted; `Retry-After` header set. The reason string says `signer …` for the per-IP scope — the quota helper's generic label; the key is the caller IP, there is no per-address quota |
| 502 | `upstream_failed` | **every** venue read failed — see §6 for the one exception |
| 503 | `perps_killed` | module killswitch (`PERPS_KILLSWITCH=true`) |
| 503 | `killswitch_active` | global gateway killswitch |
| 503 | `perps_unconfigured` | `PERPS_ENABLED` is not `true` |
| 503 | `upstream_unavailable` | unexpected internal failure (catch-all) |

### Caching and staleness

`createTtlCache` (`src/opensea/cache.js`), TTL `PERPS_CACHE_TTL_MS` (default 15 000 ms),
single-flight per key. On a loader failure a previously cached value is served with `stale: true`;
a stale value older than **10 × TTL** (`STALE_FACTOR`) is treated as gone and the venue degrades —
stale-as-live would be dishonest.

Cache keys (address lowercased so casing cannot multiply entries):

```
gains-tv:<chainId>                 gains-open:<chainId>:<address>
gains-utv:<chainId>:<address>      gains-prices
gmx-pairs                          hl-perp-dexs
hl-pairs:<dex>                     hl-positions:<address>:<dex>
```

`hl-perp-dexs` is the Hyperliquid perp-dex list (§2) — **global, not per-member**, so it has its own
long TTL (`PERPS_HL_DEX_LIST_TTL_MS`, default 1 h) and is never re-fetched per request. Non-default
`hl-pairs:<dex>` entries sit behind a 5-minute floor for the rate-limit reason in §2; `<dex>` is `""`
for the first/default dex, so the default keys read `hl-pairs:` and `hl-positions:<address>:`.

Upstream reads are retried (`PERPS_RETRIES`, default 1) on 5xx/429 only; every venue call is a read,
so retrying is safe. A definitive upstream 4xx is not retried.

---

## 2. `GET /v1/perps/pairs`

Merged normalized pairs from every configured venue. No parameters.

```jsonc
{
  "pairs": [PerpPair],
  "sources": {
    "gains":       { "status": "read", "chains": [42161, 8453, 137], "stale": false },
    "gmx":         { "status": "read", "chains": [42161], "stale": false },
    "hyperliquid": {
      "status": "read", "chains": [], "stale": false,
      "dexes": ["", "xyz", "hyna"],  // the perp dexes read; "" is the first/default one
      "unreadDexes": [],             // named where known; null when dex discovery itself failed
      "partial": false               // true => this venue's answer is incomplete (see §5)
    }
  },
  "asOf": "2026-08-12T18:04:00.000Z"
}
```

A venue with **no configured base URL is absent from `sources` entirely** — "the operator chose not
to serve it" is a different fact from an outage, which is reported as `status: "degraded"` with an
empty `chains` list.

### PerpPair — shared display fields (spec 082, unchanged)

```jsonc
{
  "id": "gains:137:BTC/USD",       // venue:scope:symbol[:market] — stable row key
  "venue": "gains" | "gmx" | "hyperliquid",
  "chainId": 137,                   // number for EVM venues; null for hyperliquid (FR-012)
  "symbol": "BTC/USD",
  "base": "BTC", "quote": "USD",
  "price": 63000,                   // number | null
  "fundingRate": 0.000072,          // per-interval fraction | null
  "fundingIntervalHours": 1,        // always explicit
  "openInterestUsd": 8000,          // number | null
  "maxLeverage": 200,               // number | null
  "volume24hUsd": null              // number | null (HL only today)
}
```

### PerpPair — spec 083 additions, per venue

These are **not display fields**. They are the venue's own handles, and without them the open sheet
has nothing to build calldata from — it would be a control that cannot submit.

**Gains** (`normalizeGainsPairs`) adds:

```jsonc
{
  "group": "crypto",               // 082 field: the pair's gains group name | null
  "pairIndex": 0,                  // uint — the venue's own index into `pairs`, what openTrade takes
  "minLeverage": 1.1,              // group floor at the 1e3 scale | null (no floor asserted)
  "collaterals": [                 // chain-wide; shared by reference across this chain's rows
    { "symbol": "USDC", "address": "0xaf88…5831", "decimals": 6,
      "collateralIndex": 3,        // the venue's own 1-BASED index — never the array position
      "usdPrice": 1 }              // the venue's own price | null; never an assumed $1 peg
  ]
}
```

- `pairIndex` is the loop position in `tv.pairs` by construction, which is the same index
  `openTrade` consumes and the same one OI/funding were read at — it cannot drift from its row.
  **It is legitimately `0` for the first pair**: present-and-zero, never absent, and a consumer that
  tests it for truthiness is wrong.
- A collateral is **omitted, not marked**, when it is inactive, unaddressed, undescribed (no
  decimals) or reports `collateralIndex: 0` (not a value on a 1-based venue). `collaterals: []`
  therefore means "this venue cannot be opened on right now", which is the honest outcome — an
  amount in unknown units is not an amount.

**GMX** (`normalizeGmxPairs`) adds:

```jsonc
{
  "variant": "WBTC.b-USDC",        // 082 field: the market's collateral pair, parsed from its name
  "market": "0x47c0…0703",         // the market TOKEN — CreateOrderParams.addresses.market | null
  "collaterals": [                 // the market's own long/short tokens, de-duplicated
    { "symbol": "WBTC.b", "address": "0x3f77…aD46", "decimals": 8,
      "collateralIndex": null,     // GMX has no index — the address IS the handle
      "usdPrice": null }           // GMX's own ticker mid | null
  ]
}
```

`market` also appears inside `id`, and both come from the one value, so they cannot disagree.
`collateralIndex: null` (rather than absent) keeps the collateral shape identical across venues so a
consumer never has to know which venue produced it.

**Hyperliquid** adds no venue handle — it is read-only in this release (`chainId: null`) — but it
does carry the perp dex that listed the market, for the reason below.

### Hyperliquid perp dexes (HIP-3) — why every read is fanned out

Hyperliquid is **not one order book**. Alongside its own it hosts validator-operated perp dexes,
each with its own asset universe and its own per-member clearinghouse state, and every `/info` read
takes a `dex` field that *"Defaults to the empty string which represents the first perp dex."*

Spec 082 sent no `dex`, so it saw only the first one. The live list held **10** dexes on 2026-08-12
(`''`, `xyz`, `flx`, `vntl`, `hyna`, `km`, `abcd`, `cash`, `para`, `mkts`) and a measured member
held **35 positions across `xyz`/`hyna`/`mkts` and zero on the first dex** — FairWins rendered "No
open perp positions found for this account."
(`specs/083-perps-position-management/hyperliquid-decision.md` §5.2, defect 1.)

So both routes:

1. **Discover** the list (`{"type":"perpDexs"}`; its leading `null` element *is* the default dex)
   and cache it — it is global, not per-member, so it is never re-fetched per request.
2. **Fan out** across it, bounded (`PERPS_HL_DEX_MAX`, concurrency 4), each dex cached and isolated
   like a venue.
3. **Report** every dex that was not read, in `sources.hyperliquid` (§5). A dex that did not answer
   is never rendered as "no positions there".

Two consequences a consumer must honour:

- **Ids carry the dex.** `hyperliquid:xyz:BTC:long` — two dexes listing the same coin are two real
  markets and two real positions, and a dex-less id merges them into one row. The **default dex
  keeps its 082 id** (`hyperliquid:BTC:long`) on purpose: the SPA's activity source fingerprints
  these ids, so re-keying them would narrate a position change that never happened.
- **`partial: true` must be disclosed**, not smoothed over. It is a `read` whose answer is
  incomplete; a short list rendered without qualification is the same fabricated absence in a new
  place. `usePerpsPositions` folds a partial venue into `unreadableVenues`, and `perpsSource` keeps
  its prior snapshot rather than diffing one (a dex going quiet is not a position closing).

**The budget that shapes this** (hyperliquid-decision.md §2.5): Hyperliquid's limit is 1200 request
weight per minute **per IP**, and the gateway is one IP for every member. `clearinghouseState`
weighs 2, so a 10-dex position fan-out is 20 per refresh (~80/min per actively-viewing member at the
15s cache) — paid, because it is the member's own position set. `metaAndAssetCtxs` weighs 20, so the
same fan-out on **pairs** would be 800/min; the pairs feed is global and single-flight cached, so
non-default dexes sit behind a 5-minute floor (~40/min at 10 dexes). Neither knob may silence a dex.

### PerpPair — the venue's own cost and the venue's own minimum

Every pair carries these three fields, **present even when null**, so a consumer can tell "this
venue does not publish it" from "this gateway predates the field":

```jsonc
{
  "venueFee": {                    // the venue's OWN trading fee | null
    "openRate": 0.00035,           // FRACTION of position size, charged on opening
    "closeRate": 0.00035,          // …and on closing (gains charges the same on both)
    "feeFloorNotionalUsd": 285.715,// the fee is charged on max(size, this)
    "minFeeUsd": 0.10000025,       // openRate × feeFloorNotionalUsd = the venue's pairMinFeeUsd
    "basis": "published-rate"      // a RATE the venue publishes, never a quote for this order
  },
  "minNotional": null,             // number | null — a minimum POSITION SIZE
  "minCollateralUsd": 0.50000125   // number | null — a minimum COLLATERAL, in USD
}
```

**A RATE, NOT AN AMOUNT.** A perps fee is a fraction of position size and the size is whatever the
member types, so a per-pair dollar figure would be the fee for one size and wrong for every other.
The SPA multiplies the rate by the size it is showing (`lib/perps/feeUnits.js#venueFeeFromNotional`),
which is the only way the number on screen can match the order.

**Gains** (`gainsPairFee`) — scales from `@gainsnetwork/sdk`'s own `convertFee`, re-verified against
the live payload and the Arbitrum diamond on 2026-08-12:

| field | source | scale |
|---|---|---|
| `openRate` | `fees[pairs[i].feeIndex].totalPositionSizeFeeP` | `/1e12` (1e10 percent × 100 → fraction) |
| `feeFloorNotionalUsd` | `fees[…].minPositionSizeUsd` | `/1e3` (USD) |
| `minCollateralUsd` | `5 × minFeeUsd` | the `InsufficientCollateral` bound on `openTrade` |

`pairMinFeeUsd(0)` on chain returns `100000250000000000` = `0.00035 × 285.715`, exactly.

**`minNotional` IS NULL FOR GAINS ON PURPOSE.** `minPositionSizeUsd` is a **fee floor**, not a
minimum size: gTrade v9 removed the `BelowMinPositionSizeUsd` check outright and replaced it with
`InsufficientCollateral` (collateral ≥ 5× the pair's minimum fee). Publishing $285.72 as a minimum
would refuse a $100 BTC position the venue would happily fill — a dead control built from a real
number read as the wrong fact. What the floor *does* mean is disclosed instead: below it the member
pays the fee of a floor-sized position (a $50 BTC position pays $0.10 — 0.2%, against a headline
0.035%), and the SPA says so beside the figure.

The rate **excludes** spread and price impact, borrowing and funding, the counter-trade discount,
and the member's own fee-tier/staking multiplier — which only ever *reduces* it, so the published
rate is an honest upper bound. Consumers must label it as the venue's estimate, never as a quote.

**GMX publishes none of the three.** Position-fee factors and `MIN_COLLATERAL_USD` /
`MIN_POSITION_SIZE_USD` live in its DataStore; `/markets/info` returns name, tokens, liquidity, OI
and rates and nothing else (verified live, 2026-08-12). All three fields are `null` and the SPA
shows `—` with the venue named — a rate copied from documentation that the deployed contract may
have moved is a *wrong* fee, which is worse than an admitted unknown. If it is ever wanted, the fix
is a DataStore read on the client beside `readExecutionFee`, not in this HTTP-only proxy.

---

## 3. `GET /v1/perps/positions?address=0x…`

| Param | Required | Validation |
|---|---|---|
| `address` | yes | `/^0x[0-9a-fA-F]{40}$/`; also used as the Hyperliquid account id |

One member fact, one screen, one route: spec 083 added `pendingOrders` **here** rather than to a
sibling route. Two routes would mean two quota hits, two staleness windows and two `sources` maps
that can disagree — the UI could then show "gains: read" positions while the member's stuck order
silently 502'd, which is exactly the invisibility this surface exists to prevent.

```jsonc
{
  "positions": [PerpPosition],
  "pendingOrders": [PerpPendingOrder],
  "sources": {
    "gains":       { "status": "read", "chains": [42161], "pendingOrderChains": [42161] },
    "hyperliquid": {
      "status": "read", "chains": [], "stale": false,
      "dexes": ["", "xyz", "hyna"], "unreadDexes": [], "partial": false
    }
  },
  "asOf": "2026-08-12T18:04:00.000Z"
}
```

- **GMX is deliberately absent from `sources` here.** Its REST API does not expose positions; they
  are read client-side from GMX's Reader contract (`usePerpsPositions`, T032). Absent is the honest
  state — inventing a GMX entry would claim a read nobody performed.
- The gains position source carries **no `stale` flag** (its two facets have separate freshness);
  the hyperliquid one does.
- `sources: {}` (no venue configured to serve positions on this deployment) yields a plain `200`
  with empty arrays and **no 502** — see §6.

### PerpPosition

```jsonc
{
  "id": "gains:42161:7",
  "venue": "gains", "chainId": 42161,
  "symbol": "BTC/USD",
  "direction": "long" | "short",
  "sizeUsd": 1000, "collateralUsd": 100,   // | null
  "entryPrice": 63000, "leverage": 10,     // | null
  "unrealizedPnlUsd": null,                // venue-reported only, never derived (gains: always null)
  "venueRef": VenueRef | undefined         // gains only; Hyperliquid positions carry none
}
```

Hyperliquid positions keep the 082 shape (`chainId: null`) and gain three fields, because
Hyperliquid is not one order book — see "Hyperliquid perp dexes (HIP-3)" in §2.

```jsonc
{
  "id": "hyperliquid:xyz:BTC:long",   // the DEX is part of the id; default dex keeps "hyperliquid:BTC:long"
  "venue": "hyperliquid", "chainId": null,
  "symbol": "BTC/USD",
  "dex": "xyz",                       // "" is the first/default perp dex, not a missing value
  "variant": "xyz",                   // null on the default dex; the same field GMX's market variant uses
  "venueRef": { "venue": "hyperliquid", "dex": "xyz" }
}
```

`venueRef` here is an **identity, not a handle**: the venue is read-only (FR-021), so it names which
book the row came from and nothing acts through it. `canManage` asks `perpsManageEnabled(venue,
chainId)`, which is build config — a ref can never turn into a control.

### PerpPendingOrder (Gains only)

The stuck-order recovery surface. A member cannot recover an order the client cannot see.
Everything here is **requested, not executed** — inclusion is never execution — so the pre-execution
values are named `requested*` and no component can mistake them for what the position became. There
is no `sizeUsd`/`collateralUsd`/`entryPrice` on this shape at all.

```jsonc
{
  "id": "gains:42161:pending:4",
  "venue": "gains", "chainId": 42161,
  "symbol": "BTC/USD",            // "pair #<n>" when the pair table is unavailable; null when even the index is
  "direction": "long" | "short" | null,
  "orderType": 0,                 // ITradingStorage.PendingOrderType, authoritative | null
  "orderTypeName": "MARKET_OPEN", // names the number; an unmapped value stays null, never invented
  "createdBlock": 493752800,      // | null
  "timeoutBlocks": 200,           // the VENUE's own getMarketOrdersTimeoutBlocks | null
  "requestedCollateralUsd": 250,  // | null
  "requestedLeverage": 10,        // | null
  "requestedSizeUsd": 2500,       // | null
  "requestedPrice": 63000,        // | null
  "venueRef": VenueRef
}
```

`orderTypeName` values: `MARKET_OPEN(0) MARKET_CLOSE(1) LIMIT_OPEN(2) STOP_OPEN(3) TP_CLOSE(4)
SL_CLOSE(5) LIQ_CLOSE(6) UPDATE_LEVERAGE(7) MARKET_PARTIAL_OPEN(8) MARKET_PARTIAL_CLOSE(9)
PARAM_UPDATE(10) PNL_WITHDRAWAL(11) MANUAL_HOLDING_FEES_REALIZATION(12)
MANUAL_NEGATIVE_PNL_REALIZATION(13)`. The table mirrors
`frontend/src/abis/perps/gainsDiamond.js#GAINS_PENDING_ORDER_TYPE`; the gateway is plain Node ESM
and cannot import the SPA tree, so the duplication is deliberate.

Emission rules (`normalizeGainsPendingOrders`):

1. Source is `GET /user-trading-variables/<address>` →
   `{ pendingMarketOrders, pendingMarketOrdersIds }` (verified live against
   `backend-arbitrum.gains.trade`, 2026-08-12).
2. An order the venue already resolved (`isOpen === false`) is **dropped** — nothing to recover.
3. `timeoutBlocks` is passed through from the venue's `marketOrdersTimeoutBlocks` so the client never
   hardcodes a per-chain constant (measured 200 Arbitrum / 30 Base / 30 Polygon) the venue can change.
4. **An id with no matching detail entry is still emitted**, with every unknown field `null` and a
   `venueRef` carrying only `pendingOrderIndex`. A recovery handle the member cannot see is the
   failure this surface exists to prevent; the client offers cancellation without claiming a
   countdown it cannot compute.
5. **Pending orders do not require the trading-variables read.** A missing pair table yields
   `symbol: "pair #0"` and null scales — the handle survives. Recovery is never gated on a second
   read succeeding.

---

## 4. `VenueRef` — and the two NAMED Gains index spaces

> ### THE INDEX TRAP
>
> Gains has **two disjoint `uint32` index spaces**:
>
> | Space | Source | Consumed by |
> |---|---|---|
> | **Trade index** | `getTrades[].index`, `MarketExecuted.index` | `closeTradeMarket`, `updateTp`, `updateSl`, `updateLeverage`, `de/increasePositionSize`, `updateMaxClosingSlippageP` |
> | **Pending-order index** | `getPendingOrders[].index`, `MarketOrderInitiated.orderId.index` | `cancelOrderAfterTimeout` — **and nothing else** |
>
> Passing one where the other belongs **does not revert**. It acts on a *different object* — the
> member's other position.
>
> The SPA defends this with branded types a raw number cannot enter. A JSON wire has no brands, so
> **the wire's defence is the field name**: this API emits `tradeIndex` and `pendingOrderIndex` and
> **never a bare `index`**. Neither name is guessable from the other, so nothing downstream can
> confuse them by accident. Tests assert `Object.keys(venueRef)` does not contain `index`.

```jsonc
// on a PerpPosition (gains) — the TRADE index space
{
  "venue": "gains", "chainId": 42161,
  "tradeIndex": 7,                // uint | null
  "pairIndex": 0,
  "collateralIndex": 3,           // 1-based
  "collateralToken": "0xaf88…5831",   // | null
  "collateralDecimals": 6,            // | null
  "collateralPrecision": "1000000"    // decimal STRING | null
}

// on a PerpPendingOrder — the PENDING-ORDER index space, plus the trade it acts on if any
{
  "venue": "gains", "chainId": 42161,
  "pendingOrderIndex": 4,         // uint — always present on a pending order
  "tradeIndex": null,             // see the MARKET_OPEN rule below
  "pairIndex": 0,                 // | null
  "collateralIndex": 3,           // | null
  "collateralToken": "0xaf88…5831", "collateralDecimals": 6, "collateralPrecision": "1000000"
}
```

A position ref has **no** `pendingOrderIndex` key; a pending-order ref always has one.

> ### `tradeIndex` is `null` on a `MARKET_OPEN` — and that is load-bearing
>
> A `MARKET_OPEN` pending order has **no trade yet**, and the venue **overwrites `Trade.index` to 0**
> on the way in (see `contracts/venue-calldata.md`, Trade field #1). The upstream payload therefore
> contains `trade.index = 0` — a well-formed integer that means nothing.
>
> Publishing that `0` as `tradeIndex` would hand the client a **live handle to the member's trade
> #0**: a different position entirely, which a close or an SL update would then act on. So
> `tradeIndex` is forced to `null` for `orderType === 0` and is only present for order types that
> reference a stored trade — which includes limit/stop orders, since those *are* stored trade
> records with real indices.
>
> The same reasoning is why every index in this API uses the `uint()` helper, which maps a missing
> value to `null` and never to `0`: on this venue **0 is a real index**, so a fabricated 0 is a
> handle to someone else's object rather than an honest "unknown".

**Refs carry identifiers and static scales only** — never mutable position state (collateral amount,
leverage, live prices). Those are re-read from the venue at signing time: a cached amount is already
stale by the time the member signs, and a close or reduce built from it would be wrong in exactly
the moments that matter.

`collateralPrecision` (= `10**decimals`) crosses the wire as an **exact decimal string**: it reaches
`1e18` for DAI/WETH markets, past the range where a JSON float round-trip is guaranteed exact, and
`collateralAmount` on this venue is in the collateral token's **own** decimals (USDC = 1e6), never
1e18 — the single most common mis-scaling in a Gains integration. When the payload does not describe
the collateral, all three fields are `null` and the client resolves `getCollateral(index)` on chain
rather than assuming.

---

## 5. The `sources` map, and `pendingOrderChains`

Per-venue isolation is the core rule: each venue resolves independently, a degraded venue
contributes **no rows** and is named in `sources`, and it never blanks the others and never renders
as zeros.

| Field | Where | Meaning |
|---|---|---|
| `status` | every venue | `"read"` (at least one chain/endpoint/dex answered) or `"degraded"` (none did) |
| `chains` | every venue | the chain ids whose **position/pair** read succeeded; `[]` for Hyperliquid, which is non-EVM |
| `stale` | pairs (all venues), positions (hyperliquid) | the served value came from cache after an upstream failure, within 10 × TTL |
| `pendingOrderChains` | **`/positions` → `gains` only** | the chain ids whose **pending-order** read succeeded |
| `dexes` | **hyperliquid only** | the perp dexes actually read. `""` is the venue's own name for the first/default dex |
| `unreadDexes` | **hyperliquid only** | the perp dexes NOT read, named — or `null` when dex discovery itself failed and we cannot name them. **`null` ≠ `[]`**: one is "we do not know what we missed", the other is "we missed nothing" |
| `partial` | **hyperliquid only** | `true` when `unreadDexes` is non-empty or `null`. A `read` status with `partial: true` means *some* of this venue answered |

`chains` and `pendingOrderChains` are two **independent facets of one venue**, because the two
upstream reads succeed or fail independently:

- Positions need `/trading-variables` (for scales) **and** `/open-trades/<addr>`.
- Pending orders need only `/user-trading-variables/<addr>` — an order with a `null` symbol is still
  recoverable, so a trading-variables outage must never withhold a recovery handle.

> ### What an empty `pendingOrders` means — read this before writing a consumer
>
> An empty `pendingOrders` array is **not** a statement that the member has no stuck orders. It is
> only a statement about the chains listed in `pendingOrderChains`.
>
> | `pendingOrderChains` | `pendingOrders` | The honest reading |
> |---|---|---|
> | `[42161]` | `[]` | **Known:** chain 42161 answered and this member has nothing pending there |
> | `[]` | `[]` | **Unknown:** no chain answered the pending-order read. Say so; do NOT render "no stuck orders" |
> | `[42161]` | `[…]` | Known, and here they are |
> | key absent entirely | any | A gateway build predating spec 083. **Unknown**, not "none" |
>
> `usePerpsOrders` implements exactly this: `pendingOrderChains: []` → `unreadable` with a stated
> reason, and a payload with no `pendingOrders` key → `unreadable` with "this gateway does not report
> pending orders yet". It deliberately does **not** consult `sources.gains.status`, which is the
> *positions* facet — reading `status !== 'read'` as unreadable would throw away the very orders the
> route went out of its way to send.

---

## 6. The total-outage 502, and its one documented exception

**The rule.** `200` with empty rows must always mean *"the venues answered, and this is what
exists"*. When **every** venue present in `sources` is `degraded`, the route answers
`502 upstream_failed` and the SPA renders its honest unavailable state instead of an empty table.

Two precise edges:

- The check only fires when `sources` is **non-empty**. A deployment where no configured venue
  serves the route (`/positions` with only GMX enabled, say) answers `200` with empty arrays and
  `sources: {}` — nothing failed, nothing was asked.
- A venue absent from `sources` (unconfigured, or GMX on `/positions`) is not counted either way.

**The exception — `/v1/perps/positions` only.**

```js
if (pendingOrders.length === 0) requireAnyRead(sources)
```

If **every position read failed but the member's pending orders WERE read**, the route answers
`200` with those orders and a `sources` map that says which reads failed — it does **not** 502.

The reason is the spec's exit rule: *exits are never gated by screening, attestation, killswitch or
feature flag* — **and an outage is not an exception to that**. A 502 here would bury a live recovery
handle behind an error screen, leaving a member with collateral locked in a stuck order and no way
to reach `cancelOrderAfterTimeout`. The honest answer is the orders plus a truthful `sources` map.

Covered by `perps.test.js` → *"serves pending orders even when the positions read is down — exits are
never gated"*: with `gainsOpenTrades` and `hyperliquid` down the response is `200`,
`positions: []`, `sources.gains: { status: 'degraded', chains: [], pendingOrderChains: [42161] }`,
and a non-empty `pendingOrders`.

The 502 is otherwise unchanged on both routes — including `/positions` when the pending-order read
also failed.

---

## 7. `GET /v1/perps/config`

Public attribution identifiers + the live Hyperliquid builder fee. **Never contains secrets.**
No parameters. Guarded (killswitch → enabled → quota) like the others.

```jsonc
{
  "attribution": {
    "gains":       { "referrer": "0x2222…2222" | null },
    "gmx":         { "refCode": "fairwins" | null },
    "hyperliquid": { "builderAddress": "0x3333…3333" | null }
  },
  "hyperliquidBuilderFee": {
    "bps": 5,                    // live FeeRouter `perps.hyperliquid.builder`, re-clamped to the cap
    "capBps": 10,                // Hyperliquid's own 10 bps perps limit
    "source": "chain" | "env-fallback"
  }
}
```

`bps` comes from the **FeeRouter on Polygon 137** (spec 060, `fees/onchain.js#getPerpsHlBuilderBps`,
30 s cache, cap re-applied at read time). `source: "env-fallback"` means the router is unset or
unreachable and `PERPS_HL_BUILDER_FEE_BPS` was used. A caller that cannot read this endpoint treats
the fee as **unconfirmed** and says so — it never substitutes a number.

**The other two rails are not served here** (`contracts/fee-rails.md`): GMX's UI fee lives in **GMX's
own DataStore** on Arbitrum and is read on chain by the admin panel — there is deliberately no
`perps.gmx.uifee` FeeRouter service, because a second config store for a rate FairWins cannot
enforce would be an admin control that silently does nothing. Gains is a venue-paid rebate and has
no member-facing rate at all.

---

## 8. `/status` contribution

`GET /status` (origin-lock exempt) carries a `perps` block — operational state only, **no member
data**:

```jsonc
"perps": {
  "enabled": true,                 // honest liveness: false under EITHER killswitch, not just config
  "venues": { "gains": [42161], "gmx": true, "hyperliquid": true },
  "attribution": { "gains": true, "gmx": true, "hyperliquid": true },  // configured booleans only
  "hlBuilderFeeBpsFallback": 5
}
```

`enabled` answers "would a request right now be served?" — a module-killed gateway reports `false`.

---

## 9. Config & boot

Env block `perps` (`src/config/index.js`). Fail-loud validation applies **only when the module is
enabled**; a disabled module never throws at boot and fails closed at the route instead.

| Env | Default | Notes |
|---|---|---|
| `PERPS_ENABLED` | `false` | anything but `true` ⇒ routes answer `503 perps_unconfigured` |
| `PERPS_GAINS_URL_ARBITRUM` | `https://backend-arbitrum.gains.trade` | an explicitly **empty** value disables that chain without disabling the venue |
| `PERPS_GAINS_URL_BASE` | `https://backend-base.gains.trade` | ” |
| `PERPS_GAINS_URL_POLYGON` | `https://backend-polygon.gains.trade` | ” |
| `PERPS_GAINS_PRICING_URL` | `https://backend-pricing.eu.gains.trade` | one global pair-price snapshot shared across chains |
| `PERPS_GMX_URL` | `https://arbitrum-api.gmxinfra.io` | |
| `PERPS_GMX_CHAIN_ID` | `42161` | the chain id stamped on GMX rows |
| `PERPS_HL_URL` | `https://api.hyperliquid.xyz` | |
| `PERPS_TIMEOUT_MS` / `PERPS_RETRIES` / `PERPS_CACHE_TTL_MS` | `8000` / `1` / `15000` | |
| `PERPS_HL_DEX_LIST_TTL_MS` | `3600000` | Hyperliquid perp-dex list cache. Global, not per-member |
| `PERPS_HL_DEX_MAX` | `24` | most dexes one read fans out to (10 existed 2026-08-12). Dexes past the cap are NAMED in `sources.hyperliquid.unreadDexes` — bounding the read never silences it |
| `PERPS_QUOTA_PER_IP` / `PERPS_QUOTA_GLOBAL` / `PERPS_QUOTA_WINDOW_MS` | `60` / `300` / `60000` | per-IP and global; **there is no per-address quota** |
| `PERPS_KILLSWITCH` | `false` | ops kill for this module alone |
| `PERPS_GAINS_REFERRER` | — | PUBLIC. Must match `ADDRESS_RE` |
| `PERPS_GMX_REF_CODE` | — | PUBLIC. 1–20 chars of `[A-Za-z0-9_]` |
| `PERPS_HL_BUILDER_ADDRESS` | — | PUBLIC. Must match `ADDRESS_RE` |
| `PERPS_HL_BUILDER_FEE_BPS` | `0` | fallback only. **Boot throws above 10 bps** — Hyperliquid's own perps cap |
| `FEE_ROUTER_ADDRESS` / `FEE_ROUTER_CHAIN_ID` / `FEE_ROUTER_CACHE_TTL_MS` | record / `137` / `30000` | the live source for `hyperliquidBuilderFee.bps` |

Boot also throws when the module is enabled and: any venue URL is not valid `https:`, **every**
venue URL is unset, or an attribution identifier is malformed.

No credentials exist anywhere in this module — all three venues serve public, unauthenticated market
data. Member addresses appear only in position queries.

---

## 10. What this API deliberately does not do

1. **No writes.** No order submission, no cancellation, no signing, no key. Position management is
   member-direct calldata built in the SPA (`contracts/venue-calldata.md`); the gateway's absence
   from the value path is the design.
2. **No GMX positions or orders.** Read client-side from GMX's Reader/EventEmitter. GMX stays
   honestly absent from `/positions` `sources` rather than being invented here.
3. **No Hyperliquid position management.** Hyperliquid is read-only this release and stays that way
   (`hyperliquid-decision.md`: on that venue the EXIT itself needs a browser-held agent key, so
   "exits first, exits never gated" cannot be honoured there). Its `venueRef` names the perp dex the
   row came from and is an **identity, not a handle** — nothing acts through it, and the SPA grows
   no control for it (no dead controls).
4. **No derived numbers.** A metric a venue did not report is `null`; a value whose scale cannot be
   applied is `null`; unrealized PnL is venue-reported or `null`, never computed here.
5. **No fee AMOUNTS on the pairs feed.** The venue's fee is published as a RATE (`venueFee`); the
   SPA turns it into money for the size it is showing. A per-pair dollar figure would be the fee for
   one size and wrong for every other one.
6. **No fee a venue does not publish.** GMX's position fee and minimums live in its DataStore, not
   in its REST API, so all three fields are `null` and the SPA shows `—` with GMX named. A rate
   taken from documentation rather than from the contract that charges it is a wrong number, and a
   wrong fee is worse than an honest dash.
