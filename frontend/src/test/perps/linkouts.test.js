/** Venue link-outs (spec 082, FR-011) — attribution attaches when configured, never blocks when not. */
import { describe, it, expect } from 'vitest'
import { tradeLinkFor, gmxTradeUrl, gainsTradeUrl, hyperliquidTradeUrl } from '../../lib/perps/linkouts'

const ATTRIBUTION = {
  gains: { referrer: '0x2222222222222222222222222222222222222222' },
  gmx: { refCode: 'fairwins' },
  hyperliquid: { builderAddress: '0x3333333333333333333333333333333333333333' },
}

describe('perps linkouts', () => {
  it('gmx links carry the referral code (and the market)', () => {
    const url = gmxTradeUrl({ base: 'BTC' }, ATTRIBUTION.gmx)
    expect(url).toContain('app.gmx.io')
    expect(url).toContain('ref=fairwins')
    expect(url).toContain('market=BTC%2FUSD')
  })

  it('gains links carry the referrer address', () => {
    const url = gainsTradeUrl({ base: 'ETH' }, ATTRIBUTION.gains)
    expect(url).toContain('gains.trade')
    expect(url).toContain('ref=0x2222222222222222222222222222222222222222')
  })

  it('hyperliquid links target the asset', () => {
    const url = hyperliquidTradeUrl({ base: 'SOL' }, ATTRIBUTION.hyperliquid)
    expect(url).toContain('app.hyperliquid.xyz')
    expect(url).toContain('SOL')
  })

  it('missing attribution falls back to the plain venue link — never blocked', () => {
    expect(gmxTradeUrl({ base: 'BTC' }, {})).not.toContain('ref=')
    expect(gainsTradeUrl({ base: 'BTC' }, {})).toBe('https://gains.trade/trading')
    expect(hyperliquidTradeUrl({ base: 'BTC' }, {})).toBe('https://app.hyperliquid.xyz/trade/BTC')
  })

  it('tradeLinkFor dispatches by venue and returns null for unknown venues', () => {
    expect(tradeLinkFor({ venue: 'gmx', base: 'BTC' }, ATTRIBUTION)).toContain('gmx.io')
    expect(tradeLinkFor({ venue: 'gains', base: 'BTC' }, ATTRIBUTION)).toContain('gains.trade')
    expect(tradeLinkFor({ venue: 'hyperliquid', base: 'BTC' }, ATTRIBUTION)).toContain('hyperliquid.xyz')
    expect(tradeLinkFor({ venue: 'unknown' }, ATTRIBUTION)).toBeNull()
    expect(tradeLinkFor(null, ATTRIBUTION)).toBeNull()
  })

  it('tradeLinkFor is total with no attribution at all', () => {
    expect(tradeLinkFor({ venue: 'gmx', base: 'BTC' })).toContain('gmx.io')
  })
})
