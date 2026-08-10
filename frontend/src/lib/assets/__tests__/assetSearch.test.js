import { describe, it, expect } from 'vitest'
import { matchesAssetQuery, filterAssetsByQuery } from '../assetSearch'

// The shared asset-search rule: match ONLY the fields a member can see on an
// option (symbol, asset name, network name). Both the Universal Asset Selector
// and the Trade ticket's pair pickers narrow through this, so a change here is a
// change to every selector at once.

const OPTIONS = [
  { key: '137:wmatic', symbol: 'WMATIC', name: 'Wrapped MATIC', networkName: 'Polygon', address: '0xAAA' },
  { key: '8453:weth', symbol: 'WETH', name: 'Wrapped Ether', networkName: 'Base', address: '0xBBB' },
  { key: '61:usc', symbol: 'USC', name: 'Classic USD', networkName: 'Ethereum Classic', address: '0xCCC' },
]

describe('matchesAssetQuery', () => {
  it('matches everything for an empty or blank query', () => {
    for (const query of ['', '   ', null, undefined]) {
      expect(OPTIONS.every((o) => matchesAssetQuery(o, query))).toBe(true)
    }
  })

  it('matches on symbol, name, and network name, case-insensitively', () => {
    expect(matchesAssetQuery(OPTIONS[0], 'wmatic')).toBe(true)
    expect(matchesAssetQuery(OPTIONS[0], 'WRAPPED')).toBe(true)
    expect(matchesAssetQuery(OPTIONS[1], 'base')).toBe(true)
    expect(matchesAssetQuery(OPTIONS[2], 'classic')).toBe(true)
  })

  it('matches substrings and ignores surrounding whitespace', () => {
    expect(matchesAssetQuery(OPTIONS[1], '  eth  ')).toBe(true)
    expect(matchesAssetQuery(OPTIONS[1], 'wrapped eth')).toBe(true)
  })

  it('never matches on a field the member cannot see', () => {
    // Address: typing part of one must not silently narrow the list.
    expect(matchesAssetQuery(OPTIONS[0], '0xaaa')).toBe(false)
    expect(matchesAssetQuery({ symbol: 'X', categoryId: 'digital-commodities' }, 'commodities')).toBe(false)
  })

  it('tolerates missing fields instead of throwing', () => {
    expect(matchesAssetQuery({}, 'usdc')).toBe(false)
    expect(matchesAssetQuery(null, 'usdc')).toBe(false)
    expect(matchesAssetQuery({ symbol: 42 }, '42')).toBe(false) // non-string fields don't match
  })
})

describe('filterAssetsByQuery', () => {
  it('narrows the list while preserving the caller’s ordering', () => {
    expect(filterAssetsByQuery(OPTIONS, 'wrapped').map((o) => o.key)).toEqual([
      '137:wmatic',
      '8453:weth',
    ])
  })

  it('returns an empty list rather than everything when nothing matches', () => {
    expect(filterAssetsByQuery(OPTIONS, 'zzz')).toEqual([])
    expect(filterAssetsByQuery(undefined, 'zzz')).toEqual([])
  })
})
