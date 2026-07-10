---
description: "Task list for Ethereum Mainnet & Testnet Support (spec 048)"
---

# Tasks: Ethereum Mainnet & Testnet Support

**Input**: Design documents from `specs/048-ethereum-mainnet-support/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: INCLUDED — the project constitution (Principle II, Test-First, NON-NEGOTIABLE)
requires Vitest coverage for all non-trivial frontend logic. Test tasks precede the
implementation they cover within each story.

**Organization**: Grouped by user story (US1 P1, US2 P1, US3 P2) so each is an
independently testable increment. All work is in `frontend/` — no contract, subgraph, or
backend changes.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 (setup, foundational, polish carry no story label)

## Path Conventions

Web app — all paths under `frontend/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Document the new environment configuration knobs (constitution: `.env.example`
documents required vars; keys/secrets never committed).

- [ ] T001 [P] Document new env vars in `frontend/.env.example`: `VITE_RPC_URL_HOODI`, `VITE_HOODI_USDC` (Hoodi faucet stablecoin, left blank — honest default null), `VITE_RPC_URL_MAINNET`/`VITE_RPC_URL_SEPOLIA` (if not already present), and the optional Chainlink feed overrides `VITE_FEED_MAINNET_ETH_USD`/`VITE_FEED_MAINNET_BTC_USD`/`VITE_FEED_MAINNET_LINK_USD`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The per-chain config + wagmi registration that ALL three stories depend on —
selection (US1) needs both, portfolio (US2) needs the `NETWORKS` entries, send (US3) needs
the wagmi chains.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T002 Update `frontend/src/config/networks.js`: add the **Hoodi** network entry (chainId `560048`, name `Hoodi`, native ETH 18d, `isTestnet: true`, `selectable: true`, `rpcUrl` = `VITE_RPC_URL_HOODI` || `https://ethereum-hoodi-rpc.publicnode.com`, `explorer` = Etherscan `https://hoodi.etherscan.io`, `subgraphUrl: null`, `stablecoin` = `VITE_HOODI_USDC` || **null** with no invented address, `dex/contracts/polymarket/passkey` empty/null, all `capabilities` false); set the existing **Sepolia** (`11155111`) entry `selectable: false → true`; refresh the **Ethereum mainnet** (`1`) comment block to describe it as a first-class value network (send/receive/portfolio), leaving its capability flags unchanged. Shape per `data-model.md`.
- [ ] T003 [P] Register the Ethereum chains in `frontend/src/wagmi.js`: import `mainnet` and `sepolia` from `wagmi/chains`, define a `hoodi` chain inline (mirroring the `mordor` definition, id `560048`), add all three to the `chains` array **keeping `polygon` first** (wagmi default — FR-015), add their `transports` (RPC defaults matching `networks.js`), and extend `getExpectedChain()` with `case 1 / 11155111 / 560048`.

**Checkpoint**: Ethereum family is modelled and wagmi-switchable — user stories can begin.

---

## Phase 3: User Story 1 - Select an Ethereum network (Priority: P1) 🎯 MVP

**Goal**: A member can pick Ethereum mainnet, Hoodi, or Sepolia from the Network tab, it
becomes the active network, and capabilities/explorer links display honestly and
per-network.

**Independent Test**: In My Account → Network, all three appear as selectable cards
(testnets labelled) with honest capability tags; switching activates each; explorer links
resolve to Etherscan (never Amoy). Automated via the tests below + quickstart US1.

### Tests for User Story 1 ⚠️ (write first)

- [ ] T004 [P] [US1] New `frontend/src/test/networks.ethereum.test.js`: assert `isSupportedChainId(560048)`, Hoodi/Sepolia/mainnet present in `getSelectableNetworks()` (mainnets-before-testnets order), Hoodi metadata (rpc `^https?://`, explorer contains `etherscan`), all Ethereum-family capability flags false except mainnet `clearpath`, and **wagmi/networks parity** (every `selectable` chain id exists in `config.chains`). Contracts C1–C3.
- [ ] T005 [P] [US1] Update `frontend/src/test/networks.mainnet.test.js`: reframe from "ClearPath-only" to first-class value network — keep the honest-off assertions (`dex`/`swap`/`wagers`/`passkey` false, `clearpath` true) and add that mainnet is selectable and portfolio-eligible. Contract C4.
- [ ] T006 [P] [US1] Update `frontend/src/test/networks.test.js`: expand the expected selectable-network set to include `1`, `11155111`, `560048`; assert `PRIMARY_CHAIN_ID`/`MAINNET_CHAIN_ID` (137) and the Testnet/Mainnet pair are unchanged (FR-015 / SC-006).
- [ ] T007 [P] [US1] New `frontend/src/test/blockExplorer.test.js`: `getBlockscoutUrl(1,…)` contains `etherscan.io` and never `polygonscan`; `11155111` → `sepolia.etherscan.io`; `560048` → `hoodi.etherscan.io`; existing `61/63/137/80002` unchanged; an unknown chainId does NOT fall back to the Amoy URL. Contract C5.

### Implementation for User Story 1

- [ ] T008 [US1] Fix `frontend/src/config/blockExplorer.js`: resolve the base URL from `getNetwork(chainId)?.explorer?.baseUrl` (single source of truth) with the existing map only as a fallback, and **remove the silent Amoy default** so an unknown chain yields no link instead of a wrong-network link (FR-016, constitution III/V). Makes T007 pass.

**Checkpoint**: US1 fully functional — Ethereum family selectable with honest display and correctly-scoped explorer links.

---

## Phase 4: User Story 2 - See Ethereum assets in the portfolio (Priority: P1)

**Goal**: A connected account's Ethereum holdings (native ETH + curated tokens) appear in
the cross-network portfolio, priced from verifiable sources, with testnets gated behind the
opt-in.

**Independent Test**: With an account holding ETH/USDC on mainnet, the Portfolio shows the
Ethereum holdings labelled Ethereum, ETH priced via Chainlink and stablecoins at $1
contributing to totals; Hoodi/Sepolia holdings appear only when "show testnet assets" is
on; a failed read is reported, never shown as $0. Automated below + quickstart US2.

### Tests for User Story 2 ⚠️ (write first)

- [ ] T009 [P] [US2] Extend `frontend/src/test/portfolio/usePortfolio.test.jsx` (and/or a focused `assetTaxonomy`/`priceFeeds` test): `getPortfolioRegistry(1)` yields native ETH + WETH + USDC + USDT + DAI (correct categories, no empty addresses); `getPortfolioChainIds({includeTestnets:false})` includes 1 but excludes 11155111/560048, and includes them when true (FR-006/FR-007); ETH/WETH resolve a USD price from `CHAINLINK_FEEDS[1]` while an unpriceable non-stablecoin stays `usd:null` and is excluded from sums; a failed balance read lands in `failedAssets`, never coerced to zero (FR-008). Contracts C6–C8.

### Implementation for User Story 2

- [ ] T010 [US2] Add curated Ethereum-mainnet tokens in `frontend/src/config/assetTaxonomy.js`: append `USDT` (`0xdAC17F958D2ee523a2206206994597C13D831ec7`, 6d, payment-stablecoins) and `DAI` (`0x6B175474E89094C44Da98b954EedeAC495271d0F`, 18d, payment-stablecoins) to `CURATED_REGISTRY[1]` (WETH already present), and add `DAI: { name: 'Dai Stablecoin', homeChainId: null }` to `UNDERLYING_META`. Data-model "Curated token".
- [ ] T011 [P] [US2] Add `CHAINLINK_FEEDS[1]` in `frontend/src/config/priceFeeds.js` with canonical mainnet `*/USD` AggregatorV3 feeds for `ETH` (`0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419`), `BTC` (`0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c`), `LINK` (`0x2c1d072e956AFFC0D435Cb7AC38EF18d24d9127c`), each env-overridable. Data-model "Price feed".

**Checkpoint**: US1 AND US2 both work independently — Ethereum selectable and its assets visible/priced honestly.

---

## Phase 5: User Story 3 - Send & receive on an Ethereum network (Priority: P2)

**Goal**: While an Ethereum network is active, the existing transfer surface sends native
ETH / configured tokens with honest fee disclosure and sanctions screening, and the
existing address-QR surface serves receive — by reuse, no new UI.

**Independent Test**: With Ethereum active and a funded account, send ETH (fee disclosed,
sanctions-blocked recipient rejected) and present the receive QR. Automated below +
quickstart US3.

### Tests for User Story 3 ⚠️ (write first)

- [ ] T012 [P] [US3] Add a focused test (e.g. `frontend/src/test/useChainTokens.ethereum.test.js` or extend an existing transfer test) asserting that for active chain `1` `useChainTokens` returns native `ETH` and the configured USDC stable (so `TransferForm` offers both), and for a chain with a null stablecoin (Hoodi `560048`) it returns native ETH with the stable marked unavailable — proving the picker stays usable native-only (FR-009 edge case). Contract C9.

### Implementation for User Story 3

- [ ] T013 [US3] Confirm send/receive reuse needs **no code change**: verify `components/wallet/TransferForm.jsx` (fee disclosure + `screenOne` sanctions gate) and `components/ui/AddressQRCode.jsx` operate purely off the active chain / account address; if any surface hard-gates to non-Ethereum chains, remove that gate so the Ethereum family is included. Record the outcome; make T012 green.

**Checkpoint**: All three stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T014 [P] Update any supported-networks documentation that enumerates chains (e.g. under `docs/` or a network README) to list the Ethereum family; skip if no such doc exists (do not invent one).
- [ ] T015 Run the full gate locally: `npm run test:frontend`, then `cd frontend && npm run lint` and the axe/a11y checks — all green, no new ESLint errors (constitution IV/V). Fix any fallout.
- [ ] T016 Execute the `quickstart.md` validation (automated section authoritative; manual US1–US3 where a wallet/funds are available) and confirm SC-001..SC-006, including that the default network (Polygon) and existing flows are unchanged (SC-006).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup; **blocks all user stories**.
- **User Stories (Phase 3–5)**: all depend on Foundational. US1, US2, US3 are mutually
  independent afterwards (different files) and can proceed in parallel.
- **Polish (Phase 6)**: depends on the desired stories being complete.

### User Story Dependencies

- **US1 (P1)**: after Foundational. Touches `blockExplorer.js` + tests — independent of US2/US3.
- **US2 (P1)**: after Foundational. Touches `assetTaxonomy.js` + `priceFeeds.js` + portfolio tests — independent of US1/US3.
- **US3 (P2)**: after Foundational. Verification/reuse of transfer + QR — independent of US1/US2.

### Within Each User Story

- Tests written first and expected to fail before the implementation task closes them.
- No model→service layering here (config feature): impl tasks are single-file edits.

### Parallel Opportunities

- T001 (Setup) runs alone; T002 and T003 (Foundational) are different files → **T003 [P]** alongside T002.
- Within US1, T004–T007 (four different test files) all **[P]** together; T008 follows.
- US1, US2, US3 can be executed in parallel once Foundational lands (distinct files):
  - US1 → `blockExplorer.js`
  - US2 → `assetTaxonomy.js` (T010) + `priceFeeds.js` (T011, [P])
  - US3 → transfer/QR verification
- T014 [P] polish doc runs alongside T015/T016 sequencing.

---

## Parallel Example: Foundational + User Story 1 tests

```bash
# After T001, run the two foundational edits in parallel (different files):
Task: "T002 networks.js — Hoodi entry + Sepolia selectable + mainnet comments"
Task: "T003 wagmi.js — register mainnet/sepolia/hoodi chains + transports + getExpectedChain"

# Then launch all US1 tests together (four different files):
Task: "T004 networks.ethereum.test.js"
Task: "T005 networks.mainnet.test.js"
Task: "T006 networks.test.js"
Task: "T007 blockExplorer.test.js"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 Setup → Phase 2 Foundational (CRITICAL — unblocks everything).
2. Phase 3 US1 → **the MVP**: Ethereum mainnet/Hoodi/Sepolia are selectable with honest
   display and correctly-scoped explorer links. This alone satisfies the issue's acceptance
   scenario 1.
3. STOP and validate US1 independently (quickstart US1).

### Incremental Delivery

1. Foundational ready → US1 (select) → demo (MVP, acceptance scenario 1).
2. Add US2 (portfolio) → demo (acceptance scenario 2 — the other issue scenario).
3. Add US3 (send/receive) → demo (completes the user's stated send/receive intent).
4. Polish → full gate green + quickstart + SC verification.

### Notes

- [P] = different files, no incomplete-task dependency.
- Honest-state is a NON-NEGOTIABLE acceptance bar: no invented addresses (Hoodi stablecoin
  stays null), no fabricated balances/prices, testnet holdings gated, explorer links scoped.
- Commit after each task or logical group; keep the default network (Polygon) untouched.
