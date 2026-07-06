// Spec 042 — per-DAO data-source router (subgraph-first, then on-chain, then truthful empty/partial/error).
//
// Precedence (FR-008, SC-011): (1) a The Graph governance subgraph when one is configured for (chainId, dao) AND
// a gateway API key is present; (2) the connector's bounded, chunked on-chain live indexer; (3) a truthful
// empty/partial/error status. Both paths return the SAME normalized proposal shape (contracts/connector-
// interface.md), so ExternalDaoView and daoSource never branch on the source. Never fabricates — a subgraph
// failure falls back to on-chain, and an on-chain failure surfaces honestly.

import { subgraphEndpointFor } from '../../config/clearpath/daoSubgraphs'
import { getConnector } from './connectors'

/** Which source will serve (chainId, dao): a configured+keyed subgraph, else on-chain. */
export function resolveDataSource(chainId, address) {
  const endpoint = subgraphEndpointFor(chainId, address)
  return endpoint ? { kind: 'subgraph', endpoint } : { kind: 'onchain', endpoint: null }
}

// A conventional governance-subgraph query (OpenZeppelin/Compound governance schemas expose a `proposals`
// collection). Concrete per-DAO schemas are VERIFIED when a subgraph id is wired (T026/T036); a mismatch yields
// ok:false here and the router falls back to on-chain — it never fabricates rows.
const PROPOSALS_QUERY = `query Proposals($first: Int!) {
  proposals(first: $first, orderBy: creationBlock, orderDirection: desc) {
    id proposalId description
    targets values calldatas
    startBlock endBlock
    state
    forVotes againstVotes abstainVotes
  }
}`

function normalizeSubgraphProposal(p) {
  const arr = (v) => (Array.isArray(v) ? v.map(String) : [])
  const votes =
    p.forVotes != null || p.againstVotes != null || p.abstainVotes != null
      ? { for: String(p.forVotes ?? '0'), against: String(p.againstVotes ?? '0'), abstain: String(p.abstainVotes ?? '0') }
      : null
  return {
    id: String(p.proposalId ?? p.id),
    proposer: p.proposer ?? null,
    description: p.description ?? '',
    targets: arr(p.targets),
    values: arr(p.values),
    calldatas: arr(p.calldatas),
    descriptionHash: null,
    voteStart: p.startBlock != null ? String(p.startBlock) : null,
    voteEnd: p.endBlock != null ? String(p.endBlock) : null,
    state: p.state != null && Number.isFinite(Number(p.state)) ? Number(p.state) : null,
    votes,
  }
}

/**
 * Read proposals from a governance subgraph. Real GraphQL POST; returns { ok:false } on any transport/shape
 * failure so the caller falls back to on-chain (honest, never fabricated). `fetchImpl` is injectable for tests.
 */
export async function fetchProposalsFromSubgraph(endpoint, _address, { fetchImpl = fetch, max = 50 } = {}) {
  if (!endpoint) return { ok: false }
  try {
    const resp = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: PROPOSALS_QUERY, variables: { first: max } }),
    })
    if (!resp || !resp.ok) return { ok: false }
    const json = await resp.json()
    const rows = json?.data?.proposals
    if (!Array.isArray(rows)) return { ok: false } // schema mismatch → on-chain fallback
    return { ok: true, proposals: rows.map(normalizeSubgraphProposal) }
  } catch {
    return { ok: false }
  }
}

/**
 * Fetch a DAO's proposals via the resolved source. Returns
 * `{ ok, kind: 'subgraph'|'onchain', proposals, status: 'ok'|'empty'|'partial'|'error', partial, error }`.
 * `status` is truthful at every tier and drives the UI source/status chip.
 */
export async function fetchDaoProposals({ chainId, address, framework, reader, opts }, { fetchImpl } = {}) {
  const source = resolveDataSource(chainId, address)

  if (source.kind === 'subgraph') {
    const sg = await fetchProposalsFromSubgraph(source.endpoint, address, fetchImpl ? { fetchImpl } : {})
    if (sg.ok) {
      return {
        ok: true,
        kind: 'subgraph',
        proposals: sg.proposals,
        status: sg.proposals.length ? 'ok' : 'empty',
        partial: false,
      }
    }
    // subgraph unreachable / schema mismatch → fall through to on-chain (never fabricate)
  }

  const connector = getConnector(framework)
  if (!connector) {
    return { ok: false, kind: 'onchain', proposals: [], status: 'error', error: 'No connector for this framework.' }
  }
  if (!reader) {
    return { ok: false, kind: 'onchain', proposals: [], status: 'error', error: 'No provider available.' }
  }
  const res = await connector.fetchProposals(reader, address, opts)
  const status = !res.ok ? 'error' : res.partial ? 'partial' : res.proposals?.length ? 'ok' : 'empty'
  return {
    ok: !!res.ok,
    kind: 'onchain',
    proposals: res.proposals || [],
    status,
    partial: !!res.partial,
    error: res.error,
  }
}

export default fetchDaoProposals
