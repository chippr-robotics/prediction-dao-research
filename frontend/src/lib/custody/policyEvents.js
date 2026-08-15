// Spec 049 (FR-016) — guard event reads for the custody notification source. The four
// SafePolicyGuard events (RulesConfigured, CooldownSet, AllowlistEnabled, AllowlistChanged) are
// all indexed by safe, so one bounded scan per vault yields a monotonic activity count the
// snapshot-diff engine (spec 031) can diff: any increase means "the policy on this vault
// changed". Read-only; never scans from genesis (caller supplies the recorded deploy block).
//
// All four share the guard address and their `safe` topic, so they go out as ONE topic0 OR-set
// through `lib/chain/logScan` — a quarter of the requests of four separate scans, and bounded and
// resumable so a guard that is a million blocks old does not exceed the RPC's 10,000-block cap
// (which is what made this read fail outright on Polygon). A count taken from an INCOMPLETE
// backfill would look like a policy that keeps changing as the scan catches up, so an incomplete
// pass reports `complete: false` and the caller keeps its prior count instead of diffing.

import { Contract } from 'ethers'
import { SAFE_POLICY_GUARD_ABI } from '../../abis/SafePolicyGuard'
import { scanLogs } from '../chain/logScan'

/**
 * Count all policy events the guard has emitted for one vault since `fromBlock`.
 * @param {{guardAddress:string, safeAddress:string, chainId:number, provider:import('ethers').Provider, fromBlock:number, maxChunks?:number}} args
 * @returns {Promise<{count:number, complete:boolean}>}
 */
export async function readPolicyEventCount({ guardAddress, safeAddress, chainId, provider, fromBlock, maxChunks }) {
  const guard = new Contract(guardAddress, SAFE_POLICY_GUARD_ABI, provider)
  const { logs, complete } = await scanLogs({
    contract: guard,
    filters: [
      guard.filters.RulesConfigured(safeAddress),
      guard.filters.CooldownSet(safeAddress),
      guard.filters.AllowlistEnabled(safeAddress),
      guard.filters.AllowlistChanged(safeAddress),
    ],
    fromBlock,
    chainId,
    maxChunks,
  })
  return { count: logs.length, complete }
}

export default readPolicyEventCount
