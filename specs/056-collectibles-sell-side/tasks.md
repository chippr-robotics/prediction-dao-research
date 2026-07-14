# Tasks: Collectibles Sell-Side Trading (Phase 2)

**Input**: Design documents from `/specs/056-collectibles-sell-side/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/gateway-sell-api.md, contracts/seaport-order-signing.md, quickstart.md

**Tests**: INCLUDED — constitution principle II (test-first) is non-negotiable; every behavior task pairs with a test task in the same phase.

**Organization**: Grouped by user story. US1 (list) alone is a shippable increment; US2 (accept offer) and US3 (cancel) layer on independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US1 (list), US2 (accept offer), US3 (cancel); reward attribution is cross-cutting, folded into the gateway write routes

## Phase 1: Setup (Shared Configuration)

**Purpose**: config surface both sides need; no behavior yet

- [x] T001 Add write config to `services/relay-gateway/src/config/index.js` `opensea` block: `referralAddress` (`OPENSEA_REFERRAL_ADDRESS`, `ADDRESS_RE`-validated at boot if set), per-chain `referralAddressByChain` (`OPENSEA_REFERRAL_ADDRESS_<chainId>`), and write-quota knobs (`OPENSEA_WRITE_QUOTA_PER_ADDRESS` default 20, `OPENSEA_WRITE_QUOTA_GLOBAL` default 100, reuse `quotaWindowMs`); document each in the file-top env comment
- [x] T002 [P] Document the new `OPENSEA_REFERRAL_*` and write-quota env vars in `services/relay-gateway/.env.example` (rename the "read-only OpenSea proxy" section to "OpenSea proxy (read + sell-side)") and the README env table in `services/relay-gateway/README.md`
- [x] T003 [P] Add the Seaport protocol + conduit addresses per supported chain (1, 137) as gateway config in `services/relay-gateway/src/config/index.js` (or a small `src/opensea/seaport.js` constants module) so the required-fees route can return `protocolAddress`/`conduitKey` without the client hardcoding them

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the gateway write client/pipeline and the frontend signing+client scaffolds every story shares

**⚠️ CRITICAL**: complete before any user story phase

- [x] T004 [P] Add a `post(path, body, query)` method to `services/relay-gateway/src/opensea/client.js`: `X-API-KEY` + `content-type: application/json`, AbortController timeout, and **no retry on 5xx** (mutations are not idempotent — distinct from the GET path's retry); export alongside `get`
- [x] T005 [P] Create `services/relay-gateway/src/opensea/referral.js` — the `attachReferral({ chainId, order|fulfillment })` seam: resolves `referralAddressByChain[chainId] || referralAddress`; when set AND attribution is available at no user cost, attaches FairWins as beneficiary; otherwise a no-op (`source: 'none'`). MUST NOT add or alter any consideration item that changes buyer cost or seller net (FR-013/FR-015)
- [x] T006 [P] Extend `services/relay-gateway/src/opensea/normalize.js` with sell-side DTO mappers + body validators per data-model.md: `normalizeFeeBreakdown` (marketplace fee + creator royalty + full fee list + protocol/conduit), `normalizeFulfillment` ({to,data,value,orderHash}), and validators for the post-listing body (order shape, signature hex, protocolAddress) and cancel/fulfillment bodies (orderHash, address)
- [x] T007 Add the write-route skeleton to `services/relay-gateway/src/opensea/routes.js` (reuse `guard()` with a write quota key = seller address; **bypass the read cache**; reuse the error envelope) and wire a second `osWriteQuotas` `createQuotas` instance in `services/relay-gateway/src/server.js`, passing it + the referral config into `createOpenSeaRouter` deps
- [x] T008 Foundational gateway tests in `services/relay-gateway/test/opensea.test.js`: extend `mockOpenSeaFetch` to capture `method`+`body`; assert `client.post` sends `X-API-KEY` and does NOT retry on 5xx; write-route cross-cutting (origin-lock 403, killswitch 503, `collectibles_unconfigured` 503, write-quota 429 per-address + global with Retry-After, `unsupported_chain` 404); and the `attachReferral` seam (attaches when configured; no-op + unchanged consideration when unset)
- [ ] T009 [P] Create the Seaport order builder `frontend/src/lib/collectibles/seaportOrder.js` per contracts/seaport-order-signing.md: a pinned Seaport EIP-712 domain + `OrderComponents` types (modeled on `intentTypes.js`), `buildOrder(item, price, feeBreakdown)` returning `{ domain, types, message, net, feeLines, belowFloor }` where the seller-receipt consideration equals the displayed `net`, and every required fee item is included; `counter` read via an injectable provider call
- [ ] T010 [P] Unit-test `seaportOrder.js` in `frontend/src/test/collectibles/seaportOrder.test.js`: net = seller-receipt consideration amount (FR-010); every required fee appears in consideration; NO consideration item pays a FairWins address (FR-015); `belowFloor` true when net ≤ 0 (FR-011); currency labeling
- [ ] T011 [P] Create `frontend/src/lib/collectibles/sellClient.js` (extends the 055 `gatewayClient` conventions): `fetchRequiredFees(chainId, slug)`, `publishListing(chainId, {order, signature, protocolAddress})`, `cancelListing(chainId, {orderHash, offerer, signature})`, `fetchOfferFulfillment(chainId, {orderHash, fulfiller})` — `VITE_RELAYER_URL` base, bounded fetch, mapping outages/killswitch to the degraded error and `409 offer_changed` to a re-confirm signal; with tests in `frontend/src/test/collectibles/sellClient.test.js` (fetch mocked: success, fee-fetch failure, 409, unavailable)

**Checkpoint**: gateway write routes respond with correct errors; the client can build/sign an order and reach the gateway — no UI yet

---

## Phase 3: User Story 1 — List an owned collectible (Priority: P1) 🎯 MVP

**Goal**: a member lists an owned collectible for a fixed price with honest net-proceeds disclosed before a gas-free signature; item shows "Listed"

**Independent Test**: quickstart §3 rows List / Net=signed / Fee-fetch failure / Below floor / First-time approval — connect a wallet owning an item, Sell, confirm net matches the signed order, approve, see "Listed"

- [x] T012 [US1] Implement `GET /v1/opensea/:chainId/collections/:slug/required-fees` and `POST /v1/opensea/:chainId/listings` in `services/relay-gateway/src/opensea/routes.js` (post applies `attachReferral`, forwards the signed order to OpenSea's create-listing endpoint, no 5xx retry, surfaces `502 upstream_rejected` reason on fee/order rejection)
- [x] T013 [US1] Gateway tests for required-fees + publish-listing in `services/relay-gateway/test/opensea.test.js`: fee normalization from a captured OpenSea fixture, fees-unavailable → 503, publish forwards the exact signed order body, referral attached when configured, `502` surfaces the upstream reason, no double-post on 5xx
- [ ] T014 [US1] Create `frontend/src/hooks/useCollectibleSell.js` — the SellActionState machine for LIST (data-model.md): checking (fetch fees → verify network == item.chainId → verify account can sign) → blocked (fees unavailable FR-009 / account unsupported FR-019) → confirming → signing (EOA `signer.signTypedData`; passkey via `passkeyIntentSigner`) → submitting (`publishListing`) → done/error; race-safe; with tests in `frontend/src/test/collectibles/useCollectibleSell.test.jsx` (fees-block-signing, EOA sign+post, network-switch prompt, error keeps self-submit/act-on-OpenSea path)
- [ ] T015 [US1] Create `frontend/src/components/collectibles/SellConfirm.jsx` + CSS (modeled on `PasskeyConfirm`): price + currency + expiry inputs, the live fee breakdown + **net proceeds** shown before approval (FR-002), below-floor warning (FR-011), the reward disclosure "FairWins may earn a referral reward from the marketplace — costs you nothing" (FR-014), one-time-approval disclosure when required (FR-004), keyboard-operable + accessible
- [ ] T016 [US1] Tests for `SellConfirm.jsx` in `frontend/src/test/collectibles/SellConfirm.test.jsx`: net + fee lines rendered before any approve action, below-floor warning, reward disclosure present and states no cost, no FairWins surcharge line anywhere, approval blocked until fees confirmed, axe pass
- [ ] T017 [US1] Wire Sell into `frontend/src/components/collectibles/CollectibleDetailSheet.jsx`: add a Sell action (opens `SellConfirm` via `useCollectibleSell`), show current listing state ("Listed"/"Not listed"), hidden on unsupported networks (FR-018) and disabled-with-honest-reason for accounts OpenSea can't validate (FR-019); update `CollectiblesPanel.jsx` "display only / no trading" copy (lines ~44-66); if `WalletContext.switchNetwork` only targets `PRIMARY_CHAIN_ID`, add a parametrized switch to `item.chainId` (FR-021)
- [ ] T018 [US1] Detail-sheet + panel action tests in `frontend/src/test/collectibles/CollectibleDetailSheet.test.jsx` (extend) + `CollectiblesPanel.test.jsx` (copy update): Sell affordance present on supported network, absent on unsupported, disabled-with-reason for unsupported account, "Listed" state after listing, wrong-network prompt

**Checkpoint**: MVP shippable — a member can list an owned item with honest disclosure; soft-fails everywhere required

---

## Phase 4: User Story 2 — Accept the best offer (Priority: P2)

**Goal**: a member accepts the best offer with net-to-seller + gas disclosed; sale settles

**Independent Test**: quickstart §3 rows Accept offer / Stale offer — item with a best offer, confirm net + gas disclosed, accept, item transfers and proceeds arrive; a changed offer re-confirms

- [x] T019 [US2] Implement `POST /v1/opensea/:chainId/offers/fulfillment` in `services/relay-gateway/src/opensea/routes.js`: re-read the offer for staleness, `409 offer_changed` when the best offer no longer matches `orderHash` (FR-007), apply `attachReferral`, return `FulfillmentData {to,data,value,orderHash}`
- [x] T020 [US2] Gateway tests for offer-fulfillment in `services/relay-gateway/test/opensea.test.js`: fulfillment DTO from a fixture, `409 offer_changed` on a changed best offer, referral attached, `404 not_found` when the offer is gone
- [ ] T021 [US2] Extend `useCollectibleSell.js` with the ACCEPT flow in `frontend/src/hooks/useCollectibleSell.js`: fetch fulfillment → disclose net-to-seller + gas (FR-006) → submit tx (EOA) or UserOp (passkey; sponsorship decided server-side by tier, FR-023) → done; handle `409 offer_changed` by re-confirming the current offer (FR-007); tests in `frontend/src/test/collectibles/useCollectibleSell.test.jsx` (gas disclosed before approve, stale-offer re-confirm, passkey UserOp path)
- [ ] T022 [US2] Add the Accept-offer action + gas/net confirmation to `frontend/src/components/collectibles/CollectibleDetailSheet.jsx` (reuse the best-offer data already fetched by the 055 detail), with tests in `frontend/src/test/collectibles/CollectibleDetailSheet.test.jsx`: accept shows net-to-seller + on-chain gas disclosure, no offers → no accept action, stale-offer re-confirm surfaced, axe pass

**Checkpoint**: list + accept-offer complete; still no in-app custody

---

## Phase 5: User Story 3 — Cancel a listing (Priority: P3)

**Goal**: a member cancels a listing; free when possible, gas disclosed only when on-chain is required

**Independent Test**: quickstart §3 row Cancel — list then cancel; verify free cancel used when available, gas disclosed only for on-chain, item returns to "Not listed"

- [x] T023 [US3] Implement `POST /v1/opensea/:chainId/listings/cancel` in `services/relay-gateway/src/opensea/routes.js`: prefer OpenSea's off-chain cancel (forward the authorizing signature → `{cancelled:true, method:"offchain"}`); return `{method:"onchain"}` when only an on-chain cancel is possible (FR-008); with gateway tests in `services/relay-gateway/test/opensea.test.js` (offchain path, onchain fallback shape, unknown order)
- [ ] T024 [US3] Extend `useCollectibleSell.js` with the CANCEL flow in `frontend/src/hooks/useCollectibleSell.js`: prefer the free off-chain cancel (sign + `cancelListing`); when `method:"onchain"`, disclose gas and submit the Seaport cancel; item returns to "Not listed"; tests in `frontend/src/test/collectibles/useCollectibleSell.test.jsx` (free path no gas disclosure, on-chain path discloses gas)
- [ ] T025 [US3] Add the Cancel action to `frontend/src/components/collectibles/CollectibleDetailSheet.jsx` (visible only when the item has an active listing by this member), with tests in `frontend/src/test/collectibles/CollectibleDetailSheet.test.jsx`: cancel present on a listed item, free-vs-gas disclosure, returns to "Not listed"

**Checkpoint**: all three stories complete

---

## Phase 6: Polish & Cross-Cutting

- [ ] T026 [P] [US2] [US3] Passkey ERC-1271 signing coverage in `frontend/src/test/collectibles/sellPasskey.test.jsx`: a passkey seller signs a listing over `replaySafeHash(orderHash)` via the injected `passkeyIntentSigner` deps (mock `readContract`/`replaySafeHash` + assertion), and where the account signature can't be validated the action resolves to the honest-unavailable state (FR-019 / SC-009) — never a failed submit
- [ ] T027 [P] Add the `OPENSEA_REFERRAL_ADDRESS` inline env entry to the gateway container in `services/oz-relayer/deploy/production/service.yaml` (public value, not a secret; alongside `PAYMASTER_ADDRESS_137`) and bump the gateway image tag past `collectibles-055`
- [ ] T028 [P] Update `docs/runbooks/relayer-operations.md`: document the `/v1/opensea/*` write routes, the referral beneficiary provisioning/rotation (public address), write quotas, and the "attribution off when unset" safe default
- [ ] T029 Run quickstart §1 + §5 gates: full `services/relay-gateway` suite, full `frontend` suite (`--maxWorkers=2` to avoid OOM), and `npm run lint` (frontend) — all green; fix fallout
- [ ] T030 Grep-audit per quickstart §4: no marketplace credential in `frontend/` source or `dist/`; the wallet is the only signer on the sell path (no gateway signing key in the write routes); `OPENSEA_REFERRAL_ADDRESS` only in config/manifest, never a secret

## Dependencies & Execution Order

- **Phase 1 → Phase 2 → (Phase 3 → Phase 4 → Phase 5) → Phase 6**
- US1 is the MVP and the only story that must land first (it establishes fees + order build/sign + publish). US2 and US3 each add one gateway route + one hook flow + one sheet action and are otherwise independent of each other.
- Within Phase 2, T004/T005/T006 (gateway) and T009/T010/T011 (frontend) are disjoint files — parallelizable; T007–T008 depend on T004–T006.
- The passkey path (T026) depends on US1's signing flow (T014) and reuses US2's UserOp submit (T021); grouped in polish so it can be verified end-to-end once EOA flows exist.

**Parallel examples**: T001+T002+T003 | T004+T005+T006 then T007 | T009+T010+T011 | T012–T013 (gateway) alongside T014–T018 (frontend, against the mocked client) | T027+T028

## Implementation Strategy

Ship US1 (list) as the MVP checkpoint — it carries the fee-disclosure, order-build/sign, and publish machinery the other stories reuse. Layer US2 (accept) and US3 (cancel) as independent increments, then the polish phase adds passkey end-to-end coverage, deploy wiring, runbook, and the security/regression gates. Every task's test lands in the same phase as its behavior (constitution II). Passkey selling stays behind the honest-unavailable fallback until validated end-to-end (FR-019).
