/**
 * My Wagers hybrid data sources (spec 037, US2 / FR-024).
 *
 * Feeds aggregateMyItems() with the item types the existing wager path does NOT already cover:
 *  - Group pools the user CREATED — indexed by the subgraph (Pool.creator).
 *  - Group pools the user JOINED — membership is by public wallet address (Joined(address)), but the
 *    subgraph has no wallet→pools reverse index, so joins are recorded device-locally at join time and
 *    their summaries are re-fetched from the subgraph by id.
 *  - Device-vault open challenges — created-but-locally-known codes (via the code vault).
 *
 * 1v1 wagers and created open challenges (which are themselves Wager entities keyed by creator) already
 * arrive through the wager repository, so they are intentionally not re-queried here.
 *
 * Network scoping (Constitution III): the subgraph endpoint is resolved per active chain; a chain with
 * no endpoint yields an empty result rather than leaking another network's data.
 */
import { getSubgraphUrl } from '../../config/networks'

export const POOL_STATE_LABELS = { 0: 'Joining open', 1: 'Joining closed', 2: 'Resolved', 3: 'Cancelled' }

const POOL_FIELDS = 'id poolId creator token buyIn maxMembers thresholdBips acceptDeadline resolveDeadline state memberCount createdAt'

const CREATED_POOLS_QUERY = `
  query MyCreatedPools($owner: Bytes!, $first: Int!) {
    pools(first: $first, orderBy: createdAt, orderDirection: desc, where: { creator: $owner }) {
      ${POOL_FIELDS}
    }
  }`

const POOLS_BY_ID_QUERY = `
  query PoolsById($ids: [ID!]!) {
    pools(where: { id_in: $ids }) {
      ${POOL_FIELDS}
    }
  }`

async function defaultPostGraphQL(url, query, variables) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) throw new Error(`Subgraph HTTP ${res.status}`)
  const json = await res.json()
  if (json.errors) throw new Error(`Subgraph: ${json.errors[0]?.message || 'unknown error'}`)
  return json.data
}

/** Map a raw subgraph Pool to the shape poolItem() (myWagersAggregation) consumes. */
export function mapPool(p) {
  const state = Number(p.state)
  return {
    address: p.id,
    poolId: Number(p.poolId),
    state,
    stateLabel: POOL_STATE_LABELS[state] || `State ${p.state}`,
    memberCount: Number(p.memberCount),
    maxMembers: Number(p.maxMembers),
  }
}

// --- Device-local record of joined pools (addresses only; no wallet↔commitment link is ever stored) ---

const joinedKey = (account) => `fairwins_joined_pools_v1_${String(account || '').toLowerCase()}`

export function readJoinedPoolAddresses(account) {
  if (!account) return []
  try {
    const raw = localStorage.getItem(joinedKey(account))
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

/** Record (idempotently) that this device joined a pool, so it can surface in My Wagers later. */
export function recordJoinedPool(account, address) {
  if (!account || !address) return
  try {
    const cur = readJoinedPoolAddresses(account).map((a) => String(a).toLowerCase())
    const addr = String(address).toLowerCase()
    if (!cur.includes(addr)) {
      localStorage.setItem(joinedKey(account), JSON.stringify([...cur, addr]))
    }
  } catch {
    /* private browsing / quota — degrade to session-only */
  }
}

// --- Fetchers ---

export async function fetchCreatedPools({ chainId, account, first = 50, postGraphQL = defaultPostGraphQL, resolveUrl = getSubgraphUrl } = {}) {
  if (!account) return []
  const url = resolveUrl(chainId)
  if (!url) return []
  const data = await postGraphQL(url, CREATED_POOLS_QUERY, { owner: String(account).toLowerCase(), first })
  return (data?.pools || []).map(mapPool)
}

export async function fetchJoinedPools({ chainId, account, postGraphQL = defaultPostGraphQL, resolveUrl = getSubgraphUrl } = {}) {
  const ids = readJoinedPoolAddresses(account)
  if (!ids.length) return []
  const url = resolveUrl(chainId)
  if (!url) return []
  const data = await postGraphQL(url, POOLS_BY_ID_QUERY, { ids: ids.map((a) => String(a).toLowerCase()) })
  return (data?.pools || []).map(mapPool)
}

/** Device-vault open-challenge codes (created-but-locally-known). `recoverCodes` is the vault reader. */
export async function fetchDeviceChallenges(recoverCodes) {
  if (typeof recoverCodes !== 'function') return []
  try {
    const list = await recoverCodes()
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

/**
 * Load the hybrid sources this module owns (pools + device-vault challenges), scoped to the active
 * network/account. Errors from any one source degrade to an empty array for that source (FR-024/019).
 */
export async function loadMyWagersSources({ chainId, account, recoverCodes, postGraphQL, resolveUrl } = {}) {
  const opts = { chainId, account, postGraphQL, resolveUrl }
  const [createdPools, joinedPools, deviceChallenges] = await Promise.all([
    fetchCreatedPools(opts).catch(() => []),
    fetchJoinedPools(opts).catch(() => []),
    fetchDeviceChallenges(recoverCodes),
  ])
  return { createdPools, joinedPools, deviceChallenges }
}
