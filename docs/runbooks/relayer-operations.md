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
