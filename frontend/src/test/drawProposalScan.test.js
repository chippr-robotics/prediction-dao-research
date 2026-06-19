/**
 * Tests for data/notifications/drawProposalScan.js (spec 017 — subgraph read).
 *
 * The draw-proposal lookup no longer scans `eth_getLogs`; it reads the v2
 * subgraph's `drawProposer` for the user's wagers currently in
 * `status: draw_proposed`. Contract:
 *   - returns a COMPLETE snapshot { proposals: [{wagerId, proposer}], ok }
 *   - empty wagerIds → { proposals: [], ok: true } (no network call)
 *   - missing VITE_SUBGRAPH_URL / HTTP error / GraphQL error / throw →
 *     { proposals: [], ok: false } so the caller retains prior state
 *   - proposer is lowercased; a null drawProposer row is dropped
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fetchDrawProposals } from '../data/notifications/drawProposalScan'

const SUBGRAPH = 'http://subgraph.example'

function mockFetchJson(payload, { ok = true, status = 200 } = {}) {
  return vi.fn(async () => ({
    ok,
    status,
    json: async () => payload,
  }))
}

beforeEach(() => {
  vi.stubEnv('VITE_SUBGRAPH_URL', SUBGRAPH)
  vi.unstubAllGlobals?.()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('fetchDrawProposals — input guards', () => {
  it('returns a successful empty snapshot without a network call for empty wagerIds', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const result = await fetchDrawProposals({ wagerIds: [] })
    expect(result).toEqual({ proposals: [], ok: true })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns ok:false (retain prior state) when VITE_SUBGRAPH_URL is unset', async () => {
    vi.stubEnv('VITE_SUBGRAPH_URL', '')
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const result = await fetchDrawProposals({ wagerIds: ['1'] })
    expect(result).toEqual({ proposals: [], ok: false })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('fetchDrawProposals — successful read', () => {
  it('maps draw_proposed wagers to {wagerId, proposer} with a lowercased proposer', async () => {
    const fetchSpy = mockFetchJson({
      data: {
        wagers: [
          { id: '7', drawProposer: '0xAbCdEF1111111111111111111111111111111111' },
          { id: '9', drawProposer: '0x2222222222222222222222222222222222222222' },
        ],
      },
    })
    vi.stubGlobal('fetch', fetchSpy)

    const result = await fetchDrawProposals({ wagerIds: ['7', '9', '11'] })

    expect(result).toEqual({
      ok: true,
      proposals: [
        { wagerId: '7', proposer: '0xabcdef1111111111111111111111111111111111' },
        { wagerId: '9', proposer: '0x2222222222222222222222222222222222222222' },
      ],
    })
    // The query is scoped to the caller's ids and the draw_proposed status.
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body)
    expect(body.variables.ids).toEqual(['7', '9', '11'])
    expect(body.query).toMatch(/status:\s*draw_proposed/)
  })

  it('returns an empty (but ok) snapshot when no wager is currently draw_proposed', async () => {
    vi.stubGlobal('fetch', mockFetchJson({ data: { wagers: [] } }))
    const result = await fetchDrawProposals({ wagerIds: ['7'] })
    expect(result).toEqual({ proposals: [], ok: true })
  })

  it('drops a row whose drawProposer is null', async () => {
    vi.stubGlobal('fetch', mockFetchJson({
      data: { wagers: [{ id: '7', drawProposer: null }, { id: '8', drawProposer: '0x3333333333333333333333333333333333333333' }] },
    }))
    const result = await fetchDrawProposals({ wagerIds: ['7', '8'] })
    expect(result).toEqual({
      ok: true,
      proposals: [{ wagerId: '8', proposer: '0x3333333333333333333333333333333333333333' }],
    })
  })

  it('coerces numeric wagerIds to strings', async () => {
    const fetchSpy = mockFetchJson({ data: { wagers: [] } })
    vi.stubGlobal('fetch', fetchSpy)
    await fetchDrawProposals({ wagerIds: [7, 9] })
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body).variables.ids).toEqual(['7', '9'])
  })
})

describe('fetchDrawProposals — failure modes (never throws, ok:false)', () => {
  it('ok:false on a non-2xx HTTP response', async () => {
    vi.stubGlobal('fetch', mockFetchJson({}, { ok: false, status: 503 }))
    expect(await fetchDrawProposals({ wagerIds: ['1'] })).toEqual({ proposals: [], ok: false })
  })

  it('ok:false on a GraphQL errors payload', async () => {
    vi.stubGlobal('fetch', mockFetchJson({ errors: [{ message: 'bad field' }] }))
    expect(await fetchDrawProposals({ wagerIds: ['1'] })).toEqual({ proposals: [], ok: false })
  })

  it('ok:false when data is missing', async () => {
    vi.stubGlobal('fetch', mockFetchJson({}))
    expect(await fetchDrawProposals({ wagerIds: ['1'] })).toEqual({ proposals: [], ok: false })
  })

  it('ok:false when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down') }))
    expect(await fetchDrawProposals({ wagerIds: ['1'] })).toEqual({ proposals: [], ok: false })
  })
})
