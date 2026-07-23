/**
 * Polygon PoS delegated staking (spec 065, contracts/polygon-delegation.md).
 *
 * Non-custodial calls from the member's wallet against the Polygon staking
 * contracts on Ethereum L1. Delegate: approve POL → buyVoucherPOL. Undelegate:
 * sellVoucherPOL → unbond nonce → unstakeClaimTokens_newPOL after the
 * withdrawal delay. Rewards: getLiquidRewards / withdrawRewardsPOL.
 *
 * Validator targets come ONLY from the curated allowlist (FR-008). The Polygon
 * staking API decorates allowlisted entries with live commission/status; it
 * never expands the list.
 */
import { Contract, Interface } from 'ethers'
import { POLYGON_VALIDATOR_SHARE_ABI, POL_TOKEN_ABI } from '../../abis/PolygonValidatorShare'
import { POLYGON_STAKE_MANAGER_ABI } from '../../abis/PolygonStakeManager'

const VS_IFACE = new Interface(POLYGON_VALIDATOR_SHARE_ABI)
const POL_IFACE = new Interface(POL_TOKEN_ABI)

// Slippage tolerance for buyVoucher's _minSharesToMint (0 = accept any). We
// pass 0 because the exchange rate moves slowly and a strict bound would risk
// spurious reverts; the member sees the exact POL amount they are delegating.
const MIN_SHARES_TO_MINT = 0n
const MAX_SHARES_TO_BURN = (1n << 256n) - 1n // effectively unbounded burn cap

/**
 * Fetch the live decoration for the curated validators. Returns a Map keyed by
 * validatorId with { commissionPct, totalStaked, status, delegationEnabled }.
 * The allowlist is the boundary — ids not in `allowlistIds` are dropped.
 */
export async function fetchValidatorDecoration(stakingApi, allowlistIds) {
  try {
    const res = await fetch(stakingApi)
    if (!res.ok) return new Map()
    const json = await res.json()
    const rows = json?.result || json?.validators || []
    const wanted = new Set(allowlistIds)
    const out = new Map()
    for (const row of rows) {
      const id = Number(row.id)
      if (!wanted.has(id)) continue // allowlist decoration only — never expand
      out.set(id, {
        commissionPct: row.commissionPercent != null ? Number(row.commissionPercent) : null,
        totalStakedRaw: row.totalStaked != null ? String(row.totalStaked) : null,
        status: row.status || row.currentState || null,
        delegationEnabled: row.delegationEnabled !== false,
      })
    }
    return out
  } catch {
    return new Map()
  }
}

/** Read StakeManager epoch + withdrawalDelay (governance-mutable — read live). */
export async function readStakeManagerTiming({ stakeManager, provider }) {
  const sm = new Contract(stakeManager, POLYGON_STAKE_MANAGER_ABI, provider)
  const [epoch, withdrawalDelay] = await Promise.all([sm.epoch(), sm.withdrawalDelay()])
  return { epoch, withdrawalDelay }
}

/**
 * Read the member's delegated position + pending rewards for one validator.
 * Returns { stakedRaw, rewardsClaimableRaw }.
 */
export async function readDelegationPosition({ validatorShare, account, provider }) {
  const vs = new Contract(validatorShare, POLYGON_VALIDATOR_SHARE_ABI, provider)
  const [totalStake, rewards] = await Promise.all([
    vs.getTotalStake(account),
    vs.getLiquidRewards(account).catch(() => 0n),
  ])
  return { stakedRaw: totalStake[0], rewardsClaimableRaw: rewards }
}

/**
 * Delegate POL to a validator. Needs a POL approval to the StakeManager when
 * short. Returns { calls, requiresApproval }.
 */
export async function buildDelegateCalls({ validatorShare, stakeManager, polToken, account, amount, provider }) {
  const pol = new Contract(polToken, POL_TOKEN_ABI, provider)
  const allowance = await pol.allowance(account, stakeManager)
  const requiresApproval = allowance < amount
  const calls = []
  if (requiresApproval) {
    calls.push({
      target: polToken,
      data: POL_IFACE.encodeFunctionData('approve', [stakeManager, amount]),
      value: 0n,
    })
  }
  calls.push({
    target: validatorShare,
    data: VS_IFACE.encodeFunctionData('buyVoucherPOL', [amount, MIN_SHARES_TO_MINT]),
    value: 0n,
  })
  return { calls, requiresApproval }
}

/** Begin undelegation (records an unbond at the current epoch). Returns { calls }. */
export function buildUndelegateCalls({ validatorShare, amount }) {
  return {
    calls: [
      {
        target: validatorShare,
        data: VS_IFACE.encodeFunctionData('sellVoucherPOL', [amount, MAX_SHARES_TO_BURN]),
        value: 0n,
      },
    ],
  }
}

/** Withdraw a matured unbond by its nonce. Returns { calls }. */
export function buildDelegationWithdrawCalls({ validatorShare, unbondNonce }) {
  return {
    calls: [
      {
        target: validatorShare,
        data: VS_IFACE.encodeFunctionData('unstakeClaimTokens_newPOL', [BigInt(unbondNonce)]),
        value: 0n,
      },
    ],
  }
}

/** Claim accrued delegation rewards. Returns { calls }. */
export function buildDelegationClaimCalls({ validatorShare }) {
  return {
    calls: [
      {
        target: validatorShare,
        data: VS_IFACE.encodeFunctionData('withdrawRewardsPOL', []),
        value: 0n,
      },
    ],
  }
}

/**
 * Read the member's latest unbond for a validator and whether it is claimable.
 * Returns { unbondNonce, withdrawEpoch, shares, ready } or null when none.
 */
export async function readLatestUnbond({ validatorShare, account, provider, epoch, withdrawalDelay }) {
  const vs = new Contract(validatorShare, POLYGON_VALIDATOR_SHARE_ABI, provider)
  const nonce = await vs.unbondNonces(account)
  if (nonce === 0n) return null
  const unbond = await vs.unbonds_new(account, nonce)
  const shares = BigInt(unbond.shares ?? unbond[0])
  if (shares === 0n) return null
  const withdrawEpoch = BigInt(unbond.withdrawEpoch ?? unbond[1])
  const ready =
    epoch != null && withdrawalDelay != null
      ? withdrawEpoch + BigInt(withdrawalDelay) <= BigInt(epoch)
      : false
  return { unbondNonce: nonce.toString(), withdrawEpoch: withdrawEpoch.toString(), shares, ready }
}

/** Human label for the delegation unbonding period from the on-chain delay. */
export function unbondingLabel(withdrawalDelay) {
  if (withdrawalDelay == null) return null
  const checkpoints = Number(withdrawalDelay)
  // Checkpoints land ~30 min–3 h apart; ~80 ≈ 2–4 days.
  return `~2–4 days (${checkpoints} checkpoints)`
}
