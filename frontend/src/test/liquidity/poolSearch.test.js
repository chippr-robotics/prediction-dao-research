/**
 * Narrowing the Supply pool list (spec 067, FR-015/FR-024).
 *
 * The rule these hold in place is the one that is easy to break later: the search
 * narrows by what a pool IS, never by whether it is taking deposits. A "hide the
 * closed ones" behaviour would hide a member's own exit, so the closed states are
 * asserted to survive every filter here.
 */
import { describe, it, expect } from 'vitest'
import {
  POOL_KIND_FILTER_ALL,
  filterPools,
  poolKindsPresent,
  poolMatchesQuery,
  poolSearchTerms,
  poolSearchText,
} from '../../lib/liquidity/poolSearch'
import { LIQUIDITY_POOL_KIND } from '../../lib/liquidity/liquidityCopy'
import { POOL_KIND } from '../../lib/liquidity/liquidityRouter'

const USDC = { address: '0xc1', symbol: 'USDC', decimals: 6 }
const WETH = { address: '0xe1', symbol: 'WETH', decimals: 18 }
const DAI = { address: '0xda', symbol: 'DAI', decimals: 18 }

const tradingPolygon = {
  key: '137:a',
  kind: POOL_KIND.TRADING_LP,
  protocol: 'Uniswap',
  networkName: 'Polygon',
  assets: [USDC, WETH],
  available: true,
}

const tradingBase = {
  key: '8453:b',
  kind: POOL_KIND.TRADING_LP,
  protocol: 'Uniswap',
  networkName: 'Base',
  assets: [USDC, DAI],
  available: true,
}

/** Closed to new deposits on purpose — it must survive every filter below. */
const bridgeEthereum = {
  key: '1:c',
  kind: POOL_KIND.BRIDGE_LP,
  protocol: 'Across',
  networkName: 'Ethereum',
  assets: [USDC],
  available: false,
  unavailableReason: 'retired',
}

const POOLS = [tradingPolygon, tradingBase, bridgeEthereum]
const keys = (list) => list.map((p) => p.key)

describe('poolSearchText — what a member can type', () => {
  it('covers the words the row itself shows: assets, pair, protocol, network, kind', () => {
    const text = poolSearchText(tradingPolygon)
    expect(text).toContain('usdc')
    expect(text).toContain('weth')
    expect(text).toContain('usdc / weth')
    expect(text).toContain('uniswap')
    expect(text).toContain('polygon')
    expect(text).toContain('trading liquidity')
  })

  it('never includes a pool’s STATE, so no query can filter by availability (FR-024)', () => {
    const text = poolSearchText(bridgeEthereum)
    expect(text).not.toContain('closed')
    expect(text).not.toContain('retired')
  })

  it('survives a pool whose token metadata could not be read', () => {
    expect(() => poolSearchText({ kind: POOL_KIND.TRADING_LP, assets: [null, {}] })).not.toThrow()
    expect(poolSearchText({})).toBe('')
  })
})

describe('poolSearchTerms / poolMatchesQuery', () => {
  it('treats an empty query as no narrowing at all', () => {
    expect(poolSearchTerms('   ')).toEqual([])
    expect(poolMatchesQuery(tradingPolygon, '')).toBe(true)
  })

  it('requires EVERY term to match, so two words narrow instead of widening', () => {
    expect(poolMatchesQuery(tradingPolygon, 'usdc polygon')).toBe(true)
    // Both halves exist in the catalog, but not in this pool — an OR would say true.
    expect(poolMatchesQuery(tradingPolygon, 'usdc ethereum')).toBe(false)
  })

  it('is case-insensitive and matches partial words', () => {
    expect(poolMatchesQuery(tradingBase, 'BAS')).toBe(true)
    expect(poolMatchesQuery(tradingBase, 'uni')).toBe(true)
  })
})

describe('filterPools', () => {
  it('returns everything when nothing is narrowing', () => {
    expect(keys(filterPools(POOLS))).toEqual(keys(POOLS))
    expect(keys(filterPools(POOLS, { query: '', kind: POOL_KIND_FILTER_ALL }))).toEqual(keys(POOLS))
  })

  it('finds a pool by network and by asset', () => {
    expect(keys(filterPools(POOLS, { query: 'base' }))).toEqual(['8453:b'])
    expect(keys(filterPools(POOLS, { query: 'dai' }))).toEqual(['8453:b'])
  })

  it('filters by kind, and the words "trading"/"bridge" work typed too', () => {
    expect(keys(filterPools(POOLS, { kind: LIQUIDITY_POOL_KIND.BRIDGE_LP }))).toEqual(['1:c'])
    expect(keys(filterPools(POOLS, { query: 'bridge' }))).toEqual(['1:c'])
    expect(keys(filterPools(POOLS, { kind: LIQUIDITY_POOL_KIND.TRADING_LP }))).toEqual([
      '137:a',
      '8453:b',
    ])
  })

  it('composes the deep-link token filter, the kind chips, and the query', () => {
    const out = filterPools(POOLS, {
      tokenSymbol: 'USDC',
      kind: LIQUIDITY_POOL_KIND.TRADING_LP,
      query: 'polygon',
    })
    expect(keys(out)).toEqual(['137:a'])
  })

  it('keeps a pool CLOSED to new deposits in every result it matches (FR-024)', () => {
    // The member's exit lives inside this row. No filter may drop it while it
    // matches what was asked for.
    expect(keys(filterPools(POOLS, { query: 'usdc' }))).toContain('1:c')
    expect(keys(filterPools(POOLS, { tokenSymbol: 'USDC' }))).toContain('1:c')
    expect(keys(filterPools(POOLS, { kind: LIQUIDITY_POOL_KIND.BRIDGE_LP }))).toContain('1:c')
  })

  it('preserves the catalog’s order and returns the same objects', () => {
    const out = filterPools(POOLS, { query: 'usdc' })
    expect(out[0]).toBe(tradingPolygon)
    expect(keys(out)).toEqual(keys(POOLS))
  })

  it('answers a miss with an empty list rather than falling back to everything', () => {
    expect(filterPools(POOLS, { query: 'solana' })).toEqual([])
    expect(filterPools(null, { query: 'usdc' })).toEqual([])
  })
})

describe('poolKindsPresent', () => {
  it('reports the kinds actually curated, so a one-kind list gets no chip row', () => {
    expect(poolKindsPresent(POOLS).size).toBe(2)
    expect(poolKindsPresent([tradingPolygon, tradingBase]).size).toBe(1)
    expect(poolKindsPresent([]).size).toBe(0)
  })
})
