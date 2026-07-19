# Interface Contract: relay-gateway fee surfaces (spec 060)

No new writable endpoints. The gateway stays stateless; changes are read-path only.

## Changed: `GET /v1/polymarket/:chainId/fee-rate?token_id=…`

Response (extended — existing fields unchanged for compatibility):

```json
{
  "tokenId": "…",
  "feeRateBps": 0,
  "builderCode": "0x6e03…93a3",
  "builderTakerFeeBps": 40,
  "builderMakerFeeBps": 0,
  "source": "chain"
}
```

- `builderTakerFeeBps` / `builderMakerFeeBps` now come from the FeeRouter on Polygon
  (`polymarket.taker` / `polymarket.maker`), cached `FEE_ROUTER_CACHE_TTL_MS`
  (default 30 000 ms).
- `source`: `"chain"` (live on-chain read) or `"env-fallback"` (router unreachable /
  `FEE_ROUTER_ADDRESS` unset — serves the env values exactly as today).
- Chain values are clamped to the spec-057 caps (100 taker / 50 maker) before serving.

## Changed: `GET /status`

Gains a `fees` block (public, read-only telemetry — same disclosure class as existing
fields):

```json
{
  "fees": {
    "feeRouter": "0x… | null",
    "polymarket": { "takerBps": 40, "makerBps": 0, "source": "chain" },
    "opensea": { "referralConfigured": true, "beneficiary": "0x… | null" }
  }
}
```

Consumed by the AdminPanel Fees tab for the gateway-enforced rows.

## New config (env, boot-validated — unchanged philosophy)

| Var | Meaning | Default |
|---|---|---|
| `FEE_ROUTER_ADDRESS` | FeeRouter proxy on Polygon; unset ⇒ env-fallback mode. Cross-checked against `deployments/…#feeRouter` at boot (fail loud on mismatch). | unset |
| `FEE_ROUTER_CHAIN_ID` | Chain the router is read from | `137` |
| `FEE_ROUTER_CACHE_TTL_MS` | On-chain read cache TTL | `30000` |
| `POLYMARKET_BUILDER_TAKER_FEE_BPS` | **Demoted to fallback**; boot cap 100 unchanged | `50` |
| `POLYMARKET_BUILDER_MAKER_FEE_BPS` | **Demoted to fallback**; boot cap 50 unchanged | `0` |

## Order-attachment consistency

`attachBuilderCode` (used by `/fee-rate` and `builder-sign`) reads the same cached chain
value, so the bps disclosed and the bps attached to orders always come from one read
path (FR-016; no disclosure/charge divergence within a TTL window).
