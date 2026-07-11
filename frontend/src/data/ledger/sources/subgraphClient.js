/**
 * Minimal subgraph POST helper for ledger sources (spec 051).
 * Returns null (not an error) when the chain has no subgraph configured so
 * sources can degrade to their fallback or to an honest empty result.
 */
import { getSubgraphUrl } from '../../../config/networks'

export async function querySubgraph(chainId, query, variables) {
  const url = getSubgraphUrl(chainId)
  if (!url) return null
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
