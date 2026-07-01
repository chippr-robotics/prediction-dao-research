---
description: "Task list for Intent-Based Signatures (Spec 035)"
---

# Tasks: Intent-Based Signatures (Platform-Wide Gasless UX)

**Input**: Design documents from `/specs/035-intent-based-payments/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: INCLUDED — the constitution makes Test-First & Comprehensive Coverage NON-NEGOTIABLE (Principle II), so contract/integration/frontend/a11y tests are first-class tasks, written before the code they cover.

**Organization**: Tasks are grouped by the four user stories from spec.md so each can be implemented and validated as an independent increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US4 (Setup/Foundational/Polish carry no story label)
- Exact file paths are included in each description.

## Path Conventions

Web project: Solidity under `contracts/`, tests under `test/`, frontend under `frontend/src/`, deploy under `scripts/deploy/`, recorded addresses under `deployments/` — per plan.md Structure Decision.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Scaffolding and config that later phases build on.

- [ ] T001 [P] Scaffold `contracts/upgradeable/SignerIntentBase.sol` (abstract skeleton: `EIP712Upgradeable` import, `intentAuthorizationState` storage, empty `_verifyIntent`/`invalidateNonce` stubs + NatSpec)
- [ ] T002 [P] Scaffold `frontend/src/lib/relay/` (`intentClient.js`, `intentTypes.js`, `useIntentAction.js` stubs) and `frontend/src/components/intents/IntentStatus.jsx` stub, per `contracts/frontend-relay-client.md`
- [ ] T003 [P] Add a `domainVersion` field to each network's `stablecoin` config in `frontend/src/config/networks.js` (native Circle USDC `'2'`; bridged USDC.e `'1'`; Mordor USC left null = no EIP-3009)
- [ ] T004 [P] Add `cancelAuthorization(authorizer, nonce, v, r, s)` to `contracts/mocks/MockUSDCPermit.sol` so FR-006 payment-leg invalidation is testable

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared intent layer + the contract internal refactor + the relay client. **No user story can begin until this phase is complete.**

**⚠️ CRITICAL**: These block all of US1–US4.

- [ ] T005 Implement `contracts/upgradeable/SignerIntentBase.sol`: `EIP712` init, 2-D `mapping(address => mapping(bytes32 => bool)) intentAuthorizationState` in **ERC-7201 namespaced** storage (zero gap cost, safe as a base — like `EIP712Upgradeable`), `_verifyIntent(structHash, signer, nonce, validAfter, validBefore, sig)` (recover + `validAfter <= block.timestamp <= validBefore` + single-use, checks-effects order), `invalidateNonce(bytes32)`, `invalidateNonceWithSig(...)`, and `authorizationState`/`DOMAIN_SEPARATOR` views (per `contracts/intent-eip712-schemas.md`)
- [ ] T006 [P] Unit tests for `SignerIntentBase` (nonce single-use, replay revert, `invalidateNonce`, validity-window `validAfter`/`validBefore` bounds, per-contract domain isolation) in `test/intent/SignerIntentBase.test.js` — write first, must fail
- [ ] T007 Upgrade `contracts/wagers/WagerRegistry.sol`: inherit `SignerIntentBase` (its nonce map is namespaced — no sequential slot); append **only** the fee-netting scalars (`feeNettingEnabled`+`gasFeeRecipient` packed, `maxGasFee`) above `__gap`; decrement `__gap` 48→46 (2 slots); add `setFeeNetting(...)` admin (floppy-signed)
- [ ] T008 Refactor `contracts/wagers/WagerRegistry.sol` action bodies to internal `_fn(address actor, …)` (create/accept/claim/refund/draw/revoke/cancel/decline/declareWinner); existing external functions call `_fn(msg.sender, …)` with **no behavior change** (depends on T007)
- [ ] T009 [P] Upgrade `contracts/access/MembershipManager.sol`: add `EIP712Upgradeable` + `SignerIntentBase` (both namespaced — no sequential slots); add `reinitializer(2)` calling `__EIP712_init("FairWins MembershipManager","1")`; append **only** the fee scalars above `__gap`; decrement `__gap` 49→47 (2 slots); add `setFeeNetting(...)` admin
- [ ] T010 Refactor `contracts/access/MembershipManager.sol` bodies to internal `_fn(address actor, …)` (purchase/upgrade/extend/redeem); existing externals call `_fn(msg.sender, …)` (depends on T009)
- [ ] T011 [P] Confirm append-only storage: run `npm run check:storage-layout` for both proxies and ensure OZ `validateUpgrade` passes (validates T007/T009)
- [ ] T012 [P] Implement `frontend/src/lib/relay/intentClient.js` (`signIntent` for both classes, `makeRelayer`, `relayIntent`, `pollStatus`, `probeHealth`) + `intentTypes.js` (EIP-712 structs per action) per `contracts/frontend-relay-client.md`
- [ ] T013 Implement `frontend/src/lib/relay/useIntentAction.js` — `probeHealth → signIntent → relayIntent → pollStatus`, falling back to a caller-supplied `selfSubmit()` on `RelayerUnavailable`/unset/`payment_unsupported_on_chain` (the never-stranded enforcement point) (depends on T012)
- [ ] T014 [P] Implement `frontend/src/components/intents/IntentStatus.jsx` — honest lifecycle (signed/pending/confirmed/expired/invalidated/failed), WCAG 2.1 AA (text labels, `aria-live`), mapped onto spec 031 `ActivityEntry`
- [ ] T015 [P] Add upgrade scripts for both proxies via `scripts/deploy/lib/upgradeable.js` (`upgradeProxy` with the reinitializer call), and a `setFeeNetting` ops script

**Checkpoint**: Shared intent layer + refactored contracts + relay client ready — user stories can proceed (in parallel if staffed).

---

## Phase 3: User Story 1 - Sign-to-stake for wagers (Priority: P1) 🎯 MVP

**Goal**: A zero-native-balance wallet creates a wager and another accepts it, each with one signature and no approval; on-chain `creator`/`opponent` = the signers.

**Independent Test**: With a stablecoin-only, zero-native wallet, `createWagerWithAuthorization` then `acceptWagerWithAuthorization` succeed; on-chain state records the two signers and escrows from their balances (SC-001/SC-003).

### Tests for User Story 1 ⚠️ (write first, must fail)

- [ ] T016 [P] [US1] Contract tests for `createWagerWithAuthorization` + `acceptWagerWithAuthorization` (signer attribution, EIP-3009 pull from signer, atomicity, replay/expiry revert, fail-closed signer screening, fee-netting decline over cap) in `test/intent/WagerCreateAccept.intent.test.js`
- [ ] T017 [P] [US1] Integration test: zero-native wallet create + accept end-to-end in `test/integration/gasless-create-accept.test.js`

### Implementation for User Story 1

- [ ] T018 [US1] Implement `createWagerWithAuthorization` + `createOpenWagerWithAuthorization` in `contracts/wagers/WagerRegistry.sol` (verify intent, EIP-3009 stake pull from `signer`, call `_createWager(signer,…)`, atomic, fee-netting) (depends on T008)
- [ ] T019 [US1] Implement `acceptWagerWithAuthorization` + `acceptOpenWagerWithAuthorization` in `contracts/wagers/WagerRegistry.sol` (two-sig open-accept rebinding claim-code proof to `taker = signer`) (depends on T008)
- [ ] T020 [P] [US1] Migrate create-wager to `useIntentAction` (payment) with the existing flow as `selfSubmit` fallback in `frontend/src/hooks/useFriendMarketCreation.js`
- [ ] T021 [P] [US1] Migrate accept-wager (`frontend/src/components/fairwins/MarketAcceptanceModal.jsx`) and open-challenge accept (`frontend/src/hooks/useOpenChallengeAccept.js`) to `useIntentAction`
- [ ] T022 [P] [US1] Frontend Vitest for create/accept intent path + self-submit fallback in `frontend/src/hooks/__tests__/intent-create-accept.test.js`
- [ ] T023 [US1] Deploy WagerRegistry upgrade to Amoy: `check:storage-layout` → `upgradeProxy` → record `wagerRegistryImpl` in `deployments/amoy-*.json` (depends on T018, T019)

**Checkpoint**: MVP — gasless create + accept work on Amoy, self-submit twin verified.

---

## Phase 4: User Story 2 - Sign-to-act for no-stake outcomes (Priority: P2)

**Goal**: Claim/refund/draw/cancel/decline and voucher redeem via one signature, no native gas; effect attributed to the signer.

**Independent Test**: A zero-native winner runs `claimPayoutWithSig` and the payout lands in the winning wallet; a voucher holder redeems via `redeemVoucherWithSig` (SC-009).

### Tests for User Story 2 ⚠️ (write first, must fail)

- [ ] T024 [P] [US2] Contract tests for `claimPayoutWithSig`/`claimRefundWithSig`/`declareDrawWithSig`/`revokeDrawWithSig`/`cancelOpenWithSig`/`declineWagerWithSig`/`declareWinnerWithSig` + `redeemVoucherWithSig` (signer attribution, replay, invalidation, fail-closed) in `test/intent/NoStake.intent.test.js`
- [ ] T025 [P] [US2] Integration test: zero-native winner claims payout in `test/integration/gasless-claim.test.js`

### Implementation for User Story 2

- [ ] T026 [US2] Implement the WagerRegistry no-stake `…WithSig` entrypoints (claim/refund/draw/revoke/cancel/decline/declareWinner) in `contracts/wagers/WagerRegistry.sol` (depends on T008)
- [ ] T027 [US2] Implement `redeemVoucherWithSig` in `contracts/access/MembershipManager.sol` (depends on T010)
- [ ] T028 [P] [US2] Migrate claim/refund/cancel/draw call sites (`frontend/src/components/fairwins/MyMarketsModal.jsx`), decline (`MarketAcceptanceModal.jsx`), and voucher redeem (`frontend/src/hooks/useVouchers.js`) to `useIntentAction` (signer-attributed)
- [ ] T029 [P] [US2] Frontend Vitest for no-stake intent paths + self-submit in `frontend/src/hooks/__tests__/intent-nostake.test.js`

**Checkpoint**: The full wager lifecycle is gasless end-to-end (stake → play → claim).

---

## Phase 5: User Story 3 - Sign-to-join pools & buy membership (Priority: P2)

**Goal**: Pool join and membership purchase/upgrade/extend under one unified one-signature flow; activate the dormant gasless pool-join.

**Independent Test**: A zero-native wallet joins an open pool and appears as a member; another purchases a tier and holds it afterward.

### Tests for User Story 3 ⚠️ (write first, must fail)

- [ ] T030 [P] [US3] Contract tests for `purchaseTierWithAuthorization`/`upgradeTierWithAuthorization`/`extendMembershipWithAuthorization` (EIP-3009 price pull from signer, atomic, fee-netting) in `test/intent/Membership.intent.test.js`
- [ ] T031 [P] [US3] Contract tests for the new pool template `proposeOutcomeFor`/`closeJoiningFor`/`cancelFor`/`refundFor` (signer==creator; refund pays signer) in `test/intent/PoolTemplate.intent.test.js`

### Implementation for User Story 3

- [ ] T032 [US3] Implement `purchaseTierWithAuthorization`/`upgradeTierWithAuthorization`/`extendMembershipWithAuthorization` in `contracts/access/MembershipManager.sol` (depends on T010)
- [ ] T033 [P] [US3] Author the new `contracts/pools/ZKWagerPool.sol` template master with `*For` signer-attributed creator actions (future clones only); leave deployed clones untouched
- [ ] T034 [P] [US3] Frontend: activate dormant gasless pool-join (`frontend/src/hooks/usePools.js`, `GroupPoolModal.jsx`) and migrate membership purchase/upgrade/extend (`frontend/src/utils/blockchainService.js`) + voucher mint (`frontend/src/hooks/useVouchers.js`) to `useIntentAction`
- [ ] T035 [P] [US3] Frontend Vitest for pool-join + membership intent paths + self-submit in `frontend/src/hooks/__tests__/intent-pool-membership.test.js`
- [ ] T036 [US3] Deploy: MembershipManager upgrade to Amoy (record `membershipManagerImpl`); deploy new `poolImpl` + `factory.setTemplate` on Mordor (record `poolImpl`) (depends on T032, T033)

**Checkpoint**: All money-in flows are gasless and consistent; future pools support gasless creator actions.

---

## Phase 6: User Story 4 - Never stranded + honest status (Priority: P2)

**Goal**: Guaranteed self-submit fallback for every covered flow and truthful intent status; the user is never blocked and never sees premature finality.

**Independent Test**: With no relayer reachable, every covered flow completes via self-submit with an identical on-chain result; status transitions are accurate and never show "done" before inclusion (SC-004/SC-005/SC-007).

### Tests for User Story 4 ⚠️ (write first, must fail)

- [ ] T037 [P] [US4] Integration test: 100% self-submit fallback across create/accept/claim/pool-join/membership with the relayer disabled, asserting identical on-chain result in `test/integration/self-submit-fallback.test.js`
- [ ] T038 [P] [US4] Frontend a11y test (axe) over `IntentStatus` + activity entries at WCAG 2.1 AA in `frontend/src/components/intents/__tests__/IntentStatus.a11y.test.js`

### Implementation for User Story 4

- [ ] T039 [US4] Wire `IntentStatus` into all migrated flows and emit a spec 031 `ActivityEntry` per intent (submitted/confirmed/expired/invalidated/failed); never surface "confirmed" before on-chain inclusion (`frontend/src/lib/relay/useIntentAction.js`, `frontend/src/components/intents/IntentStatus.jsx`)
- [ ] T040 [US4] Implement the native-vs-bridged USDC domain pre-sign check with a specific error → self-submit (FR-020) in `frontend/src/lib/relay/intentClient.js`, and extend the revert/reason maps to cover relayer error codes
- [ ] T041 [US4] Expose an explicit "pay your own gas" choice and an "invalidate unsubmitted intent" (FR-006) action at every migrated call site (`frontend/src/lib/relay/useIntentAction.js` + call-site UI)

**Checkpoint**: The never-stranded + honest-state guarantees hold across all flows.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Security, sync, docs, staged rollout, and full validation.

- [ ] T042 [P] Run Slither + Medusa fuzzing on the new entrypoints + mixin (intent replay, cross-contract nonce isolation, atomicity, fee bounds); resolve all high/critical findings (`contracts/`)
- [ ] T043 Smart-contract security review per `.github/agents/smart-contract-security.agent.md` for the mixin + all `…WithSig`/`…WithAuthorization` entrypoints
- [ ] T044 [P] Run `npm run sync:frontend-contracts` to refresh frontend ABIs/addresses after the upgrades
- [ ] T045 [P] Add developer-guide + runbook docs for gasless intents and the fee-netting admin flow in `docs/`
- [ ] T046 Staged rollout: validate the full flow on Amoy → enable no-stake-only intents on Mordor (document the USC/EIP-3009 payment gate) → note Polygon mainnet blocked pending the 025/027 UUPS migration; update `deployments/<net>.json` `…Impl` keys
- [ ] T047 Run all `quickstart.md` scenarios (1–16); confirm `check:storage-layout`, Slither/Medusa, and axe/Lighthouse gates are green

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup — **BLOCKS US1–US4**. Within it: T005 (mixin) → T007/T008 (WagerRegistry) and T009/T010 (MembershipManager, parallel to the WagerRegistry pair); T011 after T007/T009; T012 → T013; T014 parallel.
- **US1 (Phase 3)**: after Foundational. **MVP.**
- **US2 (Phase 4)**, **US3 (Phase 5)**: after Foundational; independent of US1 and of each other (different entrypoints/call sites).
- **US4 (Phase 6)**: the fallback branch exists in Foundational (T013); this phase layers honest-status UI + a11y + explicit choices over US1–US3, so it is validated last.
- **Polish (Phase 7)**: after the desired stories are complete.

### Within Each Story

- Tests first (must fail) → contract entrypoints → frontend migration → deploy.
- Same-file contract tasks are sequential (e.g. T018/T019/T026 all edit `WagerRegistry.sol`); different-file frontend tasks are `[P]`.

### Parallel Opportunities

- Setup: T001–T004 all `[P]`.
- Foundational: the WagerRegistry pair (T007/T008) and the MembershipManager pair (T009/T010) run in parallel; T006, T012, T014 are `[P]`.
- After Foundational: US1, US2, US3 can be staffed in parallel.
- Within a story: the `[P]` test + frontend tasks run together.

---

## Parallel Example: User Story 1

```bash
# Tests first (parallel):
Task T016: Contract tests for create/accept WithAuthorization in test/intent/WagerCreateAccept.intent.test.js
Task T017: Integration test zero-native create+accept in test/integration/gasless-create-accept.test.js

# Frontend migration (parallel, different files):
Task T020: migrate useFriendMarketCreation.js
Task T021: migrate MarketAcceptanceModal.jsx + useOpenChallengeAccept.js
Task T022: Vitest for create/accept intent path
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 Setup → 2. Phase 2 Foundational (CRITICAL) → 3. Phase 3 US1 → **STOP & VALIDATE** gasless create+accept on Amoy from a zero-native wallet → demo.

### Incremental Delivery

Foundational → US1 (MVP) → US2 (full lifecycle) → US3 (pools + membership) → US4 (never-stranded + honest status) → Polish. Each story is an independently testable, deployable increment; every flow keeps its self-submit twin so nothing regresses.

### Rollout order (per research C3/C4)

MembershipManager upgrade first, then WagerRegistry, then new pool template; networks Amoy (full) → Mordor (no-stake only) → Polygon (after 025/027 UUPS migration).

---

## Notes

- `[P]` = different files, no incomplete dependency; `[Story]` maps to spec.md user stories.
- Tests are required (constitution II); verify they fail before implementing.
- Every covered action keeps its existing function as the self-submit twin — the source of the identical-result guarantee (SC-005).
- Commit after each task or logical group; do not push to `main` (branch + PR).
- **036 dependency**: the relayer (spec 036) submits against the `…WithSig`/`…WithAuthorization` entrypoints delivered here — 035 Foundational + US1 unblock 036 implementation.
