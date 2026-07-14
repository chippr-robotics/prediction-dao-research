# Gateway Contract: `/v1/opensea/*` write routes (sell-side)

**Service**: `services/relay-gateway` | **Feature**: 056-collectibles-sell-side
**Extends**: the read-only routes in spec 055's `contracts/gateway-opensea-api.md`.

New routes are added to the same OpenSea router. All are **origin-locked**,
**killswitch-aware**, **fail closed** without `OPENSEA_API_KEY` (`503
collectibles_unconfigured`), and **write-quota-guarded** by a separate
`osWriteQuotas` instance keyed on the seller's account address (429
`quota_exceeded` + `Retry-After`). Writes **bypass the read cache** and **do not
retry POST on 5xx** (order publication is not idempotent). Error envelope and
chain-slug mapping (1→ethereum, 137→matic; else `404 unsupported_chain`) are
inherited. DTO fields: `../data-model.md`.

---

## 1. Get required fees for an order

```
GET /v1/opensea/:chainId/collections/:slug/required-fees
```

Returns the `FeeBreakdown` (marketplace fee + creator royalty + full fee list +
protocol/conduit addresses) the client must bake into the order's consideration
and show as net proceeds. Cached briefly (read semantics; short TTL). `404
not_found` for an unknown collection; `503 upstream_unavailable` when OpenSea is
unreachable and nothing is cached — the client then **blocks signing** (FR-009).

## 2. Publish a listing

```
POST /v1/opensea/:chainId/listings
```

Body: `{ order: SeaportOrderComponents, signature: hex, protocolAddress: address }`
(the client-built, wallet-signed order). The gateway validates shape + chain, runs
the write guard, attaches referral attribution where permitted at no user cost
(`attachReferral`, §6), and forwards to OpenSea's create-listing endpoint. Response
echoes `{ orderHash, listing }`. **Not retried on 5xx.** `400 invalid_order` on
shape/signature validation failure; `502 upstream_rejected` when OpenSea rejects the
order (e.g. fee mismatch) with the reason surfaced; `503` on killswitch/outage.

## 3. Get offer fulfillment data (accept an offer)

```
POST /v1/opensea/:chainId/offers/fulfillment
```

Body: `{ orderHash, fulfiller: address }`. The gateway re-reads the offer to
confirm it is still live (staleness input for FR-007), calls OpenSea's
offer-fulfillment endpoint, attaches referral where permitted (§6), and returns
`FulfillmentData { to, data, value, orderHash }` for the seller's wallet to submit.
`409 offer_changed` when the current best offer no longer matches `orderHash`
(client re-confirms — FR-007); `404 not_found` when the offer is gone.

## 4. Cancel a listing

```
POST /v1/opensea/:chainId/listings/cancel
```

Body: `{ orderHash, offerer: address, signature?: hex }`. Prefers OpenSea's
**off-chain cancel** (gas-free; the `signature` authorizes it) and returns
`{ cancelled: true, method: "offchain" }`. When only an on-chain cancel is
possible, returns `{ method: "onchain", ... }` so the client discloses gas and
submits the Seaport cancel itself (FR-008).

## 5. (read, from 055) Best offer + listing state

Reused: the 055 item-detail composition already returns `bestOffer`; extended to
include the item's current `listing` state (`active`/none) so the detail sheet
shows "Listed"/"Not listed" truthfully.

---

## 6. `attachReferral` seam (server-side)

A single internal function applied to publish (§2) and fulfillment (§3):

- Reads `config.opensea.referralAddress` (global) or `referralAddressByChain[chainId]`.
- When set **and** the marketplace program accepts attribution **at no cost to the
  user**, attaches FairWins as the referral/affiliate beneficiary (mechanism per
  OpenSea's current API/affiliate terms — confirmed in implementation, research D6).
- Otherwise it is a **no-op** (`source: none`). It MUST NOT modify the order's
  consideration in a way that changes the buyer's cost or the seller's net
  (FR-013/FR-015). Never adds a FairWins fee item.

---

## Error codes (write-route summary)

| HTTP | `error.code` | Meaning |
|---|---|---|
| 400 | `invalid_order` / `invalid_address` / `invalid_identifier` | body/param validation |
| 403 | `origin_denied` | missing/wrong `X-Origin-Auth` |
| 404 | `unsupported_chain` / `not_found` | chain not 1/137; unknown collection/offer |
| 409 | `offer_changed` | best offer changed since displayed (FR-007) |
| 429 | `quota_exceeded` | write quota (per-address or global) + `Retry-After` |
| 502 | `upstream_rejected` | OpenSea refused the order (reason surfaced) |
| 503 | `collectibles_unconfigured` / `killswitch_active` / `upstream_unavailable` | fail-closed / paused / outage |

## Config additions (`config.opensea`)

| Env | Default | Notes |
|---|---|---|
| `OPENSEA_REFERRAL_ADDRESS` | null | public FairWins beneficiary; `ADDRESS_RE`-validated at boot; null = attribution off |
| `OPENSEA_REFERRAL_ADDRESS_<chainId>` | (falls back to global) | per-network override |
| `OPENSEA_WRITE_QUOTA_PER_ADDRESS` | 20 | writes/min per seller address |
| `OPENSEA_WRITE_QUOTA_GLOBAL` | 100 | global write backstop |

## Frontend client contract

`frontend/src/lib/collectibles/sellClient.js` (extends the 055 `gatewayClient`):
`fetchRequiredFees`, `publishListing`, `cancelListing`, `fetchOfferFulfillment` —
all through `VITE_RELAYER_URL`, bounded fetch, mapping outages to the degraded
state; never sends any credential beyond the edge `X-Origin-Auth`.
