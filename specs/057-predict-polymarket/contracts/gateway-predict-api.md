# Gateway API Contract: Predict (Polymarket proxy)

Server-side proxy under `services/relay-gateway/src/polymarket/`. All routes are
chain-scoped to Polygon (`:chainId` must be `137`; anything else ⇒ `404 unsupported_chain`).
Reads are TTL-cached + single-flight; order/cancel writes bypass cache and use a separate
tighter write quota keyed by the trader's address. Credentials (API key + derived L2 HMAC
secret/passphrase) live only in the gateway (FR-016). Missing key ⇒ every route
`503 predict_unconfigured` (fail-closed, FR-017) and the SPA hides the Predict tab.

## Cross-cutting behaviour

- **Origin lock**: non-health routes require the Cloudflare `X-Origin-Auth` header ⇒ else `403`.
- **Killswitch**: engaged ⇒ writes `503` with an honest message; the member can still reach
  Polymarket directly (never stranded, FR-017).
- **Quotas**: reads keyed by address (`POLYMARKET_QUOTA_PER_ADDRESS`/`_GLOBAL`); writes on a
  separate instance (`POLYMARKET_WRITE_QUOTA_PER_ADDRESS` default 20 / `_GLOBAL` default 100).
  Exceeded ⇒ `429` with `Retry-After`.
- **No 5xx retry on POST**: order submission is not idempotent (research D7).
- **Live fees only**: the platform fee is read from Polymarket's live fee schedule per
  market; it is never hardcoded (research D3). If it can't be fetched, the write path blocks.

## Reads

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/v1/polymarket/:chainId/markets` | L2 | List/search live markets (query, category, cursor). Cached. |
| GET | `/v1/polymarket/:chainId/markets/:id` | L2 | Market detail: outcomes + token ids, prices, volume, tradable state. |
| GET | `/v1/polymarket/:chainId/fee-rate?token_id=…` | L2 | Live platform fee schedule for the token (basis for the taker fee line). |
| GET | `/v1/polymarket/:chainId/positions?address=…` | L2 | The address's outcome-token positions (size, best bid, value). |
| GET | `/v1/polymarket/:chainId/orders?address=…` | L2 | The address's open (unfilled) orders. |

## Writes

### `POST /v1/polymarket/:chainId/order`

Submit a client-signed CLOB V2 order. Body: `{ order: <signed OrderComponents>, signature }`.
The route:
1. Validates the order shape + signature hex (`normalize.js#validateOrderBody`).
2. Asserts `order.builder === attachBuilderCode({chainId, side, isMaker}).builderCode` when
   attribution is configured; when `source: 'none'` (unconfigured) the order is accepted
   **unattributed** rather than rejected (never stranded, FR-015).
3. Forwards to Polymarket CLOB `POST /order` (L2 HMAC), no 5xx retry.

Responses: `200 { orderId, status }` · `409 price_changed` (re-confirm, FR-008) ·
`502 upstream_rejected { reason }` · `503 predict_unconfigured` · `429`.

### `POST /v1/polymarket/:chainId/order/cancel`

Body: `{ orderId, signature }`. Forwards to Polymarket's cancel endpoint. `200 { cancelled }`
· `502 upstream_rejected` · `503` · `429`. Gas-free.

## `attachBuilderCode` seam (`polymarket/builderCode.js`)

```
attachBuilderCode({ chainId, side, isMaker }) →
  { builderCode: string|null, takerFeeBps: number, makerFeeBps: number, source: 'attributed'|'none' }
```

- Resolves the configured `builderCode` + fee bps for the chain.
- `isMaker` ⇒ fee bps resolve to 0 (makers pay no builder fee, research D2).
- Unconfigured ⇒ `{ builderCode: null, source: 'none', ...fees 0 }` — order still posts.
- **Distinct from Collect's `attachReferral`**: the returned fee bps are a **real user
  cost** surfaced in the confirm breakdown (FR-012), not a silent no-op. Boot validates
  `takerFeeBps ≤ 100` and `makerFeeBps ≤ 50`; out of range ⇒ throw at startup (SC-010).

## Config (`config/index.js` `polymarket` block)

`apiKey` (secret), `baseUrl`, `timeoutMs`, `retries`, read/write quotas, `builderCode`
(`bytes32`, public), `takerFeeBps` (default 50), `makerFeeBps` (default 0), operator
`signerKey` for the one-time L1 api-key derivation.
