# OpenZeppelin Relayer — FairWins submission engine configuration (spec 036)

This directory holds **configuration only** — the engine is the open-source
[OpenZeppelin Relayer](https://github.com/OpenZeppelin/openzeppelin-relayer) (Rust, AGPL-3.0,
**pin a 1.x release**), run as a container. It is *not* our code and must never be forked into
this repo (AGPL containment: FairWins logic lives in the separately-licensed
`services/relay-gateway/`, which talks to this engine only over its REST API — see plan.md,
"AGPL-3.0 note").

## The gateway / engine split

| Concern | Owner |
|---|---|
| Recover + screen the **signer**, intent binding, dedup, quotas, spend caps, fee-netting, kill switch, origin-lock, audit | `services/relay-gateway/` (FairWins) |
| Nonce lanes per `(chain, gas wallet)`, gas estimation + stuck-tx bumping, inclusion tracking, RPC failover, hot-key custody | **this engine** (configured here) |

The engine only ever sees a built transaction `{to, value: "0", data, speed}` on
`POST /api/v1/relayers/{relayerId}/transactions` — never a FairWins intent, never the signer.
It can censor, it cannot steal (spec 036 FR-003).

## Relayers (one per chain — `<name>-<chainId>`, matching the gateway's defaults)

| id | chain | gas | notes |
|---|---|---|---|
| `polygon-137` | Polygon mainnet | EIP-1559 | `whitelist_receivers` pinned to the deployed WagerRegistry + MembershipManager proxies (defense-in-depth for FR-025) |
| `amoy-80002` | Polygon Amoy | EIP-1559 | testnet |
| `etc-61` | Ethereum Classic | **legacy type-0** | **`paused: true`** — no `deployments/*-chain61-v2.json` record exists yet, so there is no pinned target set; un-pause only after the ETC deployment lands |
| `mordor-63` | Mordor | **legacy type-0** | testnet; ETC-family chains never adopted EIP-1559 |

ETC-family specifics (research.md §2):

- `eip1559_pricing: false` + no `eip1559` feature on the network entry → all pricing and
  stuck-tx replacement use a single `gasPrice`, never `maxFeePerGas`.
- **`batchMaxCount: 1` equivalent**: the public 61/63 endpoints (Caddy-fronted core-geth/besu)
  mishandle batched JSON-RPC. The Rust engine issues sequential requests by default, but if a
  batch option is ever enabled, keep it at 1 for these chains (tagged `no-batch` in
  `config.json` as an operator reminder).
- `gas_price_cap` is set high (2000 gwei) because the ETC legacy oracle suggests ~300 gwei
  baseline; the cap bounds bump/replace escalation (FR-006).

## Key provisioning (FR-017 / FR-019a)

Signers reference **Google Cloud KMS** keys (`google_cloud_kms` signer type) — the hot gas key
material never exists in env vars, config files, logs, or this repo. Provisioning:

1. Create one secp256k1 signing key per chain in the `fairwins-relayer` key ring
   (`gcloud kms keys create gas-key-polygon --keyring fairwins-relayer --purpose asym-signing ...`).
2. Grant the engine's service account `cloudkms.signerVerifier` on those keys only
   (least privilege).
3. Fund each derived address with a **low-value, capped** gas balance (never from, or to, the
   floppy-keystore admin keys). Rotation = create new key version, drain in-flight, re-point
   `key_version`, defund the old address.

For local dev only, swap a signer entry for the engine's `local` keystore type with a
throwaway key — never a production key, never committed.

## Webhook → gateway

The `relay-gateway-webhook` notification posts transaction lifecycle updates
(`pending|mined|confirmed|failed|...`) to the gateway's `POST /v1/engine/webhook`, which maps
them onto intent statuses (never `confirmed` before mined — FR-006). `WEBHOOK_SIGNING_KEY` is
the shared secret; the gateway checks it timing-safe (`WEBHOOK_SHARED_SECRET` on its side).

## Running

```bash
docker run --rm -p 8080:8080 \
  -v "$PWD/services/oz-relayer/config:/app/config:ro" \
  -e GCP_PROJECT_ID=... \
  -e GOOGLE_APPLICATION_CREDENTIALS_JSON=... \
  -e WEBHOOK_SIGNING_KEY=... \
  -e API_KEY=... \
  -e REDIS_URL=redis://redis:6379 \
  ghcr.io/openzeppelin/openzeppelin-relayer:v1.4.0   # PIN an exact 1.x tag
```

Or use `services/relay-gateway/docker-compose.yml`, which wires gateway + engine + Redis for
local dev.

## Assumptions made in `config.json` (verify against the pinned 1.x release at integration)

1. **Schema**: `relayers[] / networks[] / signers[] / notifications[]` in one `config.json`,
   with `policies.{eip1559_pricing, gas_price_cap, min_balance, whitelist_receivers}` — this
   follows OpenZeppelin Relayer 1.x conventions as documented; exact field names can drift
   between minor versions, so validate with the engine's config check on the pinned tag.
2. **`${VAR:-default}` substitution** in `rpc_urls`/`url` values: if the pinned release does not
   expand env placeholders in non-secret fields, replace them with literals at deploy time
   (the defaults shown are the intended public-endpoint fallbacks).
3. **Webhook auth**: the engine signs webhook payloads with `signing_key`. The gateway v1
   authenticates a shared-secret header (`X-Webhook-Secret`/`Authorization: Bearer`); if the
   pinned release only emits an HMAC signature header, add the small HMAC verifier in
   `relay-gateway/src/engine/webhook.js` during integration (tracked as a Phase-1 integration
   task — do not disable webhook auth).
4. **Weighted RPC failover**: plain ordered `rpc_urls` arrays are used; if the pinned release
   supports `{url, weight}` objects, weights may be added without other changes.
5. `min_balance` doubles as the low-balance alert line (FR-018); `openzeppelin-monitor` is the
   intended alerting add-on (plan.md) and is not configured here.

## Fallback engine

If AGPL-3.0 ever becomes a blocker, **rrelayer (MIT)** is the pre-vetted drop-in: it exposes an
equivalent submit + webhook surface, and the gateway's engine client
(`relay-gateway/src/engine/client.js`) is a thin adapter so the swap does not touch policy code.
