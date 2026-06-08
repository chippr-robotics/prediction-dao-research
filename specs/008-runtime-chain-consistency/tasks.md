---
description: "Task list for Runtime Chain Consistency Across Frontend Modals"
---

# Tasks: Runtime Chain Consistency Across Frontend Modals

**Input**: Design documents from `/specs/008-runtime-chain-consistency/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/chain-resolution.md, quickstart.md

**Tests**: INCLUDED — Constitution Principle II (Test-First) is NON-NEGOTIABLE; each behavior is proven by Vitest before/with implementation.

**Organization**: Grouped by the three user stories (P1→P3) from spec.md. `PremiumPurchaseModal` (tier read + purchase) is already chain-aware from PR #643 and is the reference pattern for the rest.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 (setup, foundational, polish carry no story label)
- All paths are repository-relative; the frontend root is `frontend/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Conventions and test scaffolding reused by every later task.

- [x] T001 [P] Add reusable chain-aware test helpers (mock `getContractAddressForChain`, fake signer/provider exposing a `chainId`) in `frontend/src/test/helpers/chainMocks.js`
- [ ] T002 Add a thin `useActiveChainId()` hook that returns `useWeb3().chainId` and documents the disconnected→primary-chain fallback, in `frontend/src/hooks/useActiveChainId.js`, referencing `specs/008-runtime-chain-consistency/contracts/chain-resolution.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Primitives every user story depends on.

**⚠️ CRITICAL**: No user-story work begins until this phase is complete.

- [x] T003 [P] Create accessible `NetworkUnavailableNotice` (WCAG 2.1 AA: role/alert, focusable action) wired to the existing `switchNetwork()`, in `frontend/src/components/ui/NetworkUnavailableNotice.jsx` (+ `NetworkUnavailableNotice.css`)
- [x] T004 Scope the local role/purchase cache by `(chainId, walletAddress)` in `frontend/src/utils/roleStorage.js` (update `getRoleStorageKey` and all exported signatures to take `chainId`; treat legacy account-only entries as absent), and update its callers to pass `chainId`
- [x] T005 Add the regression-guard scanning test in `frontend/src/test/chainResolutionGuard.test.js` that fails on any `getContractAddress(` or argless `getProvider()` under `src/hooks|components|pages` and chain-scoped `src/utils|data`, with an explicit allowlist of the not-yet-migrated files (each migration task removes its entry)

**Checkpoint**: Notice component, per-chain cache, and the "no new offenders" guard exist — migrations can begin.

---

## Phase 3: User Story 1 - See and act on the network my wallet is on (Priority: P1) 🎯 MVP

**Goal**: Every read/display/transaction path resolves contract addresses + providers for the connected `chainId`, so a user who connects on any supported network sees only that network's data and transacts there (display↔execution parity).

**Independent Test**: Connect on each supported network and walk every modal; all chain-scoped values and all initiated transactions correspond to the connected network (e.g., no membership on the connected chain ⇒ all tiers offered).

### Tests for User Story 1

- [x] T006 [P] [US1] Test `useTierPrices` resolves `membershipManager` for the active `chainId` (prices/limits) in `frontend/src/test/useTierPrices.chain.test.js`
- [x] T007 [P] [US1] Test `useRoleDetails` resolves membership reads for the connected `chainId` in `frontend/src/test/useRoleDetails.chain.test.js`
- [ ] T008 [P] [US1] Test remaining `blockchainService` read helpers (stats, key registry, role-manager, friend factory, balance/allowance) resolve for the passed `chainId` in `frontend/src/test/blockchainService.chain.test.js`
- [ ] T009 [P] [US1] Test `EventsSource` and service wager reads resolve for the passed `chainId` in `frontend/src/test/eventsSource.chain.test.js`
- [x] T010 [P] [US1] Test `roleStorage` returns a record only for its `(chainId, account)` and never across chains in `frontend/src/test/roleStorage.chain.test.js`

### Implementation for User Story 1 — hooks

- [x] T011 [P] [US1] Migrate `useTierPrices` to `getContractAddressForChain(name, chainId)` + `getProvider(chainId)` (chainId from `useActiveChainId`); remove its guard allowlist entry — `frontend/src/hooks/useTierPrices.js`
- [x] T012 [P] [US1] Migrate `useRoleDetails` to resolve `membershipManager` for the connected `chainId` (already reads via wallet provider) — `frontend/src/hooks/useRoleDetails.js`
- [ ] T013 [P] [US1] Migrate `useTreasuryVault` reads to chain-aware — `frontend/src/hooks/useTreasuryVault.js`
- [x] T014 [P] [US1] Migrate `useSiteStats` (address + argless `getProvider()`) to chain-aware — `frontend/src/hooks/useSiteStats.js`
- [x] T015 [P] [US1] Migrate `useFriendMarketCreation` (registry/token reads + write execution) to chain-aware with display↔execution parity — `frontend/src/hooks/useFriendMarketCreation.js`
- [ ] T016 [P] [US1] Migrate `useNullifierContracts` to chain-aware — `frontend/src/hooks/useNullifierContracts.js`

### Implementation for User Story 1 — services & data

- [ ] T017 [US1] Add an optional `chainId` to the remaining build-bound read helpers in `frontend/src/utils/blockchainService.js` (stats, key registry, role-manager, friend factory, balance/allowance), resolving via `getContractAddressForChain` + `getProvider(chainId)`
- [x] T018 [P] [US1] Migrate `keyRegistryService` to accept/resolve `chainId` — `frontend/src/utils/keyRegistryService.js`
- [x] T019 [P] [US1] Migrate `sanctionsScreen` to accept/resolve `chainId` — `frontend/src/utils/sanctionsScreen.js`
- [ ] T020 [P] [US1] Migrate `EventsSource` (address + argless `getProvider()`) to chain-aware — `frontend/src/data/wagers/EventsSource.js`
- [x] T021 [P] [US1] N/A — `WalletButton` uses wagmi `connector.getProvider()` (already chain-aware); the audit's argless-`getProvider()` match was a false positive — `frontend/src/components/wallet/WalletButton.jsx`

### Implementation for User Story 1 — modals & pages (consume chainId, pass to services)

- [x] T022 [P] [US1] Migrate `FriendMarketsModal` contract reads to chain-aware (pass `chainId` to services) — `frontend/src/components/fairwins/FriendMarketsModal.jsx`
- [x] T023 [P] [US1] Migrate `MyMarketsModal` (5 build-bound sites) to chain-aware — `frontend/src/components/fairwins/MyMarketsModal.jsx`
- [x] T024 [P] [US1] Migrate `MarketAcceptancePage` (read + write) to chain-aware with display↔execution parity — `frontend/src/pages/MarketAcceptancePage.jsx`
- [x] T025 [P] [US1] Migrate `AdminPanel` reads to chain-aware — `frontend/src/components/AdminPanel.jsx`
- [x] T026 [US1] Remove each migrated file's entry from the guard allowlist (T005) as it is completed; confirm `chainResolutionGuard.test.js` shrinks accordingly — `frontend/src/test/chainResolutionGuard.test.js`

**Checkpoint**: A user connected on any single supported network sees only that network's data and transacts there. MVP complete.

---

## Phase 4: User Story 2 - Switching networks updates the UI immediately (Priority: P2)

**Goal**: Changing networks re-resolves and re-fetches all visible chain-scoped values without a page reload, showing a loading state and never a stale prior-chain value.

**Independent Test**: With a modal open, switch networks; values re-resolve to the new chain within ~2 s with no stale values.

### Tests for User Story 2

- [ ] T027 [P] [US2] Hook re-fetch-on-`chainId`-change tests (chainId in deps; prior value cleared) for the migrated hooks in `frontend/src/test/chainSwitch.refetch.test.jsx`
- [ ] T028 [P] [US2] Modal switch-refresh integration test (open modal, change `chainId`, values re-resolve, no stale, loading shown) in `frontend/src/test/chainSwitch.modal.test.jsx`

### Implementation for User Story 2

- [ ] T029 [P] [US2] Ensure `useTierPrices`/`useRoleDetails`/`useTreasuryVault`/`useSiteStats` include `chainId` in their effect/memo dependencies and clear stale state on change (their files, mirroring `PremiumPurchaseModal`)
- [ ] T030 [P] [US2] Add `chainId`-dependency + stale-reset to the stateful modals `FriendMarketsModal`, `MyMarketsModal`, `MarketAcceptancePage`, `AdminPanel` (their files)
- [ ] T031 [US2] Apply a shared loading state while chain-scoped values re-resolve after a switch across the migrated modals (reuse the `PremiumPurchaseModal` loading pattern)

**Checkpoint**: Switching networks is reflected immediately and correctly everywhere; US1 + US2 both pass.

---

## Phase 5: User Story 3 - Clear guidance when an action isn't available (Priority: P3)

**Goal**: On a connected network lacking a needed deployment (or an unsupported chain), the UI shows the `NetworkUnavailableNotice` (naming a supported network + one-click switch) instead of a silent wrong-chain read or generic error.

**Independent Test**: Connect to a network without a needed deployment and open the action; the actionable notice appears, no generic "contract not found", no build-time data.

### Tests for User Story 3

- [x] T032 [P] [US3] `NetworkUnavailableNotice` component test (message names a supported network, switch action invokes `switchNetwork`, correct ARIA role) in `frontend/src/test/NetworkUnavailableNotice.test.jsx`
- [ ] T033 [P] [US3] Per-path "renders notice / actionable error when address absent on connected chain" tests in `frontend/src/test/networkUnavailable.paths.test.jsx`

### Implementation for User Story 3

- [ ] T034 [P] [US3] Render `NetworkUnavailableNotice` in the membership/admin/stats views when `getContractAddressForChain` is falsy (their files)
- [ ] T035 [P] [US3] Render `NetworkUnavailableNotice` in the wager modals (`FriendMarketsModal`, `MyMarketsModal`, `MarketAcceptancePage`) for missing deployments (their files)
- [ ] T036 [US3] Replace remaining generic "contract not found / not configured" errors with actionable, network-named messages in `frontend/src/utils/blockchainService.js` and `frontend/src/utils/keyRegistryService.js`

**Checkpoint**: All three stories pass; remaining failure modes are actionable guidance.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T037 Regression guard for `getContractAddress(` / argless `getProvider()` in user-facing paths — implemented as a **vitest source-scanning guard** (`frontend/src/test/chainResolutionGuard.test.js`) rather than an ESLint rule. Runs in CI and fails loudly (Constitution IV); chosen over ESLint to avoid littering `eslint-disable` comments across the fallback-heavy service layer. Satisfies FR-011.
- [x] T038 Empty the guard allowlist and assert zero offenders in `frontend/src/test/chainResolutionGuard.test.js`; fix any stragglers (closes FR-011)
- [ ] T039 [P] Run `npm run lint` and `npx vitest run` from `frontend/`; ensure lint passes and the full suite (851 existing + new) is green
- [ ] T040 Execute the `quickstart.md` manual matrix (Scenarios A–D on Amoy and mainnet, incl. the tier-leak repro); record results in the PR
- [ ] T041 [P] Update PR #643 description and any frontend docs to note the runtime chain-consistency guarantee

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (P1)**: no dependencies.
- **Foundational (P2)**: depends on Setup; **blocks all user stories** (T004 cache + T003 notice + T005 guard are prerequisites).
- **US1 (P3 phase)**: depends on Foundational. The MVP.
- **US2 (P4 phase)**: depends on US1 (it enhances the files US1 migrated). Independently *testable*, but its impl tasks touch US1's files.
- **US3 (P5 phase)**: depends on Foundational (T003 notice) and on US1 (paths must resolve chain-aware first). Independently testable.
- **Polish (P6)**: depends on US1–US3 complete (the guard can only be fully enforced once every path is migrated).

### Within US1

- Tests T006–T010 [P] first (Constitution II), then implementation.
- T017 (service `chainId` params) should land before/with the modals that call those services (T022–T025) and before T026 trims the allowlist for those files.
- All `[P]` implementation tasks operate on different files and can run concurrently.

### Parallel Opportunities

- Setup T001 ∥ (T002 after, small).
- Foundational T003 ∥ T005; T004 is sequential (touches callers).
- US1: tests T006–T010 all ∥; hook migrations T011–T016 all ∥; service/data T018–T021 ∥ (T017 gates the modal tasks); modal migrations T022–T025 ∥.
- US3: T034 ∥ T035; tests T032 ∥ T033.

---

## Parallel Example: User Story 1 (hooks)

```bash
# Tests first (different files):
Task: "T006 useTierPrices chain test in frontend/src/test/useTierPrices.chain.test.js"
Task: "T007 useRoleDetails chain test in frontend/src/test/useRoleDetails.chain.test.js"
Task: "T008 blockchainService chain test in frontend/src/test/blockchainService.chain.test.js"

# Then hook migrations (different files):
Task: "T011 migrate useTierPrices"
Task: "T012 migrate useRoleDetails"
Task: "T013 migrate useTreasuryVault"
Task: "T014 migrate useSiteStats"
Task: "T015 migrate useFriendMarketCreation"
Task: "T016 migrate useNullifierContracts"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → Phase 2 Foundational (notice, per-chain cache, guard scaffold).
2. Phase 3 US1: migrate every read/display/transaction path to resolve for the connected `chainId`.
3. **STOP & VALIDATE**: connect on Amoy and on mainnet; confirm each modal shows the connected chain's data and the tier-leak repro is gone. Ship the MVP.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. US1 → test on both networks → demo (MVP, closes the reported defects).
3. US2 → switch-refresh → demo.
4. US3 → unavailable-network guidance → demo.
5. Polish → enforce the guard (FR-011), run the quickstart matrix.

---

## Notes

- `PremiumPurchaseModal` (tier read + purchase) is already chain-aware (PR #643) and is the reference implementation for every migration here.
- `[P]` = different files, no dependency on an incomplete task.
- This is a frontend-only refactor: no `contracts/` changes, no redeploys (Constitution I N/A).
- Commit after each task or logical group; keep CI green by trimming the guard allowlist (T026) as files migrate rather than enabling full enforcement before migrations finish (T037/T038).
- Verify each new test fails before its implementation lands (Constitution II).
