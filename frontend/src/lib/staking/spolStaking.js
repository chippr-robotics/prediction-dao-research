/**
 * sPOL liquid staking (spec 065, contracts/spol-liquid-staking.md).
 *
 * Non-custodial calls from the member's wallet against Polygon's official
 * native LST controller on Ethereum L1. Members hold sPOL (exchange-rate,
 * value-accruing). Stake: approve POL → buySPOL. Exit: sellSPOL → unbonding
 * nonce → withdrawPOL after the wait, OR an instant DEX swap of the liquid
 * token. rewardFee is Polygon's fee (on rewards), read for honest disclosure.
 */
import { Contract, Interface } from 'ethers'
import { SPOL_CONTROLLER_ABI, SPOL_TOKEN_ABI } from '../../abis/SPOLController'
import { POL_TOKEN_ABI } from '../../abis/PolygonValidatorShare'

const CONTROLLER_IFACE = new Interface(SPOL_CONTROLLER_ABI)
const POL_IFACE = new Interface(POL_TOKEN_ABI)

const WAD = 1_000_000_000_000_000_000n // 1e18

/**
 * Read the member's sPOL position over a read provider.
 * Returns { lstBalanceRaw (sPOL), stakedRaw (underlying POL) }.
 */
export async function readSpolPosition({ account, provider, contracts }) {
  const token = new Contract(contracts.token, SPOL_TOKEN_ABI, provider)
  const controller = new Contract(contracts.controller, SPOL_CONTROLLER_ABI, provider)
  const lstBalanceRaw = await token.balanceOf(account)
  let stakedRaw = 0n
  if (lstBalanceRaw > 0n) {
    stakedRaw = await controller.convertSPOLtoPOL(lstBalanceRaw)
  }
  return { lstBalanceRaw, stakedRaw }
}

/** Total POL staked in the pool (TVL numerator), or null on failure. */
export async function readSpolTvl({ provider, contracts }) {
  try {
    const controller = new Contract(contracts.controller, SPOL_CONTROLLER_ABI, provider)
    return await controller.totalsPOLBalance()
  } catch {
    return null
  }
}

/** Read Polygon's live sPOL reward fee (bps) for disclosure, or null. */
export async function readSpolRewardFee({ provider, contracts }) {
  try {
    const controller = new Contract(contracts.controller, SPOL_CONTROLLER_ABI, provider)
    // rewardFee is per-mille (100 = 10%). Convert to bps for a common unit.
    const perMille = Number(await controller.rewardFee())
    return perMille * 10
  } catch {
    return null
  }
}

/**
 * Stake POL → sPOL. Needs a POL approval to the controller when short.
 * Returns { calls, requiresApproval }.
 */
export async function buildStakeCalls({ contracts, polToken, account, amount, provider }) {
  const pol = new Contract(polToken, POL_TOKEN_ABI, provider)
  const allowance = await pol.allowance(account, contracts.controller)
  const requiresApproval = allowance < amount
  const calls = []
  if (requiresApproval) {
    calls.push({
      target: polToken,
      data: POL_IFACE.encodeFunctionData('approve', [contracts.controller, amount]),
      value: 0n,
    })
  }
  calls.push({
    target: contracts.controller,
    data: CONTROLLER_IFACE.encodeFunctionData('buySPOL', [amount]),
    value: 0n,
  })
  return { calls, requiresApproval }
}

/** Request an unstake (burn sPOL, open unbonding). Returns { calls }. */
export function buildUnstakeCalls({ contracts, amount }) {
  return {
    calls: [
      {
        target: contracts.controller,
        data: CONTROLLER_IFACE.encodeFunctionData('sellSPOL', [amount]),
        value: 0n,
      },
    ],
  }
}

/** Withdraw matured POL after unbonding. Returns { calls }. */
export function buildWithdrawCalls({ contracts }) {
  return {
    calls: [
      {
        target: contracts.controller,
        data: CONTROLLER_IFACE.encodeFunctionData('withdrawPOL()', []),
        value: 0n,
      },
    ],
  }
}

/**
 * Read the member's open sPOL unbonds and whether each is ready.
 * A nonce is ready once its withdrawEpoch has passed the delay — the contract
 * enforces this, so `getUserOpenNonces` returning it as still-open with a
 * withdrawEpoch in the past is our ready signal, compared to the current epoch
 * supplied by the caller (from the StakeManager).
 * Returns [{ unbondNonce, shares, withdrawEpoch, amountRaw, ready }].
 */
export async function readSpolOpenNonces({ contracts, account, provider, currentEpoch, withdrawalDelay }) {
  const controller = new Contract(contracts.controller, SPOL_CONTROLLER_ABI, provider)
  const rows = await controller.getUserOpenNonces(account)
  return rows.map((r) => {
    const withdrawEpoch = BigInt(r.withdrawEpoch)
    const ready =
      currentEpoch != null && withdrawalDelay != null
        ? withdrawEpoch + BigInt(withdrawalDelay) <= BigInt(currentEpoch)
        : false
    return {
      unbondNonce: r.nonce.toString(),
      shares: r.shares,
      withdrawEpoch: withdrawEpoch.toString(),
      amountRaw: r.polAmount,
      ready,
    }
  })
}

/** Convert an sPOL exchange rate reading into a display fraction (informational). */
export function spolRateToFraction(convertSpolToPolForOne) {
  // convertSPOLtoPOL(1e18) returns how much POL 1 sPOL is worth; >1e18 ⇒ gains.
  if (convertSpolToPolForOne == null) return null
  return Number(convertSpolToPolForOne) / Number(WAD)
}
