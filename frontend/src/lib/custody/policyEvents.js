// Spec 049 (FR-016) — guard event reads for the custody notification source. The four
// SafePolicyGuard events (RulesConfigured, CooldownSet, AllowlistEnabled, AllowlistChanged) are
// all indexed by safe, so one bounded scan per vault yields a monotonic activity count the
// snapshot-diff engine (spec 031) can diff: any increase means "the policy on this vault
// changed". Read-only; never scans from genesis (caller supplies the recorded deploy block).

import { Contract } from 'ethers'
import { SAFE_POLICY_GUARD_ABI } from '../../abis/SafePolicyGuard'

/**
 * Count all policy events the guard has emitted for one vault since `fromBlock`.
 * @param {{guardAddress:string, safeAddress:string, provider:import('ethers').Provider, fromBlock:number}} args
 * @returns {Promise<number>}
 */
export async function readPolicyEventCount({ guardAddress, safeAddress, provider, fromBlock }) {
  const guard = new Contract(guardAddress, SAFE_POLICY_GUARD_ABI, provider)
  const logs = await Promise.all([
    guard.queryFilter(guard.filters.RulesConfigured(safeAddress), fromBlock),
    guard.queryFilter(guard.filters.CooldownSet(safeAddress), fromBlock),
    guard.queryFilter(guard.filters.AllowlistEnabled(safeAddress), fromBlock),
    guard.queryFilter(guard.filters.AllowlistChanged(safeAddress), fromBlock),
  ])
  return logs.reduce((n, l) => n + l.length, 0)
}

export default readPolicyEventCount
