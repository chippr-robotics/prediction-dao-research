# Tasks: Bitcoin Transactions

**Input**: Design documents from `/specs/061-bitcoin-transactions/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: INCLUDED — constitution principle II (test-first) is non-negotiable; every
behavior task pairs with its Vitest/node-test suite in the same story phase.

**Organization**: Grouped by user story (US1 receive/rotation, US2 portfolio,
US3 send, US4 stamps, US5 capability honesty) so each is independently
implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US5 per spec.md

## Phase 1: Setup

**Purpose**: Dependencies and config skeletons every story builds on

- [x] T001 Add pinned `@scure/btc-signer` + `@scure/bip32` to `frontend/package.json` (exact versions, lockfile updated; no other dep churn)
- [x] T002 [P] Add the `BTC_*` env block (per `contracts/bitcoin-gateway-api.md`) to `services/relay-gateway/src/config/index.js` with fail-loud validation (clamps sane, URLs well-formed when `BTC_ENABLED=true`) and document every var in `services/relay-gateway/.env.example`
- [x] T003 [P] Create `frontend/src/config/bitcoinNetworks.js` implementing `contracts/network-registry.md` exactly (`BITCOIN_NETWORKS`, `BITCOIN_TESTNET_MAINNET_PAIR`, `isBitcoinNetworkId`, `getBitcoinNetwork`), with unit tests in `frontend/src/config/__tests__/bitcoinNetworks.test.js`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Key derivation, address codecs, and the gateway data plane — no story works without them

**⚠️ CRITICAL**: Complete before any user-story phase

- [x] T004 Implement `frontend/src/lib/bitcoin/derivation.js` per `contracts/key-derivation-btc.md`: `deriveBtcRoot(masterSeed)` (HKDF-SHA256, info `fairwins-btc-seed-v1`, 64B), account nodes m/84'/{coin}'/0' and m/86'/{coin}'/0', `receiveKey(acct, i)`, memory-only invariants (no persistence/logging of secrets)
- [x] T005 Vitest suite `frontend/src/lib/bitcoin/__tests__/derivation.test.js`: BIP32/84/86 published reference vectors, pinned FairWins test-seed vectors (first 3 addresses per type × network), domain-separation check (KEK path ≠ btc path), determinism across two derivations
- [x] T006 [P] Implement `frontend/src/lib/bitcoin/addresses.js`: encode P2WPKH (bech32) + P2TR (bech32m, BIP-341 tweaked) from pubkeys; `classifyAddress(str, networkId)` accepting P2PKH/P2SH/bech32 v0/bech32m v1 with specific rejection reasons (checksum, wrong network hrp, EVM `0x`, unknown witness version); BIP-21 `bitcoin:` URI parse/format with amount
- [x] T007 [P] Vitest suite `frontend/src/lib/bitcoin/__tests__/addresses.test.js`: accept/reject matrix incl. mainnet↔testnet cross-rejection, checksum mutations, BIP-21 round-trips, BIP-350 bech32m vectors
- [x] T008 Implement gateway module `services/relay-gateway/src/bitcoin/{client.js,normalize.js,cache.js,routes.js}` per `contracts/bitcoin-gateway-api.md`: Esplora + Stamps upstream fetchers (timeout/retry), DTO normalization, per-endpoint TTL caches, `createBitcoinRouter(config)` with killswitch → validation → quotas → cache → fetch; wire into `services/relay-gateway/src/server.js` behind `BTC_ENABLED`
- [x] T009 Gateway tests `services/relay-gateway/test/bitcoin.test.js` (mocked upstreams): route contracts (shapes above), 503 when disabled/killswitched, 400 invalid address/hex, 429 quota, 502 upstream-down, degraded stamps flag, cache TTL behavior, boot fail-loud on malformed config
- [x] T010 [P] Implement `frontend/src/lib/bitcoin/gatewayClient.js`: thin fetch client for the five `/v1/bitcoin/*` endpoints (batching ≤50 addresses, error taxonomy → typed results incl. `stale`/`degraded`), base URL from existing gateway config source; tests in `frontend/src/lib/bitcoin/__tests__/gatewayClient.test.js`

**Checkpoint**: keys derive deterministically, addresses encode/validate, gateway serves testnet data

---

## Phase 3: User Story 1 — Receive with rotating addresses (P1) 🎯 MVP

**Goal**: Fresh never-reused receive addresses (segwit default / taproot opt-in), QR + BIP-21, all issued addresses recoverable and monitored

**Independent Test**: quickstart.md §3.1 + §3.6 (receive, rotate, fund old address, recover on clean profile)

- [x] T011 [US1] Implement `frontend/src/lib/bitcoin/wallet.js`: issued-address ledger + rotation cursor per (network, type) with never-decreasing invariant; gap-limit-20 discovery scan over `gatewayClient` rebuilding ledger/cursor on unlock (research R5); client persistence via the existing wallet-preference storage
- [x] T012 [US1] Vitest suite `frontend/src/lib/bitcoin/__tests__/wallet.test.js`: rotation never repeats, cursor never decreases (stale cache vs discovery), discovery finds funds at index gaps ≤20, ahead-of-cursor deposits detected, testnet/mainnet ledgers isolated
- [x] T013 [US1] Implement `frontend/src/hooks/useBitcoinWallet.js` (unlock/receive portion): wallet status (`unavailable/locked/ready`) from spec-041 capability + `initMasterSeed`/`unwrapMasterSeed` ceremony, `nextReceiveAddress()`, preferred-type get/set, discovery-on-unlock
- [x] T014 [US1] Extend `frontend/src/components/ui/AddressQRModal.jsx` with a Bitcoin mode: fresh address display (text/QR/share as BIP-21), "new address" affordance, segwit/taproot type toggle (persisted), explicit Bitcoin + testnet/mainnet labeling distinct from the EVM address view, honest unavailable state for non-PRF/injected accounts
- [x] T015 [US1] Component tests `frontend/src/components/ui/__tests__/AddressQRModal.bitcoin.test.jsx`: rotation on reopen, type toggle changes prefix (bc1q/bc1p), BIP-21 payload in QR, unavailable-state rendering, a11y roles/labels

**Checkpoint**: MVP — members can receive BTC with rotation and recover addresses on a new device

---

## Phase 4: User Story 2 — Bitcoin in the portfolio (P1)

**Goal**: One aggregated Bitcoin row (native + WBTC), USD-priced, pending/confirmed split, stale-not-zero degradation

**Independent Test**: quickstart.md §3.2 (multi-address sum, pending flip, gateway-down staleness)

- [x] T016 [P] [US2] Add the native-Bitcoin instance to `frontend/src/config/assetTaxonomy.js` under the `BTC` baseline (kind `btc-native`, network ids from `bitcoinNetworks.js`, `UNDERLYING_META.BTC.homeNetwork = 'bitcoin'`) without disturbing EVM registry shapes; update taxonomy tests
- [x] T017 [US2] Implement balance folding in `frontend/src/lib/bitcoin/wallet.js` (or `balances.js` if cleaner): UTXO set → `{confirmedSats, pendingSats, protectedSats, spendableSats, stale}` per data-model.md rules
- [x] T018 [US2] Vitest suite `frontend/src/lib/bitcoin/__tests__/balances.test.js`: pending vs confirmed math (inbound/outbound mempool), protected exclusion, stale flag on gateway failure, empty wallet
- [x] T019 [US2] Add the bitcoin balance source branch to `frontend/src/hooks/usePortfolio.js`: non-EVM source keyed by `isBitcoinNetworkId`, feeding aggregation so native BTC + WBTC roll up under one Bitcoin row; BTC/USD from the existing `BTC` price feed path; stale renders stale, never zero; zero-BTC accounts render exactly as before (SC-008)
- [x] T020 [US2] Tests for the portfolio integration in `frontend/src/hooks/__tests__/usePortfolio.bitcoin.test.js`: aggregation with/without WBTC, price application, stale path, wallet-unavailable path (no bitcoin row, no errors), EVM-only regression snapshot

**Checkpoint**: receive + verify loop closed inside the product

---

## Phase 5: User Story 3 — Send to any valid address (P2)

**Goal**: Pay legacy/P2SH/bech32/bech32m destinations with honest fee quotes, MAX, dust handling, pending tracking, concurrency locks

**Independent Test**: quickstart.md §3.3 (four destination types on testnet4, fee ≤ quote, rejection matrix)

- [x] T021 [P] [US3] Implement `frontend/src/lib/bitcoin/coinSelection.js`: spendable-only accumulative selection with change, deterministic vsize estimation (P2WPKH/P2TR inputs, all output types), fee = rate × vsize, MAX net of fees, sub-dust change folded into fee (546/330 thresholds), in-flight coin locks
- [x] T022 [P] [US3] Vitest suite `frontend/src/lib/bitcoin/__tests__/coinSelection.test.js`: property-style checks — never selects protected/unverified/locked/unconfirmed coins, MAX leaves zero remainder, no dust outputs ever produced, shortfall reported with amounts, vsize estimates within known bounds for fixture txs
- [x] T023 [US3] Implement `frontend/src/lib/bitcoin/psbt.js`: PSBT build + sign via `@scure/btc-signer` (P2WPKH + P2TR key-path inputs, RBF sequence 0xfffffffd, any standard output type), returning raw hex + actual fee; refuse to sign if actual fee > pinned quote (FR-012)
- [x] T024 [US3] Vitest suite `frontend/src/lib/bitcoin/__tests__/psbt.test.js`: fixture-seed signed-tx vectors decode correctly (input/output scripts, witness types, sequence), fee-overrun refusal, mixed-input (segwit+taproot) transaction
- [x] T025 [US3] Extend `frontend/src/hooks/useBitcoinWallet.js` with the send pipeline: fee-quote fetch/pin with 60s freshness + re-confirm on drift, selection → psbt → broadcast via gateway, pending tracking (`tx/:txid` polling with backoff), coin locking across concurrent sends, activity entries
- [x] T026 [US3] Add Bitcoin destination support to `frontend/src/components/ui/AddressInput.jsx` (validation path via `classifyAddress` with per-reason messages, recognized-type display) and `bitcoin:` URI handling to `frontend/src/components/ui/QRScanner.jsx` + `frontend/src/lib/addressBook/scanAddress.js`; tests in the components' existing test files
- [x] T027 [US3] Extend `frontend/src/components/wallet/TransferForm.jsx` with the BTC asset path: separate `useBitcoinWallet.send` pipeline (never `useTransfer` EVM routing), preview step showing amount, destination + type, fee line in BTC + USD, total debit, explicit "you pay the Bitcoin network fee" (never gasless wording), MAX, shortfall explanation, pending state after submit
- [x] T028 [US3] Component tests `frontend/src/components/wallet/__tests__/TransferForm.bitcoin.test.jsx`: full preview disclosure assertions, rejection matrix surfaces reasons, quote-drift forces re-confirm, EVM asset flows untouched (regression)

**Checkpoint**: full money loop — receive, hold, verify, send

---

## Phase 6: User Story 4 — Stamps recognized and protected (P3)

**Goal**: Stamps visible in collectibles; stamps-bearing and unverified coins never spent; degraded recognition fails safe

**Independent Test**: quickstart.md §3.4 (stamp shown, MAX never consumes it, degraded banner)

- [x] T029 [US4] Implement stamps classification in `frontend/src/lib/bitcoin/wallet.js`/`coinSelection.js`: merge gateway stamps DTOs onto the UTXO set (`stampId`, `protected`), `degraded ⇒ unverified ⇒ protected` fail-safe, bare-multisig heuristic belt-and-braces, protectedSats accounting
- [x] T030 [US4] Vitest suite `frontend/src/lib/bitcoin/__tests__/stamps.test.js`: stamp coins excluded at every selection path incl. MAX, degraded flag protects all unverified coins with honest reason, recovery of spendability after indexer returns, only-stamps wallet blocks sends with explanation
- [x] T031 [US4] Add the Bitcoin Stamps section to the collectibles surface (spec-055 section pattern, `collect: 'stamps-only'` capability): stamp cards with image/id, "protected" badge and total-vs-spendable explainer link in the portfolio detail; component tests alongside the existing collectibles tests
- [x] T032 [US4] Add the degraded-recognition banner + protected-balance explainer to the send flow in `frontend/src/components/wallet/TransferForm.jsx` (test additions in the US3 test file)

**Checkpoint**: stamps safe by construction

---

## Phase 7: User Story 5 — Honest capability disclosure (P3)

**Goal**: Bitcoin appears exactly where supported, absent or honestly-off everywhere else

**Independent Test**: quickstart.md §3.5 (network tab truthfulness, no BTC in wager/pool/membership flows, no gasless wording, unavailable states)

- [x] T033 [P] [US5] Render Bitcoin (and testnet pair) as display-only rows in the Network tab / capabilities surface from `BITCOIN_NETWORKS.capabilities` (no switch-wallet affordance), including the wallet-availability reason (PRF/passkey matrix from `contracts/key-derivation-btc.md`); tests with the existing capabilities-panel suites
- [x] T034 [P] [US5] Guard-rail audit + type guards: assert `isBitcoinNetworkId` boundaries so Bitcoin ids never reach `getContractAddressForChain`, wagmi switch/provider paths, subgraph routing, or wager/pool/membership asset pickers; add regression tests pinning BTC absence from those flows
- [x] T035 [US5] Testnet/mainnet mode integration: bind the active Bitcoin network to the app's existing testnet/mainnet toggle via `BITCOIN_TESTNET_MAINNET_PAIR`, with strict scoping of balances/addresses/activity per side; tests cover no cross-leak (FR-021)

**Checkpoint**: all five stories complete

---

## Phase 8: Polish & Cross-Cutting

- [x] T036 [P] Write `docs/developer-guide/bitcoin.md` (architecture, derivation contract pointer, gateway module, surfaces, availability matrix) mirroring `docs/developer-guide/predict-polymarket.md` depth
- [x] T037 [P] Write `docs/runbooks/bitcoin-operations.md`: upstream swap (self-hosted mempool/electrs), killswitch, quotas, stamps-indexer degradation playbook, testnet4 notes
- [x] T038 [P] Add the spec-061 guardrail summary block to `CLAUDE.md` (pattern: existing per-spec bullets — derivation constants are wallet-breaking, no numeric chainId for Bitcoin, fail-safe stamps rule, no gasless on BTC)
- [ ] T039 Accessibility pass on new/changed UI (axe on receive modal Bitcoin mode, TransferForm BTC path, stamps section, network rows) — fix findings; CI a11y gates stay green
- [x] T040 Security review pass per `.github/agents/` over `frontend/src/lib/bitcoin/` (key handling, signing, selection) + gateway module; record findings/resolutions in `specs/061-bitcoin-transactions/security-review.md`
- [ ] T041 Full regression gate: `npm run test:frontend`, root `npm test`, relay-gateway suite — all green (SC-008); run quickstart.md §3 end-to-end on testnet4 and record results in the PR description

---

## Dependencies & Execution Order

- **Phase 1 → Phase 2 → story phases**: T004/T005 (derivation) block everything key-touching; T008/T009 (gateway) block wallet discovery, portfolio, send, stamps; T003 (registry) blocks all surface work.
- **Story order**: US1 → US2 → US3 → US4; US5 is independent of US3/US4 after Phase 2 and can run in parallel with them. MVP = Phases 1–3.
- **Within stories**: lib → tests → hook → UI → component tests (test tasks may be written first — constitution II encourages it).

### Parallel opportunities

- Phase 1: T002 ∥ T003 (after T001 starts independently)
- Phase 2: {T004+T005} ∥ {T006+T007} ∥ {T008+T009}; T010 after T008
- US2: T016 ∥ T017; US3: T021/T022 ∥ T023/T024; US5: T033 ∥ T034
- Phase 8: T036 ∥ T037 ∥ T038

## Implementation Strategy

Ship incrementally behind honest capability gates: after Phase 3 (MVP) the
feature is deployable with receive-only Bitcoin (send surfaces stay hidden via
capabilities until US3 lands); each subsequent phase flips one capability on.
`BTC_ENABLED=false` keeps the entire feature dark in production until ops
enables the gateway module.

---

## Status notes (2026-07-20)

- T030's stamps-classification coverage lives in `wallet.test.js` (classifyUtxos
  fail-safe matrix) and `coinSelection.test.js`/`TransferForm.bitcoin.test.jsx`
  (never-spend + degraded disclosure) rather than a separate `stamps.test.js`.
- T020's test lives at `src/test/portfolio/usePortfolio.bitcoin.test.jsx`
  (matching the existing usePortfolio test location).
- T039 (a11y audit): new components ship with roles/labels/focus management and
  an axe test on the stamps section; the full axe/Lighthouse pass runs in CI —
  left unchecked until that gate reports.
- T041 (regression + live testnet4 e2e): the full local frontend + gateway
  suites are green; the LIVE testnet4 walk-through of quickstart.md §3 (faucet
  funds, real broadcasts) still needs a human-driven session and is the
  remaining open item.
