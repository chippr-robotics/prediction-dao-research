# Tasks: Earn Section — Lending & Rewards

**Input**: Design documents from `/specs/050-earn-lending-rewards/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: included — constitution II makes frontend tests mandatory for non-trivial logic.

**Organization**: grouped by user story (US1 lend, US2 rewards, US3 portfolio+activity) so each
story is an independently testable increment.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup (Shared Infrastructure)

- [ ] T001 Add earn constants module `frontend/src/config/earn.js` (MORPHO_API_URL,
      MERKL_API_URL, VAULT_LIST_LIMIT, POSITIONS_POLL_MS, `earnPath()` deep-link builder) per
      contracts/earn-config.md
- [ ] T002 Add `earn` config blocks (provider, merklDistributor, legacyRewardsUrl) to chains 1
      and 137 in `frontend/src/config/networks.js`, add `earn` to every network's
      `capabilities` getter (`Boolean(this.earn)`), and export
      `isEarnAvailable`/`getEarnConfig`/`getEarnNetworks` helpers
- [ ] T003 [P] Add minimal ERC-4626 vault ABI in `frontend/src/abis/ERC4626Vault.js`
      (asset/decimals/balanceOf/convertToAssets/previewDeposit/previewRedeem/maxDeposit/
      maxWithdraw/deposit/withdraw/redeem) and Merkl Distributor ABI in
      `frontend/src/abis/MerklDistributor.js` (claim)
- [ ] T004 [P] Add `sprout` glyph to `frontend/src/components/nav/NavIcon.jsx` and the
      `{ id: 'earn', label: 'Earn', icon: 'sprout' }` item to the Finance group in
      `frontend/src/config/appNav.js`
- [ ] T005 Unit tests for config gating in `frontend/src/test/earn/earnConfig.test.js`
      (capability on 1/137 only, helpers, earnPath builder, nav item present in Finance group)

**Checkpoint**: config + nav shell exists; `?tab=earn` not yet routed.

---

## Phase 2: Foundational (Blocking Prerequisites)

- [ ] T006 Implement Morpho GraphQL client + normalizers in
      `frontend/src/lib/earn/morphoApi.js` (fetchVaults(chainId), fetchPositionsEnrichment
      (address, chainId), typed MorphoApiError, drop non-listed/foreign-chain items, null-safe
      APY/TVL) per contracts/morpho-api.md
- [ ] T007 [P] Implement Merkl module `frontend/src/lib/earn/merkl.js` (fetchRewards with
      lowercased address, bigint cumulative math `claimable = amount − claimed`,
      buildClaimArgs parallel arrays, filter empty-proof/zero entries) per
      contracts/merkl-rewards.md
- [ ] T008 [P] Implement vault action helpers in `frontend/src/lib/earn/vaultActions.js`
      (readVaultUserState, validateDepositAmount/validateWithdrawAmount pure validators,
      ensureAllowance→approve, deposit with previewDeposit + staticCall dry-run, withdraw/redeem)
      using ethers v6
- [ ] T009 [P] Create member-facing copy module `frontend/src/lib/earn/earnCopy.js` (InfoTip
      texts: APY, vault, curator, total deposits, approval two-prompt, withdrawal liquidity,
      rewards origin/freshness; risk disclosure; unavailable-state copy referencing
      `getEarnNetworks()`)
- [ ] T010 Unit tests `frontend/src/test/earn/morphoApi.test.js` (normalization, curation
      filters, error→MorphoApiError, null APY preserved) and
      `frontend/src/test/earn/merkl.test.js` (claimable math, claim args alignment, filtering,
      lowercase address) with mocked fetch
- [ ] T011 [P] Unit tests `frontend/src/test/earn/vaultActions.test.js` (validators: zero, dust,
      > balance, > maxWithdraw; approve-then-deposit ordering with mocked contracts)

**Checkpoint**: data + action layers proven; no UI yet.

---

## Phase 3: User Story 1 — Discover Earn and lend idle assets (P1) 🎯 MVP

**Goal**: Earn tab in Finance nav; hub with areas; curated vault list; deposit/withdraw with
honest gating and InfoTips everywhere.

**Independent test**: quickstart.md steps 2–6.

- [ ] T012 [US1] Implement `frontend/src/hooks/useEarnVaults.js` (per-active-chain vault list,
      status loading/ready/unavailable, manual refresh, capability-gated no-op on non-earn
      chains)
- [ ] T013 [US1] Implement `frontend/src/hooks/useEarnPositions.js` (on-chain shares/assets/
      maxWithdraw via read provider + API USD/pnl enrichment, 60s poll, per account+chain scope,
      honest degradation when enrichment fails)
- [ ] T014 [US1] Build `frontend/src/components/earn/EarnPanel.jsx` + `Earn.css`: hub with
      area cards (Lend live; Staking + Bridges honest "not yet available"), Powered-by-Morpho
      attribution + risk disclosure + docs link, honest unavailable state on non-earn networks
      naming earn-enabled networks, `?view=`/`?chain=`/`?token=` deep-link consumption
- [ ] T015 [US1] Build `frontend/src/components/earn/EarnLendView.jsx` (vault list rows: asset,
      net APY, total deposits, curator, InfoTips from earnCopy; token prefilter; unavailable/
      loading/empty states) and `frontend/src/components/earn/EarnPositionsList.jsx` (deposited
      value, current value, earned-so-far when available)
- [ ] T016 [US1] Build `frontend/src/components/earn/VaultSheet.jsx`: single-vault bottom sheet
      (repo modal convention) with Deposit and Withdraw modes — amount input + Max, pre-wallet
      validation errors, two-prompt approval explanation, plain-English pre-confirmation summary,
      pending/success/failure states, maxWithdraw liquidity bound surfaced honestly
- [ ] T017 [US1] Register the earn tab: `WALLET_TABS` entry + `{activeTab === 'earn'}` panel in
      `frontend/src/pages/WalletPage.jsx` rendering EarnPanel
- [ ] T018 [P] [US1] Component tests `frontend/src/test/earn/EarnPanel.test.jsx` (nav-reachable
      hub, honest unavailable network state, area cards, attribution/disclosure present, docs
      link) with mocked hooks
- [ ] T019 [P] [US1] Component tests `frontend/src/test/earn/EarnLendView.test.jsx` and
      `frontend/src/test/earn/VaultSheet.test.jsx` (list rendering incl. null-APY "—",
      unavailable state disables deposit, validation messages pre-wallet, approval-two-prompt
      copy, withdraw bound)
- [ ] T020 [P] [US1] Accessibility tests `frontend/src/test/earn/EarnPanel.axe.test.jsx`
      (hub + lend view + vault sheet render with no axe violations)

**Checkpoint**: MVP — a member can discover Earn, lend, see the position, withdraw.

---

## Phase 4: User Story 2 — See and claim rewards (P2)

**Goal**: Rewards area listing Merkl reward balances with freshness + one-action claim.

**Independent test**: quickstart.md step 7.

- [ ] T021 [US2] Implement `frontend/src/hooks/useEarnRewards.js` (Merkl fetch per
      account+chain, claimable/pending split, freshness timestamp, claim(signer) sending
      distributor tx from `getEarnConfig(chainId).merklDistributor`, post-claim refetch +
      receipt-driven success)
- [ ] T022 [US2] Build `frontend/src/components/earn/EarnRewardsView.jsx` (reward rows with
      token, claimable, pending; freshness copy; Claim button disabled at zero claimable;
      empty-state explains accrual; unavailable state on API failure — never zero; legacy
      rewards link; InfoTips) and wire it as the `rewards` view in EarnPanel
- [ ] T023 [P] [US2] Tests `frontend/src/test/earn/useEarnRewards.test.jsx` (claim arg
      construction from hook state, unavailable on fetch failure, post-claim refresh) and
      `frontend/src/test/earn/EarnRewardsView.test.jsx` (states: loading/empty/unavailable/
      claimable, freshness copy, claim disabled at zero) + axe pass in
      `frontend/src/test/earn/EarnRewardsView.axe.test.jsx`

**Checkpoint**: rewards visible + claimable; US1 unaffected.

---

## Phase 5: User Story 3 — Portfolio entry point + activity audit (P3)

**Goal**: Earn action on portfolio asset detail; every earn action recorded in the activity feed.

**Independent test**: quickstart.md steps 8–9.

- [ ] T024 [US3] Add `earn` action to `actionsFor()` in
      `frontend/src/components/wallet/AssetDetailSheet.jsx` (enabled when
      `NETWORKS[chainId]?.earn` && `asset.kind !== 'nft'`; deep link
      `/wallet?tab=earn&chain=<id>&token=<sym>`; disabled reason otherwise) and update
      `frontend/src/test/portfolio/AssetDetailSheet.test.jsx` for the new action
- [ ] T025 [US3] Add `earn` domain to `frontend/src/data/notifications/domains.js` and
      implement `frontend/src/data/notifications/sources/earnSource.js` (spec 031 contract:
      snapshot-diff over vault share balances + cumulative claimed rewards; first-sight
      baseline; stable ids; ok:false on hard failure) and register it in
      `frontend/src/data/notifications/sources/index.js`
- [ ] T026 [US3] Emit immediate action entries with tx links from the deposit/withdraw/claim
      flows (VaultSheet + useEarnRewards) into the earn store partition using the earnSource
      stable-id scheme so the next poll dedups (per data-model.md EarnActivityEntry)
- [ ] T027 [P] [US3] Tests `frontend/src/test/earn/earnSource.test.js` (baseline-no-entries,
      diff→entry, idempotent re-run, ok:false on fetch error, claim-detection) and deep-link
      test additions in `frontend/src/test/earn/EarnPanel.test.jsx` (`?token=` prefilter,
      `?chain=` hint)

**Checkpoint**: issue #861 acceptance scenarios 1–4 all pass.

---

## Phase 6: Polish & Cross-Cutting

- [ ] T028 [P] Write member docs `docs/user-guide/earn.md` (what Earn is, step-by-step lend/
      withdraw, rewards + claiming, risks, fees — plain language, mirrors in-app copy) and
      register under User Guide in `mkdocs.yml`
- [ ] T029 [P] Write `docs/developer-guide/earn-integration.md` (architecture, config contract,
      Morpho/Merkl endpoints + addresses, how to enable a new network, deferred treasury
      fee-wrapper decision per research.md R4) and register under Developer Guide in
      `mkdocs.yml`; link the user guide from EarnPanel (FR-014)
- [ ] T030 Run `npm run test:frontend`, `npm run lint --workspace frontend`, and
      `npm run build --workspace frontend`; fix regressions (incl. existing appNav/WalletPage
      tests affected by the new tab)
- [ ] T031 Validate quickstart.md manual script items that are automatable (nav presence,
      unavailable states, deep links) and update spec 050 checklists

## Dependencies

- Phase 1 → Phase 2 → US1 (Phase 3) → US2 (Phase 4, needs hub) → US3 (Phase 5, needs flows) →
  Polish. T024 only needs T002+T017; T025–T027 need T016/T021.
- Parallel opportunities: T003/T004 ∥; T007/T008/T009 ∥ after T006 starts; T018–T020 ∥;
  T023 ∥ T024; T028/T029 ∥ everything after copy stabilizes.

## Implementation Strategy

MVP = Phases 1–3 (US1). Ship increments in story order; each checkpoint leaves the app
releasable. US2/US3 layer onto the same hub without touching US1 internals.
