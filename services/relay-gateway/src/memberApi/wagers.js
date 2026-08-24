/**
 * Per-chain wager reads for the member API (spec 095).
 *
 * A THIN PROXY OVER THE SAME SUBGRAPHS THE SPA READS, and nothing more. It queries the `Wager`
 * entity the way `frontend/src/data/wagers/SubgraphSource.js` does — creator OR opponent — so an
 * agent and the app see the same wagers, and it deliberately does NOT fall back to on-chain event
 * scans: the SPA's `RegistrySource`/`EventsSource` exist because a browser can afford a slow path a
 * shared gateway cannot, and inventing a second, differently-shaped answer here would be worse than
 * saying honestly that this chain has no indexer.
 *
 * THE ENVELOPE IS THE POINT. Every chain resolves to exactly one of:
 *
 *   read            — the indexer answered; `wagers` exists and is what it said.
 *   not-configured  — no MEMBER_API_SUBGRAPH_<chainId> on this gateway. NOT an empty result: the
 *                     question was never asked, and `[]` here would assert the member has no
 *                     wagers on a chain we never looked at.
 *   unreadable      — configured, asked, and it failed. Also NOT an empty result.
 *
 * `wagers` exists only on `read`, so there is no shape in which a failure can be mistaken for
 * "nothing found". A response missing a chain names it in `partial`.
 */

/**
 * The same field set the SPA's subgraph source selects, minus what only a browser uses. `first` is
 * capped by the caller; ordering is newest-first so a capped page is the useful half.
 */
const PAGE_QUERY = `
  query MemberWagers($owner: Bytes!, $first: Int!) {
    wagers(
      first: $first
      orderBy: createdAt
      orderDirection: desc
      where: { or: [ { creator: $owner }, { opponent: $owner } ] }
    ) {
      id
      status
      resolutionType
      creator
      opponent
      token
      creatorStake
      opponentStake
      winner
      createdAt
      resolvedAt
      metadataUri
      metadataHash
    }
  }
`

/** Shape one row for the wire. Absent values stay null — never 0, never ''. */
function toWager(raw, chainId) {
  return {
    id: String(raw.id),
    chainId,
    status: raw.status ?? null,
    resolutionType: raw.resolutionType == null ? null : Number(raw.resolutionType),
    creator: raw.creator ?? null,
    opponent: raw.opponent || null,
    token: raw.token ?? null,
    creatorStake: raw.creatorStake == null ? null : String(raw.creatorStake),
    opponentStake: raw.opponentStake == null ? null : String(raw.opponentStake),
    winner: raw.winner || null,
    createdAt: raw.createdAt == null ? null : Number(raw.createdAt),
    resolvedAt: raw.resolvedAt == null ? null : Number(raw.resolvedAt),
    metadataUri: raw.metadataUri || null,
    metadataHash: raw.metadataHash || null,
  }
}

/**
 * @param {object} config full gateway config (reads .memberApi.subgraphUrls and .enabledChainIds)
 * @param {{fetchImpl?: typeof fetch}} [deps]
 */
export function createWagerReader(config, { fetchImpl = fetch } = {}) {
  const memberApi = config.memberApi

  async function queryChain(chainId, account, first) {
    const url = memberApi.subgraphUrls[chainId]
    if (!url) return { state: 'not-configured', reason: 'no wager indexer is configured for this network on this gateway' }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), memberApi.timeoutMs)
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: PAGE_QUERY, variables: { owner: String(account).toLowerCase(), first } }),
        signal: controller.signal,
      })
      if (!res.ok) return { state: 'unreadable', reason: `the wager indexer answered HTTP ${res.status}` }
      const json = await res.json()
      // A GraphQL `errors` array with no usable `data` is a failed read, not an empty one.
      if (!json?.data?.wagers) {
        const first0 = Array.isArray(json?.errors) ? json.errors[0]?.message : null
        return { state: 'unreadable', reason: first0 ? `the wager indexer rejected the query: ${String(first0).slice(0, 160)}` : 'the wager indexer returned an unreadable payload' }
      }
      return { state: 'read', wagers: json.data.wagers.map((w) => toWager(w, chainId)) }
    } catch {
      return { state: 'unreadable', reason: 'the wager indexer could not be reached; try again' }
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    /** Chains this gateway can answer for at all (config-time fact). */
    configuredChainIds: () => config.enabledChainIds.filter((id) => Boolean(memberApi.subgraphUrls[id])),

    /**
     * @param {string} account
     * @param {{chainIds: number[], first: number}} opts
     * @returns {Promise<{chains: Record<string, object>, partial: string[]|null}>}
     */
    async read(account, { chainIds, first }) {
      const results = await Promise.all(chainIds.map((id) => queryChain(id, account, first)))
      const chains = {}
      const missing = []
      chainIds.forEach((id, i) => {
        chains[String(id)] = { chainId: id, ...results[i] }
        if (results[i].state !== 'read') missing.push(String(id))
      })
      // A total that is missing a chain is labelled partial and NAMES what is missing — a caller
      // summing across chains must be able to see that the sum is incomplete.
      return { chains, partial: missing.length > 0 ? missing : null }
    },
  }
}
