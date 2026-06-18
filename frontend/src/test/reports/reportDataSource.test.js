import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createReportDataSource, resolveEscrow } from '../../data/reports/reportDataSource'
import { WAGER_REGISTRY_ABI } from '../../abis/WagerRegistry'

const USER = '0x1111111111111111111111111111111111111111'

describe('resolveEscrow (contract resolution)', () => {
  for (const chainId of [137, 80002, 63, 1337]) {
    it(`resolves the v2 WagerRegistry on chain ${chainId} with the v2 ABI + events`, () => {
      const e = resolveEscrow(chainId)
      expect(e.address).toMatch(/^0x[0-9a-fA-F]{40}$/)
      expect(e.abi).toBe(WAGER_REGISTRY_ABI)
      expect(e.valueEvents).toEqual(
        expect.arrayContaining(['WagerCreated', 'WagerAccepted', 'PayoutClaimed', 'WagerRefunded']),
      )
    })
  }

  it('throws a clear error when no escrow is configured for the chain', () => {
    expect(() => resolveEscrow(999999)).toThrow(/no wager escrow contract is configured/i)
  })
})

describe('createReportDataSource.enumerateWagers (subgraph-based, no genesis scan)', () => {
  afterEach(() => vi.unstubAllEnvs())

  function fakeRepo(pages) {
    let call = 0
    return {
      listMyWagers: vi.fn(async () => pages[Math.min(call++, pages.length - 1)]),
    }
  }

  it('requires the subgraph and throws a clear error when it is not configured', async () => {
    vi.stubEnv('VITE_SUBGRAPH_URL', '')
    const ds = createReportDataSource({ chainId: 80002, provider: { getBlockNumber: async () => 1 }, repository: fakeRepo([]) })
    await expect(ds.enumerateWagers({ account: USER })).rejects.toThrow(/requires the indexing subgraph/i)
  })

  it('enumerates the user\'s wagers from the subgraph repository (never scans logs)', async () => {
    vi.stubEnv('VITE_SUBGRAPH_URL', 'http://subgraph.example')
    const repo = fakeRepo([
      {
        source: 'subgraph',
        hasMore: false,
        nextCursor: null,
        items: [
          { id: '1', creator: USER, participants: [USER], stakeTokenAddress: '0xtok', stakeAmount: '100', createdAt: 1700000000000 },
          { id: '2', creator: '0xother', participants: ['0xother', USER], stakeTokenAddress: '0xtok', stakeAmount: '50', createdAt: 1700001000000 },
        ],
      },
    ])
    const ds = createReportDataSource({ chainId: 80002, provider: { getBlockNumber: async () => 1 }, repository: repo })
    const wagers = await ds.enumerateWagers({ account: USER })
    expect(wagers.map((w) => w.id)).toEqual(['1', '2'])
    expect(repo.listMyWagers).toHaveBeenCalledWith(expect.objectContaining({ userAddress: USER, filter: { includeExpired: true } }))
  })

  it('fails clearly if the repository falls back to the legacy events source', async () => {
    vi.stubEnv('VITE_SUBGRAPH_URL', 'http://subgraph.example')
    const repo = fakeRepo([{ source: 'subgraph-fallback', hasMore: false, nextCursor: null, items: [] }])
    const ds = createReportDataSource({ chainId: 80002, provider: { getBlockNumber: async () => 1 }, repository: repo })
    await expect(ds.enumerateWagers({ account: USER })).rejects.toThrow(/subgraph is unreachable/i)
  })

  it('returns [] without an account', async () => {
    vi.stubEnv('VITE_SUBGRAPH_URL', 'http://subgraph.example')
    const ds = createReportDataSource({ chainId: 80002, provider: { getBlockNumber: async () => 1 }, repository: fakeRepo([]) })
    expect(await ds.enumerateWagers({ account: null })).toEqual([])
  })
})

describe('createReportDataSource.getWagerEvents (bounded window, adaptive chunking)', () => {
  beforeEach(() => vi.stubEnv('VITE_SKIP_BLOCKCHAIN_CALLS', 'false'))
  afterEach(() => vi.unstubAllEnvs())

  function fakeContract(onQuery) {
    return {
      filters: new Proxy({}, { get: (_t, name) => (...args) => ({ name: String(name), args }) }),
      queryFilter: onQuery,
    }
  }

  it('does not scan from genesis — starts near the wager createdAt and stays within budget', async () => {
    vi.stubEnv('VITE_SUBGRAPH_URL', 'http://subgraph.example')
    const calls = []
    // latest block ~ 1,000,000; createdAt recent → window should be small.
    const provider = {
      getBlockNumber: async () => 1_000_000,
      getBlock: async () => ({ timestamp: 2_000_000 }),
    }
    const contract = fakeContract(async (filter, from, to) => {
      calls.push([from, to])
      return []
    })
    const repo = {
      listMyWagers: async () => ({
        source: 'subgraph', hasMore: false, nextCursor: null,
        // createdAt ~ now (latestSec 2,000,000) → window starts just below latest block
        items: [{ id: '5', creator: '0x1111111111111111111111111111111111111111', participants: [], stakeTokenAddress: '0xtok', stakeAmount: '1', createdAt: 1_999_000_000 }],
      }),
    }
    const ds = createReportDataSource({ chainId: 80002, provider, contract, repository: repo })
    await ds.enumerateWagers({ account: '0x1111111111111111111111111111111111111111' })
    await ds.getWagerEvents('5')

    expect(calls.length).toBeGreaterThan(0)
    const minFrom = Math.min(...calls.map((c) => c[0]))
    // Must NOT start at genesis.
    expect(minFrom).toBeGreaterThan(0)
    // Bounded request count (budget).
    expect(calls.length).toBeLessThanOrEqual(60)
  })

  it('shrinks the chunk when the RPC rejects the block range', async () => {
    vi.stubEnv('VITE_SUBGRAPH_URL', 'http://subgraph.example')
    const sizes = []
    let firstBig = true
    const provider = { getBlockNumber: async () => 10_000, getBlock: async () => ({ timestamp: 1000 }) }
    const contract = fakeContract(async (filter, from, to) => {
      sizes.push(to - from + 1)
      if (firstBig && to - from + 1 > 1000) {
        firstBig = false
        const e = new Error('block range exceeds configured limit')
        throw e
      }
      return []
    })
    const repo = {
      listMyWagers: async () => ({ source: 'subgraph', hasMore: false, nextCursor: null,
        items: [{ id: '9', creator: '0x1', participants: [], stakeTokenAddress: '0xt', stakeAmount: '1', createdAt: 0 }] }),
    }
    const ds = createReportDataSource({ chainId: 80002, provider, contract, repository: repo })
    await ds.enumerateWagers({ account: '0xabc' })
    await ds.getWagerEvents('9')
    // After the rejection, a smaller chunk size must have been attempted.
    expect(Math.min(...sizes)).toBeLessThan(5000)
  })
})
