// Spec 042 — per-DAO governance subgraph endpoints (subgraph-first data sourcing).
//
// When a DAO is indexed by The Graph, ClearPath reads its proposals/tallies/states from the subgraph in
// preference to scanning the chain (FR-008, SC-011). Endpoints are built from a single gateway API key
// (VITE_CLEARPATH_GRAPH_KEY) plus the subgraph id — the hosted service is deprecated, so the decentralized
// network gateway is the supported path. When the key is absent, a DAO with a configured subgraph simply falls
// back to on-chain reads (still truthful — never a silent disable).
//
// Keyed by chainId → { <lowercased dao address>: { subgraphId, idKind } }. Subgraph IDs are VERIFIED config
// (confirmed against the live gateway during implementation, T026/T036), never guessed.

const GRAPH_KEY = import.meta.env?.VITE_CLEARPATH_GRAPH_KEY || null

/** Build a decentralized-network gateway URL for a subgraph id, or null when no API key is configured. */
export function gatewayUrl(subgraphId) {
  if (!GRAPH_KEY || !subgraphId) return null
  return `https://gateway.thegraph.com/api/${GRAPH_KEY}/subgraphs/id/${subgraphId}`
}

// Researched for the two seeded mainnet DAOs (knownDaos.js) — deliberately left EMPTY, not guessed:
//  - ENS Governor (0x323A76393544d5ecca80cd6ef2A560C6a395b7E3): Messari published an OZ-Governor-schema
//    subgraph ("ens-governance") announced at https://discuss.ens.domains/t/new-ens-governance-subgraph-live/13898,
//    but only ever on the now-deprecated hosted service (api.thegraph.com/subgraphs/name/...) — that host no
//    longer serves live queries and no decentralized-network (gateway) subgraph id for it could be confirmed.
//  - Uniswap Governor Bravo (0x408ED6354d4973f66138C91495F2f2FCbd8724C3): community subgraphs found
//    (messari/uniswap-governance, arr00/uniswap-governance-v2) are unmaintained/hosted-service-only, and most
//    target the older GovernorAlpha contract rather than this Bravo deployment.
// Re-check https://thegraph.com/explorer for a live, actively-synced entry before adding an id here — a wrong
// id is worse than no id (the router falls back to the on-chain live scan either way, never fabricates rows).
/** @type {Record<number, Record<string, {subgraphId: string, idKind?: string}>>} */
export const DAO_SUBGRAPHS = {
  // 1: { '0x…ens governor': { subgraphId: '…' }, '0x…uniswap governor': { subgraphId: '…' } },
}

/**
 * Resolve the governance subgraph endpoint for (chainId, dao), or null when none is configured OR no gateway API
 * key is present (→ the caller falls back to on-chain reads). Never throws.
 */
export function subgraphEndpointFor(chainId, dao) {
  const byChain = DAO_SUBGRAPHS[Number(chainId)]
  if (!byChain) return null
  const entry = byChain[String(dao || '').toLowerCase()]
  if (!entry) return null
  return gatewayUrl(entry.subgraphId)
}

export default subgraphEndpointFor
