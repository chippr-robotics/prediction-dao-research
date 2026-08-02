import { describe, it, expect, vi, beforeEach } from 'vitest'

// Spec 042 — per-DAO data-source router precedence: subgraph-first → on-chain → truthful empty/partial/error.

const h = vi.hoisted(() => ({ endpoint: null, fetchProposals: vi.fn() }))

vi.mock('../../../config/clearpath/daoSubgraphs', () => ({
  subgraphEndpointFor: () => h.endpoint,
}))
vi.mock('../connectors', () => ({
  getConnector: (fw) => (fw === 0 ? { framework: 0, fetchProposals: (...a) => h.fetchProposals(...a) } : null),
}))

import { resolveDataSource, fetchDaoProposals } from '../daoDataSource'

const base = { chainId: 1, address: '0xdao', framework: 0, reader: {}, opts: {} }

describe('daoDataSource (spec 042)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.endpoint = null
  })

  it('resolves on-chain when no subgraph is configured', () => {
    expect(resolveDataSource(1, '0xdao').kind).toBe('onchain')
    h.endpoint = 'https://gateway/x'
    expect(resolveDataSource(1, '0xdao').kind).toBe('subgraph')
  })

  it('on-chain: maps a populated result to status "ok"', async () => {
    h.fetchProposals.mockResolvedValue({ ok: true, proposals: [{ id: '1' }], partial: false })
    const r = await fetchDaoProposals(base)
    expect(r.kind).toBe('onchain')
    expect(r.status).toBe('ok')
    expect(r.proposals).toHaveLength(1)
  })

  it('on-chain: empty vs partial vs error statuses are truthful', async () => {
    h.fetchProposals.mockResolvedValueOnce({ ok: true, proposals: [], partial: false })
    expect((await fetchDaoProposals(base)).status).toBe('empty')
    h.fetchProposals.mockResolvedValueOnce({ ok: true, proposals: [{ id: '1' }], partial: true })
    expect((await fetchDaoProposals(base)).status).toBe('partial')
    h.fetchProposals.mockResolvedValueOnce({ ok: false, proposals: [], error: 'rpc' })
    expect((await fetchDaoProposals(base)).status).toBe('error')
  })

  it('unknown framework → error status, never fabricated rows', async () => {
    const r = await fetchDaoProposals({ ...base, framework: 'unknown' })
    expect(r.ok).toBe(false)
    expect(r.status).toBe('error')
    expect(r.proposals).toEqual([])
  })

  it('subgraph-first: reads via the subgraph and normalizes; on-chain untouched', async () => {
    h.endpoint = 'https://gateway/x'
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { proposals: [{ proposalId: '7', description: 'hi', state: 1 }] } }),
    })
    const r = await fetchDaoProposals(base, { fetchImpl })
    expect(r.kind).toBe('subgraph')
    expect(r.status).toBe('ok')
    expect(r.proposals[0].id).toBe('7')
    expect(h.fetchProposals).not.toHaveBeenCalled()
  })

  it('subgraph failure falls back to on-chain (honest, never a dead end)', async () => {
    h.endpoint = 'https://gateway/x'
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false })
    h.fetchProposals.mockResolvedValue({ ok: true, proposals: [{ id: '1' }], partial: false })
    const r = await fetchDaoProposals(base, { fetchImpl })
    expect(r.kind).toBe('onchain')
    expect(r.status).toBe('ok')
    expect(h.fetchProposals).toHaveBeenCalled()
  })
})
