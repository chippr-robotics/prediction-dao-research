# Quickstart Validation: Collectibles Portfolio

**Feature**: 055-collectibles-portfolio

Runnable checks proving the feature works end-to-end. Contracts:
[`contracts/gateway-opensea-api.md`](contracts/gateway-opensea-api.md);
DTOs: [`data-model.md`](data-model.md).

## Prerequisites

- Node ≥ 22 (frontend) / ≥ 20 (gateway), `npm install` run at repo root,
  `frontend/`, and `services/relay-gateway/`.
- An OpenSea API key for live checks (free 30-day key:
  `curl -s -X POST https://api.opensea.io/api/v2/auth/keys`). Never commit it.

## 1. Automated suites (no key needed — upstream is mocked)

```bash
# Gateway route group: DTO normalization, chain mapping, cache, quotas,
# killswitch, origin-lock, fail-closed config
cd services/relay-gateway && npm test -- opensea

# Frontend: hook, panel states, detail sheet, deep link, portfolio line, axe
cd frontend && npm run test:run -- collectibles
```

Expected: all green. The gateway suite asserts two identical requests hit the
mocked upstream once (cache) and that upstream 5xx after a hit serves
`stale: true`.

## 2. Gateway live smoke (optional, needs key)

```bash
cd services/relay-gateway
OPENSEA_API_KEY=<key> ORIGIN_AUTH_SECRET=dev-secret \
  ALLOWED_ORIGINS=http://localhost:5173 node src/server.js &

# Owned items on Polygon for a known wallet
curl -s -H 'X-Origin-Auth: dev-secret' \
  localhost:8788/v1/opensea/137/account/<address>/nfts | jq '.items[0], .stale'

# Unsupported chain soft-fail
curl -s -H 'X-Origin-Auth: dev-secret' \
  localhost:8788/v1/opensea/63/account/<address>/nfts | jq '.error.code'
# → "unsupported_chain"

# Missing key fails closed (restart without OPENSEA_API_KEY)
# → error.code "collectibles_unconfigured", HTTP 503
```

## 3. Frontend manual walkthrough

```bash
cd frontend && VITE_RELAYER_URL=http://localhost:8788 npm run dev
```

| Check | Steps | Expected |
|---|---|---|
| Tab visible (SC-001) | Connect wallet on Polygon or Ethereum → Finance | "Collectibles" appears; ≤ 2 interactions to grid; first screen < 3 s |
| Grid renders | Open Collectibles with an NFT-holding wallet | Cards show image, name, collection; flagged items behind "hidden items" toggle |
| Empty state | Open with an empty wallet | Friendly empty state + OpenSea explore link |
| Detail + deep link (SC-002) | Tap an item → "View on OpenSea" | Traits, floor, best offer (or explicit "none yet"); link opens the exact item, new tab, ≤ 3 interactions total |
| Read-only (FR-005) | Inspect all collectible screens | No buy/sell/list/transfer/signature affordances anywhere |
| Portfolio line (SC-006) | Open Portfolio tab | "Collectibles (floor estimate)" line, labeled as estimate, NOT included in headline total; navigates to the tab |
| Soft-fail hidden (SC-003) | Switch network to Mordor | Tab and portfolio line disappear entirely; `?tab=collectibles` deep link falls back to default tab |
| Degraded (SC-004) | Stop the gateway while on the tab, refresh | Explicit unavailable/stale state with OpenSea link; wagers/pools/portfolio tokens unaffected |
| Network switch (FR-010) | Switch Polygon ↔ Ethereum on the tab | Items swap networks; no cross-network mixing |

## 4. Security / guardrail checks (SC-005)

```bash
# No key in any client-delivered asset
cd frontend && npm run build && ! grep -ri "opensea_api\|x-api-key" dist/

# No secrets committed
git grep -i "OPENSEA_API_KEY=" -- ':!*.example' ':!specs' ':!docs'   # no hits

# Quota backstop: burst > per-address limit → 429 with Retry-After
for i in $(seq 1 70); do curl -s -o /dev/null -w '%{http_code}\n' \
  -H 'X-Origin-Auth: dev-secret' \
  localhost:8788/v1/opensea/137/account/<address>/nfts; done | sort | uniq -c
```

## 5. Regression gates

```bash
cd frontend && npm run lint && npm run test:run     # full frontend suite
cd services/relay-gateway && npm test                # full gateway suite
```

No contract changes in this feature — `npm run compile` / `npm test` (Hardhat)
and `check:storage-layout` are unaffected by design; CI must stay green without
any `continue-on-error` additions.
