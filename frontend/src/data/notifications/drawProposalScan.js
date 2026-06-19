/**
 * Draw-proposal lookup for wager notifications — subgraph-sourced (spec 017).
 *
 * Draw proposals are the one participant-relevant signal the WagerRegistry
 * struct reads cannot surface. Previously this ran an incremental `eth_getLogs`
 * scan of DrawProposed/DrawRevoked, which floods public RPCs and trips their
 * `block range exceeds configured limit` cap. The v2 subgraph now indexes the
 * proposer on the Wager itself (`drawProposer`, set while `status ==
 * draw_proposed`, cleared on revoke), so we read current state in one bounded
 * GraphQL query instead.
 *
 * This returns a COMPLETE snapshot of the requested wagers' draw state, not a
 * since-watermark event delta: the caller sets `drawProposedBy` to the proposer
 * for every wager currently in `draw_proposed` and to `null` for the rest, so
 * the diff engine detects both a new proposal (null → proposer) and a revoke
 * (proposer → null). `ok` distinguishes a real "no proposals" answer from a
 * failed read: on failure the caller must RETAIN prior state rather than null
 * everything out (which would fabricate spurious revokes — constitution III).
 *
 * Best-effort: ANY failure (no endpoint, network, GraphQL error) resolves
 * `{ proposals: [], ok: false }` and never throws into the poll loop (FR-015).
 */

// One bounded query — current draw-proposed wagers among the caller's ids.
// `id_in` scopes to the user's wagers; `status` filters to open proposals.
const QUERY = `
  query DrawProposals($ids: [ID!]!) {
    wagers(first: 1000, where: { id_in: $ids, status: draw_proposed }) {
      id
      drawProposer
    }
  }
`

/**
 * Fetch the current open draw proposals for the given wagers from the subgraph.
 *
 * @param {object} params
 * @param {string[]} params.wagerIds - Wager ids the user participates in
 * @returns {Promise<{proposals: {wagerId: string, proposer: string}[], ok: boolean}>}
 *   `proposals` lists every wager currently in `draw_proposed` with its
 *   (lowercased) proposer. `ok` is true only when the read succeeded — the
 *   caller retains prior draw state when `ok` is false. Resolves; never rejects.
 */
export async function fetchDrawProposals({ wagerIds }) {
  const ids = (wagerIds || []).map(String)
  // Nothing to ask about — a successful empty answer (lets the caller clear any
  // stale proposals without a network round-trip).
  if (ids.length === 0) return { proposals: [], ok: true }
  const subgraphUrl = import.meta.env?.VITE_SUBGRAPH_URL || ''
  if (!subgraphUrl) return { proposals: [], ok: false }

  try {
    const res = await fetch(subgraphUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: QUERY, variables: { ids } }),
    })
    if (!res.ok) return { proposals: [], ok: false }
    const json = await res.json()
    if (json.errors || !json.data) return { proposals: [], ok: false }

    const proposals = []
    for (const w of json.data.wagers || []) {
      // A draw_proposed wager always has a proposer under v2 indexing; guard
      // anyway so a null never becomes an empty-address "proposer".
      if (!w || !w.drawProposer) continue
      proposals.push({ wagerId: String(w.id), proposer: String(w.drawProposer).toLowerCase() })
    }
    return { proposals, ok: true }
  } catch {
    return { proposals: [], ok: false }
  }
}
