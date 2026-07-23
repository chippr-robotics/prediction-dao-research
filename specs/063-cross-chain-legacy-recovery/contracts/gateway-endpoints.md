# Gateway Proxy Endpoints (optional, honest-degradation)

**Feature**: 063 | New optional modules under `services/relay-gateway/src/`, mirroring the spec-061
Bitcoin module. Each is **optional**: when its env is unset/unreachable, the corresponding frontend
surface hides or degrades honestly (never-stranded). Every endpoint receives **only public
addresses and already-signed raw transactions** — except the single escalated Monero view-key case
below.

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

## Monero — `services/relay-gateway/src/monero-lws/` (`MONERO_*` env)

**⚠ Escalated FR-021 exception (pending `/speckit-clarify`)**: the Monero balance path transmits the
private **view key** to the scanner. Recommended posture: the LWS is **self-hosted, first-party**
infra behind this proxy, and the member is explicitly told "your view key is shared with FairWins'
scanner to read your balance; it cannot move funds." The alternative (in-browser monero-ts WASM,
view key stays local) removes this endpoint entirely at a 10 MB cost.

| Endpoint | Input | Output | Notes |
|----------|-------|--------|-------|
| `POST /v1/monero/login` | `{ address, view_key }` | ok | mymonero/OpenMonero LWS protocol |
| `POST /v1/monero/get_address_info` | `{ address, view_key }` | balance/outputs | **view key only** — cannot spend |
| `POST /v1/monero/get_address_txs` | `{ address, view_key }` | tx history | |
| `POST /v1/monero/sendrawtransaction` | signed tx blob (Phase 2) | status | WASM-signed client-side |

Client sends: address + **view key** (the exception) + signed tx blobs. NEVER: the spend key/seed.

---

## Common contract

- All modules boot-optional: absent env ⇒ frontend feature hides/degrades honestly (spec-061
  contract), no crash.
- Responses distinguish "empty" from "error" so the client can honor FR-014 (nothing-found vs
  unreachable).
- No endpoint persists request bodies containing the Monero view key beyond the scan session; this
  is documented in `docs/runbooks/` per the escalated decision.
