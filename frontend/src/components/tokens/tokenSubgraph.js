/**
 * Token holder cap table + activity feed, read from the subgraph (spec 028 US10/US12, FR-043).
 *
 * THREE OUTCOMES, NEVER TWO. "There is no subgraph here", "there is one but it does not index
 * tokens", and "there is one that indexes tokens but I could not reach it" are different facts,
 * and a member acting on them would do different things. Collapsing them is how this surface got
 * its bug: it treated a missing URL as the only unavailable case, so on a chain whose subgraph
 * simply does not index tokens the query threw and the panel showed a red alert containing the raw
 * string "Subgraph: Type `Query` has no field `holders`" — an error message for something that is
 * not an error.
 *
 * Where each occurs today:
 *   - `no-subgraph`  — Mordor (63) and Ethereum Classic (61). Neither has a Graph deployment and
 *                      neither will; `subgraphUrl` is null and the app reads the chain directly.
 *   - `not-indexed`  — Polygon (137). It HAS a subgraph, but `subgraph/networks.json` gives the
 *                      `matic` network no TokenFactory data source, so `graph build` defers it and
 *                      the deployed schema has no `holders`/`tokenActivities` fields at all.
 *                      (Verified live against the v0.2.0 endpoint.)
 *   - `unreachable`  — any transport failure, anywhere.
 *
 * The distinction that matters most is the last one: `not-indexed` is a durable fact about the
 * chain and may be stated flatly, while `unreachable` is a fact about right now and must NEVER be
 * reported as "this network does not support it". Claiming a permanent absence because one fetch
 * failed is the same class of lie as fabricating rows.
 */
import { getSubgraphUrl } from '../../config/networks'

/** Why the indexed view is unavailable. Rendered differently for each — see the panels. */
export const SUBGRAPH_UNAVAILABLE = Object.freeze({
  /** This chain has no subgraph at all (Mordor, ETC). */
  NO_SUBGRAPH: 'no-subgraph',
  /** This chain has a subgraph, but it does not index token events. */
  NOT_INDEXED: 'not-indexed',
  /** The subgraph could not be reached or answered unintelligibly — a fact about NOW. */
  UNREACHABLE: 'unreachable',
})

/**
 * A GraphQL error saying the field does not exist in the deployed schema.
 *
 * Matched narrowly and only on the server's OWN words. Anything we cannot positively identify as
 * "this entity is not part of the deployed schema" stays `unreachable`, because the honest default
 * when we do not understand a failure is to admit we could not check — not to promote a guess into
 * a statement about what the chain supports.
 */
const NOT_INDEXED_PATTERN = /has no field|cannot query field|unknown (?:type|field|argument)/i

function classifyGraphQLErrors(errors) {
  const message = errors?.[0]?.message || ''
  return NOT_INDEXED_PATTERN.test(message)
    ? SUBGRAPH_UNAVAILABLE.NOT_INDEXED
    : SUBGRAPH_UNAVAILABLE.UNREACHABLE
}

/**
 * POST a query. Returns `{ data }` or `{ unavailable, detail }` — it does NOT throw, because every
 * caller here has to distinguish the failure kinds and a thrown Error flattens them back into one.
 */
async function postGraphQL(url, query, variables) {
  let json
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    })
    if (!res.ok) {
      return { unavailable: SUBGRAPH_UNAVAILABLE.UNREACHABLE, detail: `HTTP ${res.status}` }
    }
    json = await res.json()
  } catch (error) {
    return { unavailable: SUBGRAPH_UNAVAILABLE.UNREACHABLE, detail: error?.message || 'network error' }
  }
  if (json?.errors?.length) {
    return { unavailable: classifyGraphQLErrors(json.errors), detail: json.errors[0]?.message || '' }
  }
  return { data: json?.data || {} }
}

const HOLDERS_QUERY = `
  query Holders($token: Bytes!) {
    holders(where: { token: $token, balance_gt: "0" }, orderBy: balance, orderDirection: desc, first: 200) {
      account balance firstHeldAt
    }
  }`

const ACTIVITY_QUERY = `
  query Activity($token: Bytes!) {
    tokenActivities(where: { token: $token }, orderBy: timestamp, orderDirection: desc, first: 100) {
      id type actor from to amount detail timestamp txHash
    }
  }`

/** Shared shape so both readers degrade identically. */
async function fetchIndexed(chainId, tokenAddress, query, key) {
  const url = getSubgraphUrl(chainId)
  if (!url) return { available: false, unavailable: SUBGRAPH_UNAVAILABLE.NO_SUBGRAPH, detail: '', [key]: [] }

  const result = await postGraphQL(url, query, { token: String(tokenAddress).toLowerCase() })
  if (result.unavailable) {
    return { available: false, unavailable: result.unavailable, detail: result.detail, [key]: [] }
  }
  // An EMPTY list from an indexing subgraph is a real answer — this token has no holders yet — and
  // must not be dressed up as unavailable.
  return { available: true, unavailable: null, detail: '', [key]: result.data[key] || [] }
}

/** Holder cap table. `{ available, unavailable, detail, holders }`. */
export async function fetchHolders(chainId, tokenAddress) {
  return fetchIndexed(chainId, tokenAddress, HOLDERS_QUERY, 'holders')
}

/** Activity feed. `{ available, unavailable, detail, tokenActivities }` — aliased to `activity`. */
export async function fetchActivity(chainId, tokenAddress) {
  const result = await fetchIndexed(chainId, tokenAddress, ACTIVITY_QUERY, 'tokenActivities')
  return { ...result, activity: result.tokenActivities }
}
