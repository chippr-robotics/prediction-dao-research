# Quickstart & Validation: Intent Relayer Infrastructure (Spec 036)

A runnable guide to bring up the relayer locally and prove the feature's guarantees end-to-end. Implementation details live in `tasks.md` (Phase 2) and the code; this file is the validation/run guide. Contracts and entities are referenced, not duplicated — see `contracts/` and `data-model.md`.

## Prerequisites

- Node.js 20 LTS, Docker (for the OpenZeppelin Relayer engine container + Redis if testing Phase 2).
- A local/staging EVM chain (Hardhat node for 1337, or Amoy 80002 with test funds) with spec 035's signer-attributed entrypoints and an EIP-3009 test token deployed (for the `payment` class). Use `contracts/mocks/MockUSDCPermit.sol` as the EIP-3009 test token.
- A **dedicated low-value hot key** funded with native gas on the target chain (never the floppy admin key).
- Secrets available locally as env: `RELAYER_GAS_KEY` (hot key), `ORIGIN_LOCK_SECRET`, engine `WEBHOOK_SECRET`. In production these come from Secret Manager.

## Bring-up

```bash
# 1. Submission engine (OpenZeppelin Relayer) — configured, not built
docker run --rm -p 8080:8080 \
  -v "$PWD/services/oz-relayer/config:/config" \
  ghcr.io/openzeppelin/openzeppelin-relayer:<pinned>   # networks incl. ETC legacy-gas; signer=RELAYER_GAS_KEY

# 2. Relay gateway (FairWins policy)
cd services/relay-gateway && npm ci
ENGINE_URL=http://localhost:8080 ORIGIN_LOCK_SECRET=$ORIGIN_LOCK_SECRET \
  npm run dev            # serves POST /v1/intents, GET /v1/intents/:id, GET /healthz
```

## Validation scenarios (map to Success Criteria)

Each scenario is scripted under `services/relay-gateway/test/` (integration) or `services/relay-gateway/load/` (k6). Run against the staging chain.

| # | Scenario | How to run | Expected (SC) |
|---|----------|-----------|----------------|
| 1 | **Zero-native gasless action** | Sign a `signer-attributed` claim from a wallet with **0 native balance**; `POST /v1/intents`. | On-chain effect attributed to the **signer**; user paid no gas (SC-003). |
| 2 | **Load: sustained + burst, no nonce collisions** | `k6 run load/burst.js` (≥3/s/chain sustained, burst 20/s×30s). | 0 nonce collisions; p95 accept→broadcast < 2s (SC-001, SC-002). |
| 3 | **Stuck-tx recovery** | Inject an artificial fee spike mid-run. | Stuck tx re-priced/replaced + included; later nonces not stalled (SC-013). |
| 4 | **RPC failover** | Kill the primary RPC for a chain. | Error rate < 1%, back to baseline < 30s (SC-003). |
| 5 | **Sanctions fail-closed** | (a) Submit for a sanctioned signer; (b) point the guard at a dead RPC. | (a) `403 sanctioned_signer`; (b) `503 screening_unavailable` — never submitted (SC-005). |
| 6 | **Dedup / no double-spend** | `POST` the same intent twice concurrently + after completion. | One on-chain submission; second returns original `txHash`; no gas wasted (SC-006). |
| 7 | **Abuse cap** | Flood from one signer past quota / window spend cap. | `429` + `Retry-After`; gas-wallet spend stays within cap (SC-006, SC-012). |
| 8 | **Never stranded (kill switch / down)** | Stop the engine (or activate kill switch); retry each covered flow. | Client self-submits; identical on-chain result; no funds lost (SC-004). |
| 9 | **Multi-instance correctness** | Run 2 gateway+engine instances (shared Redis) under scenario 2. | 0 cross-instance nonce collisions; limits not multiplied (SC-012). |
| 10 | **Network isolation** | Submit an intent signed for chain A against chain B config. | `400 chain_mismatch`; nothing submitted (SC-014). |
| 11 | **Origin-lock / geo perimeter** | Direct `*.run.app` hit w/o `X-Origin-Auth`; restricted-region request via the zone. | `403` direct; `451` restricted region — no bypass (SC-016). |
| 12 | **ETC/Mordor legacy gas + USC gate** | Configure chain 63; submit a no-stake intent (legacy gas) and a `payment` intent. | No-stake relays with type-0 gas; `payment` returns `503 payment_unsupported_on_chain` → self-submit (research §2). |
| 13 | **Audit trail** | Inspect Cloud Logging after a run. | Each intent → `signer` → `txHash` record; retained ≥5yr (SC-017); no secrets present (SC-009). |
| 14 | **Hot-key rotation + graceful deploy** | Rotate the key / rolling-deploy under load. | 0 lost or double-submitted intents; drain verified (SC-008). |

## CI gate

The k6 load test (scenario 2) runs as a **gating** CI step; a latency/throughput regression past the configured thresholds fails the pipeline (FR-011/FR-026). Lint/test/security scans are gating with no `continue-on-error`.

## Definition of done (validation)

All 14 scenarios pass on the primary chains; scenario 12 documents the ETC/Mordor payment gate honestly; the self-submit fallback (scenario 8) passes for **every** covered flow.
