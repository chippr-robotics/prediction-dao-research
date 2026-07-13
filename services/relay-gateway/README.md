# FairWins Relay Gateway (spec 036 — Intent Relayer Infrastructure)

The policy front-end for gasless intent submission. Users sign spec-035 intents off-chain; this
gateway recovers the **signer** from the signature, validates that the intent binds exactly what
was signed, screens the signer against the on-chain sanctions guard (**fail-closed**), dedups,
rate-limits and fee-gates — then hands a built call to the OSS submission engine
([OpenZeppelin Relayer](../oz-relayer/), which owns nonces, gas bumping, inclusion tracking, RPC
failover, and the hot key).

This service is a **deliberate, documented, scoped exception** to the platform's no-backend
directive (spec 036 FR-001/FR-004). It is optional and additive: with it stopped, killed, or
censoring, every covered action still completes via self-submit with an identical on-chain
result (FR-002 / SC-004).

## Security posture

- **Censor, not steal (untrusted-by-design).** The gateway holds no user funds, no contract
  authority, and no client-asserted identity: the signer is *recovered* from the EIP-712 /
  EIP-3009 signature, and the on-chain entrypoints re-verify everything. The worst this service
  (or its operator) can do is refuse to pay gas.
- **Fail-closed screening (FR-013).** Every intent's recovered signer is re-screened against the
  on-chain `ISanctionsGuard.isAllowed` before any gas is spent. Sanctioned signer →
  `403 sanctioned_signer`. Screening unavailable (RPC down, decode error) →
  `503 screening_unavailable` — never "assume fine and submit". On-chain screening remains
  authoritative; this is defense-in-depth so the relayer never pays gas for a wallet the guard
  would reject.
- **Hot-key containment (FR-017/FR-019a).** The gateway never touches the gas key — it lives in
  the engine, KMS-held, low-value, spend-capped, segregated from the air-gapped floppy admin
  keys. The gateway's own secrets are two shared-secret headers (origin lock + webhook), both
  compared timing-safe over SHA-256 digests.
- **Version-pinned targets (FR-025).** The per-chain target contracts are read from
  `deployments/*-chain<ID>-v2.json` at startup, with a consistency check that exits non-zero on
  any mismatch. Only allow-listed `(targetContract, action)` pairs are ever encoded.
- **Honest status (FR-006).** `confirmed` is only ever reported after the engine's webhook says
  mined/confirmed. Every terminal outcome emits an append-only audit event (JSON on stdout →
  Cloud Logging → WORM sink, ≥5yr) linking intent → signer → txHash — never signatures or keys.
- **Perimeter (FR-029).** Behind the same Cloudflare 451 geo-gate + origin-lock as the SPA; all
  client routes require `X-Origin-Auth` (`/healthz` exempt for probes; `/v1/engine/webhook`
  exempt because the engine calls in-network with its own shared secret).

## API (contracts/relay-gateway-api.md)

| Route | Purpose |
|---|---|
| `POST /v1/intents` | Submit a signed intent. `202 {intentId, status, txHash?}` on accept; `200` idempotent replay of a completed intent; errors always `{error:{code, reason}}` with the contract's exact codes (`invalid_signature`, `chain_mismatch`, `target_not_allowlisted`, `param_binding_mismatch`, `expired`, `not_yet_valid`, `fee_exceeds_cap`, `origin_denied`, `sanctioned_signer`, `duplicate_in_flight`, `quota_exceeded`, `backpressure`, `screening_unavailable`, `killswitch_active`, `chain_unavailable`, `payment_unsupported_on_chain`). |
| `GET /v1/intents/:id` | Honest status: `queued \| submitted \| confirmed \| failed` (+`txHash`, `reason`). |
| `POST /v1/engine/webhook` | Engine status callback (shared-secret; maps engine → intent status). |
| `GET /healthz` | `{status, chains:{<id>:{rpc, gasWalletRunwayHrs}}, killSwitch}` — drives the client's self-submit fallback probe. |
| `GET /v1/opensea/…` | Read-only collectibles proxy (spec 055; `specs/055-collectibles-portfolio/contracts/gateway-opensea-api.md`): account NFTs, composed item detail, collection floor stats. Origin-locked, killswitch-aware, per-key + global quotas, TTL/single-flight cache with serve-stale (`fetchedAt`/`stale` on every 200). Fails closed (`503 collectibles_unconfigured`) without `OPENSEA_API_KEY`. |

Validation pipeline (data-model.md): kill switch → parse → chain active → payment-class support
→ target/action allow-list → signer recovery (EIP-712 for `signer-attributed`, EIP-3009
authorization for `payment`) → param/window binding → dedup on `uniquenessMarker` → sanctions
re-screen → per-signer/global quotas → bounded-queue back-pressure → per-chain gas spend cap →
fee-netted `maxFee` check → encode `…WithSig`/`…WithAuthorization` calldata → engine submit.

## Running

```bash
npm ci
cp .env.example .env         # fill in secrets; never commit .env
npm run dev                  # or: npm start
npm test                     # vitest + supertest (all chain/engine access mocked via DI)
```

Full local stack (gateway + engine + redis): `docker compose up --build` (see
`docker-compose.yml`; the image must be built from the **repo root** context so the
`deployments/` records are baked in). Validation scenarios: `specs/036-relayer-infrastructure/quickstart.md`.

Load test (CI-gating, FR-011): `k6 run load/k6-intents.js -e GATEWAY_URL=... -e INTENTS_FILE=...`
— thresholds (p95 accept latency < 2s, hard-error rate < 1%) fail the run, and therefore CI.
The intents file is a JSON array of pre-signed bodies (k6 cannot sign; generate a pool with
`test/helpers.js#signedIntent` against a staging chain).

## Environment variables

| Var | Default | Purpose |
|---|---|---|
| `ENABLED_CHAIN_IDS` | `137,80002,63` | Chains served. `61` fails the startup check until an ETC deployment record exists (by design). |
| `RPC_URLS_<id>` | public pair per chain | ≥2 read endpoints, comma-separated, failover order (FR-007). 61/63 automatically use `batchMaxCount: 1`. |
| `ORIGIN_AUTH_SECRET` | *(unset = lock disabled, dev only)* | Origin-lock shared secret (`X-Origin-Auth`), same value the Cloudflare Transform Rule injects. |
| `WEBHOOK_SHARED_SECRET` | *(unset = webhooks rejected)* | Engine webhook shared secret (fail closed). |
| `ENGINE_URL` / `ENGINE_API_KEY` | `http://localhost:8080` / — | OpenZeppelin Relayer REST endpoint. |
| `ENGINE_RELAYER_ID_<id>` | `<name>-<chainId>` | Engine relayer id per chain (`polygon-137`, `amoy-80002`, `etc-61`, `mordor-63`). |
| `KILL_SWITCH` | `false` | Boot value; toggle at runtime with `kill -USR2 <pid>` (FR-015). |
| `SIGNER_QUOTA_PER_MIN` / `GLOBAL_QUOTA_PER_MIN` | `12` / `120` | Per-signer / global quotas (FR-014). |
| `MAX_QUEUE_DEPTH` | `100` | Bounded in-flight queue; past it → `429 backpressure` (FR-009). |
| `GAS_SPEND_CAP_WEI_<id>` / `SPEND_WINDOW_MS` | `0.5e18` / `3600000` | Per-chain per-window estimated-gas spend cap (FR-014/FR-018). |
| `FUNDING_MODE_<id>` | `sponsored` | Default funding mode per chain (`sponsored` \| `fee-netted`). |
| `GAS_WALLET_<id>` / `PEAK_BURN_WEI_PER_HR_<id>` | — / `0.05e18` | Healthz runway reporting only — the key itself never lives here. |
| `DEPLOYMENTS_DIR` | `../../deployments` (repo) / `/app/deployments` (image) | Version-pinned target records (FR-025). |
| `PORT` | `8788` | HTTP port. |
| `OPENSEA_API_KEY` | *(unset = `/v1/opensea/*` fails closed)* | OpenSea API v2 key for the read-only collectibles proxy (spec 055). Secret Manager in prod; the SPA never sees it. |
| `OPENSEA_BASE_URL` / `OPENSEA_TIMEOUT_MS` / `OPENSEA_RETRIES` | `https://api.opensea.io` / `5000` / `1` | Upstream endpoint + per-request bounds. |
| `OPENSEA_CACHE_TTL_MS` / `OPENSEA_STATS_CACHE_TTL_MS` | `60000` / `300000` | List/detail vs collection-floor cache TTLs (serve-stale on upstream failure). |
| `OPENSEA_QUOTA_PER_ADDRESS` / `OPENSEA_QUOTA_GLOBAL` | `60` / `300` | Reads/min per requested address\|contract\|slug, and the global backstop for the shared key. |

## Phase 1 vs Phase 2 (research.md §3)

- **Phase 1 (this code, v1):** single instance (`--max-instances=1` on Cloud Run). Dedup,
  quotas, spend counters, and the intent store are **in-process** — restart loss is benign
  because the on-chain `uniquenessMarker` is single-use (a replay can never double-spend) and a
  rate-limit reset is a momentary loosening.
- **Phase 2 (horizontal scale):** move dedup/quota/spend to shared Redis (Memorystore Basic,
  atomic `INCR`+TTL / `SET NX`) so limits are not multiplied by instance count and dedup holds
  across instances (FR-012 / SC-012). The policy modules (`src/policy/*.js`) are factories with
  narrow interfaces precisely so the Redis swap does not touch the pipeline.

## v1 scope notes (honest limitations)

- `payment` class is blocked on 61/63 (`503 payment_unsupported_on_chain`): live USC is
  permit-only, no EIP-3009 (research.md §2). No-stake signer-attributed intents still relay there.
- `createWager` and `declareWinner` are **not** allow-listed yet: spec 035 leaves the
  `CreateArgs` struct open and defines no `DeclareWinnerIntent` typed struct. They stay on
  self-submit until spec 035 pins them; adding one later is a single entry in
  `src/intent/intentTypes.js`.
- ETC mainnet (61) is configured but cannot be enabled until a `deployments/*-chain61-v2.json`
  record exists — the startup consistency check refuses to serve an unpinned chain.
