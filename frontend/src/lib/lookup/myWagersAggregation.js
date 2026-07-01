/**
 * My Wagers aggregation (spec 037, US2 / FR-015..019, 024).
 *
 * Merge a user's 1v1 wagers, open challenges, and group pools into one list of `MyWagersItem`s with a
 * type indicator, status, active/history bucket, provenance, and a route. Pure and source-agnostic: the
 * caller (myWagersSources.js / MyMarketsModal) fetches from the hybrid sources — on-chain/subgraph for
 * participating/created/resolved items, plus device-local records for locally-known-only items — and
 * passes them here already scoped to the active network and account.
 */

// Terminal statuses land an item in the "history" bucket (FR-017). Compared case-insensitively.
export const TERMINAL_WAGER_STATUSES = new Set(['resolved', 'cancelled', 'canceled', 'refunded', 'drawn', 'declined', 'expired'])
// Pool states: 0 JoiningOpen, 1 JoiningClosed, 2 Resolved, 3 Cancelled.
export const TERMINAL_POOL_STATES = new Set([2, 3])

const norm = (s) => String(s ?? '').toLowerCase()

// Non-device sources win a dedup tie (they're richer/authoritative); device-only items are a fallback.
const SOURCE_RANK = { context: 2, subgraph: 2, device: 1 }

function wagerItem(w, source = 'context') {
  const status = w.status ?? w.state ?? 'unknown'
  return {
    type: 'wager',
    id: String(w.id),
    title: w.title || w.question || w.description || `Wager #${w.id}`,
    status: String(status),
    bucket: TERMINAL_WAGER_STATUSES.has(norm(status)) ? 'history' : 'active',
    source,
    route: `wager:${w.id}`,
  }
}

function challengeItem(c, source) {
  const id = c.id ?? c.wagerId ?? c.code
  const status = c.status ?? (c.wagerId != null ? 'open' : 'unsubmitted')
  return {
    type: 'challenge',
    id: String(id),
    title: c.description || c.title || 'Open challenge',
    status: String(status),
    bucket: TERMINAL_WAGER_STATUSES.has(norm(status)) ? 'history' : 'active',
    source,
    route: `challenge:${c.wagerId ?? id}`,
  }
}

function poolItem(p, source) {
  const id = p.address ?? p.id
  const state = Number(p.state ?? 0)
  return {
    type: 'pool',
    id: String(id),
    title: p.title || (p.poolId != null ? `Pool #${p.poolId}` : 'Group pool'),
    status: p.stateLabel || String(state),
    bucket: TERMINAL_POOL_STATES.has(state) ? 'history' : 'active',
    source,
    route: `/pools/${id}`,
  }
}

/**
 * @param {object} sources - { wagers, createdChallenges, deviceChallenges, createdPools, joinedPools }
 *   (each an array; all already scoped to the active account/network). Missing keys are treated as [].
 * @returns {Array} de-duplicated MyWagersItem[] (dedup key = type + id; non-device source wins a tie).
 */
export function aggregateMyItems(sources = {}) {
  const {
    wagers = [],
    createdChallenges = [],
    deviceChallenges = [],
    createdPools = [],
    joinedPools = [],
  } = sources || {}

  const items = [
    ...wagers.map((w) => wagerItem(w, 'context')),
    ...createdChallenges.map((c) => challengeItem(c, 'subgraph')),
    ...deviceChallenges.map((c) => challengeItem(c, 'device')),
    ...createdPools.map((p) => poolItem(p, 'subgraph')),
    ...joinedPools.map((p) => poolItem(p, 'subgraph')),
  ]

  const byKey = new Map()
  for (const it of items) {
    const key = `${it.type}:${it.id}`
    const cur = byKey.get(key)
    if (!cur || (SOURCE_RANK[it.source] || 0) > (SOURCE_RANK[cur.source] || 0)) {
      byKey.set(key, it)
    }
  }
  return [...byKey.values()]
}

export default aggregateMyItems
