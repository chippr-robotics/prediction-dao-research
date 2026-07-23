# Phase 0 Research: Earn — Liquid & Delegated Staking (spec 065)

Format per decision: **Decision → Rationale → Alternatives considered**. These resolve every
NEEDS-CLARIFICATION implied by the Technical Context and lock the external-protocol facts the plan
depends on. Contract addresses and mutable parameters (unbonding delay, slashing state) are read
from config/on-chain at runtime, never hardcoded into logic.

## R1 — Liquid staking provider: Lido on Ethereum (ETH → wstETH)

**Decision**: Ship liquid staking on **Ethereum mainnet (chainId 1) via Lido**, with members holding
**wstETH** (non-rebasing) as the position token. Stake ETH via the stETH `submit(address _referral)`
payable entrypoint (or the wstETH `receive()` one-hop), then hold/track wstETH. Exit via the Lido V2
Withdrawal Queue: `requestWithdrawalsWstETH([amounts], owner)` mints an ERC-721 claim ticket;
`claimWithdrawals(ids, hints)` returns ETH once finalized.

- stETH: `0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84` · wstETH: `0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0`
  · WithdrawalQueueERC721: `0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B1` (mainnet).
- Claimable detection: `getWithdrawalStatus([ids]) → { isFinalized, isClaimed, ... }`; claimable iff
  `isFinalized && !isClaimed`. `getWithdrawalRequests(owner)` lists open ids;
  `findCheckpointHints` + `getLastCheckpointIndex` supply the claim hints. Request bounds:
  min 100 wei, max 1000 ETH.
- APR data: `https://eth-api.lido.fi/v1/protocol/steth/apr/sma` (7-day SMA, `data.smaApr`). TVL from
  on-chain `stETH.totalSupply()` × price (no dedicated TVL endpoint).

**Rationale**: Lido is the largest, audited, actively-accepting liquid-staking provider on Ethereum;
wstETH avoids rebase-driven balance/accounting surprises for positions and any future fee math
(share-accounting). Matches the spec's "liquid staking → receive a liquid staking token that grows in
value."

**Alternatives considered**: **Rocket Pool (rETH)** — viable liquid alternative, exit is a swap/redeem
rather than a queue; deferred to keep launch to one liquid provider (can be added later as another
`StakingOption`, config-only). **stETH (rebasing) as the held token** — rejected: rebasing balances
complicate position display and fee accounting; wstETH is the integration-standard form.

## R2 — Polygon liquid staking provider: sPOL (Polygon's official native LST, live)

**Decision**: Ship Polygon liquid staking via **sPOL** — Polygon Labs' official native liquid staking
token for POL, live and accepting deposits since **April 14 2026**, audited (ChainSecurity, Certora),
open-source (`0xPolygon/spol-contracts`). Member stakes POL and holds **sPOL** (an exchange-rate,
value-accruing ERC-20 — not rebasing). The canonical mint/unstake happens on **Ethereum L1
(chainId 1)** via `sPOLController`, so it sits alongside Lido (R1) and Polygon delegation (R3) on the
same launch chain.

- sPOL token (L1): `0x3B790d651e950497c7723D47B24E6f61534f7969` · `sPOLController` (stake/unstake/claim/
  convert): `0xEaadA411F2600570796c341552b9869DA708a28B` · `sPOLChild` (L2 mirror on 137, cross-chain
  cached-rate buy): `0xd1CD49A08AeF3Af93457aEc17C786C2b7F48eCd7`.
- Stake: `buySPOL(uint256 _amount)` (+ `buySPOLPermit` / `buySPOLWithDPOL` to migrate an existing
  delegated position). Exchange rate via `convertPOLtoSPOL`/`convertSPOLtoPOL`; pool size via
  `totalsPOLBalance()`.
- Exit: `sellSPOL(uint256 _amount)` → returns unbonding nonce(s); after the Polygon PoS withdrawal
  delay (~80–82 checkpoints ≈ 3–4 days) call `withdrawPOL()`. Maturity/claimable detected via
  `getUserOpenNonces(user) → FullNonceDetails[]`. **Instant exit alternative**: sPOL is a liquid ERC-20
  with Uniswap V4 pools live at launch — a member may swap out at market rate instead of waiting.
- Validator selection is **abstracted** (pooled across a Polygon-Labs-curated validator set) — this is
  what makes it the *liquid* model vs. the *delegated* model (R3). ~8% estimated APR (announcement-level;
  verify on-chain via rate drift). On-chain `rewardFee` (per-mille, charged on rewards, `MAX_FEE=1000`)
  goes to Polygon's `feeReceiver`, not FairWins — read live. **No referral/attribution param** (R6).

**Rationale**: sPOL is the official, audited, deposits-open Polygon LST. It replaces the earlier
deferral: the mainstream third-party LSTs are sunsetting (Lido-on-Polygon disabled new staking Dec 16
2024; Stader MaticX deposits close June 13 2026), but sPOL is Polygon's own native replacement and is
actively accepting deposits — so Polygon liquid staking is honest-state viable now. It also keeps
architecture consistent (canonical mint on L1, exchange-rate token like wstETH).

**Alternatives considered**: **Stader MaticX / Lido-on-Polygon** — rejected: sunsetting, not
deposits-open (would violate honest state). **Polygon-PoS-native (chainId 137) sPOL deposit via
`sPOLChild`** — deferred as a follow-up: it settles cross-chain (cached rate) and adds bridge
complexity; launch uses the canonical L1 controller (member needs POL on Ethereum). **Defer Polygon
liquid entirely** (the pre-sPOL plan) — superseded by this finding.

## R3 — Delegated staking provider: Polygon PoS validator delegation (POL, on Ethereum L1)

**Decision**: Ship delegated staking as **POL delegation to a curated Polygon validator**, executed on
**Ethereum mainnet (chainId 1)** against the per-validator `ValidatorShare` contract (Polygon PoS
staking lives on L1). This is the genuine "delegate → locked principal → unbonding → slashing" model.

- Delegate: `approve` POL to StakeManager → `buyVoucherPOL(uint256 _amount, uint256 _minSharesToMint)`.
- Undelegate: `sellVoucherPOL(uint256 claimAmount, uint256 maximumSharesToBurn)` records a
  `DelegatorUnbond{ shares, withdrawEpoch }` under the caller's incremented `unbondNonces[user]`.
- Withdraw after wait: `unstakeClaimTokens_newPOL(uint256 unbondNonce)`.
- Rewards: `getLiquidRewards(user)` (pending), `withdrawRewardsPOL()` (claim), `restakePOL()` (compound);
  staked read via `getTotalStake(user) → (amount, exchangeRate)`.
- Unbonding claimable: `unbond.withdrawEpoch + StakeManager.withdrawalDelay() <= StakeManager.epoch()`.
  `withdrawalDelay` is currently **80 checkpoints (~2–4 days wall-clock)** — **read at runtime**, not
  hardcoded (governance-mutable). No rewards accrue on the exiting portion during unbonding.
- Validator data: official Polygon staking API v2
  `https://staking-api.polygon.technology/api/v2/validators` → per validator `contractAddress`
  (the ValidatorShare to call), `name`, `commissionPercent`, `totalStaked`, `status`,
  `delegationEnabled`. APR is computed (rewards vs. stake), not a direct field.
- POL is the staking token post-migration (MATIC→POL live since Sept 2024); use the POL-suffixed
  method variants and approve POL.

**Rationale**: Polygon delegation is the one delegated-staking primitive an ordinary wallet user can
actually drive (see R4). It cleanly exhibits the staking-specific differences the spec insists on —
locked principal, an explicit unbonding period, claimable rewards, and slashing exposure. The
validator target being a small **curated allowlist** (FR-008) keeps members from delegating to an
unvetted validator from inside the app.

**Coexistence with sPOL (R2)**: sPOL and ValidatorShare delegation are the *two POL models offered
side by side* — sPOL is **liquid** (pooled, no validator choice, a value-accruing token, instant DEX
exit), ValidatorShare is **delegated** (member picks a curated validator, holds a locked per-validator
position). sPOL does not remove ValidatorShare; it abstracts over it. Offering both is exactly the
spec's "liquid and delegated." A member with an existing delegated position can later migrate into
sPOL via `buySPOLWithDPOL` (a documented future convenience, not launch scope).

**Alternatives considered**: **API-discovered full validator list** — rejected: FR-008 requires curated
targets, not free-form; the API decorates the allowlist with live commission/APR/status but never
expands it. **Skip delegated staking, ship liquid-only** — rejected: the user explicitly asked for
both liquid and delegated; Polygon delegation makes delegated genuinely available.

## R4 — Ethereum has no user-facing native delegation (liquid-only there)

**Decision**: On Ethereum, staking exposure for an app user is **liquid only** (R1). Do not attempt a
"delegate ETH to a validator with unbonding" flow.

**Rationale**: Ethereum consensus has no delegation primitive — native staking requires a full 32-ETH
validator with hardware/uptime; there is no protocol-level "delegate someone else's ETH to a chosen
validator with an unbonding lock." For app users, delegated ETH exposure only exists via pooled/liquid
staking (Lido/Rocket Pool). Modeling a fake ETH "delegation" would violate honest state.

**Alternatives considered**: **Present Rocket Pool as "delegated ETH"** — rejected as misleading; rETH
is liquid staking, not delegation. It can later be added as a second *liquid* option.

## R5 — Slashing risk disclosure (delegated)

**Decision**: Disclose to delegators that **principal can, in principle, be reduced by validator
slashing** (ValidatorShare shares are slashed proportionally across a validator's delegators), while
noting rewards are variable and not guaranteed. Read current slashing-enforcement/`withdrawalDelay`
state on-chain at build/runtime rather than asserting a fixed figure.

**Rationale**: The slashing functions exist in the Polygon staking contracts and are a real
contract-level risk that FR-014 requires disclosing. (In practice principal-confiscation slashing has
been largely dormant on Polygon PoS — penalties have been dominated by missed rewards/jailing — but it
is governance-changeable, so the app discloses the risk honestly rather than downplaying it.)

**Alternatives considered**: **Omit slashing copy** — rejected (dishonest, violates FR-014). **State a
fixed slashing percentage** — rejected (no fixed on-chain guarantee; parameters are mutable).

## R6 — Platform fee: ship fee-free; on-chain fee router deferred

**Decision**: Staking ships **fee-free** (no fee line; behavior byte-identical to the pre-fee path).
Register the intent as spec-060 `earn.stake` but do **not** build an on-chain fee-charging path in
this feature; defer the fee-on-input staking router (a new value-bearing contract) to its own spec.

**Rationale**: Lido `submit` and Polygon `buyVoucher` are bespoke payable/ERC-20 calls, **not**
ERC-4626 `deposit`, so the FeeRouter's only chargeable entrypoint (`depositToVaultWithFee`) does not
apply. Charging would require a new router contract that transiently custodies funds and re-emits the
LST/shares — a value-bearing surface demanding security review (constitution I). Spec 050 set the
precedent by deferring its treasury fee-wrapper vault for the same reason. FR-015 is fully satisfied:
the single fee source is the FeeRouter, and a zero/absent fee means no fee line and identical behavior.

**Alternatives considered**: **Fee-on-input router now** — rejected: new value-bearing contract, out of
scope, blocks a frontend-only PASS. **Register `earn.stake` as ConfigOnly and read a rate** — rejected
as misleading: there is no wrapped entrypoint to actually charge it against for non-ERC-4626 staking,
so a displayed rate could not be enforced.

## R7 — Reuse the existing Earn/notification/ledger/portfolio rails (no new infra)

**Decision**: Reuse, do not rebuild: host staking as a **view in the Earn tab**
(`?tab=earn&view=stake`); reuse the `.asset-sheet-*` bottom-sheet styling; use the spec-041 unified
send rail (`useEarnSend`) for stake/unstake/withdraw/claim; register one notification
`ActivitySource` (`stakingSource`) + `staking` domain + a `staking` notification category; add one
ledger `STAKING` class + `captureStakingAction` capture helper; flip the existing disabled portfolio
`stake` action.

**Rationale**: Every target system is source-registry-driven and designed for exactly this extension
(confirmed against `sources/index.js`, `domains.js`, `deliveryPreferences.js`, `ledger/index.js`,
`AssetDetailSheet.jsx:86-92`, `EarnPanel.jsx:87-96`). Reuse keeps the feature frontend-only, honest,
and consistent, and satisfies the spec's "properly wired into notifications, event logs, and the
portfolio bottom sheets."

**Alternatives considered**: **A separate top-level "Staking" tab** — rejected: the request says "as
part of the finance > earn > staking section," and a sibling view keeps Lend/Stake visually unified.

## Open items carried to tasks/implementation

- Confirm the **curated Polygon validator allowlist** (which ValidatorShare addresses) with the
  product owner; enrich with live commission/APR/status from the staking API at runtime.
- Read `StakeManager.withdrawalDelay()` and current slashing state on-chain at build time to keep the
  unbonding copy and risk disclosure accurate.
- Read the live sPOL `rewardFee`/`feeReceiver` on-chain and disclose that Polygon (not FairWins) takes
  a reward-fee; confirm the canonical sPOL addresses against `0xPolygon/spol-contracts` at build time.
- Confirm the **FairWins `_referral` attribution address** to pass to Lido `submit` (tracking only, no
  revenue — R1). sPOL has no referral param (R2/R6).
- Decide the exact set of `UNDERLYING_META`/`CURATED_REGISTRY` additions (wstETH, sPOL, and POL on
  chain 1) and price-feed wiring for USD valuation of positions.
- Follow-up (post-launch): the Polygon-PoS-native sPOL deposit path via `sPOLChild` (chainId 137,
  cross-chain settle) so members can stake POL held on Polygon without bridging to L1 first.
