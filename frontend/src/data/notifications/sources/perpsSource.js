/**
 * Perps activity source (spec 082 / spec 031, FR-014). Read-only snapshot-diff backstop ONLY:
 * there are no in-app perps actions this release (FR-018), so there is no action buffer — the
 * signal is the member's per-venue open-position set changing (opened / closed / resized on the
 * venue's own app), detected by diffing position keys+sizes each cycle.
 *
 * Reads go through the gateway's cached /v1/perps/positions (never venue APIs directly — the 30s
 * activity cadence would hammer them; the gateway cache absorbs it). First sight = baseline; a
 * degraded venue keeps its prior snapshot (a venue outage is NOT "positions closed"); hard total
 * failure returns ok:false so the engine keeps the prior slice.
 */
import { fetchPerpPositions } from '../../../lib/perps/perpsClient'
import { perpsAvailable, perpsPath, PERP_VENUES } from '../../../config/perps'

const EMPTY = { ok: true, entries: [], nextSnapshots: {}, currentIds: [], actionNeededById: {} }

/** Stable per-venue fingerprint of the account's open positions. */
function fingerprint(positions) {
  return positions
    .map((p) => `${p.id}:${p.direction}:${p.sizeUsd ?? '-'}`)
    .sort()
    .join('|')
}

export function createPerpsSource({ deps } = {}) {
  const io = { fetchPositions: fetchPerpPositions, available: perpsAvailable, ...deps }
  return {
    key: 'perps',
    label: 'Perps',
    async detect({ account, nowMs, prior }) {
      if (!account || !io.available()) return EMPTY

      let body
      try {
        body = await io.fetchPositions(account)
      } catch {
        return { ok: false } // total read failure — keep the prior slice, never fake "no positions"
      }

      const positions = Array.isArray(body?.positions) ? body.positions : []
      const sources = body?.sources ?? {}
      const priorSnapshots = prior?.snapshots || {}
      const entries = []
      const nextSnapshots = {}
      const currentIds = []

      for (const [venue, source] of Object.entries(sources)) {
        const sid = `perps:${venue}`
        currentIds.push(sid)
        if (source?.status !== 'read') {
          // Venue unreadable this cycle: keep the baseline — an outage is not a position change.
          if (priorSnapshots[sid]) nextSnapshots[sid] = priorSnapshots[sid]
          continue
        }
        const venuePositions = positions.filter((p) => p.venue === venue)
        const print = fingerprint(venuePositions)
        const prev = priorSnapshots[sid]
        nextSnapshots[sid] = { print, count: venuePositions.length, snappedAt: nowMs }

        // First sight = baseline (no retroactive entries).
        if (prev?.print != null && prev.print !== print) {
          const label = PERP_VENUES[venue]?.label ?? venue
          const grew = venuePositions.length > (prev.count ?? 0)
          const shrank = venuePositions.length < (prev.count ?? 0)
          entries.push({
            id: `perps:${venue}:position-changed:${nowMs}`,
            domain: 'perps',
            refId: venue,
            type: 'perps-position-changed',
            message: grew
              ? `A perp position was opened on ${label}`
              : shrank
                ? `A perp position was closed on ${label}`
                : `Your perp positions changed on ${label}`,
            severity: 'info',
            actionable: false,
            link: { to: perpsPath({ venue }) },
            createdAt: nowMs,
            read: false,
          })
        }
      }

      return { ok: true, entries, nextSnapshots, currentIds, actionNeededById: {} }
    },
  }
}

export const perpsSource = createPerpsSource()

export default perpsSource
