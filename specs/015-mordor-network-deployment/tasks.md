---
description: "Task list for Mordor Network Deployment"
---

# Tasks: Mordor Network Deployment

**Input**: Design documents from `/specs/015-mordor-network-deployment/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: INCLUDED. Constitution II (Test-First & Comprehensive Coverage) is NON-NEGOTIABLE in this repo, so test tasks are generated for all non-trivial frontend logic, plus on-chain validation/e2e for the deployment.

**Organization**: Tasks are grouped by user story. Note: unlike typical independent stories, US2 and US3 depend on US1's on-chain deployment (a network must be deployed before its UI can show real state or accept real transactions). This is inherent to a "deploy a network" feature and is called out in Dependencies.

**Implementation status (2026-06-16)**: The buildable, no-live-network tasks are DONE and verified — deploy-script + constants hardening (T006/T007), frontend integration (T011/T014/T015/T016/T017/T018/T019/T020), verification + tests (T022/T026), and polish (T027/T028). Frontend suite: **1236/1236 passing**; ESLint clean; `node --check` clean on deploy scripts. The remaining unchecked tasks require the **live Mordor network and the physical floppy admin key** and must be run by the operator: T001–T004 (on-chain verification + funding), T008 (Hardhat dry-run), T009/T010/T012/T013 (deploy → sync → validate), T021 (a dedicated chain-63 resolution-gating test — optional; gating already verified via T022), T023/T024/T025 (on-chain e2e / sanctions / swap), T029/T031 (on-Mordor smoke + full quickstart), and T030 (axe/Lighthouse runs in CI). A smart-contract security review of the deploy-path change is required before T009 (analyze C2).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 / US2 / US3 (maps to spec.md user stories)
- File paths are repo-relative.

## Path Conventions

- Contracts/deploy: `scripts/deploy/`, `scripts/debug/`, `hardhat.config.js`, `deployments/`
- Frontend: `frontend/src/`
- Docs: `docs/`, spec artifacts under `specs/015-mordor-network-deployment/`

---

## Phase 1: Setup (Verification Gates & Scaffolding)

**Purpose**: Resolve the blocking external facts and scaffold env config before any deploy. Per research.md, an existing canonical Classic USD on Mordor is a HARD dependency.

- [ ] T001 **BLOCKING** Verify the canonical Classic USD (USC) ERC-20 contract address and decimals on Mordor (chainId 63) via `https://etc-mordor.blockscout.com`, docs.brale.xyz, and classicusd.com; record the confirmed address + decimals in `specs/015-mordor-network-deployment/research.md` (D3). If no canonical Classic USD exists on Mordor, STOP — the feature is blocked (no mock substitute).
- [ ] T002 [P] Verify ETCswap V3 addresses (factory, swapRouter/SwapRouter02, quoter/QuoterV2, NonfungiblePositionManager), the WETC address, and whether a Classic USD ↔ WETC pool with liquidity exists on Mordor (github.com/etcswap, docs.etcswap.org, on-chain); record in `specs/015-mordor-network-deployment/research.md` (D4). Non-blocking — swap hides cleanly if absent.
- [ ] T003 [P] Confirm the Mordor test-ETC faucet URL and the ETCswap app/swap URL; record in `specs/015-mordor-network-deployment/research.md` (D5) for the Network-tab card links.
- [ ] T004 [P] Confirm the admin/deployer address (floppy `admin-keystore.json`) and fund it with enough Mordor test ETC for gas; confirm `npm run floppy:mount` + `FLOPPY_KEYSTORE_PASSWORD` loads the key (research.md D8).
- [x] T005 [P] Add `VITE_RPC_URL_MORDOR`, `VITE_MORDOR_USC`, `VITE_MORDOR_ETCSWAP_FACTORY`, `VITE_MORDOR_ETCSWAP_SWAP_ROUTER`, `VITE_MORDOR_ETCSWAP_QUOTER`, `VITE_MORDOR_ETCSWAP_POSITION_MANAGER`, and `VITE_MORDOR_WETC` to `.env.example` with explanatory comments.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The honest-state deploy path. The stock script ships mocks on null-config networks; this phase makes a real-tokens-only, core-only deploy possible (Constitution III).

**⚠️ CRITICAL**: No deploy (US1) can run until this phase is complete and dry-run-verified.

- [x] T006 Update `scripts/deploy/lib/constants.js`: set `TOKENS.mordor.USC` to the verified Classic USD address (from T001) and `TOKENS.mordor.WETC` to the verified WETC (from T002); keep `POLYMARKET_CTF.mordor`, `CHAINLINK_*_.mordor`, `UMA_OOV3.mordor` null; confirm `NETWORK_CONFIG.mordor` (chainId 63, RPC, Blockscout). Add a per-network flag (e.g. `noPolymarket: true` / `requireRealStablecoin: true`) for Mordor consumed by T007.
- [x] T007 Harden `scripts/deploy/deploy.js` for the Mordor core-only path (depends on T006): (a) when the network is flagged no-Polymarket, skip `resolvePolymarketCTF` + `PolymarketOracleAdapter` and pass `address(0)` to `WagerRegistry` (supported per `WagerRegistry.sol:126`); (b) when `requireRealStablecoin`, never deploy a `MockERC20` stablecoin — throw and abort if `TOKENS.mordor.USC` is unset/invalid; (c) avoid the mock wrapped-native — construct `WagerRegistry` with `initialTokens=[classicUSD]` (or `[classicUSD, WETC]` if real WETC confirmed); (d) ensure `SanctionsGuard` is deployed and wired/enforced on `WagerRegistry`.
- [ ] T008 Dry-run the hardened deploy on a local Hardhat network/fork to confirm core-only behavior (depends on T007): assert NO `MockPolymarketCTF`, NO `MockERC20`, `WagerRegistry.polymarketAdapter == address(0)`, `SanctionsGuard` enforced, and only the intended stake token(s) allowlisted. Capture output for review.

**Checkpoint**: Deterministic, mock-free deploy path proven locally.

---

## Phase 3: User Story 1 - Deploy core v2 to Mordor with the admin key (Priority: P1) 🎯 MVP

**Goal**: The core v2 contracts are live on Mordor with Classic USD as the payment token, recorded as the source of truth, and wired into the frontend via the sync artifact.

**Independent Test**: Run the deploy with the admin key; confirm the four core contracts are LIVE on `etc-mordor.blockscout.com`, `deployments/mordor-chain63-v2.json` lists all addresses with no mocks/oracle adapters, and `MORDOR_CONTRACTS` in `contracts.js` reflects them — no secrets leaked.

- [ ] T009 [US1] Deploy core v2 to Mordor with the admin key (depends on T001, T007, T008): `npm run floppy:mount`; `export FLOPPY_KEYSTORE_PASSWORD=…`; optional `export TREASURY=0x…`; `npx hardhat run scripts/deploy/deploy.js --network mordor`. Produces `deployments/mordor-chain63-v2.json`. Run `npm run floppy:unmount` after.
- [ ] T010 [US1] Validate `deployments/mordor-chain63-v2.json` against `specs/015-mordor-network-deployment/contracts/deployment-record.md`: `paymentToken` = real Classic USD, `mocks` = null, `contracts` = exactly {wagerRegistry, membershipManager, keyRegistry, sanctionsGuard}, no oracle adapter keys, `chainId` 63.
- [x] T011 [P] [US1] Reset the `MORDOR_CONTRACTS` block in `frontend/src/config/contracts.js` to the v2 shape, removing all v1-only fields listed in `data-model.md` (roleManagerCore, tieredRoleManager, friendGroupMarketFactory, zkKeyManager, etc.).
- [ ] T012 [US1] Run `npm run sync:frontend-contracts -- --network mordor --chainId 63` (depends on T009, T011); confirm `MORDOR_CONTRACTS` holds the four core addresses + `paymentToken` and no oracle keys.
- [ ] T013 [US1] Read-only on-chain validation (depends on T009): `npx hardhat run scripts/debug/validate-amoy-deployment.js --network mordor`; confirm the core contracts report LIVE at recorded addresses and oracle adapters are intentionally absent. No transactions sent.
- [x] T014 [P] [US1] Extend `frontend/src/test/contractsConfig.test.js` (depends on T012): assert `getContractAddressForChain('wagerRegistry'|'membershipManager'|'keyRegistry'|'sanctionsGuard'|'paymentToken', 63)` resolve to valid addresses, and `getContractAddressForChain('polymarketAdapter'|'chainlinkDataFeedAdapter'|'chainlinkFunctionsAdapter'|'umaAdapter', 63)` return undefined.

**Checkpoint**: FairWins core is live on Mordor and the app reads its addresses from the synced artifact (MVP).

---

## Phase 4: User Story 2 - Select Mordor and read its documentation on the Network tab (Priority: P2)

**Goal**: Mordor appears as a selectable card on My Account → Network with truthful capability tags and operational documentation, and switching to it works.

**Independent Test**: Open the Network tab; confirm a Mordor card (Testnet badge) with correct tags (4 core ✓, oracles —, swap per ETCswap config) and docs (ETC, faucet, Blockscout, Classic USD, ETCswap); switch to Mordor via wallet confirmation.

### Tests for User Story 2 (write first, ensure they fail)

- [x] T015 [P] [US2] Extend `frontend/src/test/NetworkSettings.test.jsx`: Mordor card renders with Testnet badge; capability tags show P2P Wagers/Memberships/Encrypted Wagers/Sanctions Guard available and Polymarket/Chainlink/UMA unavailable (Token Swap available only when `dex` set); Switch button calls `switchChain({ chainId: 63 })`; the docs section renders explorer/faucet/stablecoin/swap links.

### Implementation for User Story 2

- [x] T016 [US2] Add the `NETWORKS[63]` entry to `frontend/src/config/networks.js` per `contracts/network-config.md` (chainId 63, `selectable:true`, ETC native currency, Blockscout explorer, Classic USD `stablecoin` with verified decimals, ETCswap `dex` gated on `VITE_MORDOR_ETCSWAP_*`, `polymarket:null`, `resources:{faucet,dexUrl}`, `capabilities` with `polymarketSidebets:false`).
- [x] T017 [US2] Add the per-network operational-docs section to `frontend/src/components/wallet/NetworkSettings.jsx` per `contracts/network-tab-card.md` (native currency, faucet, explorer, stablecoin, swap; external links with `rel="noopener noreferrer"` + descriptive accessible names; semantic markup) — sourced from the network object, no hardcoded addresses (depends on T016).
- [x] T018 [P] [US2] Add the docs-section styles to `frontend/src/components/wallet/NetworkSettings.css`.
- [x] T019 [US2] Make the legacy Testnet/Mainnet toggle degrade gracefully when the active chain is Mordor (`isOtherChain`) in `frontend/src/hooks/useNetworkMode.js` consumers (`frontend/src/components/.../FairWinsUserModal.jsx` and `UserManagementModal.jsx`): hide/disable the toggle with a hint to use Network settings, rather than render a broken state (depends on T016).
- [x] T020 [US2] Run `npm run test:frontend` and confirm T015 passes (depends on T016–T019).

**Checkpoint**: Mordor is discoverable, documented, and switchable on the Network tab with truthful tags.

---

## Phase 5: User Story 3 - Transact in Classic USD on Mordor with correct accommodations (Priority: P3)

**Goal**: Users create/accept wagers in Classic USD on Mordor; unavailable features (Polymarket/Chainlink/UMA) are hidden; Sanctions Guard is enforced; swap works via ETCswap when liquidity exists.

**Independent Test**: On Mordor, purchase a tier and run an Either-resolution Classic USD wager create→accept→declare→claim plus a refund path; confirm only peer resolution types are offered, sanctioned addresses are blocked, and swap is present (with liquidity) or cleanly hidden.

### Tests for User Story 3 (write first, ensure they fail)

- [ ] T021 [P] [US3] Add a resolution-gating test in `frontend/src/test/FriendMarketsModal.test.jsx` (or a new test): for chainId 63 with no oracle adapters present, only peer resolution types (Either/Creator/Opponent/ThirdParty) are offered and Polymarket/Chainlink/UMA types are absent.

### Implementation / verification for User Story 3

- [x] T022 [US3] Verify (and adjust only if needed) that the primary create-wager surface gates oracle resolution types on deployed adapters per chain in `frontend/src/components/fairwins/FriendMarketsModal.jsx` and any "Make an Offer" create flow; confirm peer-only on Mordor (data-driven — expected no change).
- [ ] T023 [US3] End-to-end smoke on Mordor (depends on T009): `npx hardhat run scripts/e2e-wager-flow.js --network mordor` exercising Classic USD tier purchase, an Either-resolution wager create→accept→declareWinner→claim, and a refund path; oracle steps skipped (no adapters). Requires test USC + ETC on the e2e accounts.
- [ ] T024 [US3] Verify the Sanctions Guard is enforced on Mordor participation (depends on T009): a blocked/sanctioned test address is rejected on participation, consistent with other networks.
- [ ] T025 [US3] If ETCswap was confirmed (T002): verify in-app swap of native ETC → Classic USD works while Mordor is active; otherwise confirm Token Swap is cleanly hidden (`dex == null`) with accurate messaging (depends on T016).
- [x] T026 [US3] Run `npm run test:frontend` and confirm T021 passes (depends on T021, T022).

**Checkpoint**: Peer-to-peer wagering in Classic USD works on Mordor with honest accommodations.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, hygiene, isolation, and accessibility across the feature.

- [x] T027 [P] Update network/architecture docs under `docs/` (FR-015): Mordor as a supported v2 testnet — Classic USD, ETCswap, Blockscout explorer, faucet, capability matrix, and the retirement of the legacy v1 Mordor deployment.
- [x] T028 [P] Fix the `deploy:mordor` script in `package.json` (currently points at a non-existent `scripts/deploy/deploy-deterministic.js`) to use `scripts/deploy/deploy.js`.
- [ ] T029 Smoke the app on Mordor to confirm no code path throws on now-absent v1 fields (guarded no-ops) and verify network isolation (FR-009, SC-006): no Mordor data appears on other networks and vice versa, and no legacy v1 Mordor data appears anywhere.
- [ ] T030 [P] Accessibility check on the new card docs (axe/Lighthouse, Constitution V): external links have descriptive accessible names + `rel="noopener noreferrer"`, sufficient contrast — confirm no new violations in CI.
- [ ] T031 Run the full `specs/015-mordor-network-deployment/quickstart.md` end-to-end and confirm SC-001 through SC-007.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Start immediately. T001 is BLOCKING for the whole feature.
- **Foundational (Phase 2)**: Depends on T001 (real stablecoin) + T002 (WETC). Blocks the deploy.
- **US1 (Phase 3)**: Depends on Foundational (T007, T008) + T001. This is the MVP and the substrate for US2/US3.
- **US2 (Phase 4)**: Depends on US1 (T012 sync) for truthful tags; T016 may be drafted earlier but its acceptance needs synced addresses.
- **US3 (Phase 5)**: Depends on US1 (deployment) and on US2's `NETWORKS[63]` registration (T016) for the active-network stablecoin/dex.
- **Polish (Phase 6)**: After US1–US3.

### User Story Dependencies

- **US1 (P1)**: Independent (given Setup + Foundational). Delivers the deployment.
- **US2 (P2)**: Depends on US1 output (synced addresses).
- **US3 (P3)**: Depends on US1 (deployment) + US2 (`NETWORKS[63]`).

### Within Each Story

- Frontend: write the failing test (T015/T021) before implementation.
- Config/entity before component (T016 before T017); component before toggle integration.
- Deploy (T009) before validation (T010/T013) and e2e (T023).

### Parallel Opportunities

- Setup: T002, T003, T004, T005 in parallel (T001 first/blocking).
- US1: T011 [P] and T014 [P] (T014 after sync).
- US2: T015 [P] (test) and T018 [P] (CSS).
- US3: T021 [P] (test).
- Polish: T027, T028, T030 in parallel.

---

## Parallel Example: Phase 1 Setup

```bash
# After T001 (blocking) is confirmed, run the rest of Setup in parallel:
Task: "T002 Verify ETCswap + WETC + liquidity on Mordor → research.md"
Task: "T003 Confirm Mordor faucet + ETCswap app URLs → research.md"
Task: "T004 Confirm + fund deployer (admin key) with Mordor test ETC"
Task: "T005 Add VITE_MORDOR_* env vars to .env.example"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup (esp. T001 blocking verification).
2. Phase 2 Foundational (mock-free core-only deploy path + dry-run).
3. Phase 3 US1 — deploy, record, sync, validate.
4. **STOP & VALIDATE**: contracts LIVE on Blockscout; record + synced config correct; no secrets leaked.

### Incremental Delivery

1. Setup + Foundational → mock-free deploy path ready.
2. US1 → core live + synced (MVP).
3. US2 → Mordor selectable + documented on the Network tab.
4. US3 → Classic USD wagering + accommodations.
5. Polish → docs, isolation, a11y, full quickstart.

---

## Notes

- [P] = different files, no dependencies on incomplete tasks.
- T001 is a hard gate: if no canonical Classic USD exists on Mordor, the feature stops (no mock).
- No Solidity changes — `WagerRegistry` already supports a zero Polymarket adapter; the deploy hardening (T006–T008) is what keeps Mordor mock-free (Constitution III).
- Commit after each task or logical group; never commit secrets/keys.
- Use the air-gapped floppy keystore for the deploy (T009); unmount after.
