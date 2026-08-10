# Contract: Bitcoin Gateway API (spec 061)

Normative REST contract for `services/relay-gateway/src/bitcoin/` mounted at
`/v1/bitcoin/*`. Follows the platform proxy-module governance (killswitch →
validation → quotas → TTL cache → normalized DTOs; module disabled ⇒ 503 with
`{ error: 'bitcoin_disabled' }` and the frontend soft-fails the capability).

`:network` path param ∈ `{ mainnet, testnet }` → upstream base URL from config
(`BTC_ESPLORA_URL`, `BTC_ESPLORA_TESTNET_URL`; defaults `https://mempool.space/api`,
`https://mempool.space/testnet4/api`). Stamps indexer: `BTC_STAMPS_URL`
(stampchain.io-compatible), optional — unset ⇒ stamps endpoint returns
`degraded: true` (client fail-safe applies). All responses
`application/json`. Errors: `{ error: <slug>, message }` with 4xx/5xx; quota
breach 429; upstream failure 502 `{ error: 'upstream_unavailable' }` (client
must render stale/degraded, never zero).

## POST /v1/bitcoin/:network/addresses

Batch balance + UTXO lookup. Request: `{ "addresses": [string, ≤50] }`
(validated: syntactically valid for `:network`, else 400 `invalid_address`).

Response 200:

```json
{
  "tipHeight": 903211,
  "results": [{
    "address": "bc1q…",
    "confirmedSats": 125000,
    "pendingSats": -4200,
    "utxos": [{
      "txid": "…", "vout": 0, "valueSats": 125000,
      "confirmations": 3, "blockHeight": 903208
    }]
  }]
}
```

Cache TTL 15s keyed by (network, sorted address set hash). Quotas: per-IP and
global, config caps (mirrors polymarket quota knobs).

## GET /v1/bitcoin/:network/fees

Response 200: `{ "rates": { "fast": 12, "normal": 6, "slow": 2 }, "tipHeight": 903211 }`
— integer sat/vB, from the upstream recommended-fees endpoint, clamped to
`[1, BTC_MAX_FEE_RATE (config, default 500)]`. Cache TTL 30s. Boot fails
loudly if config clamps are malformed (min ≥ 1, max ≥ min).

## POST /v1/bitcoin/:network/tx

Broadcast. Request: `{ "rawTx": "<hex>" }` (validated hex, ≤ 100 kB). Proxies
upstream broadcast; success 200 `{ "txid": "…" }`; upstream rejection 400
`{ error: "broadcast_rejected", message: <upstream reason> }` (surfaced to the
member verbatim-safe). Never cached. Rate-limited per-IP (stricter than reads).

## GET /v1/bitcoin/:network/tx/:txid

Response 200: `{ "txid": "…", "confirmed": true, "blockHeight": 903210, "confirmations": 2 }`
(`confirmations` derived from tip). 404 `{ error: "tx_not_found" }` while
unknown to upstream (client keeps it pending with retry/backoff). TTL 15s.

## GET /v1/bitcoin/:network/stamps?addresses=a,b,c

Stamps holdings for ≤50 addresses. Response 200:

```json
{
  "degraded": false,
  "stamps": [{
    "stampId": "A1234…",
    "address": "bc1q…",
    "outpoint": { "txid": "…", "vout": 1 },
    "imageUrl": "https://…", "mimeType": "image/png"
  }]
}
```

`degraded: true` (with `stamps: []` or partial) whenever the indexer call
fails, times out, or is unconfigured — the client MUST then treat unverified
coins as protected (fail-safe, FR-019). Cache TTL 300s; a degraded result is
cached ≤30s so recovery is fast (an unconfigured indexer is a static config
condition and is not cached at all).

## Conventions (normative clarifications)

- **Confirmations** = `tip − blockHeight + 1` (the tip block itself is one
  confirmation) — used consistently by both the addresses and tx-status
  endpoints.
- **Additional error slugs** beyond the per-endpoint ones above:
  `invalid_rawtx` (malformed broadcast hex), `invalid_txid`,
  `unknown_network` (404 on a bad `:network`), `quota_exceeded` (429, with
  `Retry-After`). All errors use the flat `{ error, message }` shape.
- `BTC_TIMEOUT_MS` (default 5000) and `BTC_RETRIES` (default 1) tune upstream
  fetches, at parity with the other proxy modules; broadcast POSTs are never
  retried (a timed-out broadcast may still have propagated).

## Config (env, documented in `.env.example`)

| Var | Default | Meaning |
|---|---|---|
| `BTC_ENABLED` | `false` | master switch; false ⇒ routes 503 |
| `BTC_ESPLORA_URL` / `BTC_ESPLORA_TESTNET_URL` | mempool.space URLs | Esplora-compatible upstreams |
| `BTC_STAMPS_URL` | unset | Stamps indexer base; unset ⇒ degraded |
| `BTC_MAX_FEE_RATE` | `500` | sat/vB clamp on fee responses |
| `BTC_QUOTA_PER_IP` / `BTC_QUOTA_GLOBAL` | polymarket-parity defaults | request quotas |
| `BTC_KILLSWITCH` | `false` | ops kill: all routes 503 `bitcoin_killed` |

## Non-goals (v1)

No xpub/descriptor endpoints (client sends bare addresses only), no websocket
push, no fee-bump/CPFP helpers, no server-side wallet state of any kind.
