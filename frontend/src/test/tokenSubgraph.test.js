/**
 * Spec 028 FR-043 — the token subgraph reader degrades honestly on every network.
 *
 * The bug this file pins: "no subgraph here" was the only unavailable case the reader knew, so on
 * Polygon — which HAS a subgraph that simply does not index token events — the query threw and the
 * panel rendered a red role="alert" containing the raw string
 * "Subgraph: Type `Query` has no field `holders`". An error message, for something that is not an
 * error.
 *
 * Three outcomes are now distinguished, and the third is the one that matters most:
 * `unreachable` is a fact about RIGHT NOW and must never be reported as a limitation of the
 * network. Claiming a permanent absence because one fetch failed is the same class of lie as
 * fabricating rows.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchHolders, fetchActivity, SUBGRAPH_UNAVAILABLE } from '../components/tokens/tokenSubgraph'

const TOKEN = '0xAbC0000000000000000000000000000000000028'
const MORDOR = 63
const ETC = 61
const POLYGON = 137

/** The Graph's own wording when a data source was never built into the deployment. */
const SCHEMA_ERROR = {
  errors: [{ message: 'Type `Query` has no field `holders`', locations: [{ line: 1, column: 3 }] }],
}

const respond = (body, ok = true, status = 200) => ({
  ok,
  status,
  json: async () => body,
})

let fetchMock

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('a chain with no subgraph at all (Mordor, ETC)', () => {
  it('reports no-subgraph without attempting a request', async () => {
    for (const chainId of [MORDOR, ETC]) {
      const res = await fetchHolders(chainId, TOKEN)
      expect(res.available).toBe(false)
      expect(res.unavailable).toBe(SUBGRAPH_UNAVAILABLE.NO_SUBGRAPH)
      expect(res.holders).toEqual([])
    }
    // Mordor and ETC have no Graph deployment and will not get one; asking is pointless.
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does the same for the activity feed', async () => {
    const res = await fetchActivity(MORDOR, TOKEN)
    expect(res.available).toBe(false)
    expect(res.unavailable).toBe(SUBGRAPH_UNAVAILABLE.NO_SUBGRAPH)
    expect(res.activity).toEqual([])
  })
})

describe('a subgraph that does not index tokens (Polygon today)', () => {
  it('reports not-indexed rather than throwing a GraphQL string at the member', async () => {
    fetchMock.mockResolvedValue(respond(SCHEMA_ERROR))
    const res = await fetchHolders(POLYGON, TOKEN)

    expect(res.available).toBe(false)
    expect(res.unavailable).toBe(SUBGRAPH_UNAVAILABLE.NOT_INDEXED)
    expect(res.holders).toEqual([])
  })

  it('recognises the other wordings a GraphQL server uses for a missing field', async () => {
    for (const message of [
      'Cannot query field "tokenActivities" on type "Query"',
      'Unknown type `Holder`',
      'Unknown field `firstHeldAt`',
    ]) {
      fetchMock.mockResolvedValue(respond({ errors: [{ message }] }))
      expect((await fetchHolders(POLYGON, TOKEN)).unavailable).toBe(SUBGRAPH_UNAVAILABLE.NOT_INDEXED)
    }
  })

  it('keeps the server\'s own words as detail, for a developer — not for the member', async () => {
    fetchMock.mockResolvedValue(respond(SCHEMA_ERROR))
    expect((await fetchHolders(POLYGON, TOKEN)).detail).toMatch(/has no field/)
  })
})

describe('a transport failure is never dressed up as a limitation of the network', () => {
  it('reports unreachable on a non-OK response', async () => {
    fetchMock.mockResolvedValue(respond({}, false, 503))
    const res = await fetchHolders(POLYGON, TOKEN)
    expect(res.available).toBe(false)
    expect(res.unavailable).toBe(SUBGRAPH_UNAVAILABLE.UNREACHABLE)
  })

  it('reports unreachable when the request throws', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))
    expect((await fetchActivity(POLYGON, TOKEN)).unavailable).toBe(SUBGRAPH_UNAVAILABLE.UNREACHABLE)
  })

  it('reports unreachable for a GraphQL error it cannot positively identify', async () => {
    // The honest default. Promoting an unrecognised failure to "this chain does not index tokens"
    // would state a durable fact about the estate on the strength of a guess.
    fetchMock.mockResolvedValue(respond({ errors: [{ message: 'indexing_error: subgraph failed' }] }))
    expect((await fetchHolders(POLYGON, TOKEN)).unavailable).toBe(SUBGRAPH_UNAVAILABLE.UNREACHABLE)
  })

  it('never throws — the caller must be able to branch, not catch', async () => {
    fetchMock.mockRejectedValue(new Error('boom'))
    await expect(fetchHolders(POLYGON, TOKEN)).resolves.toBeTruthy()
    await expect(fetchActivity(POLYGON, TOKEN)).resolves.toBeTruthy()
  })
})

describe('a subgraph that does index tokens', () => {
  it('returns the rows', async () => {
    const holders = [{ account: '0x1', balance: '10', firstHeldAt: '1700000000' }]
    fetchMock.mockResolvedValue(respond({ data: { holders } }))
    const res = await fetchHolders(POLYGON, TOKEN)

    expect(res.available).toBe(true)
    expect(res.unavailable).toBeNull()
    expect(res.holders).toEqual(holders)
  })

  it('treats an EMPTY result as a real answer, not as unavailable', async () => {
    // "This token has no holders yet" is information. Reporting it as unavailable would hide a
    // true fact behind a false one.
    fetchMock.mockResolvedValue(respond({ data: { holders: [] } }))
    const res = await fetchHolders(POLYGON, TOKEN)
    expect(res.available).toBe(true)
    expect(res.holders).toEqual([])
  })

  it('lower-cases the token address in the query variables', async () => {
    fetchMock.mockResolvedValue(respond({ data: { holders: [] } }))
    await fetchHolders(POLYGON, TOKEN)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.variables.token).toBe(TOKEN.toLowerCase())
  })

  it('exposes activity under both its entity name and the panel\'s alias', async () => {
    const rows = [{ id: '1', type: 'mint' }]
    fetchMock.mockResolvedValue(respond({ data: { tokenActivities: rows } }))
    const res = await fetchActivity(POLYGON, TOKEN)
    expect(res.activity).toEqual(rows)
    expect(res.tokenActivities).toEqual(rows)
  })
})
