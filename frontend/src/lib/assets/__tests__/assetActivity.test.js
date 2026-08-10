import { describe, it, expect } from 'vitest'
import {
  ASSET_ACTIVITIES,
  allowedKindsForActivity,
  filterAssetsForActivity,
  defaultAssetKey,
} from '../assetActivity'

const opt = (over = {}) => ({
  key: `${over.chainId ?? 137}:${over.address ? over.address.toLowerCase() : over.kind ?? 'native'}`,
  chainId: 137,
  kind: 'erc20',
  address: null,
  symbol: 'TKN',
  ...over,
})

// A representative cross-network list: connected(137) native + stablecoin + a
// token, an off-chain token (1), and Bitcoin.
const USDC = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'
const WBTC = '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6'
function sampleOptions() {
  return [
    opt({ chainId: 137, kind: 'native', address: null, symbol: 'MATIC', key: '137:native' }),
    opt({ chainId: 137, kind: 'erc20', address: USDC, symbol: 'USDC', key: `137:${USDC.toLowerCase()}` }),
    opt({ chainId: 137, kind: 'erc20', address: WBTC, symbol: 'WBTC', key: `137:${WBTC.toLowerCase()}` }),
    opt({ chainId: 1, kind: 'erc20', address: WBTC, symbol: 'WBTC', key: `1:${WBTC.toLowerCase()}` }),
    opt({ chainId: 'bitcoin', kind: 'btc-native', address: null, symbol: 'BTC', key: 'bitcoin:native' }),
  ]
}

describe('allowedKindsForActivity', () => {
  it('pay/request/transfer allow every kind including btc-native', () => {
    for (const a of [ASSET_ACTIVITIES.PAY, ASSET_ACTIVITIES.REQUEST, ASSET_ACTIVITIES.TRANSFER]) {
      const kinds = allowedKindsForActivity(a)
      expect(kinds).toContain('native')
      expect(kinds).toContain('erc20')
      expect(kinds).toContain('btc-native')
    }
  })

  it('wager allows only erc20', () => {
    expect(allowedKindsForActivity(ASSET_ACTIVITIES.WAGER)).toEqual(['erc20'])
  })

  it('defaults to all kinds for an unknown activity (never silently emptied)', () => {
    expect(allowedKindsForActivity('mystery')).toContain('btc-native')
  })
})

describe('filterAssetsForActivity', () => {
  it('keeps Bitcoin + native for pay/request', () => {
    const kept = filterAssetsForActivity(ASSET_ACTIVITIES.PAY, sampleOptions())
    expect(kept.some((o) => o.kind === 'btc-native')).toBe(true)
    expect(kept.some((o) => o.kind === 'native')).toBe(true)
    expect(kept).toHaveLength(5)
  })

  it('drops native + Bitcoin for wager, leaving ERC-20s only', () => {
    const kept = filterAssetsForActivity(ASSET_ACTIVITIES.WAGER, sampleOptions())
    expect(kept.every((o) => o.kind === 'erc20')).toBe(true)
    expect(kept.some((o) => o.kind === 'native')).toBe(false)
    expect(kept.some((o) => o.kind === 'btc-native')).toBe(false)
    expect(kept).toHaveLength(3)
  })

  it('tolerates empty / nullish input', () => {
    expect(filterAssetsForActivity(ASSET_ACTIVITIES.PAY, [])).toEqual([])
    expect(filterAssetsForActivity(ASSET_ACTIVITIES.PAY, undefined)).toEqual([])
  })
})

describe('defaultAssetKey', () => {
  it('prefers the connected network stablecoin', () => {
    const key = defaultAssetKey(ASSET_ACTIVITIES.PAY, sampleOptions(), {
      connectedChainId: 137,
      stableAddress: USDC,
    })
    expect(key).toBe(`137:${USDC.toLowerCase()}`)
  })

  it('falls back to connected native when no stablecoin matches', () => {
    const opts = sampleOptions().filter((o) => o.symbol !== 'USDC')
    const key = defaultAssetKey(ASSET_ACTIVITIES.PAY, opts, { connectedChainId: 137, stableAddress: USDC })
    expect(key).toBe('137:native')
  })

  it('falls back to the first option when neither stablecoin nor native present', () => {
    const opts = [opt({ chainId: 1, kind: 'erc20', address: WBTC, key: `1:${WBTC.toLowerCase()}` })]
    const key = defaultAssetKey(ASSET_ACTIVITIES.PAY, opts, { connectedChainId: 137, stableAddress: USDC })
    expect(key).toBe(`1:${WBTC.toLowerCase()}`)
  })

  it('wager defaults to the connected stablecoin (USDC unchanged)', () => {
    const opts = filterAssetsForActivity(ASSET_ACTIVITIES.WAGER, sampleOptions())
    const key = defaultAssetKey(ASSET_ACTIVITIES.WAGER, opts, { connectedChainId: 137, stableAddress: USDC })
    expect(key).toBe(`137:${USDC.toLowerCase()}`)
  })

  it('returns null for an empty list', () => {
    expect(defaultAssetKey(ASSET_ACTIVITIES.PAY, [], { connectedChainId: 137 })).toBeNull()
  })
})
