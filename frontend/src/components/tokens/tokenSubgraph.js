import { getSubgraphUrl } from '../../config/networks'

// Spec 028 expansion (US10/US12) — read a token's holder cap table + activity from the subgraph. Returns
// `{ available:false }` when the active network has no subgraph (e.g. Mordor) so the UI can disable the view
// truthfully (FR-043) rather than fabricate rows. Network-scoped via getSubgraphUrl(chainId).

async function postGraphQL(url, query, variables) {
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

/** Fetch the holder cap table for a token. `{ available, holders }`. */
export async function fetchHolders(chainId, tokenAddress) {
  const url = getSubgraphUrl(chainId)
  if (!url) return { available: false, holders: [] }
  const data = await postGraphQL(url, HOLDERS_QUERY, { token: String(tokenAddress).toLowerCase() })
  return { available: true, holders: data.holders || [] }
}

/** Fetch the activity feed for a token. `{ available, activity }`. */
export async function fetchActivity(chainId, tokenAddress) {
  const url = getSubgraphUrl(chainId)
  if (!url) return { available: false, activity: [] }
  const data = await postGraphQL(url, ACTIVITY_QUERY, { token: String(tokenAddress).toLowerCase() })
  return { available: true, activity: data.tokenActivities || [] }
}
