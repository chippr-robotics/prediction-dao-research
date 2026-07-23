# Gateway Proxy Endpoints (optional, honest-degradation)

**Feature**: 063 | New optional modules under `services/relay-gateway/src/`, mirroring the spec-061
Bitcoin module. Each is **optional**: when its env is unset/unreachable, the corresponding frontend
surface hides or degrades honestly (never-stranded). Every endpoint receives **only public
addresses and already-signed raw transactions** — no private key ever reaches a gateway. (Monero,
whose balance path would have required the view key, is deferred to a follow-up spec.)

Trust boundary (FR-021): keys/seeds NEVER reach these endpoints. Providers behind the proxy are
untrusted for confidentiality; the proxy hides provider API keys and applies the shared
screening/quotas/killswitch.

---

## Solana — `services/relay-gateway/src/solana/` (`SOLANA_*` env)

| Endpoint | Input | Output | Notes |
|----------|-------|--------|-------|
| `POST /v1/solana/rpc` | JSON-RPC body (`getBalance`, `getSignaturesForAddress`, `getLatestBlockhash`, `sendTransaction`, `getSignatureStatuses`) | JSON-RPC result | Fronts a keyed provider; public `api.mainnet-beta.solana.com` is the client fallback |

Client sends: base58 addresses, base64 signed txs. Never: secret keys.

## Zcash — `services/relay-gateway/src/zcash/` (`ZCASH_*` env)

| Endpoint | Input | Output | Notes |
|----------|-------|--------|-------|
| `GET /v1/zcash/utxo/{taddr}` | t-address | UTXO list | Blockbook REST behind the proxy |
| `GET /v1/zcash/address/{taddr}` | t-address | balance + tx history | |
| `GET /v1/zcash/info` | — | `{ height, consensusBranchId }` | Live branch id for ZIP-244 (never hardcoded) |
| `POST /v1/zcash/sendtx` | signed raw tx hex | txid | |

Client sends: t-addresses, signed raw tx hex. Never: private keys.

## Monero — DEFERRED

The Monero LWS proxy (which would have transmitted the private view key) is deferred to a follow-up
spec. No Monero gateway module ships in feature 063.

---

## Common contract

- All modules boot-optional: absent env ⇒ frontend feature hides/degrades honestly (spec-061
  contract), no crash.
- Responses distinguish "empty" from "error" so the client can honor FR-014 (nothing-found vs
  unreachable).
- No endpoint ever receives a seed or private key.
