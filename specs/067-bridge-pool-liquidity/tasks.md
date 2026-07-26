---

description: "Task list for spec 067 — Transfer → Bridge & Earn → Supply"
---

# Tasks: Transfer — Cross-Chain Bridge & Earn — Supply Liquidity

**Input**: Design documents from `/specs/067-bridge-pool-liquidity/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: **REQUIRED, not optional.** Constitution II is non-negotiable ("behavior is not done until
tests prove it") and mandates fork tests wherever external protocols are involved — which is both
routers. **T038 is merge-blocking**: it is the only test that can detect the `depositor` refund bug
(research R2), because the happy path passes whether or not the bug is present.

**Organization**: grouped by user story so each ships independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable — different files, no dependency on incomplete work
- **[Story]**: US1–US5, on user-story phases only
- **Task IDs are stable identifiers assigned in creation order, not an ordering index.** Execution order
  is given by phase and position. T151+ were added by `/speckit-analyze` remediation and sit in their
  correct phases; existing IDs were deliberately not renumbered so references to them (notably the
  merge-blocking **T038**) stay valid.

## Path Conventions

Repo root. Contracts in `contracts/`, tests in `test/`, frontend in `frontend/src/`, gateway in
`services/relay-gateway/src/`, docs in `docs/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: network config, address plumbing, and external protocol interfaces that everything else
builds on.

⚠️ **Addresses are per-chain.** Uniswap explicitly warns integrators not to assume identical addresses
across chains, and Base's differ (research R4b). Take every address from that chain's own official
deployment record. Never copy a canonical address across networks.

- [X] T001 Add Arbitrum One (42161) as a full network entry in `frontend/src/config/networks.js` — RPC, explorer, native currency, stablecoin, portfolio wiring — so it is first-class for select/view/send (FR-006b)
- [X] T002 Add Base (8453) as a full network entry in `frontend/src/config/networks.js`
- [X] T003 Add Optimism (10) as a full network entry in `frontend/src/config/networks.js`
- [X] T004 Add a per-network `dex` block (factory, positionManager, quoter, swapRouter, wnative) for Ethereum, Arbitrum, Base, and Optimism in `frontend/src/config/networks.js`, each address taken from that chain's own Uniswap deployment record
- [X] T005 (SC-018) Split `capabilities.dex` into an explicit per-network swap flag and add derived `capabilities.liquidity` (`dex.positionManager` present AND `liquidityRouter` deployed) in `frontend/src/config/networks.js` per research R4a
- [X] T006 Add a per-network `bridge` block (`{ spokePool, hubPool | null }`) as build-time display fallback in `frontend/src/config/networks.js` — authoritative values are read from the router at runtime (FR-051)
- [X] T007 [P] Add `bridgeRouter` and `liquidityRouter` address keys (empty until synced) to every network in `frontend/src/config/contracts.js`
- [X] T008 [P] Add RPC env vars for Arbitrum, Base, and Optimism to `.env.example` with comments — never real values
- [X] T009 [P] Create minimal `contracts/interfaces/external/IAcrossSpokePool.sol` exposing only `depositV3` (no vendored SDK)
- [X] T010 [P] Create minimal `contracts/interfaces/external/IAcrossHubPool.sol` exposing `addLiquidity`, `removeLiquidity`, `exchangeRateCurrent` for reads and direct member calls
- [X] T011 [P] Create minimal `contracts/interfaces/external/INonfungiblePositionManager.sol` exposing `mint`, `increaseLiquidity`, `decreaseLiquidity`, `collect`, `positions`
- [X] T012 Create `scripts/ops/verify-protocol-addresses.js` asserting every configured SpokePool / HubPool / NFPM / factory has non-empty bytecode **on that chain** — the R4b guard
- [X] T013 [P] Update `frontend/src/config/assetTaxonomy.js` and asset-logo artwork so the three new networks resolve logos and network badges (required by FR-059's cross-network lists)

**Checkpoint**: config is complete and every configured protocol address is proven to exist on its chain.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: both routers, their tests, deployment, and the shared selector primitives. US1 and US2 both
depend on all of it.

⚠️ **CRITICAL**: no user story work begins until this phase is complete and green.

### Contracts

- [X] T014 Create `contracts/bridge/IBridgeRouter.sol` with the `Route` struct, events, and custom errors from [contracts/bridge-router.md](./contracts/bridge-router.md)
- [X] T015 Implement `contracts/bridge/BridgeRouter.sol` — UUPS via `UUPSManaged`, `LIQUIDITY_ADMIN_ROLE` + `GUARDIAN_ROLE`, route registry (`EnumerableSet.Bytes32Set`), `spokePool`/`feeRouter` refs, `paused`, trailing `__gap`
- [X] T016 Implement `BridgeRouter.bridgeWithFee` in `contracts/bridge/BridgeRouter.sol` following checks-effects-interactions: validate route → `quoteFee` + `maxFeeBps` ceiling → emit → pull, skim to treasury, approve, `depositV3`
- [X] T017 **Set `depositor = msg.sender` (the member), never `address(this)`,** in the `depositV3` call in `contracts/bridge/BridgeRouter.sol`, with an inline comment stating why — Across refunds unfilled deposits to `depositor` on the origin chain (research R2)
- [X] T018 Add route config setters (`setRoute`, `setRouteEnabled`, `setRouteLimit`, `removeRoute`, `setSpokePool`, `setFeeRouter`) with validation and one event each in `contracts/bridge/BridgeRouter.sol`
- [X] T019 Add `pause`/`unpause` (GUARDIAN only) plus enumeration reads (`getRoute`, `routeCount`, `routeAt`) to `contracts/bridge/BridgeRouter.sol`
- [X] T020 [P] Create `contracts/liquidity/ILiquidityRouter.sol` with the `PoolListing` struct, `PoolKind` enum, events, and errors from [contracts/liquidity-router.md](./contracts/liquidity-router.md)
- [X] T021 Implement `contracts/liquidity/LiquidityRouter.sol` — UUPS, same roles, pool registry, `positionManager`/`feeRouter` refs, `paused`, trailing `__gap`
- [X] T022 Implement `LiquidityRouter.mintFullRangeWithFee` in `contracts/liquidity/LiquidityRouter.sol`: reject non-`TRADING_LP` pools, enforce cap, per-token fee skim, `mint` with **`recipient = msg.sender`**, refund unspent remainder, zero approvals
- [X] T023 Implement full-range tick derivation from the pool's own `tickSpacing` (±887272 floored/ceiled) in `contracts/liquidity/LiquidityRouter.sol` — no member-facing range control (FR-016)
- [X] T024 Add pool registry setters (`listPool`, `setPoolEnabled`, `setPoolCap`, `setPositionManager`, `setFeeRouter`) and `pause`/`unpause` to `contracts/liquidity/LiquidityRouter.sol` — deliberately **no `removePool`** (FR-024)
- [X] T025 [P] Wire `ISanctionsGuard` screening of `msg.sender` into both routers' value paths (`contracts/bridge/BridgeRouter.sol`, `contracts/liquidity/LiquidityRouter.sol`) per FR-031/FR-032

### Contract tests

- [X] T026 [P] Unit tests for role gating on every `BridgeRouter` setter in `test/bridge/BridgeRouter.test.js`
- [X] T027 [P] Unit tests for route validation (reject `destinationChainId == block.chainid` and `0`, bounds on `expectedFillSeconds`) in `test/bridge/BridgeRouter.test.js`
- [X] T028 [P] Unit tests for `maxAmount` enforcement and `FeeAboveQuoted` revert in `test/bridge/BridgeRouter.test.js`
- [X] T029 [P] Unit test asserting a zero fee rate performs no treasury transfer and leaves downstream behavior identical (FR-029) in `test/bridge/BridgeRouter.test.js`
- [X] T030 [P] Unit tests asserting pause blocks `bridgeWithFee` and nothing else, plus reentrancy guard, in `test/bridge/BridgeRouter.test.js`
- [X] T031 [P] Unit test asserting zero residual token balance and zero leftover allowance after every `BridgeRouter` call in `test/bridge/BridgeRouter.test.js`
- [X] T032 [P] Unit tests for role gating and `BRIDGE_LP`-poolId rejection in `test/liquidity/LiquidityRouter.test.js`
- [X] T033 [P] Unit tests for retired-pool rejection, cap enforcement, and `FeeAboveQuoted` in `test/liquidity/LiquidityRouter.test.js`
- [X] T034 [P] Unit test asserting no `removePool` function exists on `LiquidityRouter` in `test/liquidity/LiquidityRouter.test.js`
- [X] T035 [P] Unit test asserting zero residual balances and allowances after `mintFullRangeWithFee` in `test/liquidity/LiquidityRouter.test.js`
- [X] T036 Create `test/fork/bridgeRouter.fork.test.js` with the happy-path case: Polygon → Ethereum USDC, asserting fee at treasury, net deposited, router balance zero
- [X] T037 Add an L2 → L2 fork case (Base → Arbitrum) to `test/fork/bridgeRouter.fork.test.js` proving the mesh works without touching L1 from the member's perspective
- [X] T038 **MERGE-BLOCKING** — add the expiry-refund case to `test/fork/bridgeRouter.fork.test.js`: submit with a near `fillDeadline`, let it expire, assert the refund lands on the **member's** address and **not** the router's, and that the `FundsDeposited` event carried `depositor == member`. Do not skip or quarantine this test
- [X] T039 [P] Add fork cases for a fee-rate change between quote and submit (asserting `FeeAboveQuoted`) and a native-asset route via `msg.value` to `test/fork/bridgeRouter.fork.test.js`
- [X] T040 Create `test/fork/liquidityRouter.fork.test.js` asserting a full-range mint leaves the **position NFT owned by the member**, both fee legs at treasury, router balances zero, approvals zeroed
- [X] T041 Add per-network fork mint cases to `test/fork/liquidityRouter.fork.test.js` covering all five networks — **especially Base**, whose Uniswap addresses differ from the canonical set (research R4b)
- [X] T042 [P] Add fork cases to `test/fork/liquidityRouter.fork.test.js` for correct tick bounds at each fee tier and unspent-amount refund to the member
- [X] T043 Add a fork case to `test/fork/liquidityRouter.fork.test.js` asserting the member can exit via `decreaseLiquidity` + `collect` **while the router is paused and the pool retired** (FR-021/FR-024/FR-043)
- [X] T044 Add a fork case to `test/fork/liquidityRouter.fork.test.js` for the Across `HubPool.addLiquidity`/`removeLiquidity` round trip from the member's own address, asserting the router is never an intermediary (research R3)

### Deploy, gating, sync

- [X] T045 Register both routers with `scripts/check-storage-layout.js` so the CI gate covers them before any upgrade
- [X] T046 [P] Add both routers to the Slither and Medusa CI targets in `.github/workflows/security.yml` and `medusa.json` — no new high/critical findings permitted
- [X] T047 Create `scripts/deploy/deploy-bridge-liquidity.js` deploying both UUPS proxies via `scripts/deploy/lib/upgradeable.js`, asserting non-empty bytecode at every configured protocol address before writing any record
- [X] T048 Extend `scripts/deploy/deploy-bridge-liquidity.js` to register `bridge.transfer` and `liquidity.deposit` on that network's `FeeRouter` at cap 250 bps, rate 0
- [X] T049 Record `bridgeRouter` / `bridgeRouterImpl` / `liquidityRouter` / `liquidityRouterImpl` per network in `deployments/<network>-chain<id>-v2.json` and verify `npm run sync:frontend-contracts` propagates them
- [X] T050 [P] Add `BRIDGE_TRANSFER` and `LIQUIDITY_DEPOSIT` service ids to `frontend/src/lib/fees/feeQuote.js`
- [X] T051 [P] Add the two service ids to `services/relay-gateway/src/fees/onchain.js` with env bps as documented fallback only

### Shared selector primitives

- [X] T052 Create `frontend/src/lib/assets/networkPin.js` exporting **both** predicates side by side — `samePair` (`o.chainId === pin.pinnedChainId`) and `bridgeDest` (`o.symbol === pin.pinnedSymbol && o.chainId !== pin.pinnedChainId`) — with a comment stating that applying `samePair` to a bridge silently reduces it to a same-chain transfer (research R11b)
- [X] T053 [P] Unit tests for both predicates, re-pin revalidation, and non-EVM (string `chainId`) exclusion in `frontend/src/lib/assets/__tests__/networkPin.test.js`
- [X] T054 (SC-022) Add a search/filter input to `frontend/src/components/ui/UniversalAssetSelect.jsx` matching on symbol, asset name, and network name, keyboard and screen-reader operable (FR-064)
- [X] T055 Add an optional `pin` + `pinPredicate` prop to `frontend/src/components/ui/UniversalAssetSelect.jsx` so callers filter the list without the component deriving eligibility (it stays presentational per spec 064 FR-001), **and render the empty-counterpart state** — a plain statement of why the list is empty and what would change it, never a bare empty dropdown (FR-065)
- [X] T056 [P] Extend `frontend/src/components/ui/__tests__/UniversalAssetSelect.test.jsx` with search, pin-filtering, empty-counterpart messaging, and vitest-axe coverage
- [X] T057 [P] Regression-test the four existing consumers (home Pay/Request/Wager, wallet Transfer) still work and gained search, in `frontend/src/test/home.axe.test.jsx` and the relevant panel tests
- [X] T058 [P] Add `LEDGER_CLASS.BRIDGE = 'bridge'` and `LEDGER_CLASS.LIQUIDITY = 'liquidity'` additively to `frontend/src/data/ledger/constants.js` — no existing entry reclassified

**Checkpoint**: both routers deployed, all safety invariants proven by fork tests, selector primitives
ready. User stories may now proceed in parallel.

---

## Phase 3: User Story 1 — Bridge an asset to another network from Transfer (Priority: P1) 🎯 MVP

**Goal**: a member moves a supported asset between supported networks from the renamed Transfer section,
with an itemized quote and truthful cross-chain progress.

**Independent Test**: with a connected account holding a supported asset, open Transfer → Bridge, quote
and execute a bridge to another supported network, and confirm the destination balance increases and the
progress view reaches delivered backed by a destination-chain transaction.

### Section rename

- [X] T059 [P] [US1] Rename the section label "Pay & Transfer" → "Transfer" in `frontend/src/config/appNav.js`, keeping the `paytransfer` tab id unchanged (FR-001/FR-002)
- [X] T060 [P] [US1] Update the section heading, intro copy, and `aria-label`s from "Pay & Transfer" to "Transfer" in `frontend/src/components/wallet/PayTransferPanel.jsx`
- [X] T061 [P] [US1] Sweep remaining "Pay & Transfer" occurrences in page/document titles and in-app link text across `frontend/src/`, leaving every identifier and route intact
- [X] T062 [P] [US1] Test that every previously-working entry point still resolves to the renamed section, including `/wallet?tab=paytransfer`, in `frontend/src/test/PortalNav.test.jsx`

### Quote + gateway

- [X] T063 [US1] Create `services/relay-gateway/src/bridge/quotes.js` proxying Across suggested-fees, reusing the existing screening, quota, and killswitch middleware
- [X] T064 [US1] Create `services/relay-gateway/src/bridge/status.js` proxying Across deposit status
- [X] T065 [P] [US1] Gateway tests for the bridge quote and status modules in `services/relay-gateway/test/bridge.test.js`, including the disabled/unconfigured path
- [X] T066 [US1] Create `frontend/src/lib/bridge/acrossQuotes.js` — quote fetch, itemized cost lines, validity window, and staleness detection (FR-007/FR-008)
- [X] T067 [P] [US1] Unit tests for quote itemization and staleness in `frontend/src/lib/bridge/__tests__/acrossQuotes.test.js`

### Router client + submission

- [X] T068 [US1] Create `frontend/src/lib/bridge/bridgeRouter.js` — router config reads returning `null` on failure (the `lib/staking/stakingRouter.js` shape) plus the `bridgeWithFee` call builder passing the quoted bps as `maxFeeBps`
- [X] T069 [P] [US1] Unit tests for router reads, honest-null fallback, and call-builder arguments in `frontend/src/lib/bridge/__tests__/bridgeRouter.test.js`
- [X] T070 [US1] Guard every bridge entry point with the numeric-chain assertion so Bitcoin string ids never reach `getContractAddressForChain` or wagmi, in `frontend/src/lib/bridge/bridgeRouter.js` (FR-006)

### Status tracking

- [X] T071 [US1] Create `frontend/src/data/ledger/sources/bridgeLedgerSource.js` capturing one entry per bridge keyed by origin chain + `depositId`, with `direction: 'none'` (FR-035/FR-036)
- [X] T072 [US1] Create `frontend/src/lib/bridge/bridgeStatus.js` implementing the state machine — `delivered` reachable **only** from confirmed destination-side evidence (FR-009)
- [X] T073 [US1] Implement cross-session reconciliation in `frontend/src/lib/bridge/bridgeStatus.js`: poll the gateway status endpoint, fall back to on-chain `FundsDeposited`/`FilledV3Relay` reads (FR-010)
- [X] T074 [US1] Implement the `needs_attention` transition past `expectedBy` in `frontend/src/lib/bridge/bridgeStatus.js`, non-terminal and still resolvable to delivered or refunded (FR-011)
- [X] T075 [P] [US1] Unit tests covering the full state matrix including delayed, refunded, and partial outcomes in `frontend/src/lib/bridge/__tests__/bridgeStatus.test.js`
- [X] T076 [P] [US1] (SC-004) Test that an in-flight bridge resumes its true status after a simulated app restart in `frontend/src/lib/bridge/__tests__/bridgeStatus.test.js` (FR-010)

### UI

- [X] T077 [P] [US1] Create `frontend/src/lib/bridge/bridgeCopy.js` — InfoTip text and the third-party settlement risk disclosure (FR-014)
- [X] T078 [US1] Create `frontend/src/components/wallet/BridgeView.jsx` — asset selector (all networks, nested logos), destination selector using the **`bridgeDest`** predicate, amount field with Max
- [X] T079 [US1] Create `frontend/src/components/wallet/BridgeQuoteCard.jsx` rendering each cost on its own labelled line with InfoTips, total, arrival estimate, and stale-quote refresh (FR-007/FR-008)
- [X] T080 [US1] Add the destination-gas disclosure to `frontend/src/components/wallet/BridgeQuoteCard.jsx` when the member's destination-chain native balance is zero (FR-012)
- [X] T081 [US1] Create `frontend/src/components/wallet/BridgeStatusList.jsx` showing in-flight, delivered, refunded, and needs-attention transfers with both transaction links
- [X] T082 [US1] Add the Bridge tab to `frontend/src/components/wallet/PayTransferPanel.jsx` beside Send and Activity, without displacing the existing same-chain send flow (FR-004)
- [X] T083 [US1] Implement honest-unavailable states in `frontend/src/components/wallet/BridgeView.jsx` for paused routes, undeployed/unreachable routers, missing gateway, ETC/Mordor, and Bitcoin networks (FR-051/FR-052/FR-053)
- [X] T084 [P] [US1] (SC-014) Component tests for quote rendering, stale-quote gating, honest-unavailable states, and vitest-axe in `frontend/src/test/bridge/BridgeView.test.jsx`
- [X] T085 [P] [US1] Test that the destination selector offers **only the same asset on other networks** — never the same network — in `frontend/src/test/bridge/BridgeView.test.jsx` (FR-063, SC-021, the R11b inversion check)
- [X] T151 [US1] Implement the **signing-time network switch** in `frontend/src/components/wallet/BridgeView.jsx` — when the selected source asset is on a network other than the wallet's active one, switch automatically at submit and disclose the switch before signature, reusing the `useEarnSend` pattern (FR-061, SC-020). Without this the cross-network selector produces failed transactions for every asset off the active chain
- [X] T152 [P] [US1] Test that selecting an off-chain asset triggers a disclosed automatic switch at signing and that the network switcher is never required, in `frontend/src/test/bridge/BridgeView.test.jsx` (SC-020)

**Checkpoint**: US1 is fully functional and independently testable. MVP reached.

---

## Phase 4: User Story 2 — Supply liquidity from Earn → Supply (Priority: P1)

**Goal**: a member supplies to a curated bridge or Uniswap pool from the new Earn → Supply area, sees the
position and earnings, and can exit at any time free of platform fees.

**Independent Test**: supply to one bridge pool and one Uniswap pool, confirm both positions appear with
current value and earnings, then withdraw from each and confirm assets return to the wallet.

- [X] T086 [P] [US2] Replace the disabled "Bridges" tile with a live **Supply** area in `frontend/src/components/earn/EarnPanel.jsx`, add the `?view=supply` route, and remove the `bridges` entry from `EARN_AREAS_FUTURE` in `frontend/src/lib/earn/earnCopy.js`
- [X] T087 [P] [US2] Create `frontend/src/lib/liquidity/liquidityCopy.js` — InfoTips plus the impermanent-loss and cross-chain-rebalancing disclosures
- [X] T088 [US2] Create `frontend/src/lib/liquidity/liquidityRouter.js` — pool-listing reads with honest-null fallback and the `mintFullRangeWithFee` call builder passing `maxFeeBps`
- [X] T089 [US2] Create `frontend/src/lib/liquidity/uniswapPositions.js` — full-range tick helpers, position reads, current value, earnings, and composition (FR-020)
- [X] T090 [US2] Create `frontend/src/lib/liquidity/acrossLpPositions.js` — **direct** `HubPool.addLiquidity`/`removeLiquidity` calls and LP-token position reads, with no router in the path (research R3)
- [X] T091 [P] [US2] Unit tests for tick derivation, position valuation, and the honest-null fallback in `frontend/src/lib/liquidity/__tests__/uniswapPositions.test.js`
- [X] T092 [P] [US2] Unit test asserting the Across LP path never routes through `liquidityRouter` in `frontend/src/lib/liquidity/__tests__/acrossLpPositions.test.js`
- [X] T093 [US2] Create `frontend/src/components/earn/SupplyView.jsx` listing both pool kinds together across networks with network badges, in the Lend card layout
- [X] T094 [P] [US2] Create `frontend/src/components/earn/LiquidityPoolCard.jsx` showing kind, asset/pair, protocol, network, estimated return, total supplied, and the kind-specific risk summary with InfoTips (FR-017)
- [X] T095 [US2] Create `frontend/src/components/earn/SupplySheet.jsx` — amount entry, fee line with net amounts, and the confirm step
- [X] T096 [US2] Gate the confirm control in `frontend/src/components/earn/SupplySheet.jsx` behind a **visible inline** impermanent-loss disclosure for trading pools (FR-018) and the rebalancing/inventory disclosure for bridge pools (FR-019) — never tooltip-only
- [X] T097 [US2] Apply the **`samePair`** predicate to the second asset selector in `frontend/src/components/earn/SupplySheet.jsx`, showing the pinned network and revalidating on re-pin (FR-062)
- [X] T098 [US2] Render open positions with current value, earnings to date, and composition — each labelled an estimate — in `frontend/src/components/earn/SupplyView.jsx` (FR-020)
- [X] T099 [US2] Implement add-to and withdraw flows in `frontend/src/components/earn/SupplyView.jsx` with **no platform fee on exit** and partial-withdrawal messaging when inventory is short (FR-021/FR-022)
- [X] T100 [US2] Implement retired-pool and unreachable-protocol states in `frontend/src/components/earn/SupplyView.jsx`: closed to new deposits, still visible and withdrawable, never hidden with member funds inside (FR-024)
- [X] T101 [US2] Implement the honest per-network empty state naming where supplying is available in `frontend/src/components/earn/SupplyView.jsx` (FR-025)
- [X] T102 [P] [US2] (SC-014) Component tests for the disclosure gate, fee line, retired-pool behavior, empty state, and vitest-axe in `frontend/src/test/earn/SupplyView.test.jsx`
- [X] T103 [P] [US2] (SC-021) Test that a pair can never span networks and that re-pinning clears an invalidated second selection in `frontend/src/test/earn/SupplyView.test.jsx` (FR-062)
- [X] T104 [P] [US2] Create `frontend/src/data/ledger/sources/liquidityLedgerSource.js` capturing supply, withdraw, and fee-claim actions with class `liquidity`
- [X] T153 [US2] Implement the **signing-time network switch** in `frontend/src/components/earn/SupplySheet.jsx` for pairs pinned to a network other than the wallet's active one, disclosed before signature (FR-061, SC-020)

**Checkpoint**: US1 and US2 both work independently.

---

## Phase 5: User Story 3 — Auxiliary service wiring (Priority: P2)

**Goal**: both surfaces behave as first-class FairWins activities — ledger, reporting, notifications,
platform fees, and sanctions.

**Independent Test**: after one bridge and one supply, verify both appear in the ledger and a generated
report with correct classification; notifications fire and respect per-category delivery; the fee shown
matches what was charged; a deny-listed wallet is refused at both surfaces before any signature.

- [X] T105 [P] [US3] Register the bridge and liquidity ledger sources in `frontend/src/data/ledger/index.js` and `ledgerRepository.js`
- [X] T106 [US3] Ensure a bridge renders as **one** logical ledger entry naming both networks and both transactions in `frontend/src/data/ledger/normalize.js` (FR-035)
- [X] T107 [US3] Include bridge and liquidity entries in reporting with fees attributed and cross-chain self-transfers excluded from income and disposals, in `frontend/src/data/reports/` and the Reporting panel at `frontend/src/components/wallet/TaxReportsPanel.jsx` (FR-036)
- [X] T108 [P] [US3] Add `bridge: { label: 'Bridge' }` and `liquidity: { label: 'Liquidity' }` to `DOMAIN_META` in `frontend/src/data/notifications/domains.js`
- [X] T109 [US3] **Relabel the wager-pool domain from `'Pool'` to `'Wager Pool'`** in `frontend/src/data/notifications/domains.js` (FR-039a) — the collision is otherwise invisible until a member has both kinds of activity
- [X] T110 [P] [US3] Append the Bridge and Liquidity categories to `NOTIFICATION_CATEGORIES` in `frontend/src/lib/notifications/deliveryPreferences.js`, defaulting to delivered (FR-038)
- [X] T111 [US3] Emit notifications for bridge delivered, refunded, and needs-attention from `frontend/src/lib/bridge/bridgeStatus.js` (FR-037)
- [X] T112 [US3] Emit notifications for pool closed-to-deposits and positions materially affected by a protocol event from `frontend/src/lib/liquidity/liquidityRouter.js` (FR-037)
- [X] T113 [US3] Wire the live `bridge.transfer` rate into the bridge confirm step via `fetchFeeQuote`, rendering **no fee line at all** at zero rate (FR-028/FR-029) in `frontend/src/components/wallet/BridgeQuoteCard.jsx`
- [X] T114 [US3] Wire the live `liquidity.deposit` rate into the supply confirm step, with no fee line for bridge-LP pools at any rate, in `frontend/src/components/earn/SupplySheet.jsx`
- [X] T115 [US3] Block the fee-bearing path (never assume a lower rate) when `FeeRouter` is present but unreadable, in `frontend/src/lib/fees/feeQuote.js`
- [X] T116 [P] [US3] Wire `useAddressScreening` into both surfaces so screening happens at submission, not only at display, in `frontend/src/components/wallet/BridgeView.jsx` and `frontend/src/components/earn/SupplySheet.jsx` (FR-032)
- [X] T117 [P] [US3] Ledger consistency tests for bridge single-entry representation and liquidity/wager-pool distinguishability in `frontend/src/test/ledger/ledgerConsistency.test.js`
- [X] T118 [P] [US3] Tests asserting the two new notification categories are independently controllable and that no bridge or liquidity notification is attributed to the wager-pool category, in `frontend/src/test/notifications/`
- [X] T119 [P] [US3] Tests asserting the quoted rate is a hard ceiling and that a zero rate renders no fee line, in `frontend/src/test/fees/`
- [X] T120 [P] [US3] Tests asserting a deny-listed wallet is refused at both surfaces before signature, including a listing that lands between quote and submission, in `frontend/src/test/` (SC-013)
- [X] T154 [US3] Implement the platform's existing **restricted-account policy** for view and exit on both surfaces in `frontend/src/components/wallet/BridgeView.jsx` and `frontend/src/components/earn/SupplyView.jsx` — a restricted member must still see existing positions and in-flight bridges and still be able to exit, following the established treatment rather than a new one (FR-033)
- [X] T155 [P] [US3] Test that a restricted account can still view and exit existing positions while being refused new value-in, in `frontend/src/test/` (FR-033)

**Checkpoint**: both surfaces are fully wired into the shared services.

---

## Phase 6: User Story 4 — Operator control surfaces (Priority: P2)

**Goal**: authorized operators manage routes, pools, addresses, limits, and emergency pause from the
admin control panel without a redeploy.

**Independent Test**: as an authorized operator, add and remove a curated pool, change a route's
availability, and pause/resume — each visible to members within one refresh and recorded in history with
actor and timestamp. As an unauthorized operator, confirm the controls are neither visible nor actionable.

- [X] T121 [US4] Add the **Liquidity** group with `bridge` and `supply` items, the `isLiquidityAdmin` flag, and both tab icons to `frontend/src/components/admin/adminNav.js`
- [X] T122 [P] [US4] Resolve `LIQUIDITY_ADMIN_ROLE` membership and pass `isLiquidityAdmin` into `buildAdminNavGroups` — **path corrected**: there is no `frontend/src/hooks/useAdminRoles.js` in this codebase and none was invented. Role flags are resolved in `frontend/src/components/AdminPanel.jsx` (the `isStakingAdmin` precedent), with the role declared in `contexts/RoleContext.js`, synced in `contexts/WalletContext.jsx`, and read from BOTH routers in `utils/blockchainService.js#hasRoleOnChain`
- [X] T123 [US4] Create `frontend/src/components/admin/BridgeTab.jsx` with Status, Routes, Addresses, Fee (read-only), Operations, and History sections per [contracts/admin-and-runtime.md](./contracts/admin-and-runtime.md)
- [X] T124 [US4] (SC-017) Implement route add/edit/enable/disable/remove plus bulk per-network-pair toggles across the 20 directed routes in `frontend/src/components/admin/BridgeTab.jsx` (FR-041)
- [X] T125 [US4] Implement address editing with the current value shown and invalid input rejected with a reason before submit, in `frontend/src/components/admin/BridgeTab.jsx` (FR-042)
- [X] T126 [US4] Implement the Operations panel (in-flight, past-`expectedBy`, recent completions/refunds, gateway health) in `frontend/src/components/admin/BridgeTab.jsx`, stating plainly that it is observational — no operator action can touch an in-flight bridge (FR-047)
- [X] T127 [US4] Create `frontend/src/components/admin/SupplyTab.jsx` with Status, Pools, Addresses, Fee (read-only), and History sections spanning all five networks
- [X] T128 [US4] Label the Supply pause control **"Pauses new Uniswap supplies"** in `frontend/src/components/admin/SupplyTab.jsx` — bridge-LP deposits bypass the router, so the contract cannot stop them and the tab must not imply otherwise (research R3)
- [X] T129 [US4] Show retired pools as **retired, not gone**, with their position count, in `frontend/src/components/admin/SupplyTab.jsx` (FR-024)
- [X] T130 [P] [US4] Implement per-transaction bridge maximum editing in `frontend/src/components/admin/BridgeTab.jsx` and per-pool deposit cap editing in `frontend/src/components/admin/SupplyTab.jsx`, each honoured and explained in the member flows (FR-045)
- [X] T131 [P] [US4] Implement decoded event history (action, target, before → after, operator, time) in `frontend/src/components/admin/BridgeTab.jsx` and `frontend/src/components/admin/SupplyTab.jsx` (FR-046)
- [X] T132 [P] [US4] Show the live fee rate and cap read-only with a link to the Fees tab, and state plainly when `FeeRouter` is undeployed or unreachable while keeping other controls usable, in both admin tabs (FR-048/FR-051)
- [X] T133 [P] [US4] (SC-011) Tests asserting least-privilege — an operator with none of admin/liquidity-admin/guardian sees neither tab and can perform no control action by any route — in `frontend/src/test/admin/`
- [X] T134 [P] [US4] Tests asserting pause stops new value in while in-flight bridges settle and existing positions stay withdrawable, in `frontend/src/test/admin/`
- [X] T135 [P] [US4] vitest-axe coverage for both admin tabs in `frontend/src/test/admin/` (SC-014)
- [X] T156 [P] [US4] Test that **pause and resume still work with every optional service unavailable** — gateway unset and unreachable — for both routers, in `test/bridge/BridgeRouter.test.js` and `test/liquidity/LiquidityRouter.test.js` (FR-044). A killswitch that depends on optional infrastructure is not a killswitch
- [X] T157 [P] [US4] Test that control state and history are **scoped per network** and that no testnet control state reaches a mainnet surface, in `frontend/src/test/admin/` (FR-050)

### US4 audit remediation (post-build, three adversarial lenses)

An operator-honesty / least-privilege / regression audit of the finished US4 surfaces returned 23
findings; 1 critical, 6 high. These were fixed in the same phase — the critical one made the emergency
pause structurally unreachable on 4 of the 5 networks, which is the opposite of what US4 exists for.

- [X] T157a [US4] **Contracts — the fee ceiling now binds the fee TAKEN, not the rate the FeeRouter
      reports about itself.** Both routers checked `MAX_FEE_BPS` against `feeBps()` and then transferred
      whatever `quoteFee()` returned, unbounded: a FeeRouter reporting 0 bps while quoting 99% passed
      every check and drained the member. Both now bound the returned amount and require an exact
      fee/net split (`FeeSplitMismatch`). `contracts/mocks/MockLyingFeeRouter.sol` is the regression.
- [X] T157b [US4] **Contracts — protocol-wiring setters moved to `DEFAULT_ADMIN_ROLE`.**
      `setSpokePool` / `setPositionManager` / `setFeeRouter` / `setSanctionsGuard` were
      `LIQUIDITY_ADMIN_ROLE`, the same role as "enable a route" — so a route curator could redirect
      member funds. `setPositionManager` also now rejects the zero address.
- [X] T157c [US4] **(CRITICAL) Authority is read from the router in scope, not from the app-wide role
      flags.** `hasRole(ADMIN|GUARDIAN)` resolved only against `wagerRegistry`/`membershipManager`,
      which do not exist on Ethereum / Optimism / Base / Arbitrum — so `canPause` was false for EVERY
      account on four of five networks, including each router's real guardian, and the pause card
      rendered nothing at all. Added `readRouterAuthority` + `authorityGates`; both tabs now ask the
      specific router for the specific network. An unreadable answer keeps the controls offered and
      says it is unconfirmed (FR-044); a definite "no" renders the card with the reason and where the
      role comes from, never an empty space.
- [X] T157d [US4] **`GUARDIAN_ROLE` is grantable per router.** The Roles tab could only grant it on the
      WagerRegistry, so the routers' killswitch was undelegable — held by the `initialize` admin alone.
- [X] T157e [US4] **The fee card quotes the FeeRouter the router actually holds**, and says plainly when
      that disagrees with the app config (members are then quoted by a contract that is not charging
      them, and the member path refuses rather than overcharging).
- [X] T157f [US4] **`applyCaps` no longer deletes the untouched leg's ceiling.** `setPoolLimit` writes
      both legs and 0 means uncapped, so typing one cap silently removed the other and reported success.
- [X] T157g [US4] **No false zeros.** A failed deposit scan stored `byPool: {}` and the cells fell through
      to `?? 0`, printing "0 positions" for a pool members still hold LP in — the one claim FR-024 exists
      to prevent. Bridge-pool SIZE is now read from the HubPool (it was withheld as "not observable"
      while the member view read exactly that); only the per-member COUNT genuinely needs an indexer.
- [X] T157h [US4] **Bulk route toggles actually stop on the first refusal.** `runTx` swallowed every
      error and resolved with no signal, so rejecting the first prompt to abort still fired the rest;
      `runTx` now resolves a boolean and the loop honours it.
- [X] T157i [US4] **Operations panel: late outranks recent**, so a stuck transfer is not evicted by ten
      newer ones that are fine; a route whose curation was removed reports its window as UNKNOWN rather
      than not-late; `removeRoute` confirms first and names that consequence; and the panel states what
      it could not show.
- [X] T157j [US4] **Scope switches clear state first**, so the previous network's pause banner cannot
      render under the newly-selected network's name (FR-050/FR-052).
- [X] T157k [US4] **History no longer claims a route/pool went live when it did not.** `RouteSet` and
      `PoolListed` carry no `enabled` field, so `args.enabled === false` was always false.
- [X] T157l [US4] **The permissions card and header badge name every role that can open the panel** —
      `FEE_ADMIN`, `STAKING_ADMIN` and `LIQUIDITY_ADMIN` were missing, so holders read a list of × and
      concluded their grant had not landed while being badged "Admin".

**Still open, reported not fixed:** `test/WagerRegistry.coverage.test.js` and
`test/intent/WagerRegistryIntents.coverage.test.js` (1,043 lines of spec-035/046 coverage) were untracked
scratch work swept into PR #961 by a `git add -A`. They pass (56 tests) and are legitimate coverage, but
they shipped under a bridge/liquidity PR and were reviewed as such. Left in place; re-attribution is a
call for the maintainer.

**Checkpoint**: every member-facing surface has a working operator control.

---

## Phase 7: User Story 5 — Content deliverables (Priority: P3)

**Goal**: the three content series each gain an accurate entry for this feature.

**Independent Test**: each series contains a new numbered entry in its established structure, with its
index table updated and internal links resolving.

- [ ] T136 [P] [US5] Write the member feature announcement in `docs/blog/features/02-bridge-and-supply/blog.md` — benefit-first, with the exact confirm-step flow
- [ ] T137 [P] [US5] Write the promotion kit (X post, LinkedIn post, 16:9 image prompt) in `docs/blog/features/02-bridge-and-supply/social.md`
- [ ] T138 [P] [US5] Add the announcement row to the index table in `docs/blog/features/README.md`
- [ ] T139 [P] [US5] Write the engineering post on cross-chain intents and pooled liquidity in `docs/blog/posts/35-cross-chain-intents-and-lp/blog.md`, covering the `depositor` refund invariant and the no-custody fee rule
- [ ] T140 [P] [US5] Write its promotion kit in `docs/blog/posts/35-cross-chain-intents-and-lp/social.md` and add the index row in `docs/blog/posts/README.md`
- [ ] T141 [P] [US5] Write the knowledge-base article explaining bridges, liquidity provision, and impermanent loss in plain language in `docs/blog/knowledge/21-bridges-and-liquidity/blog.md`
- [ ] T142 [P] [US5] Write its promotion kit and add the index row in `docs/blog/knowledge/README.md`
- [ ] T143 [US5] Fact-check `docs/blog/features/02-bridge-and-supply/blog.md`, `docs/blog/posts/35-cross-chain-intents-and-lp/blog.md`, and `docs/blog/knowledge/21-bridges-and-liquidity/blog.md` against the R8 availability matrix and the zero-rate launch state — a piece implying bridge liquidity beyond Ethereum, or a platform fee that ships at zero, fails FR-058

**Checkpoint**: all five user stories complete.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T144 [P] Write the developer guide in `docs/developer-guide/bridge-and-liquidity.md` covering both routers, the two fee services, and the R11b predicate inversion
- [X] T145 [P] Write the operator runbook in `docs/runbooks/bridge-liquidity-operations.md` covering pause/resume, route and pool curation, stuck-bridge triage, and the limits of operator action
- [X] T146 [P] Add the spec-067 summary block to `CLAUDE.md` following the existing per-spec guardrail format
- [ ] T147 Run `npm run compile && npm test && npm run test:frontend && npm run check:storage-layout` and confirm all green
- [ ] T148 (SC-012, SC-019, SC-020) Run the full `quickstart.md` walkthrough end to end, including the honest-degradation and cross-network selection checks
- [X] T149 [P] Confirm no `continue-on-error` was added to any lint/test/build/security step in `.github/workflows/`
- [X] T150 Request the smart-contract security review required by constitution I (`.github/agents/smart-contract-security.agent.md`) for `contracts/bridge/BridgeRouter.sol` and `contracts/liquidity/LiquidityRouter.sol`
      **DONE — verdict APPROVE_WITH_NITS** (PR #965). Three lenses (value flow & custody / access
      control & upgradeability / external integration & DoS) over both routers; each of 28 candidate
      findings handed to an independent skeptic instructed to refute it. Nothing survived above
      `low`. EthTrust-SL **Level 2** met. Confirmed under active attack: `depositor == member` on
      both legs (`_deposit` is the single `depositV3` call site; no rescue function exists in the
      ABI), non-custodial, transient custody, the `MAX_FEE_BPS` amount bound, and fee-on-consumed-
      capital. Reentrancy protection is structurally sufficient — every external read is `view` and
      compiles to `STATICCALL`. Fixed in `b4d107b6`: the missing Uniswap slippage bound (the only
      unprivileged-attacker path), `bool enabled` on `RouteSet`/`PoolListed` so the FR-046 audit
      history can reconstruct availability, and `TreasuryTransferFailed` replacing a misleading
      `ResidualFunds`. Carried to #966: the bridge `recipient` screening scope (a compliance
      decision), proving the fork suite green against the real Across SpokePool, and the FeeRouter
      service-registration liveness gate.
- [ ] T158 Run the moderated impermanent-loss comprehension check behind SC-005 before mainnet launch and record the result in `specs/067-bridge-pool-liquidity/checklists/requirements.md` — the in-flow gate (T096) proves the disclosure is *shown*, this proves it is *understood*

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)** — no dependencies. T004 and T005 depend on T001–T003.
- **Phase 2 (Foundational)** — depends on Phase 1. **Blocks everything else.**
- **Phase 3 (US1)** and **Phase 4 (US2)** — depend on Phase 2 only. **Independent of each other; can run in parallel.**
- **Phase 5 (US3)** — depends on US1 and US2 existing (it wires what they produce).
- **Phase 6 (US4)** — depends on Phase 2 (the routers). Largely independent of US1/US2 and can run alongside them.
- **Phase 7 (US5)** — depends on US1–US4 being final enough to describe accurately (FR-058).
- **Phase 8 (Polish)** — last.

### Critical path

```
Setup → Foundational (routers + T038) → US1 ─┐
                                    └→ US2 ─┼→ US3 → US5 → Polish
                                    └→ US4 ─┘
```

### Within each user story

Libraries and data sources before components; components before integration; tests alongside the
behavior they describe (constitution II), never deferred to the end.

### Parallel opportunities

- Phase 1: T007–T011 and T013 all touch different files.
- Phase 2: the whole unit-test block T026–T035 runs in parallel; T020 parallels T014–T019 (different contract).
- **US1 and US2 are the big win** — two developers can take Phase 3 and Phase 4 simultaneously after the foundational checkpoint.
- US4 can proceed alongside US1/US2 since it depends only on the routers.
- Phase 7: T136–T142 are all separate files.

---

## Parallel Example: User Story 1

```
# After the Phase 2 checkpoint, launch the independent pieces together:
T059  Rename section label in frontend/src/config/appNav.js
T063  Gateway quote module in services/relay-gateway/src/bridge/quotes.js
T077  Copy + disclosures in frontend/src/lib/bridge/bridgeCopy.js

# Then the dependent chain:
T066 (quotes lib) → T068 (router client) → T078/T079 (UI) → T084/T085 (tests)
```

---

## Implementation Strategy

### MVP scope

**Phase 1 + Phase 2 + Phase 3 (US1).** That delivers cross-chain bridging from the renamed Transfer
section — the headline capability — with every safety invariant proven. Earn → Supply, the auxiliary
wiring, and the admin surfaces can follow.

Note that Phase 2 is unusually heavy for an MVP because both routers, their fork tests, and the
deployment pipeline must exist before either surface works. That is inherent to a value-bearing
cross-chain feature, not padding.

### Incremental delivery

1. **Setup + Foundational** → contracts deployed, safety proven, nothing member-visible yet.
2. **+ US1** → bridging works. Shippable.
3. **+ US2** → supplying works. Both P1 stories done.
4. **+ US3** → ledger, reporting, notifications, live fees, sanctions.
5. **+ US4** → operators can run it. *Required before any mainnet launch* — a cross-chain surface without a killswitch is not shippable regardless of story priority.
6. **+ US5 + Polish** → announced and documented.

### Gates that must not be waived

- **T038** (expiry refund to the member) blocks merge. The happy path cannot detect that bug class.
- **T151 / T153** (signing-time network switch) are correctness, not polish. Without them the
  cross-network selector reaches signing on the wrong chain for any asset off the active network.
- **T045** (storage layout) must pass before any subsequent router upgrade.
- **T150** (security review) is required by constitution I for both new value-bearing contracts.
- **US4** must land before mainnet, whatever the story priority says.
