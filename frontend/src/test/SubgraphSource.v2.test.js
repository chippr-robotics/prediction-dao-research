/**
 * Spec 017 / FR-018: the "my wagers" SubgraphSource is migrated to the v2 Wager
 * schema (creator/opponent/token/creatorStake/opponentStake/status/createdAt),
 * mapping participants ⇐ [creator, opponent] and stakeToken ⇐ token. A GraphQL
 * field error degrades to the RegistrySource (RPC) fallback rather than
 * surfacing broken data (constitution II + III).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const USER = '0x1111111111111111111111111111111111111111'
const OPP = '0x2222222222222222222222222222222222222222'

// RegistrySource is the RPC fallback (direct v2 WagerRegistry reads); mock it so
// the fallback path is observable without a provider.
vi.mock('../data/wagers/RegistrySource', () => ({
  listPage: vi.fn(async () => ({ items: [], nextCursor: null, hasMore: false, totalKnown: 0, source: 'registry' })),
  getById: vi.fn(async () => null),
}))
// cacheStore.upsertCache touches localStorage indirectly; keep it inert.
vi.mock('../data/wagers/cacheStore', () => ({ upsertCache: vi.fn() }))

describe('SubgraphSource v2 migration (FR-018)', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('VITE_SUBGRAPH_URL', 'http://subgraph.example')
    vi.stubEnv('VITE_SKIP_BLOCKCHAIN_CALLS', 'false')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('queries v2 Wager fields and maps participants/token from creator+opponent', async () => {
    let sentBody = null
    vi.stubGlobal('fetch', vi.fn(async (_url, opts) => {
      sentBody = JSON.parse(opts.body)
      return {
        ok: true,
        json: async () => ({
          data: {
            wagers: [
              { id: '7', status: 'active', resolutionType: 2, creator: USER, opponent: OPP, token: '0xtok', creatorStake: '100', opponentStake: '150', winner: null, createdAt: '1700000000', resolvedAt: null, metadataUri: 'ipfs://cid7', metadataHash: '0xhash' },
            ],
          },
        }),
      }
    }))

    const mod = await import('../data/wagers/SubgraphSource')
    const res = await mod.listPage({ userAddress: USER, pageSize: 10 })

    // Query targets v2 fields and ownership by creator OR opponent.
    expect(sentBody.query).toMatch(/creatorStake/)
    expect(sentBody.query).toMatch(/opponent/)
    expect(sentBody.query).not.toMatch(/stakePerParticipant|participants_contains/)

    expect(res.source).toBe('subgraph')
    const w = res.items[0]
    expect(w.id).toBe('7')
    expect(w.marketType).toBe('oneVsOne')
    expect(w.participants).toEqual([USER.toLowerCase(), OPP.toLowerCase()])
    expect(w.stakeTokenAddress).toBe('0xtok')
    expect(w.stakeAmount).toBe('100')
    expect(w.opponentStake).toBe('150')
    expect(w.needsRehydration).toBe(true) // R5: chain fills timing + description
  })

  it('falls back to RegistrySource (RPC) when the subgraph returns a GraphQL field error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ errors: [{ message: "Type `Wager` has no field `marketType`" }] }),
    })))

    const mod = await import('../data/wagers/SubgraphSource')
    const res = await mod.listPage({ userAddress: USER, pageSize: 10 })
    expect(res.source).toBe('subgraph-fallback')
  })
})
