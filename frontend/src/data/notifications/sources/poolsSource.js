/**
 * Group-pool activity source (spec 037 follow-up). Snapshot-diffs the user's created + joined pools each
 * cycle and routes lifecycle changes into the platform notification system (feed + toasts + action-needed
 * badge), the same way wagerSource does for 1v1 wagers. Pure snapshot-diff (first sight = baseline); a read
 * failure retains the prior slice. Read-only — no wallet signature.
 *
 * Emitted transitions per pool:
 *  - joining closed (state 0→1) — informational
 *  - resolved (→2) — success, actionable: open the pool to see if you can claim
 *  - cancelled (→3) — warning, actionable: refund your buy-in
 *  - a new member joined while still open — informational
 * Action-needed (drives the badge): pools that are Resolved (check/claim) or Cancelled (refund).
 */
import { loadMyWagersSources } from '../../../lib/lookup/myWagersSources'

export const poolsSource = {
  key: 'pools',
  label: 'Pool',
  async detect({ account, chainId, nowMs, prior }) {
    if (!account) {
      return { ok: true, entries: [], nextSnapshots: {}, currentIds: [], actionNeededById: {} }
    }

    let pools
    try {
      const { createdPools = [], joinedPools = [] } = await loadMyWagersSources({ chainId, account })
      // Union created + joined, de-duped by pool address.
      const byAddr = new Map()
      for (const p of [...createdPools, ...joinedPools]) {
        if (p && p.address) byAddr.set(String(p.address).toLowerCase(), p)
      }
      pools = [...byAddr.values()]
    } catch {
      return { ok: false } // couldn't read — retain the prior pools slice
    }

    const entries = []
    const actionNeededById = {}
    const currentIds = []
    const nextSnapshots = {}

    const mk = (refId, type, message, severity, actionable) => ({
      id: `pools:${refId}:${type}:${nowMs}`,
      domain: 'pools',
      refId,
      type,
      message,
      severity,
      actionable,
      link: { to: `/pools/${refId}` },
      createdAt: nowMs,
      read: false,
    })

    for (const p of pools) {
      const refId = String(p.address)
      const state = Number(p.state)
      const memberCount = Number(p.memberCount ?? 0)
      currentIds.push(refId)
      nextSnapshots[refId] = { state, memberCount, snappedAt: nowMs }

      // Action-needed: a resolved pool may have a claim; a cancelled pool can be refunded.
      if (state === 2) actionNeededById[refId] = 'checkPool'
      else if (state === 3) actionNeededById[refId] = 'refund'

      const prev = prior.snapshots?.[refId]
      if (!prev) continue // first sight = baseline (no entry, just snapshot)

      const label = p.poolId != null ? `Pool #${p.poolId}` : 'A pool you’re in'
      if (prev.state !== state) {
        if (state === 1) {
          entries.push(mk(refId, 'pool-closed', `${label} closed joining — resolution can begin`, 'info', false))
        } else if (state === 2) {
          entries.push(mk(refId, 'pool-resolved', `${label} resolved — open it to see if you can claim`, 'success', true))
        } else if (state === 3) {
          entries.push(mk(refId, 'pool-cancelled', `${label} was cancelled — you can refund your buy-in`, 'warning', true))
        }
      } else if (state === 0 && memberCount > (prev.memberCount ?? 0)) {
        const cap = p.maxMembers ? `/${p.maxMembers}` : ''
        entries.push(mk(refId, 'pool-member-joined', `${label} now has ${memberCount}${cap} members`, 'info', false))
      }
    }

    return { ok: true, entries, nextSnapshots, currentIds, actionNeededById }
  },
}

export default poolsSource
