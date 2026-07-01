# Contract: Frontend Relay Client

Generalizes the dormant `frontend/src/lib/pools/gasless.js` + `relayerClient.js` into a shared intent-relay client under `frontend/src/lib/relay/`, used by all spec-035 flows. The client is the enforcement point for the **never-stranded** guarantee (spec 035 FR-014, spec 036 FR-016/SC-004).

## Configuration

- `VITE_RELAYER_URL` — the perimeter-protected endpoint (`https://relayer.fairwins.app` or `https://fairwins.app/relay`). **Unset ⇒ gasless disabled ⇒ every flow self-submits** (the current dormant behavior is the safe default).
- Subdomain topology additionally requires the origin in the SPA CSP `connect-src` (`nginx.conf.template`); path topology is same-origin (no CSP change).

## Client surface

| Function | Behavior |
|----------|----------|
| `makeRelayer(chainId)` | Returns `null` if `VITE_RELAYER_URL` unset or the chain has no relayer → caller self-submits. |
| `signIntent(action, params, {chainId, intentClass})` | Builds the spec-035 typed payload and requests the wallet signature (EIP-712 or EIP-3009). Returns the Intent body. |
| `relayIntent(intent)` | `POST /v1/intents`; on `2xx` returns `{intentId, status, txHash?}`; on `429/503` (or timeout past the health/timeout budget) **throws a typed `RelayerUnavailable`** so the caller falls back to self-submit. |
| `pollStatus(intentId)` | `GET /v1/intents/{id}`; drives the honest status UI. |
| `probeHealth(chainId)` | `GET /healthz` within a bounded budget; a failed probe routes the flow to self-submit before signing where possible (FR-016). |

## Never-stranded rule (MUST)

Every gasless call site MUST wrap `relayIntent` so that **any** of: relayer unset, `RelayerUnavailable`, `429`, `503`, `payment_unsupported_on_chain` (ETC/Mordor), or timeout → transparently offers/executes the **self-submit** path (user pays own gas), producing an identical on-chain result (SC-004). No call site may present a gasless-only dead end.

## Honest status + accessibility (MUST)

New UI states — `queued/submitted/pending` vs `confirmed`, back-pressure/retry-after, and relayer-unavailable→self-submit — reuse spec 035's intent-status framework and meet **WCAG 2.1 AA** (FR-027): state not conveyed by color/icon alone; transitions announced to assistive tech; `confirmed` never shown before on-chain inclusion.

## ETC/Mordor note

For `payment`-class intents on chains 61/63, `makeRelayer`/`relayIntent` surface `payment_unsupported_on_chain` and the flow self-submits (the live USC token lacks EIP-3009). No-stake signer-attributed intents relay normally.
