# Contract: Lido liquid staking (spec 065, chainId 1)

External protocol — audited Lido V2 contracts called from the member's own wallet (non-custodial).
Minimal inline ABIs in `frontend/src/abis/Lido*.js`. Addresses come from the `staking.liquid.contracts`
config block, never hardcoded in logic. Amounts are `bigint` raw wei.

## Stake (ETH → wstETH)

- **stETH** `submit(address _referral) payable returns (uint256 stethAmount)` — send ETH as
  `msg.value`; `_referral` = FairWins attribution address (tracking only, no payout). Then
  `wstETH.wrap(stethAmount)` (needs stETH `approve` to wstETH), OR
- **one-hop**: send ETH directly to the wstETH `receive()` payable → returns wstETH in one tx.

Launch uses the model where the member **holds wstETH** (non-rebasing) as the position token.
Validation before any prompt: amount > 0, ≤ balance minus a native gas reserve, ≥ Lido min (100 wei),
≤ max (1000 ETH per withdrawal request — relevant to exit, not stake). Summary discloses the wstETH
received and that its value grows vs ETH.

## Read position

- `wstETH.balanceOf(account)` → held wstETH; `wstETH.stEthPerToken()` / `getStETHByWstETH` → underlying
  stETH value for display. No separate reward claim — rewards accrue into the exchange rate.

## Exit (Withdrawal Queue)

1. `WithdrawalQueue.requestWithdrawalsWstETH(uint256[] _amounts, address _owner) → uint256[] requestIds`
   (needs wstETH `approve` to the queue). Persist each `requestId` as an `UnstakeRequest{ handle:{requestId} }`.
2. Detect claimable: `getWithdrawalStatus(uint256[] ids) → WithdrawalRequestStatus[]` with
   `{ amountOfStETH, amountOfShares, owner, timestamp, isFinalized, isClaimed }`. **Ready iff
   `isFinalized && !isClaimed`.** Cheap pre-check: `getLastFinalizedRequestId()` (id ≤ it ⇒ finalized).
   `getWithdrawalRequests(owner)` lists open ids.
3. Claim: `findCheckpointHints(ids, 1, getLastCheckpointIndex())` → hints; then
   `claimWithdrawals(uint256[] ids, uint256[] hints)` returns ETH to the owner.

## APR / TVL

- APR: GET `…/steth/apr/sma` → `data.smaApr` (7-day SMA, fraction). Freshness "as of" fetch time.
- TVL ("total staked"): on-chain `stETH.totalSupply()` × ETH price (no dedicated TVL endpoint).

## Honest-state obligations

- API/RPC failure ⇒ option shows `unavailable`, staking disabled — never a fake zero/APR.
- The exit wait is variable (hours–days); the UI must present the queue honestly and MUST NOT imply an
  instant cash-out (FR-006). The exit never appears "ready" until `isFinalized && !isClaimed`.
- Rebase safety: any transient stETH accounting uses shares (`sharesOf`/`getSharesByPooledEth`); holding
  wstETH avoids this by construction.
