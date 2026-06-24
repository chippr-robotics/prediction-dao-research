/**
 * Wager activity source (spec 031) — the existing spec-012 wager watcher, repackaged as one ActivitySource.
 * It REUSES the proven pure modules verbatim (diffWagers / computeDeadlineWarnings / deriveActionNeeded), so
 * wager notification behavior is unchanged (no regression); it only adds the generic `domain`/`refId`/`link`
 * stamps every source must carry. Network reads (fetchWagers, scanProposals) are injectable for testing.
 */

import { diffWagers } from '../diffEngine'
import { computeDeadlineWarnings } from '../deadlineWarnings'
import { deriveActionNeeded } from '../derivedState'
import { pruneSnapshotMap } from '../activityStore'
import { fetchFriendMarketsForUser } from '../../../utils/blockchainService'
import { fetchDrawProposals } from '../drawProposalScan'

/** Canonical wager states with no further transitions (mirrors spec-012 retention). */
const TERMINAL_STATES = new Set([
  'resolved-claimable',
  'resolved-won-paid',
  'resolved-lost',
  'draw',
  'cancelled',
  'refunded',
])

/** Stamp the generic entry fields onto a wager descriptor entry (keeps wagerId for back-compat). */
function stamp(entry) {
  const refId = entry.wagerId != null ? String(entry.wagerId) : undefined
  return {
    ...entry,
    domain: 'wagers',
    refId,
    link: refId ? { to: '/app', state: { openWagerId: refId } } : null,
  }
}

/**
 * @param {object} [deps]
 * @param {(account:string, chainId:number)=>Promise<object[]>} [deps.fetchWagers]
 * @param {(args:{chainId:number, wagerIds:string[]})=>Promise<{proposals:object[], ok:boolean}>} [deps.scanProposals]
 * @returns {import('../activityEngine').ActivitySource}
 */
export function createWagerSource({ fetchWagers = fetchFriendMarketsForUser, scanProposals = fetchDrawProposals } = {}) {
  return {
    key: 'wagers',
    label: 'Wagers',
    async detect({ account, chainId, nowMs, prior }) {
      let wagers
      try {
        wagers = (await fetchWagers(account, chainId)) || []
      } catch {
        return { ok: false, entries: [], nextSnapshots: prior.snapshots, nextAux: prior.aux, currentIds: [], actionNeededById: {} }
      }
      const ids = wagers.map((w) => String(w.id))

      // Best-effort draw-proposer enrichment — the open-draw proposer is not in the registry struct (spec 017).
      // A failed/partial read retains prior draw state rather than fabricating revokes.
      let scan = { proposals: [], ok: false }
      try {
        scan = await scanProposals({ chainId, wagerIds: ids })
      } catch {
        scan = { proposals: [], ok: false }
      }
      const proposerByWagerId = new Map()
      for (const p of scan.proposals || []) proposerByWagerId.set(String(p.wagerId), p.proposer)
      const enriched = scan.ok
        ? wagers.map((w) => ({ ...w, drawProposedBy: proposerByWagerId.get(String(w.id)) ?? null }))
        : wagers

      const { entries: changeEntries, nextSnapshots } = diffWagers({ snapshots: prior.snapshots, wagers: enriched, account, nowMs })
      const { entries: warnEntries, nextWarnRecords } = computeDeadlineWarnings({ wagers: enriched, warnRecords: prior.aux, account, nowMs })

      const prunedSnapshots = pruneSnapshotMap(nextSnapshots, ids, nowMs, (s) => TERMINAL_STATES.has(s?.state))

      const actionNeededById = {}
      for (const w of enriched) {
        const id = String(w.id)
        actionNeededById[id] = deriveActionNeeded(w, account, nowMs, prunedSnapshots[id]?.drawProposedBy ?? null)
      }

      return {
        ok: true,
        entries: [...changeEntries, ...warnEntries].map(stamp),
        nextSnapshots: prunedSnapshots,
        nextAux: nextWarnRecords,
        currentIds: ids,
        actionNeededById,
      }
    },
  }
}

/** The default wager source instance used by the registry. */
export const wagerSource = createWagerSource()
export default wagerSource
