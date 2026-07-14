# Tasks: Predict — Polymarket Prediction-Market Trading

**Input**: Design documents from `/specs/057-predict-polymarket/`

**Prerequisites**: plan.md, spec.md, research.md (data-model.md + contracts/ are the next
`/speckit-plan` artifacts; task IDs reference them so they slot in when generated)

**Tests**: INCLUDED — constitution principle II (test-first) is non-negotiable; every
behavior task pairs with a test task in the same phase.

**Organization**: Grouped by user story. US1 (browse + buy) alone is the shippable,
revenue-generating MVP; US2 (sell/close) and US3 (cancel open orders) layer on
independently. Builder-code attribution is cross-cutting, folded into the gateway
order/cancel routes and the confirm UI.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US1 (browse + buy), US2 (sell/close), US3 (cancel); builder-code/fee
  attribution is cross-cutting

## Phase 1: Setup (Shared Configuration)

**Purpose**: config surface both sides need; no behavior yet

- [x] T001 Add a `polymarket` config block to `services/relay-gateway/src/config/index.js`
  (mirroring `opensea`): `apiKey` (`POLYMARKET_API_KEY`, null ⇒ routes 503 fail-closed),
  `baseUrl` (`POLYMARKET_BASE_URL`, default `https://clob.polymarket.com`), `timeoutMs`,
  `retries`, read quotas (`POLYMARKET_QUOTA_PER_ADDRESS`/`_GLOBAL`), write quotas
  (`POLYMARKET_WRITE_QUOTA_PER_ADDRESS` default 20 / `_GLOBAL` default 100), `builderCode`
  (`POLYMARKET_BUILDER_CODE`, `bytes32` hex validated at boot if set), `takerFeeBps`
  (`POLYMARKET_BUILDER_TAKER_FEE_BPS`, default 50) and `makerFeeBps`
  (`POLYMARKET_BUILDER_MAKER_FEE_BPS`, default 0) — **validate `takerFeeBps ≤ 100` and
  `makerFeeBps ≤ 50` at boot and throw loudly if out of range** (FR-014/SC-010)
- [x] T002 [P] Document the new `POLYMARKET_*` env vars in
  `services/relay-gateway/.env.example` (new "Polymarket / Predict proxy" section) and the
  README env table in `services/relay-gateway/README.md`, including that the builder code
  is public config (not a secret) and the fee-rate caps
- [x] T003 [P] Add `PREDICT_CHAIN_IDS = new Set([137])` and a `capabilities.predict` getter
  to `frontend/src/config/networks.js` (mirroring `COLLECTIBLES_CHAIN_IDS`), and add
  `{ id: 'predict', label: 'Predict', icon: 'chart' }` to the Finance group in
  `frontend/src/config/appNav.js` (choose an existing NavIcon name; the item HIDES on
  non-Polygon networks via `visibleNavGroups`, FR-018)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the gateway proxy client/pipeline and the frontend signing+client scaffolds
every story shares

**⚠️ CRITICAL**: complete before any user story phase

- [x] T004 [P] Create `services/relay-gateway/src/polymarket/client.js`: CLOB REST client
  with **L1** one-time API-key derivation (EIP-712 wallet sig → `POST /auth/api-key` from
  the operator signer key) cached in-process, **L2** HMAC-SHA256 request signing
  (`POLY_API_KEY`/`POLY_PASSPHRASE`/`POLY_TIMESTAMP` seconds/`POLY_SIGNATURE` over
  `{ts}{method}{path}{body}`), `get()` (retry 5xx) and `post()` (**no 5xx retry** — order
  submission is not idempotent), AbortController timeout (research D7)
- [x] T005 [P] Create `services/relay-gateway/src/polymarket/builderCode.js` — the
  `attachBuilderCode({ chainId, side, isMaker })` seam: resolves `{ builderCode,
  takerFeeBps, makerFeeBps, source }` from config; `source: 'none'` (zero code, zero fee)
  when unconfigured so orders still post **unattributed** rather than blocking trading
  (FR-015). Unlike Collect's `attachReferral`, the returned fee bps are a **real user
  cost** fed into the visible breakdown; maker orders resolve fee 0 (research D9)
- [x] T006 [P] Create `services/relay-gateway/src/polymarket/normalize.js` with DTO mappers
  + body validators per data-model.md: `normalizeMarket` (question, category, outcomes +
  token ids, price, volume, liquidity, tradable state), `normalizeFeeBreakdown` (live
  platform fee schedule from the market / `/fee-rate` — never hardcoded, D3),
  `normalizePosition`, `normalizeOpenOrder`, and validators for the post-order body
  (signed V2 order struct shape incl. `builder` field == configured code, signature hex)
  and the cancel body (orderHash/order id, address)
- [x] T007 [P] Create `services/relay-gateway/src/polymarket/cache.js` — TTL cache +
  single-flight + serve-stale for reads (reuse the `opensea/cache.js` shape); order/cancel
  writes bypass it
- [x] T008 Add the route skeleton to `services/relay-gateway/src/polymarket/routes.js`
  (`requireLive()` fail-closed on missing key ⇒ 503 `predict_unconfigured`; origin-lock +
  killswitch reuse; read `guard()` keyed by address; a separate **write** `guard()` keyed
  by trader address that bypasses cache) and wire `pmQuotas` + `pmWriteQuotas`
  `createQuotas` instances in `services/relay-gateway/src/server.js`, passing them +
  builder config into `createPolymarketRouter` deps; mount at `/v1/polymarket`
- [x] T009 Foundational gateway tests in `services/relay-gateway/test/polymarket.test.js`:
  inject `fetchImpl`; assert L2 HMAC headers present + timestamps in **seconds**;
  `client.post` does NOT retry on 5xx; cross-cutting route errors (origin-lock 403,
  killswitch 503, `predict_unconfigured` 503, write-quota 429 per-address + global with
  Retry-After, `unsupported_chain` 404 off Polygon); `attachBuilderCode` (attaches code +
  fee when configured; `source:'none'` unattributed when unset; maker fee 0); **boot fails
  loudly when `takerFeeBps > 100` or `makerFeeBps > 50`** (SC-010)
- [x] T010 [P] Create the CLOB V2 order builder `frontend/src/lib/predict/clobOrder.js` per
  contracts/clob-order-signing.md: pinned EIP-712 domain (`"Polymarket CTF Exchange"` v2,
  chainId 137, verifyingContract from `/book` neg_risk) + `Order` types (modeled on
  `intentTypes.js`), `buildOrder({ tokenId, side, price, size, isMaker }, feeBreakdown,
  builder)` returning `{ domain, types, message, totalCost, netProceeds, feeLines }` where
  the `builder` field carries the code and `feeLines` include the platform fee AND the
  **builder fee** (taker) so shown == signed == charged (FR-011/FR-012); `salt` via
  injectable randomness, `timestamp` ms injectable
- [x] T011 [P] Unit-test `clobOrder.js` in `frontend/src/test/predict/clobOrder.test.js`:
  totalCost/netProceeds include the additive builder fee for takers (FR-011); **maker
  orders carry no platform fee and no builder fee** (FR-012/US1 scenario 4); the `builder`
  field equals the configured code; currency labeling (USDC); price/size arithmetic
- [x] T012 [P] Create `frontend/src/lib/predict/predictClient.js` (extends the gateway-client
  conventions): `fetchMarkets/fetchMarket/fetchFeeRate/fetchPositions/fetchOpenOrders`
  (reads) + `submitOrder(chainId, {order, signature})` / `cancelOrder(chainId, {orderId,
  signature})` (writes) — `VITE_RELAYER_URL` base via `predictGatewayUrl()`, bounded fetch,
  mapping outage/killswitch to a `PredictUnavailable` error and stale-price to a re-confirm
  signal; plus `frontend/src/lib/predict/builderFee.js` (client-side bps→amount math shared
  with the confirm UI). Tests in `frontend/src/test/predict/predictClient.test.js`
  (fetch mocked: success, fee-fetch failure, unavailable, re-confirm)

**Checkpoint**: gateway proxy routes respond with correct errors + attach the builder
code; the client can build/sign an order and reach the gateway — no UI yet

---

## Phase 3: User Story 1 — Browse markets & open a position (Priority: P1) 🎯 MVP

**Goal**: a member browses/searches Polymarket markets and buys outcome shares with honest
total-cost (platform fee + **builder fee**) disclosed before a gas-free CLOB signature;
the order carries the builder code and the position appears on fill

**Independent Test**: quickstart rows Browse / Buy / Total=signed / Builder-fee-shown /
Maker-no-fee / Fee-fetch failure — connect a Polygon wallet, search a market, buy, confirm
the total (incl. builder fee) matches the signed order, approve, see the position

- [x] T013 [US1] Implement the read routes in `services/relay-gateway/src/polymarket/routes.js`:
  `GET /v1/polymarket/:chainId/markets` (list/search, cached), `GET …/markets/:id`,
  `GET …/fee-rate` (live platform fee schedule), `GET …/positions` + `GET …/orders`
  (per-address); and the **`POST …/order`** route (validates the signed body, asserts the
  `builder` field == configured code via `attachBuilderCode`, forwards to CLOB `POST /order`
  with no 5xx retry, surfaces `502 upstream_rejected` reason)
- [x] T014 [US1] Gateway tests for the read + buy routes in
  `services/relay-gateway/test/polymarket.test.js`: market/fee normalization from a captured
  CLOB fixture, fee-unavailable ⇒ 503 (never hardcoded), buy forwards the exact signed order
  incl. builder code, `source:'none'` still posts (unattributed), `502` surfaces the upstream
  reason, no double-post on 5xx
- [x] T015 [US1] Create `frontend/src/hooks/usePredictTrade.js` — the TradeActionState machine
  for BUY (data-model.md): checking (fetch fee schedule → verify network == 137 → verify
  account can sign) → blocked (fees unavailable FR-010 / account unsupported FR-019 / wrong
  network FR-021) → confirming → signing (EOA `signer.signTypedData`; passkey via
  `passkeyIntentSigner` ERC-1271) → submitting (`submitOrder`) → done/error; race-safe;
  tests in `frontend/src/test/predict/usePredictTrade.test.jsx` (fees-block-signing, EOA
  sign+post, network-switch prompt, error keeps the act-on-Polymarket path)
- [x] T016 [US1] Create `frontend/src/components/predict/PredictPanel.jsx` + CSS: market
  browse/search grid (category filter, search, price/volume), keyboard-operable +
  accessible; hides entirely off Polygon (consumes `capabilities.predict`)
- [x] T017 [US1] Create `frontend/src/components/predict/MarketDetailSheet.jsx` + CSS and
  `TradeConfirm.jsx` + CSS (modeled on `SellConfirm`/`PasskeyConfirm`): outcome pick,
  amount/price/order-type entry, the live breakdown showing price + platform fee +
  **FairWins builder fee (its own labeled line)** + total cost before approval (FR-003/
  FR-012), maker orders show **no fee** (US1 scenario 4), one-time USDC-approval disclosure
  when required (FR-005), honest "FairWins earns a 0.50% builder fee on this trade" copy —
  **not** described as free (the Collect divergence) — keyboard-operable + accessible
- [x] T018 [US1] Tests for `TradeConfirm.jsx` in `frontend/src/test/predict/TradeConfirm.test.jsx`:
  builder-fee line rendered and included in the total before any approve (FR-012), maker
  order shows no fee line, total == the signed order's total (FR-011), approval blocked until
  fees confirmed (FR-010), disclosure states the fee **is** a cost (not free), axe pass
- [x] T019 [US1] Wire `PredictPanel` into `frontend/src/pages/WalletPage.jsx` (render when
  `activeTab === 'predict' && predictEnabled`, where `predictEnabled = capabilities?.predict
  && predictGatewayUrl() !== ''`); deep-link fallback to `'portfolio'` when unavailable;
  tests for tab visibility + hidden-off-Polygon

**Checkpoint**: US1 independently shippable — a member can browse and buy with the builder
code attached and the fee honestly disclosed

---

## Phase 4: User Story 2 — Close or reduce a position (Priority: P2)

**Goal**: a member sells/closes a position with honest net proceeds (best bid − fees incl.
builder fee for takers) before a gas-free signature; proceeds settle to their wallet

**Independent Test**: quickstart rows Sell / Net=signed / No-bid state / Stale-price
re-confirm — with a wallet holding a position, sell, confirm net matches, fill, verify USDC

- [x] T020 [US2] Extend the hook `usePredictTrade.js` (or a sibling) with the SELL path
  (best-bid fetch, taker/maker fee application, stale-price detection ⇒ re-confirm FR-008)
  and MarketDetailSheet's Sell affordance + positions view; tests for sell sign+post,
  no-bid honest state, stale-price re-confirm
- [x] T021 [US2] Gateway: reuse `POST …/order` for sells; add tests for a SELL order body
  (side flip, builder code attached, taker fee applied, maker sell shows 0) in
  `polymarket.test.js`
- [x] T022 [US2] TradeConfirm sell mode + tests: net proceeds = best bid − platform fee −
  builder fee (taker), shown == signed (FR-007/FR-011), no-bid/illiquid honest state, axe

**Checkpoint**: buy + sell round-trip complete, both attributed

---

## Phase 5: User Story 3 — Manage open orders (Priority: P3)

**Goal**: a member views open (unfilled) orders and cancels any via a gas-free CLOB cancel

**Independent Test**: place a resting limit order, view it, cancel, verify removed, no gas

- [x] T023 [US3] Implement `POST /v1/polymarket/:chainId/order/cancel` in `routes.js`
  (validate body, forward to CLOB cancel, no 5xx retry) + gateway tests
- [x] T024 [US3] Create `frontend/src/components/predict/OpenOrdersList.jsx` + CSS (list open
  orders from `fetchOpenOrders`, Cancel action wired through the hook's cancel path) + tests
  (cancel removes the order, gas-free, accessible, axe)

---

## Phase 6: Polish & Cross-Cutting

- [x] T025 [P] Update `services/oz-relayer/deploy/production/service.yaml`: add
  `POLYMARKET_API_KEY` (Secret Manager ref) and `POLYMARKET_BUILDER_CODE` +
  `POLYMARKET_BUILDER_TAKER_FEE_BPS`/`_MAKER_FEE_BPS` (inline public values), bump the image tag
- [x] T026 [P] Update `docs/runbooks/relayer-operations.md` with the Predict proxy routes,
  builder-code provisioning/rotation, the L1→L2 credential lifecycle, and Polymarket's
  fee-change policy (1 change / 7 days, 3-day notice) so rate tuning is done deliberately
- [x] T027 [P] Create `docs/developer-guide/predict-polymarket.md`: builder codes, the
  additive fee model + honesty rule, the CLOB signing seam, and the competitive analysis
  from research.md
- [x] T028 Update `CLAUDE.md` Guardrails with a short Predict entry (Polymarket builder-code
  trading, Polygon-only, additive builder fee disclosed honestly, no custody/no contracts,
  resolve nothing through `wagerRegistry`)
- [x] T029 Run the full validation gate (quickstart): `npm run test:frontend`, the gateway
  Vitest suite, lint, and an axe pass on all new Predict surfaces; confirm no Polymarket
  credential appears in any client bundle (SC-006)

---

## Dependencies

- **Phase 1 → 2 → (3, 4, 5)**: setup before foundational before stories.
- **US1 (Phase 3)** is the MVP and must complete first among stories (US2/US3 reuse its
  hook, client, gateway routes, and confirm UI).
- **US2 (Phase 4)** and **US3 (Phase 5)** are independent of each other once US1 lands.
- **Phase 6** polish after the stories it documents.

## Notes

- **Design revision (Option A) — see `plan.md#design-revision`.** Tasks below were authored against the
  original "hand-built order struct relayed through a shared operator key" design, which live CLOB proved
  unworkable (V2 binds each order to its signer). As shipped: each member derives their **own** CLOB creds
  and trades **client-direct** via `@polymarket/clob-client`; the gateway keeps public reads and gains a
  `builder-sign` attribution endpoint. So T014/T024's "gateway order/cancel routes" and T0xx's "hand-built
  EIP-712 struct" are superseded — the outcome (browse, trade with disclosed builder fee, cancel, no
  custody) is unchanged; the mechanism is client-direct + per-user creds + geoblock link-out.
- `[P]` tasks touch distinct files with no incomplete-task dependency and may run in parallel.
- Every behavior task ships with its test task in the same phase (constitution II).
- Builder code (`0x6e03…93a3`) and fee rates are server-side config only; the client never
  hardcodes them and the platform fee is always read live (research D3/D9).
