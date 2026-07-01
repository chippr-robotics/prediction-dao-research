# Contract: Relay Gateway HTTP API

The FairWins-owned relay gateway's public interface. It sits behind the same Cloudflare geo-gate (451) + origin-lock as the SPA (FR-029); all non-health requests require a valid `X-Origin-Auth` header (verified in-process, timing-safe) or return `403`.

Base URL (subdomain topology): `https://relayer.fairwins.app` — or path topology `https://fairwins.app/relay`.

All responses are JSON. All error responses carry `{ "error": { "code": string, "reason": string } }` with a specific, user-actionable `reason` (FR-019 in spec 035). No response ever alters, or is trusted to assert, the signer — the gateway recovers it.

---

## POST /v1/intents — submit a signed intent for relaying

Request body = the **Intent** entity (see data-model.md). The gateway recovers the signer, validates, screens, dedups, checks quota/fee, then hands the built call to the engine.

**Request (example, signer-attributed class):**
```json
{
  "intentClass": "signer-attributed",
  "chainId": 137,
  "targetContract": "0x…wagerRegistry",
  "action": "claimPayout",
  "params": { "wagerId": "0x…" },
  "signature": "0x…",
  "validAfter": 0,
  "validBefore": 1893456000,
  "uniquenessMarker": "0x…replayNonce",
  "fundingMode": "sponsored"
}
```

**Responses:**

| Status | Body | Meaning |
|--------|------|---------|
| `202 Accepted` | `{ "intentId", "status": "queued"\|"submitted", "txHash"? }` | Accepted for relaying; poll status or await webhook. `txHash` present once broadcast. |
| `200 OK` | `{ "intentId", "status": "confirmed", "txHash" }` | Idempotent replay of an already-completed intent (dedup by `uniquenessMarker`) — returns the original result, **no second submission** (FR-008, SC-006). |
| `400 Bad Request` | `error.code` ∈ `invalid_signature`, `chain_mismatch`, `target_not_allowlisted`, `param_binding_mismatch`, `expired`, `not_yet_valid` | Validation failed; no funds moved. |
| `402 Payment Required` | `error.code = fee_exceeds_cap` | Fee-netted: estimated gas > `maxFee`; declined before any funds move (FR-023). |
| `403 Forbidden` | `error.code ∈ origin_denied, sanctioned_signer` | Origin-lock failed, or **signer** failed sanctions screening (FR-013). |
| `409 Conflict` | `error.code = duplicate_in_flight` | Same `uniquenessMarker` already in flight (coalesced). |
| `429 Too Many Requests` | `Retry-After` header; `error.code ∈ quota_exceeded, backpressure` | Per-signer/global quota or bounded-queue back-pressure (FR-009, FR-014). Client offers self-submit. |
| `503 Service Unavailable` | `error.code ∈ screening_unavailable, killswitch_active, chain_unavailable, payment_unsupported_on_chain` | Fail-closed screening outage (FR-013), kill switch (FR-015), all RPCs down, or `payment` class on a chain without EIP-3009 (ETC/Mordor). Client offers self-submit. |

**Guarantees:** the on-chain effect is attributed to the recovered `signer`, never the relayer (FR-002/SC-003). Every terminal outcome yields an audit record (FR-021). Any non-2xx leaves funds untouched.

## GET /v1/intents/{intentId} — status

**200 OK:** `{ "intentId", "status", "txHash"?, "reason"? }` where `status` ∈ `queued | submitted | confirmed | rejected | failed` (see Intent Status lifecycle). Never returns `confirmed` before on-chain inclusion (FR-006).

## GET /healthz — liveness/readiness (origin-lock exempt)

**200 OK:** `{ "status": "ok", "chains": { "137": {"rpc":"up","gasWalletRunwayHrs":N}, … }, "killSwitch": false }`. Used by Cloud Run health checks and by the client's relayer-availability probe that drives the self-submit fallback (FR-016, SC-004).

## Cross-cutting

- **Rate limiting / quotas** enforced per recovered `signer` and globally, consistently across instances (FR-014).
- **Kill switch**: when active, `POST /v1/intents` returns `503 killswitch_active`; the client falls back to self-submit (FR-015, SC-004).
- **Network isolation**: an intent whose signed `chainId`/domain does not match the addressed network is rejected `400 chain_mismatch` (FR-024, SC-014).
