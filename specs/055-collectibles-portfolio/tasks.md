# Tasks: Collectibles Portfolio (Read-Only NFT Display)

**Input**: Design documents from `/specs/055-collectibles-portfolio/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/gateway-opensea-api.md, quickstart.md

**Tests**: INCLUDED — constitution principle II (test-first) is non-negotiable; every behavior task pairs with a test task in the same phase.

**Organization**: Grouped by user story so each story is an independently testable increment. US1 alone is a shippable MVP.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US1 (grid/tab), US2 (detail + deep link), US3 (portfolio line)

## Phase 1: Setup (Shared Configuration)

**Purpose**: config surface both sides need; no behavior yet

- [x] T001 Add `opensea` config block (apiKey, baseUrl, timeoutMs, cacheTtlMs, statsCacheTtlMs, quotaPerAddress, quotaGlobal — per research D12 defaults) to `services/relay-gateway/src/config/index.js`, optional/fail-closed like the paymaster block, documented in the file header comment
- [x] T002 [P] Document `OPENSEA_*` env vars in `services/relay-gateway/.env.example` and the README env table in `services/relay-gateway/README.md`
- [ ] T003 [P] Add `collectibles` capability flag to `frontend/src/config/networks.js` (`true` only for chainId 1 and 137, exposed via each network's `capabilities` getter)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: gateway plumbing every endpoint shares + the frontend client scaffold

**⚠️ CRITICAL**: complete before any user story phase

- [x] T004 [P] Create OpenSea upstream client in `services/relay-gateway/src/opensea/client.js` mirroring `src/engine/client.js`: base-URL normalization, `X-API-KEY` header, AbortController timeout, bounded retries, injectable `fetchImpl`
- [x] T005 [P] Create keyed TTL + single-flight + serve-stale cache in `services/relay-gateway/src/opensea/cache.js` (generalizes the server.js health-cache pattern; bounded size with oldest-entry eviction; returns `{value, fetchedAt, stale}`)
- [x] T006 [P] Create `services/relay-gateway/src/opensea/normalize.js` with chain-slug mapping (1→ethereum, 137→matic, else null), param validators (address, identifier, slug per contract doc), and DTO normalizers for CollectibleItem per data-model.md (name fallback `#<identifier>`, `isFlagged = is_disabled || is_nsfw`, `openseaUrl` construction, invalid-item drop)
- [x] T007 Create route-group skeleton in `services/relay-gateway/src/opensea/routes.js` (factory receiving `{config, cache, client, quotas, killSwitch}`; killswitch check → fail-closed `collectibles_unconfigured` 503 → param validation → quota check → cache/fetch pipeline; error envelope per contract doc) and register it with a third `createQuotas` instance (`osQuotas`) in `services/relay-gateway/src/server.js` after the origin-lock middleware
- [x] T008 Unit tests for foundations in `services/relay-gateway/test/opensea.test.js`: chain mapping, validators, cache TTL/single-flight/serve-stale/eviction, client header+timeout+retry (mock `fetchImpl`), and route-group cross-cutting behavior (origin-lock 403, killswitch 503, missing-key 503, quota 429 with Retry-After per-address and global)
- [ ] T009 [P] Create frontend gateway client scaffold in `frontend/src/lib/collectibles/gatewayClient.js`: `VITE_RELAYER_URL` base (null factory when unset → feature hidden), bounded fetch with 10s timeout, `CollectiblesUnavailable` error mapping, single 429 retry after `Retry-After`
- [ ] T010 [P] Add `collectiblesAvailable(chainId)` helper (capability flag && gateway configured) in `frontend/src/lib/collectibles/gatewayClient.js` (or `frontend/src/config/networkCapabilities.js` if a config-side home fits better) with unit test in `frontend/src/test/collectibles/availability.test.js`

**Checkpoint**: gateway responds on `/v1/opensea/*` with correct errors; no data endpoints yet

---

## Phase 3: User Story 1 — See my collectibles in the Finance section (Priority: P1) 🎯 MVP

**Goal**: Collectibles tab in Finance shows the connected wallet's owned NFTs (grid: image/name/collection) on Ethereum + Polygon; empty/degraded states; hidden elsewhere

**Independent Test**: quickstart §3 rows 1–3 + §2 list smoke — connect an NFT-holding Polygon wallet → grid renders; empty wallet → empty state; Mordor → tab absent

- [x] T011 [US1] Implement `GET /v1/opensea/:chainId/account/:address/nfts` (cursor passthrough, page size 50, cache key `nfts:{chainId}:{address}:{next}`, quota key address, AccountCollectiblesPage envelope) in `services/relay-gateway/src/opensea/routes.js` + list normalizer in `normalize.js`
- [x] T012 [US1] Gateway tests for the list endpoint in `services/relay-gateway/test/opensea.test.js`: DTO normalization from a captured OpenSea v2 fixture, pagination cursor, cache hit (2 calls → 1 upstream), stale serve on upstream 5xx, unsupported chain 404, invalid address 400
- [ ] T013 [US1] Add `fetchAccountCollectibles(chainId, address, next)` to `frontend/src/lib/collectibles/gatewayClient.js` with test in `frontend/src/test/collectibles/gatewayClient.test.js` (fetch mocked: success, 429 retry, unavailable mapping)
- [ ] T014 [US1] Create `useCollectibles(chainId, address)` hook in `frontend/src/hooks/useCollectibles.js` per data-model state machine (idle/loading/ready/empty/degraded, `supported:false` short-circuit, race-safe request ids, full reset on chain/account switch, `loadMore` for cursor pages, `refresh`) with tests in `frontend/src/test/collectibles/useCollectibles.test.jsx`
- [ ] T015 [US1] Create `frontend/src/components/collectibles/CollectiblesPanel.jsx` + `CollectiblesPanel.css`: responsive card grid (lazy `<img>` with placeholder fallback + accessible names), owned-quantity badge for multi-copy items, hidden-items toggle for `isFlagged` (FR-012), `EmptyState` reuse with OpenSea explore link, degraded/stale banner (FR-008/FR-013), progressive `loadMore` on scroll/button (SC-007), connect-wallet prompt when disconnected
- [ ] T016 [US1] Panel tests in `frontend/src/test/collectibles/CollectiblesPanel.test.jsx`: grid render from mocked hook, empty state, degraded state, flagged-item toggle, quantity badge, image-error placeholder, axe pass (vitest-axe)
- [ ] T017 [US1] Wire the tab: add `{ id: 'collectibles', label: 'Collectibles' }` to `WALLET_TABS` + import + conditional panel block + unsupported-chain fallback to default tab in `frontend/src/pages/WalletPage.jsx`; add Finance-group nav item + chain-aware `visibleNavGroups(chainId)` filter in `frontend/src/config/appNav.js`; apply the filter in the nav consumers (`frontend/src/components/nav/AppNavDrawer.jsx`, `frontend/src/components/nav/SectionIconNav.jsx`, `frontend/src/components/ui/PortalNav.jsx`) with an icon in `frontend/src/components/nav/NavIcon.jsx`
- [ ] T018 [US1] Navigation/deep-link tests: `?tab=collectibles` renders panel on supported chain and falls back on unsupported chain in `frontend/src/test/WalletPage.test.jsx`; nav visibility filter cases in `frontend/src/test/collectibles/navVisibility.test.jsx` (and update `frontend/src/test/AppNavDrawer.test.jsx` / `SectionIconNav.test.jsx` / `PortalNav.test.jsx` if their snapshots enumerate Finance items)

**Checkpoint**: MVP shippable — grid works end-to-end, soft-fails everywhere required

---

## Phase 4: User Story 2 — Inspect an item and trade it on OpenSea (Priority: P2)

**Goal**: detail sheet (traits, floor, best offer with honest "none yet" states) + "View on OpenSea" deep link; strictly read-only

**Independent Test**: quickstart §3 rows 4–5 — tap item → sheet renders; deep link opens exact item page; no trading affordances in-app

- [x] T019 [US2] Implement composed `GET /v1/opensea/:chainId/contract/:contract/nfts/:identifier` (concurrent item + collection + stats + best-offer legs; floor/offer legs degrade to null on failure; cache key `item:{chainId}:{contract}:{identifier}`) in `services/relay-gateway/src/opensea/routes.js` + detail/collection/PriceQuote normalizers in `normalize.js`
- [x] T020 [US2] Gateway tests for the detail endpoint in `services/relay-gateway/test/opensea.test.js`: full composition fixture, null floor/offer degradation when a leg 5xxs, invalid identifier 400, cache behavior
- [ ] T021 [US2] Add `fetchCollectibleDetail(chainId, contract, identifier)` to `frontend/src/lib/collectibles/gatewayClient.js` + test coverage in `frontend/src/test/collectibles/gatewayClient.test.js`
- [ ] T022 [US2] Create `frontend/src/components/collectibles/CollectibleDetailSheet.jsx` + CSS cloning `AssetDetailSheet.jsx` scaffolding (backdrop, role=dialog, Escape/backdrop close, scroll lock, focus save/restore): large image, traits list, floor price + best offer with explicit "none yet"/"unavailable" states and currency labels (FR-003/FR-013), "View on OpenSea" anchor (`target="_blank" rel="noopener noreferrer"`, correct per-chain URL), no trade/transfer affordances (FR-005); open from grid cards with `aria-haspopup="dialog"`
- [ ] T023 [US2] Sheet tests in `frontend/src/test/collectibles/CollectibleDetailSheet.test.jsx`: traits/floor/offer render, "none yet" states, deep-link href exactness (ethereum vs matic slugs), Escape + focus restore, absence of trading affordances, axe pass

**Checkpoint**: detail + deep link complete; still read-only everywhere

---

## Phase 5: User Story 3 — Collectible value appears in my portfolio (Priority: P3)

**Goal**: labeled floor-estimate line in Portfolio (outside `totalUsd`), navigating to the tab

**Independent Test**: quickstart §3 row 6 — Portfolio shows "Collectibles (floor estimate)" for an NFT-holding wallet; absent on unsupported networks; stale/unavailable state on outage

- [x] T024 [US3] Implement `GET /v1/opensea/collections/:slug/stats` (cache key `stats:{slug}`, TTL 300s) in `services/relay-gateway/src/opensea/routes.js` + gateway tests (fixture, invalid slug 400, cache TTL difference) in `services/relay-gateway/test/opensea.test.js`
- [ ] T025 [US3] Add `fetchCollectionStats(slug)` to `frontend/src/lib/collectibles/gatewayClient.js`; create `frontend/src/lib/collectibles/valuation.js` computing CollectiblesValuation per data-model (floor × quantity over priced collections, USD conversion via existing `frontend/src/lib/portfolio/prices.js` sources, pricedItems/unpricedItems counts, `truncated` at a bounded collection scan, stale propagation) with tests in `frontend/src/test/collectibles/valuation.test.js`
- [ ] T026 [US3] Extend `useCollectibles` (or add `useCollectiblesValuation`) in `frontend/src/hooks/useCollectibles.js` to expose the valuation aggregate without triggering fetches on unsupported chains
- [ ] T027 [US3] Add the estimate line to `frontend/src/components/wallet/PortfolioPanel.jsx`: "Collectibles (floor estimate)" row alongside token balances, explicitly excluded from the `totalUsd` headline, label stating "floor-price estimate, priced items only" (+ truncation note when `truncated`), `SensitiveValue` wrapping, stale/unavailable state that never blocks token rendering, row navigates to `/wallet?tab=collectibles`, absent when `collectiblesAvailable(chainId)` is false
- [ ] T028 [US3] Portfolio-line tests in `frontend/src/test/portfolio/collectiblesLine.test.jsx`: presence/labeling for priced wallet, exclusion from headline total, unpriced-only wallet, absent on unsupported chain, degraded state, navigation target

**Checkpoint**: all three stories complete

---

## Phase 6: Polish & Cross-Cutting

- [ ] T029 [P] Add OpenSea key provisioning/rotation + quota/killswitch notes for the new route group to `docs/runbooks/relayer-operations.md`
- [ ] T030 [P] Verify CI runs `services/relay-gateway` tests; if not, wire them into the existing test workflow in `.github/workflows/` without any `continue-on-error` (constitution IV)
- [ ] T031 Run quickstart §1 + §5 gates: full `services/relay-gateway` suite, full `frontend` suite, `npm run lint` (frontend) — all green; fix fallout
- [ ] T032 Grep-audit per quickstart §4: no `OPENSEA_API_KEY` outside `.env.example`/specs/docs, no OpenSea key material reachable from `frontend/` source or build

## Dependencies & Execution Order

- **Phase 1 → Phase 2 → (Phase 3 → Phase 4 → Phase 5) → Phase 6**
- US2 depends on US1 only for the grid entry point (the sheet opens from cards); its gateway endpoint (T019–T020) is independent and can start once Phase 2 lands
- US3's gateway endpoint (T024) is independent; its UI (T027) touches `PortfolioPanel.jsx` only — no overlap with US1/US2 files except `useCollectibles.js` (T026 after T014)
- Within phases, [P] tasks touch disjoint files and can run in parallel

**Parallel examples**: T001+T002+T003 | T004+T005+T006 then T007 | T011–T012 (gateway) alongside T013–T016 (frontend, against mocked client) | T019–T020 alongside T022–T023

## Implementation Strategy

Ship US1 as the MVP checkpoint (tab + grid + soft-fails); layer US2 then US3 as
independent increments; finish with polish gates. Every task's test lands in the
same phase as its behavior (constitution II).
