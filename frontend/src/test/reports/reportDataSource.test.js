import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createReportDataSource, resolveEscrow } from '../../data/reports/reportDataSource'
import { WAGER_REGISTRY_ABI } from '../../abis/WagerRegistry'

const USER = '0x1111111111111111111111111111111111111111'
const OTHER = '0x2222222222222222222222222222222222222222'
const TOKEN = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'

// Regression: the deployment registers the escrow as `wagerRegistry`, NOT
// `friendGroupMarketFactory`. Asking for the factory key produced
// "FriendGroupMarketFactory address not configured" on every live network.
// resolveEscrow must resolve the configured wagerRegistry across all chains and
// throw a clear error only when nothing is configured.

describe('resolveEscrow (address-config bug fix)', () => {
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

// Regression: enumeration must read the wagerRegistry contract directly and
// NEVER fall back to the legacy EventsSource (which threw
// "FriendGroupMarketFactory address not configured").
describe('createReportDataSource.enumerateWagers (self-contained chain scan)', () => {
  // The test env pins VITE_SKIP_BLOCKCHAIN_CALLS='true'; turn it off so the scan runs.
  beforeEach(() => vi.stubEnv('VITE_SKIP_BLOCKCHAIN_CALLS', 'false'))
  afterEach(() => vi.unstubAllEnvs())

  function fakeContract(logsByEvent) {
    return {
      filters: new Proxy({}, {
        get: (_t, name) => (...args) => ({ name: String(name), args }),
      }),
      // Return logs only on the first chunk (from===0) to avoid duplicates.
      queryFilter: async (filter, from) => {
        if (from !== 0) return []
        const all = logsByEvent[filter.name] || []
        // crude topic match: the indexed user arg must equal a log party
        return all.filter((log) => filter.args.includes(log._match))
      },
    }
  }

  it('collects the user\'s wagers from indexed registry logs (no repository)', async () => {
    const logsByEvent = {
      WagerCreated: [
        { _match: USER, fragment: { name: 'WagerCreated' }, transactionHash: '0xa1', blockNumber: 100,
          args: { wagerId: 1n, creator: USER, opponent: OTHER, token: TOKEN } },
      ],
      WagerAccepted: [
        { _match: USER, fragment: { name: 'WagerAccepted' }, transactionHash: '0xb2', blockNumber: 130,
          args: { wagerId: 2n, opponent: USER } },
      ],
      PayoutClaimed: [],
    }
    const ds = createReportDataSource({
      chainId: 137,
      provider: { getBlockNumber: async () => 5000 },
      contract: fakeContract(logsByEvent),
    })
    const wagers = await ds.enumerateWagers({ account: USER })
    const ids = wagers.map((w) => w.id).sort()
    expect(ids).toEqual(['1', '2'])
    const w1 = wagers.find((w) => w.id === '1')
    expect(w1.creator).toBe(USER)
    expect(w1.stakeTokenAddress).toBe(TOKEN)
    // user is recorded as a party so buildReport's isParty filter keeps it
    expect(wagers.find((w) => w.id === '2').participants).toContain(USER)
  })

  it('returns [] without an account', async () => {
    const ds = createReportDataSource({ chainId: 137, provider: { getBlockNumber: async () => 1 }, contract: fakeContract({}) })
    expect(await ds.enumerateWagers({ account: null })).toEqual([])
  })
})
