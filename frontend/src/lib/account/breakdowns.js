/**
 * computeBreakdowns — decompose the member's activity by status, token, and
 * oracle/resolution type (spec 020, data-model.md Breakdown). Pure.
 *
 * Reconciliation invariants (FR-009):
 *   Σ byStatus.count === total wagers
 *   active subset of byStatus === AccountSummary.activeWagers
 *   Σ byToken.ownStakeUsd === AccountSummary.totalWageredUsd
 */
import { isActiveStatus, normalizeStatus } from './status'

// resolutionType (subgraph Int) → human label. Indexes match the adapter
// registry order; unknown values fall back to a generic label.
export const ORACLE_LABELS = Object.freeze({
  0: 'Manual',
  1: 'Polymarket',
  2: 'Chainlink',
  3: 'UMA',
})

export function oracleLabel(resolutionType) {
  const n = Number(resolutionType)
  return ORACLE_LABELS[n] || `Type ${Number.isFinite(n) ? n : '?'}`
}

export function computeBreakdowns({ wagers = [], transfers = [], tokenMetaByAddress = {} } = {}) {
  // by status
  const statusCounts = new Map()
  for (const w of wagers) {
    const s = normalizeStatus(w.status) || 'unknown'
    statusCounts.set(s, (statusCounts.get(s) || 0) + 1)
  }
  const byStatus = [...statusCounts.entries()]
    .map(([status, count]) => ({ status, count, active: isActiveStatus(status) }))
    .sort((a, b) => b.count - a.count)

  // by token — own stake from deposit transfers (the member's own stakes)
  const tokenAgg = new Map()
  for (const t of transfers) {
    if (t.direction !== 'deposit') continue
    const addr = String(t.tokenAddress || '').toLowerCase()
    const cur = tokenAgg.get(addr) || { tokenAddress: addr, symbol: t.ticker || tokenMetaByAddress[addr]?.ticker || '', count: 0, ownStakeUsd: 0 }
    cur.count += 1
    cur.ownStakeUsd += Number(t.usdValue) || 0
    if (!cur.symbol && t.ticker) cur.symbol = t.ticker
    tokenAgg.set(addr, cur)
  }
  const byToken = [...tokenAgg.values()].sort((a, b) => b.ownStakeUsd - a.ownStakeUsd)

  // by oracle / resolution type
  const oracleCounts = new Map()
  for (const w of wagers) {
    const rt = Number(w.resolutionType ?? 0)
    oracleCounts.set(rt, (oracleCounts.get(rt) || 0) + 1)
  }
  const byOracle = [...oracleCounts.entries()]
    .map(([resolutionType, count]) => ({ resolutionType, label: oracleLabel(resolutionType), count }))
    .sort((a, b) => b.count - a.count)

  return { byStatus, byToken, byOracle }
}
