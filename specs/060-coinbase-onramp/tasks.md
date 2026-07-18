# Tasks: Buy Crypto — Coinbase Onramp from the Wallet Sheet

**Input**: Design documents from `specs/060-coinbase-onramp/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/gateway-api.md, quickstart.md

**Tests**: Included — the constitution (principle II) makes tests non-optional:
behavior is not "done" until tests prove it. Gateway tests use Vitest +
supertest with the Coinbase upstream mocked (test scope only); frontend tests
use Vitest + Testing Library.

**Organization**: Tasks are grouped by user story so each story is
independently implementable and testable.

## Phase 1: Setup

**Purpose**: Dependency + config scaffolding both stories build on

- [X] T001 Add `@coinbase/cdp-sdk` to `services/relay-gateway/package.json` dependencies and install (gateway-only; no frontend deps)
- [X] T002 Add the `onramp` config block (env table from data-model.md: `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, `ONRAMP_API_BASE_URL`, `ONRAMP_HOSTED_BASE_URL`, `ONRAMP_TIMEOUT_MS`, `ONRAMP_RETRIES`, `ONRAMP_OPTIONS_CACHE_TTL_MS`, `ONRAMP_QUOTA_*`, `ONRAMP_DEFAULT_ASSET`) to `loadConfig()` in `services/relay-gateway/src/config/index.js`, documented in the header comment like the opensea/polymarket blocks
- [X] T003 [P] Document `CDP_API_KEY_ID` / `CDP_API_KEY_SECRET` in `services/relay-gateway/.env.example` (values blank; constitution key-management rule)

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: Chain mapping + CDP client every route depends on

- [X] T004 [P] Create the chainId → Coinbase network-slug map (`137 → polygon`, `1 → ethereum`; everything else unmapped) with `slugForChain(chainId)` in `services/relay-gateway/src/onramp/chains.js`
- [X] T005 Create the CDP Onramp API client in `services/relay-gateway/src/onramp/client.js`: JWT bearer via `@coinbase/cdp-sdk` auth helper, `fetchBuyOptions(country?)` (timeout + retries + in-memory cache per `optionsCacheTtlMs`, stale-if-error), `createSessionToken({ address, slug, asset })` (never retried, token never logged), upstream failures normalized to `upstream_error`
- [X] T006 Add the `onramp` capability to `frontend/src/config/networks.js`: `ONRAMP_CHAIN_IDS = new Set([137, 1])` and `onramp: ONRAMP_CHAIN_IDS.has(this.chainId)` in every network's `capabilities` getter (testnets/ETC family therefore false)

**Checkpoint**: Config loads with and without CDP creds; slug map + client unit-testable

## Phase 3: User Story 1 — Buy crypto from the wallet bottom sheet (P1) 🎯 MVP

**Goal**: Avatar → wallet sheet → Buy → disclosure modal (asset/network/destination) → Coinbase hosted flow → funds arrive at the member's own address

**Independent Test**: quickstart.md "Manual validation" steps 1–5 (Buy renders on Polygon, modal discloses USDC/Polygon/address, Continue opens a `pay.coinbase.com` URL carrying the session token, abandon leaves no state)

- [X] T007 [P] [US1] Gateway route tests in `services/relay-gateway/test/onramp/routes.test.js`: POST `/v1/onramp/session` happy path returns `{ url }` with `sessionToken`+`defaultNetwork`+`defaultAsset` (Coinbase upstream mocked); validation order per contracts/gateway-api.md (`invalid_address` 400, `unsupported_chain` 400, `unsupported_asset` 400, `screened` 403, screen-outage 503 fail-closed, `quota_exceeded` 429, killswitch 503); GET `/v1/onramp/options` returns availability/assets and serves stale cache on upstream 5xx
- [X] T008 [US1] Implement `GET /v1/onramp/options` and `POST /v1/onramp/session` in `services/relay-gateway/src/onramp/routes.js`: contracts/gateway-api.md validation order, shared sanctions-guard screen of the destination (fail closed on screen error), per-address + global mint quotas, killswitch + origin-lock/CORS behavior identical to the polymarket module, hosted URL assembly from `hostedBaseUrl`
- [X] T009 [US1] Mount the onramp routes in `services/relay-gateway/src/server.js` gated like the other optional provider modules (creds absent ⇒ 503 `onramp_unconfigured`, boot unaffected)
- [X] T010 [P] [US1] Frontend client tests in `frontend/src/test/onramp/onrampClient.test.js`: `onrampAvailable()` false when `VITE_RELAYER_URL` unset or capability off; `fetchOnrampOptions`/`createOnrampSession` success + every error mapped to `OnrampUnavailable` with code
- [X] T011 [US1] Implement the gateway client in `frontend/src/lib/onramp/onrampClient.js` mirroring `predictClient.js`: `onrampGatewayUrl()`, `onrampAvailable(chainId)`, `fetchOnrampOptions(chainId)`, `createOnrampSession({ address, chainId, asset })`, `OnrampUnavailable`
- [X] T012 [P] [US1] Modal tests in `frontend/src/test/onramp/BuyCryptoModal.test.jsx`: renders full destination address, network name, USDC default + asset choices from options; custody/fee disclosure text present; Continue mints then `window.open`s the returned URL; mint failure renders the honest unavailable state; popup-blocked fallback link shown; Escape/backdrop close restores focus
- [X] T013 [US1] Implement `frontend/src/components/wallet/BuyCryptoModal.jsx` + `BuyCryptoModal.css`: pre-handoff disclosure (asset selector defaulting per options, network, full destination address, "Payment, identity checks and fees are Coinbase's — FairWins adds no fee and never holds your funds"), phase state `idle → minting → opened | error`, `window.open` from the user gesture with visible-link fallback, repo modal a11y idiom (role=dialog, aria-labelledby, focus trap/restore, Escape)
- [X] T014 [US1] Add the gated **Buy** button to the wallet sheet in `frontend/src/components/wallet/WalletButton.jsx` (header area beside the balance/QR) + styles in `frontend/src/components/wallet/WalletButton.css`: renders only when `onrampAvailable(activeChainId)` AND the options fetch confirms the chain; destination = the active acting identity's address (vault-aware, `useActiveAccount`); opens `BuyCryptoModal`; sheet is byte-identical to today when unavailable
- [X] T015 [US1] WalletButton gating tests in `frontend/src/test/onramp/WalletButtonBuy.test.jsx`: Buy present on Polygon with gateway configured; absent when gateway unconfigured, on testnet (80002), and on unsupported networks (61/63); destination passed to the modal matches the displayed sheet address

**Checkpoint**: Full P1 journey demonstrable per quickstart.md — MVP done

## Phase 4: User Story 2 — Honest availability (P2)

**Goal**: The Buy action never renders where the flow cannot genuinely start; config-off leaves zero residual UI

**Independent Test**: quickstart.md automated cases + manual step 6 (config-off ⇒ sheet identical to pre-feature; testnet ⇒ hidden; delisted asset ⇒ declined at handoff)

- [X] T016 [P] [US2] Gateway availability tests in `services/relay-gateway/test/onramp/availability.test.js`: no CDP creds ⇒ both routes 503 `onramp_unconfigured` and boot unaffected; unmapped chains 400 `unsupported_chain`; Buy Options listing missing the network ⇒ `available: false` with empty assets; live re-validation at mint time rejects an asset that dropped from options (`unsupported_asset`)
- [X] T017 [US2] Harden live re-validation in `services/relay-gateway/src/onramp/routes.js`: session mint re-checks options (cache-bypassing on mismatch) so delisting between render and tap declines gracefully rather than minting a dead session
- [X] T018 [P] [US2] Frontend degraded-state tests in `frontend/src/test/onramp/availability.test.jsx`: options `available: false` ⇒ Buy hidden; options fetch failure ⇒ Buy hidden (never a dead button); mid-sheet network switch re-evaluates availability before handoff (spec edge case)
- [X] T019 [US2] Implement the frontend availability behaviors from T018 in `frontend/src/components/wallet/WalletButton.jsx` and `frontend/src/components/wallet/BuyCryptoModal.jsx`: hide-until-confirmed, re-check active chain at Continue, honest unavailable message when Coinbase declines (no reason stored)

**Checkpoint**: All spec US2 acceptance scenarios green

## Phase 5: User Story 3 — Honest settlement (P3)

**Goal**: No fake finality — purchased funds appear only via real chain reads

**Independent Test**: quickstart.md manual step 4's settlement observation

- [X] T020 [US3] Add a settlement-honesty assertion to `frontend/src/test/onramp/BuyCryptoModal.test.jsx`: after "opened", the modal/sheet shows no synthetic pending-balance or success claim — copy states delivery is on Coinbase's timeline and the balance updates when funds arrive; verify no portfolio/balance state is mutated by the onramp path (grep-level: onramp lib/components never import balance stores)

**Checkpoint**: Spec US3 satisfied (default truthful path, guarded by test)

## Phase 6: Polish & Cross-Cutting

- [X] T021 [P] Write `docs/developer-guide/buy-crypto-onramp.md`: architecture (hosted URL + session token), env/config table, availability layers, removal procedure (config-off now, delete-module later), explicitly noting the no-Trade-integration and no-FairWins-fee decisions
- [X] T022 [P] Add the CLAUDE.md guardrail bullet for spec 060 (optional wallet-sheet-only onramp, no Trade integration, config-off ⇒ zero UI, gateway-only secrets) in `CLAUDE.md`
- [X] T023 Run full verification: `cd services/relay-gateway && npx vitest run`, `npm run test:frontend`, and frontend lint/build; fix any regressions (constitution IV — no skipped/continue-on-error)

## Dependencies

- Phase 1 → Phase 2 → Phase 3 (US1) → Phase 4 (US2) → Phase 5 (US3) → Phase 6
- US2 layers onto US1's routes/components (T017 edits T008's file; T019 edits T013/T014's files) — sequential by design
- US3 is test-only hardening on US1's surfaces
- Within phases, [P] tasks touch disjoint files and may run in parallel

## Parallel Example (Phase 3)

```
# After T004–T006:
T007 (gateway tests) ∥ T010 (client tests) ∥ T012 (modal tests)   # disjoint test files
then T008 → T009 (same module), T011 → T013 → T014 → T015
```

## Implementation Strategy

MVP = Phases 1–3 (US1): a working, honestly-gated Buy path on Polygon.
Phases 4–5 harden the gating and settlement honesty; Phase 6 documents and
verifies. Each checkpoint leaves the app shippable; stopping after any phase
never strands UI (the availability gate hides anything unfinished-server-side).
