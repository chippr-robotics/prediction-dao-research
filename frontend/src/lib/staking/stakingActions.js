/**
 * Shared staking action helpers (spec 065) — amount validation with a
 * native-coin gas reserve, and a dispatcher that turns a stake request into a
 * `{ target, data, value }` batch for the unified send rail, keyed on the
 * option's provider kind.
 *
 * Pure validators reject bad amounts BEFORE any wallet prompt (constitution
 * III), with member-facing wording.
 */
import { buildStakeCalls as buildLidoStake } from './lidoStaking'
import { buildStakeCalls as buildSpolStake } from './spolStaking'
import { buildDelegateCalls } from './polygonDelegation'

// Reserve left behind when staking a NATIVE coin so the member can still pay
// network fees (Max never strands them). Generous flat reserve in wei.
export const NATIVE_GAS_RESERVE = 3_000_000_000_000_000n // 0.003 ETH

/**
 * Validate a stake amount before any wallet prompt.
 * `isNative` toggles the gas-reserve rule. Returns { ok } | { ok:false, reason }.
 */
export function validateStakeAmount({ amount, walletBalance, isNative, minStakeRaw, maxStakeRaw }) {
  if (amount == null || amount <= 0n) {
    return { ok: false, reason: 'Enter an amount greater than zero.' }
  }
  if (minStakeRaw != null && amount < minStakeRaw) {
    return { ok: false, reason: 'That is below the minimum this option accepts.' }
  }
  if (maxStakeRaw != null && maxStakeRaw > 0n && amount > maxStakeRaw) {
    return { ok: false, reason: 'That is more than this option currently accepts.' }
  }
  if (walletBalance != null) {
    if (isNative) {
      if (amount + NATIVE_GAS_RESERVE > walletBalance) {
        return {
          ok: false,
          reason: 'Leave a little of the coin for network fees — try a smaller amount or use Max.',
        }
      }
    } else if (amount > walletBalance) {
      return { ok: false, reason: 'That is more than you have in your wallet.' }
    }
  }
  return { ok: true }
}

/** The most a member can stake given the gas reserve (drives the Max button). */
export function maxStakeable({ walletBalance, isNative }) {
  if (walletBalance == null) return null
  if (!isNative) return walletBalance
  return walletBalance > NATIVE_GAS_RESERVE ? walletBalance - NATIVE_GAS_RESERVE : 0n
}

/**
 * Build the stake calls for an option, dispatching on providerKind.
 * `ctx` carries { account, amount, provider, polToken }.
 * Returns { calls, requiresApproval }.
 */
export async function buildStakeForOption(option, ctx) {
  const { account, amount, provider, polToken } = ctx
  switch (option.providerKind) {
    case 'lido':
      return buildLidoStake({ contracts: option.contracts, amount })
    case 'spol':
      return buildSpolStake({ contracts: option.contracts, polToken, account, amount, provider })
    case 'validator-share':
      return buildDelegateCalls({
        validatorShare: option.validatorShare,
        stakeManager: option.stakeManager,
        polToken,
        account,
        amount,
        provider,
      })
    default:
      throw new Error(`Unknown staking provider: ${option.providerKind}`)
  }
}

/** Whether an option stakes a native coin (drives the gas-reserve rule). */
export function optionIsNative(option) {
  // Only Lido stakes the native coin (ETH). sPOL/delegation stake the POL ERC-20.
  return option.providerKind === 'lido'
}
