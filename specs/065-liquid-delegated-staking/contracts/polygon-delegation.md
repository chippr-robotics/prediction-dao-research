# Contract: Polygon PoS delegation (spec 065, chainId 1)

External protocol — audited Polygon PoS staking contracts on **Ethereum L1**, called from the member's
own wallet (non-custodial). Minimal inline ABIs in `frontend/src/abis/PolygonValidatorShare.js` and
`PolygonStakeManager.js`. Staking token is **POL** (post MATIC→POL migration) — use POL-suffixed method
variants and approve POL to StakeManager. Per-validator `ValidatorShare` addresses come from the curated
`staking.delegated.validators[]` allowlist. Amounts are `bigint` raw units.

## Delegate (POL → validator)

1. `POL.approve(stakeManager, amount)`.
2. `ValidatorShare.buyVoucherPOL(uint256 _amount, uint256 _minSharesToMint)` — `_minSharesToMint` is
   slippage protection against exchange-rate movement (computed from `exchangeRate()`/quote with a
   tolerance). Validation before prompt: amount > 0, ≤ POL balance, ≥ provider min; a native gas reserve
   applies to the ETH used for gas, not the POL principal.

## Read position & rewards

- `ValidatorShare.getTotalStake(address user) → (uint256 amount, uint256 exchangeRate)` — staked POL.
- `ValidatorShare.getLiquidRewards(address user) → uint256` — pending claimable rewards.
- `withdrawRewardsPOL()` — claim rewards to wallet. `restakePOL()` — compound into active stake.

## Undelegate → unbonding → withdraw (two-step)

1. `sellVoucherPOL(uint256 claimAmount, uint256 maximumSharesToBurn)` — records
   `unbonds_new[user][nonce] = DelegatorUnbond{ shares, withdrawEpoch }`; read the new
   `unbondNonces(user)` and persist as `UnstakeRequest{ handle:{ unbondNonce } }`. Confirm UI MUST show
   the unbonding wait and require acknowledgement before the prompt (FR-006). No rewards accrue on the
   exiting portion during unbonding.
2. Detect claimable: read `StakeManager.epoch()` (current checkpoint count) and
   `StakeManager.withdrawalDelay()` (currently **80**, read at runtime — governance-mutable). **Ready
   iff `unbond.withdrawEpoch + withdrawalDelay <= epoch()`.**
3. Withdraw: `unstakeClaimTokens_newPOL(uint256 unbondNonce)` → returns POL; prune the request.

## Validator data (curated allowlist + live decoration)

- GET `…/api/v2/validators` → per validator `id`, `name`, `commissionPercent`, `contractAddress`
  (the ValidatorShare to call), `totalStaked`, `status`, `delegationEnabled`. APR is **computed**
  (rewards vs. stake), not a direct field — show as an estimate with freshness.
- The API only **decorates allowlisted** entries. A validator absent from `validators[]` is never
  surfaced or callable (FR-008). An allowlisted validator whose API `status`/`delegationEnabled`
  indicates it is not accepting delegation is shown read-only (exit-only), not as a new-stake target.

## Honest-state & risk obligations

- API/RPC failure ⇒ delegated options show `unavailable`, new delegation disabled — never fake numbers.
- **Unbonding**: ~80 checkpoints (~2–4 days wall-clock); surfaced before confirmation; the position is
  never shown as withdrawable until step 2's condition holds (FR-006).
- **Slashing**: disclose that principal can be reduced by validator slashing (shares slashed
  proportionally across delegators); rewards variable and not guaranteed (FR-014, research.md R5).
  Read current slashing/`withdrawalDelay` state on-chain rather than asserting fixed figures.
