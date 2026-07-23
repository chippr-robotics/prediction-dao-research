/**
 * Lido liquid staking (spec 065, contracts/lido-liquid-staking.md).
 *
 * Non-custodial: all calls run from the member's own wallet against audited
 * Lido V2 contracts on Ethereum L1. Writes are `{ target, data, value }`
 * batches for the spec-041 unified send rail (useEarnSend). Members hold
 * wstETH (non-rebasing) as their position.
 *
 * Stake uses the wstETH one-hop: a plain ETH transfer to the wstETH contract's
 * `receive()` stakes via Lido and returns wstETH in a single call. (The Lido
 * `_referral` marker — tracking-only, no revenue, R1 — is not attachable on
 * this path; we accept that for the simpler, non-rebasing wstETH position.)
 *
 * Exit is the Lido Withdrawal Queue: request (mints an ERC-721 ticket) → wait
 * until finalized → claim. A request is ready iff `isFinalized && !isClaimed`.
 */
import { Contract, Interface } from 'ethers'
import { LIDO_WSTETH_ABI } from '../../abis/LidoWstETH'
import { LIDO_WITHDRAWAL_QUEUE_ABI } from '../../abis/LidoWithdrawalQueue'
import { LIDO_APR_API } from '../../config/staking'

const WSTETH_IFACE = new Interface(LIDO_WSTETH_ABI)
const QUEUE_IFACE = new Interface(LIDO_WITHDRAWAL_QUEUE_ABI)

/** Fetch Lido's 7-day SMA APR as a fraction (0.032), or null on failure. */
export async function fetchLidoApr(apiUrl = LIDO_APR_API) {
  try {
    const res = await fetch(apiUrl)
    if (!res.ok) return null
    const json = await res.json()
    const sma = json?.data?.smaApr
    if (sma == null) return null
    // The API returns a percentage (e.g. 3.2); normalize to a fraction.
    return Number(sma) / 100
  } catch {
    return null
  }
}

/**
 * Read the member's Lido position over a read provider.
 * Returns { lstBalanceRaw (wstETH), stakedRaw (underlying ETH) }.
 */
export async function readLidoPosition({ account, provider, contracts }) {
  const wsteth = new Contract(contracts.wsteth, LIDO_WSTETH_ABI, provider)
  const lstBalanceRaw = await wsteth.balanceOf(account)
  let stakedRaw = 0n
  if (lstBalanceRaw > 0n) {
    stakedRaw = await wsteth.getStETHByWstETH(lstBalanceRaw)
  }
  return { lstBalanceRaw, stakedRaw }
}

/**
 * Stake ETH → wstETH (one-hop). Native coin, no approval leg.
 * Returns { calls, requiresApproval: false }.
 */
export function buildStakeCalls({ contracts, amount }) {
  return {
    calls: [{ target: contracts.wsteth, data: '0x', value: amount }],
    requiresApproval: false,
  }
}

/**
 * Request a withdrawal of wstETH from the Lido queue. Needs a wstETH approval
 * to the queue when the allowance is short. Returns { calls, requiresApproval }.
 */
export async function buildWithdrawalRequestCalls({ contracts, account, amount, provider }) {
  const wsteth = new Contract(contracts.wsteth, LIDO_WSTETH_ABI, provider)
  const allowance = await wsteth.allowance(account, contracts.withdrawalQueue)
  const requiresApproval = allowance < amount
  const calls = []
  if (requiresApproval) {
    calls.push({
      target: contracts.wsteth,
      data: WSTETH_IFACE.encodeFunctionData('approve', [contracts.withdrawalQueue, amount]),
      value: 0n,
    })
  }
  calls.push({
    target: contracts.withdrawalQueue,
    data: QUEUE_IFACE.encodeFunctionData('requestWithdrawalsWstETH', [[amount], account]),
    value: 0n,
  })
  return { calls, requiresApproval }
}

/**
 * Read the status of the member's open Lido withdrawal requests.
 * Returns [{ requestId, amountRaw, ready }] where ready = finalized && !claimed.
 */
export async function readLidoWithdrawalStatuses({ contracts, account, provider, requestIds }) {
  const queue = new Contract(contracts.withdrawalQueue, LIDO_WITHDRAWAL_QUEUE_ABI, provider)
  const ids = requestIds?.length ? requestIds.map((r) => BigInt(r)) : await queue.getWithdrawalRequests(account)
  if (!ids.length) return []
  const statuses = await queue.getWithdrawalStatus(ids)
  return ids.map((id, i) => ({
    requestId: id.toString(),
    amountRaw: statuses[i].amountOfStETH,
    ready: Boolean(statuses[i].isFinalized) && !statuses[i].isClaimed,
    claimed: Boolean(statuses[i].isClaimed),
  }))
}

/**
 * Claim finalized Lido withdrawals. Resolves the checkpoint hints first.
 * Returns { calls }.
 */
export async function buildLidoClaimCalls({ contracts, provider, requestIds }) {
  const queue = new Contract(contracts.withdrawalQueue, LIDO_WITHDRAWAL_QUEUE_ABI, provider)
  const ids = requestIds.map((r) => BigInt(r))
  const lastIndex = await queue.getLastCheckpointIndex()
  const hints = await queue.findCheckpointHints(ids, 1, lastIndex)
  return {
    calls: [
      {
        target: contracts.withdrawalQueue,
        data: QUEUE_IFACE.encodeFunctionData('claimWithdrawals', [ids, hints]),
        value: 0n,
      },
    ],
  }
}
