# Implementation Plan: Earn — Liquid & Delegated Staking

**Branch**: `claude/staking-feature-implementation-0avxm8` | **Date**: 2026-07-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/065-liquid-delegated-staking/spec.md`

## Summary

Add a **Stake** area inside the existing **Earn** section (Finance → Earn → Stake) that mirrors the
Lending vault list: one curated card per staking option showing asset, staking model, reward rate,
total staked, provider/validator identity, and the terms that make staking different from lending
(lock-up/unbonding and, for delegated staking, slashing). Members stake, track positions, unstake
with honest unbonding disclosure, withdraw when the wait elapses, and claim rewards where the
provider distributes them — all from their own wallet, non-custodial, with FairWins never taking
custody.

Two models ship on **Ethereum mainnet (chainId 1)** at launch, both executed against audited
third-party contracts from the member's wallet:

- **Liquid — ETH via Lido** → member stakes ETH and holds **wstETH** (non-rebasing LST). Exit is a
  Lido Withdrawal Queue request (ERC-721 claim ticket) with an honest, variable wait.
- **Delegated — POL via Polygon validator delegation** → member delegates POL to a **curated**
  validator's `ValidatorShare` contract (the Polygon PoS staking contracts live on Ethereum L1),
  with a ~80-checkpoint (~2–4 day) unbonding period before withdrawal, claimable rewards, and
  disclosed slashing risk.

The feature flips on two existing honestly-disabled stubs: the Earn hub's "Stake" area
(`EarnPanel.jsx:87-96`) and the portfolio asset sheet's "Stake" action
(`AssetDetailSheet.jsx:86-92`). It wires into the notification sources (spec 059), the financial
activity ledger (spec 051), and the portfolio, exactly as Lending (spec 050) does. **Frontend-only:
no `contracts/` changes** — like spec 050, any on-chain platform-fee-charging path is a new
value-bearing contract surface and is **deferred to its own spec**; staking ships fee-free with
behavior identical to the pre-fee path (spec 060 `earn.stake` service registration is the future
hook).

## Technical Context

**Language/Version**: JavaScript (ES2022), React 18 + Vite (existing frontend stack).

**Primary Dependencies**: ethers v6 (contract reads/writes), existing InfoTip / nav / Earn panel /
activity-feed / ledger infrastructure, the spec-041 unified send rail (`useEarnSend`). **No new npm
dependencies** — Lido APR REST and the Polygon staking API are consumed with `fetch`; Lido +
Polygon `ValidatorShare`/`StakeManager` calls use minimal inline ABIs.

**Storage**: none new — activity persists through the existing spec-031 activity store and the
spec-051 client ledger store (`localStorage`, per account+chain), travelling in the spec-032
encrypted backup. Pending-unbond tracking (Lido request ids, Polygon unbond nonces) persists in a
small account+chain-scoped store so the "ready to withdraw" state survives reloads.

**Testing**: Vitest + Testing Library + vitest-axe (existing frontend suite; new tests under
`frontend/src/test/staking/`).

**Target Platform**: web (desktop + mobile PWA), same as existing app.

**Project Type**: web frontend (`frontend/` only) + docs site (`docs/` + `mkdocs.yml`).

**Performance Goals**: option list interactive < 2s on a normal network; position polling aligned
with existing cadences (60s, like `usePortfolio`/`useEarnPositions`); reward/unbond status refreshed
on the same poll.

**Constraints**: honest-state everywhere (no mock options, no fake zeros, freshness labels on APR
and unbond status); no flow implies instant availability when a withdrawal queue / unbonding period
applies; WCAG 2.1 AA; per-chain data isolation; all copy non-technical with InfoTip explainers;
delegated targets are a curated allowlist, never free-form addresses.

**Scale/Scope**: 1 staking-enabled network at launch (chainId 1); 1 liquid option (Lido) + a small
curated set of Polygon validators; staking added as a **view within the existing Earn tab**
(`?tab=earn&view=stake`), ~10 new components/modules + notification/ledger source + 2 docs pages.

## Constitution Check

*GATE evaluated against constitution v1.0.0 — PASS (pre-Phase-0; re-checked post-Phase-1).*

- **I. Security-First Smart Contracts**: PASS — **no `contracts/` changes**. The feature only calls
  audited third-party contracts (Lido stETH/wstETH/WithdrawalQueue; Polygon StakeManager /
  ValidatorShare) from the member's own wallet. Client-side safeguards: amount validation +
  native-coin gas reserve before any wallet prompt; slippage bounds (`_minSharesToMint` on
  `buyVoucherPOL`; wstETH share accounting); canonical provider/validator addresses come from
  **curated config, never user input**; a static/preview dry-run before send where the contract
  supports it. The on-chain fee-charging path (a fee-on-input staking router — a value-bearing
  contract) is explicitly **deferred to its own spec** for exactly this reason (research.md R6),
  mirroring spec 050's deferral of the treasury fee-wrapper vault.
- **II. Test-First / Coverage**: PASS — Vitest units for the Lido/Polygon lib helpers (stake args,
  withdrawal-status detection, unbond-nonce claimable math, amount/gas-reserve validation, APR
  normalizers), hook tests, and component tests including failure/edge states (API down,
  unsupported network, over-balance/below-minimum amounts, mid-unbonding, ready-to-withdraw); axe
  tests for the new views. Fork tests are **not** applicable (no FairWins contract); provider calls
  are exercised with simulated data at the test layer only.
- **III. Honest State**: PASS — live Lido/Polygon data only; explicit unavailable states; no
  staking surface on networks without a real, deposits-open provider (Polygon-137 LST is deferred
  because no provider is accepting new deposits — research.md R2); APR and unbond status carry "as
  of" freshness; unbonding/withdrawal waits are surfaced before confirmation; slashing risk
  disclosed; no fee implied while none is charged.
- **IV. Fail Loudly in CI**: PASS — no CI changes; new tests join the gating suite.
- **V. Accessible, Consistent Frontend**: PASS — InfoTip / Earn panel / `.asset-sheet-*` /
  notification / ledger patterns reused; WCAG AA via axe tests; ESLint clean. Note: Lido and
  Polygon staking contract addresses are **external protocol** deployments resolved via
  `networks.js`/`config/staking.js` config — the same pattern spec 050 uses for Morpho/Merkl and
  the dex config uses for Uniswap/ETCswap. They are not FairWins deployments, so
  `deployments/`-derived sync artifacts do not apply.

No violations → **Complexity Tracking is empty** (see below).

## Project Structure

### Documentation (this feature)

```text
specs/065-liquid-delegated-staking/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── staking-config.md        # networks.js staking block + capability + curated validator allowlist
│   ├── lido-liquid-staking.md   # Lido stETH/wstETH/WithdrawalQueue calls + APR API + status detection
│   └── polygon-delegation.md    # StakeManager/ValidatorShare calls + unbond detection + staking API
├── checklists/requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
frontend/src/
├── config/
│   ├── networks.js                  # + staking block on chain 1 (stakingConfig()), + staking
│   │                                #   capability, + isStakingAvailable/getStakingConfig/getStakingNetworks
│   ├── staking.js                   # NEW — Lido contract addresses + APR API, Polygon StakeManager +
│   │                                #   staking API, curated validator allowlist, poll cadences,
│   │                                #   stakingPath() deep-link helper, FairWins referral marker address
│   └── assetTaxonomy.js             # + wstETH/stETH + POL(on chain 1) entries in CURATED_REGISTRY +
│                                    #   UNDERLYING_META so LSTs and delegated positions render
├── abis/
│   ├── LidoStETH.js                 # NEW — submit(referral), approve, sharesOf, getPooledEthByShares
│   ├── LidoWstETH.js                # NEW — wrap/unwrap, receive(), stEthPerToken, balanceOf
│   ├── LidoWithdrawalQueue.js       # NEW — requestWithdrawals(WstETH), claimWithdrawals,
│   │                                #   getWithdrawalStatus, getWithdrawalRequests, findCheckpointHints
│   ├── PolygonValidatorShare.js     # NEW — buyVoucherPOL/sellVoucherPOL/unstakeClaimTokens_newPOL,
│   │                                #   getTotalStake, getLiquidRewards, withdrawRewardsPOL, unbonds_new
│   └── PolygonStakeManager.js       # NEW — epoch(), withdrawalDelay()
├── lib/staking/
│   ├── lidoStaking.js               # NEW — stake(submit→wstETH), requestWithdrawal, claim, status,
│   │                                #   APR fetch, share-accounting helpers
│   ├── polygonDelegation.js         # NEW — buyVoucher/sellVoucher/claim builders, unbond-nonce
│   │                                #   claimable math, rewards read/claim, validator-list fetch
│   ├── stakingActions.js            # NEW — shared amount validation + native gas reserve + build-calls
│   ├── stakingCopy.js               # NEW — member-facing InfoTip copy + risk disclosure
│   └── stakingActivityBuffer.js     # NEW — queue/drain for the notification source (mirrors earnActivityBuffer)
├── lib/staking/pendingUnbonds.js    # NEW — persist Lido request ids + Polygon unbond nonces (account+chain)
├── hooks/
│   ├── useStakingOptions.js         # NEW — curated options for active chain (Lido + validators) + status
│   ├── useStakingPositions.js       # NEW — on-chain positions + pending unbonds + ready detection (60s poll)
│   └── useStakingActions.js         # NEW — stake/unstake/withdraw/claim via the unified send rail (useEarnSend)
├── components/earn/
│   ├── StakeView.jsx                # NEW — option list (mirrors EarnLendView; ?token= prefilter)
│   ├── StakeSheet.jsx               # NEW — one option: stake/unstake/withdraw/claim + unbonding &
│   │                                #   slashing disclosure + summary + InfoTips (reuses .asset-sheet-*)
│   ├── StakingPositionsList.jsx     # NEW — active positions incl. "ready to withdraw" state
│   ├── EarnPanel.jsx                # replace disabled Stake card → openView('stake'); + {view==='stake'}
│   └── Earn.css                     # + staking rows/badges (Liquid/Delegated, unbonding, ready)
├── components/wallet/AssetDetailSheet.jsx  # flip 'stake' action → enabled when net?.staking + stakeable;
│                                    #   deep-link /wallet?tab=earn&view=stake&chain=&token=
├── data/notifications/
│   ├── domains.js                   # + staking DOMAIN_META
│   └── sources/
│       ├── stakingSource.js         # NEW — ActivitySource: drain buffer + snapshot-diff + actionable
│       │                            #   "ready to withdraw" entries
│       └── index.js                 # + register stakingSource
├── lib/notifications/
│   └── deliveryPreferences.js       # + staking NOTIFICATION_CATEGORIES row (user-configurable + profile-aware)
└── data/ledger/
    ├── constants.js                 # + LEDGER_CLASS.STAKING
    ├── sources/stakingLedgerSource.js  # NEW — captureStakingAction + createStakingLedgerSource
    └── index.js                     # + register staking source + export captureStakingAction

frontend/src/test/staking/           # NEW — unit/component/axe tests (see tasks.md)
docs/user-guide/staking.md           # NEW — member guide (liquid vs delegated, unbonding, slashing, fees)
docs/developer-guide/staking-integration.md  # NEW — architecture + config + deferred fee decision
mkdocs.yml                           # + nav entries
```

**Structure Decision**: frontend-only feature following the established Earn pattern (config-gated
capability → lib + hooks → view + bottom sheet hosted as `/wallet?tab=earn&view=stake`), plus
notification/ledger source registration and docs. No backend, no `contracts/`, no subgraph changes.
Staking is a **view inside the existing Earn tab**, not a new tab — satisfying "as part of the
finance > earn > staking section."

## Design decisions (Phase 1 digest)

1. **Capability gating** mirrors `earn`/`dex`: `NETWORKS[id].staking` block (per-model provider
   identity, Lido addresses, Polygon StakeManager + validator allowlist) → `capabilities.staking` →
   UI self-gates; unavailable networks name the staking-enabled networks (from
   `getStakingNetworks()`), never dead-end. **Chain 1 only at launch**; Polygon-137 is the honest
   unavailable state until a deposits-open LST provider exists (research.md R2).
2. **Two models, one list.** Each `StakingOption` declares `model: 'liquid' | 'delegated'`. Liquid
   options come from the fixed Lido config; delegated options come from the **curated validator
   allowlist** enriched with live commission/APR/status from the Polygon staking API (allowlist is
   the hard boundary — API only decorates, never expands it). FR-008.
3. **Liquid stake/exit (Lido).** Stake: `submit`/route to wstETH, validate + native gas reserve,
   summary discloses the wstETH received. Exit: `requestWithdrawalsWstETH` mints an ERC-721 claim
   ticket (request id persisted); "ready to withdraw" when `getWithdrawalStatus` reports
   `isFinalized && !isClaimed`; `claimWithdrawals(ids, hints)` returns ETH. Share-accounting used
   to avoid rebase drift (research.md R1).
4. **Delegated stake/exit (Polygon).** Delegate: `approve` POL to StakeManager → `buyVoucherPOL`
   with `_minSharesToMint` slippage bound. Undelegate: `sellVoucherPOL` records a `DelegatorUnbond`
   at an epoch (unbond nonce persisted). "Ready to withdraw" when
   `unbond.withdrawEpoch + StakeManager.withdrawalDelay() <= StakeManager.epoch()`; then
   `unstakeClaimTokens_newPOL(nonce)`. Rewards: `getLiquidRewards` read, `withdrawRewardsPOL`
   claim, `restakePOL` compound. `withdrawalDelay`/slashing state read on-chain at runtime, never
   hardcoded (research.md R3).
5. **Honest unbonding & slashing.** No exit flow implies instant funds. Delegated confirm requires
   acknowledging the unbonding wait; the risk disclosure covers slashing (principal can be reduced),
   variable/non-guaranteed rewards, third-party smart-contract risk, and illiquidity. FR-006/FR-014.
6. **Fee.** Ships **fee-free** (no fee line, behavior identical to pre-fee). Because Lido `submit`
   and Polygon `buyVoucher` are not ERC-4626 deposits, the FeeRouter's `depositToVaultWithFee`
   entrypoint does not fit; a fee-on-input staking router is a new value-bearing contract and is
   **deferred to its own spec** (research.md R6). Spec-060 `earn.stake` service registration is the
   documented future hook; FR-015 is satisfied (single fee source; zero ⇒ no fee line).
7. **Activity + audit.** `stakingSource` (notifications): drains the action buffer into precise
   stake/unstake/withdraw/claim entries and snapshot-diffs positions as a backstop; a completed
   unbonding emits an **actionable** "ready to withdraw" entry (`actionable: true`) that breaks
   through notification profiles. `captureStakingAction` (ledger): appends a `STAKING`-class client
   record with the real txHash at action time, exactly where the buffer entry is queued. FR-011/012.
8. **Portfolio.** The disabled `stake` action becomes live for stakeable assets on chain 1
   (ETH → liquid; POL → delegated), deep-linking `?tab=earn&view=stake&chain=&token=`; positions
   surface via `useStakingPositions`. FR-009/010.
9. **Deep link**: `/wallet?tab=earn&view=stake[&chain=<id>][&token=<sym>]` — consumed by `EarnPanel`
   (chain hint + option prefilter), produced by the portfolio stake action.

## Complexity Tracking

No constitution violations to justify. New-technology check: none added (fetch + ethers v6 +
existing Earn/notification/ledger patterns). The single scope-shaped decisions — deferring the
on-chain staking fee router, and deferring Polygon-137 liquid staking until a deposits-open provider
exists — are recorded in research.md (R6, R2) and reflected in spec FR-015/FR-008.
