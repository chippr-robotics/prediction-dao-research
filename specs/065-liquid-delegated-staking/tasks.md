# Tasks: Earn — Liquid & Delegated Staking

**Input**: Design documents from `/specs/065-liquid-delegated-staking/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: included — constitution II makes frontend tests mandatory for non-trivial logic.

**Organization**: grouped by user story (US1 discover+stake, US2 unstake/withdraw/rewards, US3
portfolio+notifications+audit) so each story is an independently testable increment. Launch network is
**chainId 1**; three options across two models — Lido (liquid ETH), sPOL (liquid POL), Polygon
ValidatorShare (delegated POL). Staking is a **view inside the existing Earn tab** (`?tab=earn&view=stake`).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependencies)
- **[Story]**: US1/US2/US3 (setup, foundational, polish carry no story label)

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: config, capability gating, ABIs, and asset-registry entries all stories depend on.

- [X] T001 Create `frontend/src/config/staking.js` — `CURATED_POLYGON_VALIDATORS` (the 8 verified
      entries from contracts/staking-config.md, each run through ethers `getAddress()`), poll cadences,
      Lido referral marker address, `stakingPath({ chainId, tokenSymbol })` deep-link builder, and the
      per-provider liquid config helpers per contracts/staking-config.md
- [X] T002 Add a `staking` block to chain 1 in `frontend/src/config/networks.js` (`liquid` = [Lido, sPOL]
      with their contract addresses; `delegated` = Polygon `stakeManager` + `stakingApi` +
      `CURATED_POLYGON_VALIDATORS`), add `staking: Boolean(this.staking)` to every network's
      `capabilities` getter, and export `isStakingAvailable`/`getStakingConfig`/`getStakingNetworks`
      helpers per contracts/staking-config.md
- [X] T003 [P] Add Lido ABIs — `frontend/src/abis/LidoStETH.js` (submit, approve, sharesOf,
      getPooledEthByShares), `frontend/src/abis/LidoWstETH.js` (wrap, unwrap, balanceOf,
      stEthPerToken, getStETHByWstETH), `frontend/src/abis/LidoWithdrawalQueue.js`
      (requestWithdrawalsWstETH, claimWithdrawals, getWithdrawalStatus, getWithdrawalRequests,
      findCheckpointHints, getLastCheckpointIndex) per contracts/lido-liquid-staking.md
- [X] T004 [P] Add `frontend/src/abis/SPOLController.js` (buySPOL, buySPOLPermit, sellSPOL, withdrawPOL,
      convertPOLtoSPOL, convertSPOLtoPOL, totalsPOLBalance, getUserOpenNonces) per
      contracts/spol-liquid-staking.md
- [X] T005 [P] Add `frontend/src/abis/PolygonValidatorShare.js` (buyVoucherPOL, sellVoucherPOL,
      unstakeClaimTokens_newPOL, getTotalStake, getLiquidRewards, withdrawRewardsPOL, unbondNonces,
      unbonds_new) and `frontend/src/abis/PolygonStakeManager.js` (epoch, withdrawalDelay) per
      contracts/polygon-delegation.md
- [X] T006 [P] Add `wstETH`, `sPOL`, and `POL` (on chain 1) entries to `CURATED_REGISTRY` and
      `UNDERLYING_META` in `frontend/src/config/assetTaxonomy.js` so liquid tokens and delegated
      positions render, and wire USD price sources in `frontend/src/config/priceFeeds.js`
- [X] T007 Unit tests `frontend/src/test/staking/stakingConfig.test.js` (capability true on chain 1
      only; helpers; `stakingPath` builder; allowlist addresses are valid checksummed and the list is
      the hard boundary; taxonomy additions resolve)

**Checkpoint**: config + capability + ABIs + registry exist; no lib/UI yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: provider libraries + shared validation/state that every story needs. **No user story work
begins until this phase is complete.**

- [X] T008 [P] Implement `frontend/src/lib/staking/lidoStaking.js` — stake (submit→wstETH share
      accounting), `buildStakeCalls`, `requestWithdrawal` (requestWithdrawalsWstETH), status detection
      (`getWithdrawalStatus` → `isFinalized && !isClaimed`), `buildClaimCalls` (findCheckpointHints +
      claimWithdrawals), APR fetch from the Lido SMA endpoint, read-position helpers per
      contracts/lido-liquid-staking.md
- [X] T009 [P] Implement `frontend/src/lib/staking/spolStaking.js` — `buildStakeCalls` (approve POL +
      buySPOL), exchange-rate/APR via `convertSPOLtoPOL` drift, TVL via `totalsPOLBalance`,
      `sellSPOL`→nonce, ready detection via `getUserOpenNonces`, `withdrawPOL`, live `rewardFee` read
      for disclosure, per contracts/spol-liquid-staking.md
- [X] T010 [P] Implement `frontend/src/lib/staking/polygonDelegation.js` — `buildDelegateCalls`
      (approve POL + buyVoucherPOL with `_minSharesToMint` slippage), `buildUndelegateCalls`
      (sellVoucherPOL → unbond nonce), unbond claimable math
      (`withdrawEpoch + withdrawalDelay() <= epoch()`), `unstakeClaimTokens_newPOL`, rewards
      read/claim (getLiquidRewards/withdrawRewardsPOL), validator-list fetch decorating **only**
      allowlisted entries, per contracts/polygon-delegation.md
- [X] T011 Implement `frontend/src/lib/staking/stakingActions.js` — shared amount validation
      (zero/dust/> balance/below-min/above-cap), native-coin gas reserve, and a dispatcher keyed on
      `option.providerKind` (`lido`|`spol`|`validator-share`) returning build-calls for the unified
      send rail
- [X] T012 [P] Implement `frontend/src/lib/staking/pendingUnbonds.js` — account+chain-scoped persistence
      of Lido request ids and sPOL/Polygon unbond nonces (add/list/prune, idempotent) per data-model.md
      UnstakeRequest
- [X] T013 [P] Create `frontend/src/lib/staking/stakingCopy.js` — InfoTip copy (staking, APR, liquid
      staking token, delegation, validator, unbonding, lock-up, slashing, approval two-prompt,
      instant-DEX-exit) + the risk disclosure (smart-contract, slashing, variable rewards, illiquidity)
      + unavailable-state copy referencing `getStakingNetworks()`
- [X] T014 [P] Create `frontend/src/lib/staking/stakingActivityBuffer.js` — queue/drain/peek for the
      notification source (mirrors `earnActivityBuffer`, account+chain-scoped)
- [X] T015 Unit tests `frontend/src/test/staking/lidoStaking.test.js`,
      `frontend/src/test/staking/spolStaking.test.js`,
      `frontend/src/test/staking/polygonDelegation.test.js` (build-calls; withdrawal-status/unbond
      claimable detection; APR/rate normalizers; allowlist-decoration-not-expansion) with mocked
      contracts/fetch
- [X] T016 [P] Unit tests `frontend/src/test/staking/stakingActions.test.js` (validators incl. gas
      reserve; provider dispatch) and `frontend/src/test/staking/pendingUnbonds.test.js` (add/prune,
      idempotency)

**Checkpoint**: provider + validation + state layers proven; no UI yet.

---

## Phase 3: User Story 1 — Discover Staking and stake a supported asset (P1) 🎯 MVP

**Goal**: live Stake area (replacing the disabled placeholder) with a lending-style option list across
all three options, and a working stake flow that reflects the new position.

**Independent test**: quickstart.md Scenarios 1, 2 (stake side), and 5.

- [ ] T017 [US1] Implement `frontend/src/hooks/useStakingOptions.js` — normalized `StakingOption[]` for
      the active chain (Lido + sPOL from config; delegated from the curated allowlist decorated with
      live commission/APR/status), list status `loading|ready|unavailable`, capability-gated no-op on
      non-staking chains
- [ ] T018 [US1] Implement `frontend/src/hooks/useStakingPositions.js` — on-chain positions per option
      (wstETH/sPOL held → underlying via rate; delegated `getTotalStake`), 60s poll, per account+chain
      scope, honest degradation when enrichment fails (unbond/ready wiring added in US2)
- [ ] T019 [US1] Implement `frontend/src/hooks/useStakingActions.js` — stake path only: build calls via
      `stakingActions` dispatcher and submit through the spec-041 unified send rail (`useEarnSend`),
      returning pending/success/failure + receipt
- [ ] T020 [US1] Build `frontend/src/components/earn/StakeView.jsx` (option list mirroring
      `EarnLendView`: one card per option with asset, model badge Liquid/Delegated, APR, total staked,
      provider/validator, unbonding/lock-up terms, LST symbol, InfoTips from `stakingCopy`; `?token=`
      prefilter; loading/unavailable/empty states) and `frontend/src/components/earn/StakingPositionsList.jsx`
- [ ] T021 [US1] Build `frontend/src/components/earn/StakeSheet.jsx` **stake mode** — bottom sheet
      reusing `.asset-sheet-*` (amount + Max with gas reserve, pre-wallet validation, two-prompt
      approval explanation for ERC-20 paths, plain-English summary disclosing the LST received /
      delegation + unbonding, slashing disclosure for delegated, no fee line while fee-free,
      pending/success/failure with tx link)
- [ ] T022 [US1] Flip the Earn hub: in `frontend/src/components/earn/EarnPanel.jsx` replace the disabled
      "Stake" card with `openView('stake')`, add `{view === 'stake' && <StakeView ... />}`, and add the
      Powered-by / risk-disclosure for the staking area; extend `frontend/src/components/earn/Earn.css`
      with Liquid/Delegated badges + unbonding/ready rows
- [ ] T023 [P] [US1] Component tests `frontend/src/test/staking/StakeView.test.jsx` (option rows incl.
      null-APY "—", model badges, unbonding term shown, unavailable disables staking, `?token=` prefilter)
      with mocked hooks
- [ ] T024 [P] [US1] Component tests `frontend/src/test/staking/StakeSheet.test.jsx` (stake validation
      pre-wallet incl. gas reserve, two-prompt copy, sPOL/Lido/delegated summaries, slashing disclosure
      for delegated) with mocked actions
- [ ] T025 [P] [US1] Accessibility tests `frontend/src/test/staking/StakePanel.axe.test.jsx` (Stake view
      + stake sheet render with no axe violations)

**Checkpoint**: MVP — a member can discover Staking, stake via any of the three options, and see the
position.

---

## Phase 4: User Story 2 — Unstake, withdraw, and claim with honest unbonding (P2)

**Goal**: honest exit for every option — Lido queue, sPOL unbond/DEX, Polygon unbond — plus delegated
rewards claim, with the "ready to withdraw" state driven by real on-chain status.

**Independent test**: quickstart.md Scenarios 2 (exit), 3.

- [ ] T026 [US2] Extend `frontend/src/hooks/useStakingPositions.js` — read pending unbonds from
      `pendingUnbonds` + on-chain status, compute per-request `ready` (Lido `isFinalized && !isClaimed`;
      sPOL/Polygon epoch/nonce maturity) and `hasReadyWithdrawal`, and delegated `rewardsClaimableRaw`
      via `getLiquidRewards`
- [ ] T027 [US2] Extend `frontend/src/hooks/useStakingActions.js` — unstake, withdraw, and claim paths
      (Lido requestWithdrawal/claim; sPOL sellSPOL/withdrawPOL; Polygon sellVoucher/unstakeClaimTokens
      + withdrawRewardsPOL), persisting/pruning unbond handles via `pendingUnbonds`
- [ ] T028 [US2] Build `frontend/src/components/earn/StakeSheet.jsx` **unstake/withdraw/claim modes** —
      unbonding wait disclosed with required acknowledgement before the prompt (FR-006); sPOL surfaces
      the instant-DEX-swap alternative with its price-impact caveat; a clear "ready to withdraw" action
      when matured; delegated Claim action (liquid options show no Claim)
- [ ] T029 [P] [US2] Component/hook tests `frontend/src/test/staking/StakeSheetExit.test.jsx` and
      `frontend/src/test/staking/useStakingPositions.test.jsx` (unbonding disclosure + ack gate, ready
      detection per provider, delegated claim present / liquid claim absent, honest "not instant" copy)

**Checkpoint**: full exit lifecycle works for all three options; US1 unaffected.

---

## Phase 5: User Story 3 — Portfolio, notifications, and audit wiring (P2)

**Goal**: portfolio Stake action live; staking positions surface; every action logged to the
notification feed + financial ledger; completed-unbonding is an actionable break-through notification.

**Independent test**: quickstart.md Scenario 4.

- [ ] T030 [US3] Flip the `stake` action in `frontend/src/components/wallet/AssetDetailSheet.jsx`
      (`enabled` when `NETWORKS[chainId]?.staking` && asset is stakeable — ETH→liquid, POL→liquid+
      delegated; deep-link `/wallet?tab=earn&view=stake&chain=<id>&token=<sym>`; disabled reason
      otherwise) and update `frontend/src/test/portfolio/AssetDetailSheet.test.jsx`
- [ ] T031 [US3] Add `staking` to `DOMAIN_META` in `frontend/src/data/notifications/domains.js` and a
      `staking` row to `NOTIFICATION_CATEGORIES` in
      `frontend/src/lib/notifications/deliveryPreferences.js` (user-configurable + profile-aware)
- [ ] T032 [US3] Implement `frontend/src/data/notifications/sources/stakingSource.js` (spec-031
      ActivitySource: drain `stakingActivityBuffer` into precise stake/unstake/withdraw/claim entries +
      snapshot-diff positions as a backstop + emit an **actionable** `unbond-ready` entry when a pending
      unbond matures) and register it in `frontend/src/data/notifications/sources/index.js`
- [ ] T033 [US3] Add `STAKING` to `LEDGER_CLASS` in `frontend/src/data/ledger/constants.js`, implement
      `frontend/src/data/ledger/sources/stakingLedgerSource.js` (`captureStakingAction` +
      `createStakingLedgerSource`), and register the source + export the capture in
      `frontend/src/data/ledger/index.js`
- [ ] T034 [US3] Wire the double-write into the stake/unstake/withdraw/claim flows (StakeSheet +
      useStakingActions): `queueStakingAction(...)` (notifications) + `captureStakingAction(...)`
      (ledger) with the real txHash + `activity?.refresh?.()`, using stable ids so the poll dedups
      (per data-model.md)
- [ ] T035 [P] [US3] Tests `frontend/src/test/staking/stakingSource.test.js` (baseline-no-entries,
      diff→entry, idempotent re-run, ok:false on failure, `unbond-ready` is actionable and breaks
      through a focused profile) and `frontend/src/test/staking/stakingLedgerSource.test.js`
      (captureStakingAction kind/direction mapping, idempotent entryId, STAKING-class filter)

**Checkpoint**: spec 065 acceptance scenarios across US1–US3 all pass.

---

## Phase 6: Polish & Cross-Cutting

- [ ] T036 [P] Write member docs `docs/user-guide/staking.md` (what staking is; liquid vs delegated;
      step-by-step stake/unstake; unbonding + the sPOL instant-DEX exit; delegated rewards; slashing
      risk; fees — plain language mirroring in-app copy) and register under User Guide in `mkdocs.yml`;
      link it from the Stake area (FR-016)
- [ ] T037 [P] Write `docs/developer-guide/staking-integration.md` (architecture; config contract;
      Lido/sPOL/Polygon endpoints + addresses; the curated validator allowlist + **build-time
      revalidation** procedure; how to add a network/provider; deferred on-chain fee router per
      research.md R6) and register under Developer Guide in `mkdocs.yml`
- [ ] T038 Run `npm run test:frontend`, `npm run lint --workspace frontend`, and
      `npm run build --workspace frontend`; fix regressions (incl. existing EarnPanel / AssetDetailSheet
      / notification / ledger tests affected by the new surfaces)
- [ ] T039 Validate the automatable quickstart.md items (Stake area live, honest unavailable states,
      deep links, notification category present) and update `specs/065-liquid-delegated-staking/checklists`

## Dependencies

- Phase 1 → Phase 2 → US1 (Phase 3) → US2 (Phase 4, extends US1 hooks/sheet) → US3 (Phase 5, needs the
  flows to hook into) → Polish. T030 needs only T002; T031–T033 are independent of each other; T034
  needs T021/T027/T032/T033.
- Parallel opportunities: T003/T004/T005/T006 ∥ (Setup); T008/T009/T010/T012/T013/T014 ∥ (after config);
  T015/T016 ∥; T023/T024/T025 ∥; T031/T032/T033 ∥ then T034; T036/T037 ∥ once copy stabilizes.

## Implementation Strategy

- **MVP** = Phases 1–3 (US1): discover + stake across all three options with the position reflected.
- Ship increments in story order; each checkpoint leaves the app releasable. US2 layers the exit
  lifecycle onto the same hooks/sheet; US3 layers portfolio + notifications + audit without touching
  US1/US2 internals.
- Chain 1 only at launch; the Polygon-PoS-native sPOL path (`sPOLChild`, chainId 137) and the on-chain
  staking fee router are documented follow-ups (research.md R2/R6), not tasks here.
