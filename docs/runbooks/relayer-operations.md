# Runbook: Intent Relayer Operations (Spec 036)

The relayer is **optional gas infrastructure** — it can censor, never steal. Every flow keeps a
self-submit fallback, so the worst failure mode of everything below is "users pay their own gas".

## Components

| Component | Where | Owns |
|-----------|-------|------|
| `relay-gateway` | Cloud Run (`services/relay-gateway`) | Policy: signer recovery, intent binding, fail-closed sanctions re-screen, dedup, quotas/spend caps, back-pressure, kill switch, audit log |
| `oz-relayer` | Container next to the gateway (`services/oz-relayer`) | Mechanics: per-chain nonce lanes, gas pricing/bumping (legacy type-0 on 61/63), inclusion tracking, RPC failover, the KMS-held gas key |
| Frontend probe | `frontend/src/lib/relay` | `VITE_RELAYER_URL` + health probe → self-submit routing |

## Local bring-up (validation)

```bash
cd services/relay-gateway
cp .env.example .env        # set ORIGIN_AUTH_SECRET + WEBHOOK secrets; never commit .env
docker compose up --build   # gateway :8788, engine :8080, redis :6379
curl -s localhost:8788/healthz | jq
```

## Key management (hot gas key)

- One dedicated, low-value key per chain, held in **GCP KMS / Secret Manager** (see
  `services/oz-relayer/config/config.json` signer refs). NEVER the floppy admin key; never in env
  files, logs, or the audit stream.
- Funding: keep balance ≥ 12h of peak burn (healthz `gasWalletRunwayHrs` alerts via
  `GAS_WALLET_<id>` + `PEAK_BURN_WEI_PER_HR_<id>`).
- Rotation: create the new KMS key version → update `key_version` in the engine config → restart
  engine → fund new address → drain old. The gateway needs no change (it never signs).
- Compromise bound: gas balance + censorship. The key holds no user funds and no contract
  authority; `whitelist_receivers` pins it to the FairWins proxies.

## Kill switch

- Activate: set `KILL_SWITCH=true` on the gateway (redeploy/restart) — `POST /v1/intents` returns
  `503 killswitch_active`; clients fall back to self-submit automatically. In-flight engine
  transactions still track to inclusion (no accepted intent is dropped).
- Per-chain stop: pause the chain's relayer in the engine config (`"paused": true`).
- Full contract stop remains `pause()` on the registry (GUARDIAN_ROLE) — independent of the relayer.

## Collectibles read proxy (spec 055, `/v1/opensea/*`)

- **Key provisioning**: `OPENSEA_API_KEY` lives in **Secret Manager** and is injected as a Cloud Run
  env var (`--update-secrets`), same pattern as `ORIGIN_AUTH_SECRET`. Never in env files, the repo,
  or the SPA bundle — the gateway is the only holder (spec 055 FR-009). Production keys come from
  `opensea.io/settings/developer`; the instant free-tier key expires after 30 days and is for dev only.
- **Rotation**: add the new Secret Manager version → redeploy the gateway → verify with an
  origin-authed `GET /v1/opensea/137/account/<addr>/nfts` → disable the old key in the OpenSea portal.
  Unset/invalid key ⇒ routes return `503 collectibles_unconfigured` and the SPA hides the
  Collectibles tab (soft-fail; wagers/pools/payments unaffected — FR-011).
- **Quotas**: `OPENSEA_QUOTA_PER_ADDRESS` (60/min per requested address) + `OPENSEA_QUOTA_GLOBAL`
  (300/min backstop for the shared key). Persistent upstream 429s from OpenSea ⇒ lower the global
  cap or raise the cache TTLs (`OPENSEA_CACHE_TTL_MS`, `OPENSEA_STATS_CACHE_TTL_MS`) before asking
  OpenSea for more throughput.
- **Kill switch**: the gateway-wide `KILL_SWITCH` / `SIGUSR2` toggle also stops these routes
  (`503 killswitch_active`); to stop ONLY collectibles, remove the `OPENSEA_API_KEY` secret binding
  and redeploy (fail-closed by config).
- **Outage behavior**: cached responses are served with `stale: true` (the SPA labels them);
  with no cache the routes return `503 upstream_unavailable` and the SPA shows its degraded state.
  No action needed beyond watching OpenSea status — nothing on the value path depends on this group.

### Sell-side write routes (spec 056)

The same `/v1/opensea/*` group gained write routes so members can list, accept offers, and cancel
through OpenSea's orderbook. The gateway forwards a **client-signed** Seaport order — it holds **no
signing key** on this path; the wallet is the only signer, and OpenSea's shared protocol settles.

- **Write quotas**: `OPENSEA_WRITE_QUOTA_PER_ADDRESS` (20/min per seller) + `OPENSEA_WRITE_QUOTA_GLOBAL`
  (100/min) — a **separate** quota instance from reads, so publishing can't drain the read budget.
  Persistent write 429s ⇒ raise deliberately or leave it; sellers can always act on OpenSea directly.
- **Not retried**: order-publish POSTs are never retried on 5xx (publishing is not idempotent), so a
  transient upstream 5xx surfaces as `503` — the seller retries, no duplicate listing.
- **Referral beneficiary**: `OPENSEA_REFERRAL_ADDRESS` (+ optional `OPENSEA_REFERRAL_ADDRESS_<chainId>`)
  is a **public** address (inline `value:` in the manifest, not a secret) that records FairWins as the
  beneficiary of OpenSea's own referral/affiliate reward. **Empty ⇒ attribution off** (safe default).
  It is **never a surcharge** — it does not change what the buyer pays or the seller nets. To turn it
  on: set the address in `services/oz-relayer/deploy/production/service.yaml` and redeploy; to rotate,
  change the value and redeploy (no key rotation — it's not a secret).
- **Killswitch** also stops the write routes (`503 killswitch_active`), same as reads.

## Predict / Polymarket proxy (spec 057, `/v1/polymarket/*`)

Browse Polymarket markets and buy/sell outcome shares, routed through FairWins' **builder code** so
attributed volume earns a builder fee plus Polymarket's weekly USDC rewards. **Polygon-only** — any
other `:chainId` returns `404 unsupported_chain` and the SPA hides the Predict tab. The gateway
forwards a **client-signed** CLOB order — it holds **no order-signing key**; the wallet is the only
signer and Polymarket's protocol settles. A total outage never touches any value path.

- **Credentials (secrets)**: `POLYMARKET_API_KEY` + `POLYMARKET_API_SECRET` + `POLYMARKET_API_PASSPHRASE`
  are the L2 HMAC creds, **derived once offline via L1** (`POST /auth/api-key` signed by the operator
  wallet) and stored in Secret Manager — so no signing key lives in the gateway. `POLYMARKET_API_ADDRESS`
  is the operator wallet (public, wired from a same-named secret for consistency). Any missing secret ⇒
  routes fail closed (`503 predict_unconfigured`) and the tab hides. To rotate: re-derive the L2 creds
  offline, update the secrets, redeploy.
  - **One-time IAM prerequisite:** the gateway runtime SA
    (`fairwins-relay-engine@chippr-bots-site-wp.iam.gserviceaccount.com`) needs
    `roles/secretmanager.secretAccessor` on all four `POLYMARKET_*` secrets, or the new revision
    boot-fails to mount them. Grant once per secret with
    `gcloud secrets add-iam-policy-binding <SECRET> --member="serviceAccount:<SA>" --role=roles/secretmanager.secretAccessor`.
- **Builder code + fee** (public config, inline `value:` in the manifest — not secrets):
  `POLYMARKET_BUILDER_CODE` (bytes32), `POLYMARKET_BUILDER_TAKER_FEE_BPS` (default `50`),
  `POLYMARKET_BUILDER_MAKER_FEE_BPS` (default `0`). The builder fee is **additive** on Polymarket's
  platform fee (a real user cost) and is **disclosed honestly** in the confirm UI — unlike the OpenSea
  referral. Empty builder code ⇒ orders post **unattributed** (never stranded), no fee.
- **Fee-change policy**: Polymarket rate-limits builder-fee changes to **one per 7 days with 3-day
  advance notice**. Change the rate deliberately (edit the manifest value + register the new rate at
  `polymarket.com/settings?tab=builder`), not reactively. **Boot fails loudly** if the configured rate
  exceeds the caps (100 bps taker / 50 bps maker).
- **Quotas**: reads `POLYMARKET_QUOTA_PER_ADDRESS`/`_GLOBAL` (60/300 per min); writes
  `POLYMARKET_WRITE_QUOTA_PER_ADDRESS`/`_GLOBAL` (20/100 per min) on a **separate** instance keyed by the
  trader. Order POSTs are **not retried** on 5xx (submission is not idempotent) → surface as `503`.
- **Killswitch** stops order/cancel writes (`503 killswitch_active`); members can always trade on
  Polymarket directly.
- **Pre-mainnet checklist** (see `specs/057-predict-polymarket/checklists/requirements.md`): confirm the
  V2 order typehash + exchange addresses (`clobOrder.js` constants) against the live contract, and
  Polymarket's ERC-1271 validation of passkey accounts before flipping `PASSKEY_PREDICT_ENABLED`.

## Common incidents

| Symptom | Check | Action |
|---------|-------|--------|
| 503 `screening_unavailable` spike | Sanctions RPC health (gateway logs `sanctions` errors) | Fail-closed is BY DESIGN — fix RPC (rotate `RPC_URLS_<id>`); do NOT bypass screening |
| 503 `chain_unavailable` | Both RPC endpoints down | Rotate/add endpoints (env), restart |
| Stuck transactions | Engine logs; lane nonce vs `eth_getTransactionCount(pending)` | Engine bumps to `gas_price_cap`; if capped, raise cap (config) or cancel + drain lane |
| 429 storms | Quota counters (`SIGNER_QUOTA_PER_MIN`, `GLOBAL_QUOTA_PER_MIN`, `MAX_QUEUE_DEPTH`) | Raise deliberately or let back-pressure shed to self-submit |
| Gas runway low | `/healthz` `gasWalletRunwayHrs` | Fund the chain's gas wallet |
| Webhook auth failures | `WEBHOOK_SHARED_SECRET` mismatch gateway↔engine | Re-sync the secret; webhooks are rejected (fail closed) until then |

## Fee netting (optional)

`scripts/operations/set-fee-netting.js` (floppy-signed admin). `FEE_RECIPIENT` MUST be a segregated
treasury address — **never** a relayer gas wallet (SC-015). Reconciliation: on-chain gas spent by
the gas wallets vs stablecoin received by the recipient; both are fully on-chain.

## Audit

Structured JSON events on stdout (`intent → recovered signer → outcome → txHash`) — route via
Cloud Logging Log Router to the WORM bucket (≥ 5-year retention). The audit stream contains no
secrets and no PII beyond on-chain-public addresses. On-chain remains the record of record.

## ETC / Mordor caveats

- Legacy type-0 gas only (no EIP-1559 fields); engine networks 61/63 carry no `eip1559` feature.
- Several public ETC RPCs reject batched JSON-RPC — endpoints are used with batch size 1.
- **Payment-class intents are blocked** on 61/63 (`503 payment_unsupported_on_chain`): live USC has
  no EIP-3009. No-stake intents relay normally; money-in flows self-submit.
- Chain 61 stays `paused` in the engine and unlisted in the gateway until the spec-025/027 proxies
  exist there (the gateway refuses to start for a chain without a deployments record).

## Colocated ERC-4337 bundler (spec 041 passkey accounts)

Passkey smart accounts submit UserOperations through an ordered bundler list
(`VITE_BUNDLER_URLS_<NET>`): **self-hosted [alto](https://github.com/pimlicolabs/alto)
first**, public fallbacks after. Deploy alto alongside `relay-gateway` /
`oz-relayer` — same host class, same edge perimeter and origin-lock (spec 036
FR-029), same "can censor, cannot steal" bound (a bundler carries only
user-signed UserOps; it can never alter or originate them).

- **Config**: one alto instance per chain, pointed at the chain's RPC set and
  the canonical EntryPoint v0.6 (`deployments/` key `entryPoint`); expose only
  the standard ERC-4337 RPC (`eth_sendUserOperation`,
  `eth_estimateUserOperationGas`, `eth_getUserOperationReceipt`,
  `eth_supportedEntryPoints`).
- **Funding**: alto's beneficiary/executor wallet needs native gas like the
  oz-relayer hot wallet — include it in the existing balance monitoring and
  rotation procedures (same thresholds).
- **Health**: probe `eth_supportedEntryPoints` (the frontend uses the same
  probe for its fallback matrix); degraded bundler ⇒ clients fall through to
  the configured public endpoints, so an alto outage is UX degradation, not
  fund inaccessibility (FR-013).
- **Fee-in-USDC (optional)**: `VITE_ERC20_PAYMASTER_<NET>` may point at a
  third-party ERC-20 paymaster; unset ⇒ UserOp fees fall back to the
  account's native balance (spec 041 clarification Q3). FairWins operates no
  paymaster and sponsors nothing.
