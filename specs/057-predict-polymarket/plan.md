# Implementation Plan: Predict — Polymarket Prediction-Market Trading

**Branch**: `claude/predict-polymarket-feature-ovhdc0` | **Date**: 2026-07-14 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/057-predict-polymarket/spec.md`

## Summary

Add a **Predict** section that lets a member with a connected wallet on Polygon browse
Polymarket markets and **buy/sell outcome shares**, close positions, and cancel open
orders — all through Polymarket's CLOB, with the member's own wallet as the only signer
and no app custody. Every order carries FairWins' `bytes32` **builder code** so
FairWins earns (1) a configured **builder fee** (50 bps taker / 0 maker) and (2) a share
of Polymarket's weekly USDC builder-rewards pool. The frontend hand-builds the CLOB V2
order struct as EIP-712 typed data and signs it through the repo's single `signTypedData`
seam — unchanged for EOAs and, via `passkeyIntentSigner`, for passkey smart accounts
(ERC-1271). The relay-gateway gains a `polymarket/` proxy (client + routes + normalize +
`attachBuilderCode` seam) holding the Polymarket API key + L2 HMAC credentials
server-side, mirroring the `opensea/` proxy, with its own write quota and killswitch.
**Key honesty difference from Collect**: Polymarket's builder fee is **additive** (a real
taker cost, unlike OpenSea's no-cost referral), so it is disclosed as a distinct fee line
before every signature. No smart-contract changes. Decision log: [research.md](research.md).

## Technical Context

**Language/Version**: JavaScript ESM — Node ≥20 (gateway), Node ≥22 + React 19 (frontend)

**Primary Dependencies**: gateway: Express 4 + native `fetch` (reuse the OpenSea client
shape; add a `polymarket/client.js` with L1/L2 HMAC auth; **no new npm dep**); frontend:
ethers v6 `signTypedData` + the existing `passkeyIntentSigner` adapter + wagmi (**no new
core dep** — the CLOB V2 order typed data is hand-built; `@polymarket/clob-client-v2` is
a documented order-builder fallback only, research D6)

**Storage**: none persistent; transient order/DTO/hook state (data-model.md); gateway
order/cancel writes bypass the read cache

**Testing**: Vitest + Supertest with injected `fetchImpl` (gateway; reuse the ERC-1271
`magic` provider mock for passkey orders); Vitest + Testing Library + vitest-axe +
injected passkey-signer deps (frontend)

**Target Platform**: gateway on Cloud Run (existing service); frontend SPA (Vite)

**Project Type**: web application — `services/relay-gateway` + `frontend/`; no
`contracts/`, no subgraph changes

**Performance Goals**: total-cost (builder fee itemized) shown before approval in 100% of
flows (SC-001); order/cancel routes protected by a separate per-address + global write
quota so the shared Polymarket key isn't drained (well under CLOB's ~9,000/10s)

**Constraints**: Polymarket key + L2 creds server-side only (FR-016); wallet is the only
signer, no custody (FR-004/SC-005); live fees, block signing if unconfirmable (FR-010);
total shown = total charged incl. **additive builder fee** (FR-011/FR-012); builder fee
config ≤ Polymarket caps, fail loudly if not (FR-014/SC-010); trade even if code
unconfigured (never stranded, FR-015); passkey traders supported via ERC-1271 or
honest-unavailable per account (FR-019); trading open to all wallets, sponsorship follows
tier gating (FR-023); **Polygon only** (FR-018); nothing on the wager/pool value path
depends on it (FR-020)

**Scale/Scope**: ~1 new gateway proxy module (client + routes + normalize +
`attachBuilderCode` + write-quota wiring) with ~6 routes; ~5 new frontend modules
(clobOrder builder, predictClient, usePredictTrade hook, PredictPanel, TradeConfirm UI)
+ nav/capability wiring; passkey path reuses existing signer machinery

## Constitution Check

*GATE: evaluated against `.specify/memory/constitution.md` — PASS (pre-Phase-0 and to be
re-checked post-Phase-1). Complexity Tracking below is empty.*

- **I. Security-First Smart Contracts**: PASS (N/A) — zero `contracts/` changes. The
  passkey account's ERC-1271 is **read**, never modified. No funds custody: the wallet is
  the only signer and Polymarket's shared protocol settles; the gateway forwards a
  client-signed order and holds no order-signing key (SC-005). New attack surface is the
  gateway proxy routes: origin-locked, killswitch-aware, fail-closed without the key,
  write-quota-guarded, shape-validated, no-retry on POST. The Polymarket **API credential**
  the gateway holds signs read/quote requests, not user value transfer.
- **II. Test-First & Coverage**: PASS — Vitest suites specified alongside every behavior
  (research D10): gateway order/cancel incl. failure/edge (no-5xx-retry, quota 429,
  killswitch/fail-closed 503, fee-fetch-failure block, `attachBuilderCode` attributed vs
  `source:'none'`, out-of-cap fee rejected at boot); frontend order-build/total-cost
  equality (incl. builder fee), maker-shows-no-fee, confirm-UI honest builder-fee
  disclosure, passkey ERC-1271 path, fee-fetch-blocks-signing, network-switch, stale-price
  re-confirm, axe. No contract interfaces altered.
- **III. Honest State, No Mocks in Shipped Paths**: PASS — live fees (never hardcoded),
  total shown equals total charged, **builder fee disclosed as a real additive cost**
  (not silent, unlike Collect's no-cost referral), no custody, killswitch, soft-fail,
  stale-labeled data. Mocks confined to tests.
- **IV. Fail Loudly in CI**: PASS — new gateway + frontend tests run under the existing
  gating jobs (the Relay Gateway Tests job already runs the gateway suite); no
  `continue-on-error`. Out-of-cap builder-fee config fails boot loudly.
- **V. Accessible, Consistent Frontend**: PASS — WCAG 2.1 AA is FR-022; TradeConfirm
  reuses the audited `PasskeyConfirm`/`SellConfirm` disclosure patterns (focus trap,
  keyboard amount/price entry, accessible names); vitest-axe assertions included. No
  hardcoded addresses/ABIs — Polymarket exchange/CTF addresses come from `deployments/`
  (`polymarketCTF`) and the gateway's `/book` (verifyingContract, neg_risk), not client
  constants; platform fee comes from the market's live fee schedule.
- **Additional Constraints**: PASS — **no new core technology** (hand-built CLOB V2 typed
  data; `@polymarket/clob-client-v2` only if the documented builder fallback triggers,
  justified then); the builder code is public config (not a secret), the API key stays in
  Secret Manager; archives untouched; `deployments/` read-only.

## Project Structure

### Documentation (this feature)

```text
specs/057-predict-polymarket/
├── spec.md
├── plan.md                          # This file
├── research.md                      # Phase 0 (D1–D10) incl. fee/competitive analysis
├── data-model.md                    # DTOs + TradeActionState machine   [/speckit-plan → next]
├── quickstart.md                    # Validation guide                  [/speckit-plan → next]
├── contracts/
│   ├── gateway-predict-api.md       # /v1/polymarket/* routes + attachBuilderCode
│   └── clob-order-signing.md        # the signed V2 OrderComponents + signer seam
├── checklists/requirements.md
└── tasks.md                         # /speckit-tasks
```

### Source Code (repository root)

```text
services/relay-gateway/
├── src/
│   ├── polymarket/
│   │   ├── client.js                # [NEW] CLOB REST client: L1 api-key derive + L2 HMAC signing,
│   │   │                            #        get() (retry 5xx) / post() (NO 5xx retry), X-API-KEY, timeout
│   │   ├── routes.js                # [NEW] /v1/polymarket/:chainId/* — markets (list/search), market,
│   │   │                            #        fee-rate, positions, orders (get open), order (post),
│   │   │                            #        order/cancel (post); requireLive() fail-closed on missing key
│   │   ├── normalize.js             # [NEW] Market/Position/Order/FeeBreakdown DTO mappers + body validators
│   │   ├── builderCode.js           # [NEW] attachBuilderCode seam: {builderCode, takerFeeBps, makerFeeBps,
│   │   │                            #        source}; source:'none' when unconfigured (trade unattributed)
│   │   └── cache.js                 # [NEW] TTL cache + single-flight for reads (reuse opensea/cache shape)
│   ├── config/index.js              # [MODIFY] `polymarket` config block: apiKey/baseUrl/timeout/retries,
│   │                                #          read + write quotas, builderCode + taker/maker fee bps
│   │                                #          (validate ≤100/≤50 caps at boot), signerKey for L1 derive
│   └── server.js                    # [MODIFY] mount polymarket router; pmQuotas + pmWriteQuotas instances
├── test/polymarket.test.js          # [NEW] route + builderCode + auth + fee-cap-boot tests
├── .env.example                     # [MODIFY] POLYMARKET_* section (key, builder code, fee bps, quotas)
└── README.md                        # [MODIFY] Predict proxy routes + builder config

frontend/src/
├── config/
│   ├── networks.js                  # [MODIFY] PREDICT_CHAIN_IDS = new Set([137]); capabilities.predict getter
│   └── appNav.js                    # [MODIFY] add { id: 'predict', label: 'Predict', icon: 'chart' } to Finance
├── lib/predict/
│   ├── clobOrder.js                 # [NEW] build CLOB V2 OrderComponents typed data + total-cost/net (one source)
│   ├── predictClient.js             # [NEW] fetchMarkets/fetchMarket/fetchFeeRate/fetchPositions/fetchOpenOrders/
│   │                                #        submitOrder/cancelOrder; predictGatewayUrl(); PredictUnavailable error
│   └── builderFee.js                # [NEW] client-side builder-fee math shared by confirm UI (bps from gateway)
├── hooks/usePredictTrade.js         # [NEW] TradeActionState machine (fees→build→sign→submit; EOA + passkey)
├── components/predict/
│   ├── PredictPanel.jsx             # [NEW] market browse/search grid (+ CSS)
│   ├── MarketDetailSheet.jsx        # [NEW] outcome pick + amount/price entry + Buy/Sell/positions (+ CSS)
│   ├── TradeConfirm.jsx             # [NEW] price + platform fee + BUILDER FEE + total + gas disclosure (+ CSS)
│   └── OpenOrdersList.jsx           # [NEW] open orders + cancel (+ CSS)
└── pages/WalletPage.jsx             # [MODIFY] render <PredictPanel/> when tab==='predict' && predictEnabled

frontend/src/test/predict/           # [NEW] clobOrder, predictClient, usePredictTrade, TradeConfirm,
                                      #   passkey-signing, builder-fee-disclosure, maker-no-fee, axe

services/oz-relayer/deploy/production/service.yaml  # [MODIFY] POLYMARKET_API_KEY (secret) +
                                                    #   POLYMARKET_BUILDER_CODE / fee bps (inline), image tag bump
docs/runbooks/relayer-operations.md   # [MODIFY] Predict proxy + builder-code provisioning/rotation + fee-change policy
docs/developer-guide/predict-polymarket.md  # [NEW] builder codes, fee model, signing seam, competitive notes
```

**Structure Decision**: extend the two existing projects in place, reusing the OpenSea
proxy shape (client/routes/normalize/cache + revenue seam + write quota) on the gateway
and the established signing seam (`signTypedData` + `passkeyIntentSigner`), confirm-UI
patterns (`PasskeyConfirm`, `SellConfirm`), capability-gating (`networks.js` +
`visibleNavGroups`), and soft-fail `…Unavailable` convention on the frontend. New
`predict`/`polymarket` modules parallel `collectibles`/`opensea` rather than sharing
code, since the venue, auth, and fee model differ. No new service, no contracts/subgraph
work, no new core dependency.

## Complexity Tracking

No constitution violations — table intentionally empty. The one dependency question,
`@polymarket/clob-client-v2`, is deferred to a documented fallback in research D6 so the
default plan adds no new core technology; if implementation triggers the fallback (CLOB
order-struct hand-building proves brittle), it is justified at that point.
