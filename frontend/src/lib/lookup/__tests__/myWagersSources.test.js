import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  fetchCreatedPools,
  fetchJoinedPools,
  fetchDeviceChallenges,
  loadMyWagersSources,
  recordJoinedPool,
  readJoinedPoolAddresses,
  mapPool,
} from '../myWagersSources.js'

const ACCOUNT = '0xAbc0000000000000000000000000000000000001'
const url = () => 'https://subgraph.example/graph'
const rawPool = (over = {}) => ({
  id: '0xpool1', poolId: '3', creator: ACCOUNT.toLowerCase(), token: '0xusdc',
  buyIn: '10', maxMembers: '10', thresholdBips: '6000', joinDeadline: '0',
  state: '0', memberCount: '2', createdAt: '100', ...over,
})

describe('mapPool', () => {
  it('maps raw subgraph fields to the aggregation shape with a state label', () => {
    expect(mapPool(rawPool({ state: '2' }))).toMatchObject({
      address: '0xpool1', poolId: 3, state: 2, stateLabel: 'Resolved', memberCount: 2, maxMembers: 10,
    })
  })
})

describe('fetchCreatedPools', () => {
  it('queries the subgraph by creator and maps results', async () => {
    const postGraphQL = vi.fn().mockResolvedValue({ pools: [rawPool(), rawPool({ id: '0xpool2', state: '1' })] })
    const pools = await fetchCreatedPools({ chainId: 137, account: ACCOUNT, postGraphQL, resolveUrl: url })
    expect(postGraphQL).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('MyCreatedPools'), { owner: ACCOUNT.toLowerCase(), first: 50 })
    expect(pools.map((p) => p.address)).toEqual(['0xpool1', '0xpool2'])
    expect(pools[1].stateLabel).toBe('Joining closed')
  })

  it('returns [] with no account or no configured endpoint (network scoping)', async () => {
    const postGraphQL = vi.fn()
    expect(await fetchCreatedPools({ chainId: 137, account: null, postGraphQL, resolveUrl: url })).toEqual([])
    expect(await fetchCreatedPools({ chainId: 999, account: ACCOUNT, postGraphQL, resolveUrl: () => '' })).toEqual([])
    expect(postGraphQL).not.toHaveBeenCalled()
  })
})

describe('joined-pool device record + fetchJoinedPools', () => {
  beforeEach(() => { localStorage.clear() })

  it('records joins idempotently, scoped per account', () => {
    recordJoinedPool(ACCOUNT, '0xPoolA')
    recordJoinedPool(ACCOUNT, '0xPoolA') // dup
    recordJoinedPool(ACCOUNT, '0xPoolB')
    expect(readJoinedPoolAddresses(ACCOUNT)).toEqual(['0xpoola', '0xpoolb'])
    expect(readJoinedPoolAddresses('0xother')).toEqual([])
  })

  it('fetches joined pools by their recorded ids', async () => {
    recordJoinedPool(ACCOUNT, '0xpool1')
    const postGraphQL = vi.fn().mockResolvedValue({ pools: [rawPool()] })
    const pools = await fetchJoinedPools({ chainId: 137, account: ACCOUNT, postGraphQL, resolveUrl: url })
    expect(postGraphQL).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('PoolsById'), { ids: ['0xpool1'] })
    expect(pools[0].address).toBe('0xpool1')
  })

  it('returns [] when nothing was joined on this device', async () => {
    const postGraphQL = vi.fn()
    expect(await fetchJoinedPools({ chainId: 137, account: ACCOUNT, postGraphQL, resolveUrl: url })).toEqual([])
    expect(postGraphQL).not.toHaveBeenCalled()
  })
})

describe('fetchDeviceChallenges', () => {
  it('returns the code vault entries, or [] on error/absent reader', async () => {
    expect(await fetchDeviceChallenges(vi.fn().mockResolvedValue([{ code: 'a b c d' }]))).toEqual([{ code: 'a b c d' }])
    expect(await fetchDeviceChallenges(vi.fn().mockRejectedValue(new Error('locked')))).toEqual([])
    expect(await fetchDeviceChallenges(undefined)).toEqual([])
  })
})

describe('loadMyWagersSources', () => {
  beforeEach(() => { localStorage.clear() })

  it('composes pools + device challenges, degrading a failing source to []', async () => {
    recordJoinedPool(ACCOUNT, '0xpool1')
    const postGraphQL = vi.fn()
      .mockResolvedValueOnce({ pools: [rawPool()] })          // createdPools
      .mockRejectedValueOnce(new Error('joined query down'))  // joinedPools → []
    const recoverCodes = vi.fn().mockResolvedValue([{ code: 'a b c d', description: 'draft' }])
    const out = await loadMyWagersSources({ chainId: 137, account: ACCOUNT, recoverCodes, postGraphQL, resolveUrl: url })
    expect(out.createdPools).toHaveLength(1)
    expect(out.joinedPools).toEqual([])
    expect(out.deviceChallenges).toHaveLength(1)
  })
})
