/**
 * Estate breakdown — pure grouping of the portfolio scan into per-network and
 * per-asset-class USD subtotals for the Account Stats view.
 *
 * The portfolio (spec 044) already reads the account's holdings across every
 * supported network, so this is the one place Stats can say something about
 * the account's ENTIRE estate — imported/recovered accounts included — rather
 * than only wager activity on the active network.
 *
 * Honesty rules (constitution III), same as the portfolio's own:
 *   - a failed read is disclosed, never summed as zero (callers pass
 *     `failedAssets` through for display);
 *   - a holding with no resolvable USD price is EXCLUDED from subtotals and
 *     counted in `unpricedCount` — the numbers shown are exactly the sum of
 *     what could be priced, and the exclusion is disclosed.
 */

/** Group holdings by network display name → USD subtotal, largest first. */
export function estateByNetwork(holdings = []) {
  const byName = new Map()
  let unpricedCount = 0
  for (const h of holdings) {
    if (!h || !(h.balance > 0)) continue // zero balances add nothing to an estate view
    if (h.usd == null) {
      unpricedCount++
      continue
    }
    const name = h.network || 'Unknown network'
    byName.set(name, (byName.get(name) || 0) + h.usd)
  }
  const rows = Array.from(byName, ([network, usd]) => ({ network, usd }))
  rows.sort((a, b) => b.usd - a.usd)
  return { rows, unpricedCount }
}

/**
 * Per-asset-class rows from the portfolio's taxonomy categories, keeping the
 * taxonomy's own (regulatory) order. Categories with nothing held are omitted.
 */
export function estateByCategory(categories = []) {
  const rows = []
  for (const c of categories) {
    if (!c?.aggregates?.length) continue
    const held = c.aggregates.some((a) => a.balance > 0)
    if (!held) continue
    rows.push({ id: c.category?.id, label: c.category?.label || 'Other', usd: c.subtotalUsd ?? 0 })
  }
  return rows
}
