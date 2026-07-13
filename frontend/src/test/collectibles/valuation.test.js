/**
 * Collectibles valuation math (spec 055 US3 / FR-006) — floor-price estimates with the
 * honest-state rules: unpriced never silently valued, bounded scans say "partial".
 */
import { describe, it, expect } from 'vitest'
import {
  computeCollectiblesValuation,
  collectionSlugsForValuation,
  underlyingCurrency,
  MAX_VALUATION_COLLECTIONS,
} from '../../lib/collectibles/valuation'

const item = (slug, quantity = 1) => ({ collectionSlug: slug, quantity })
const stats = (amount, currency, stale = false) => ({ floorPrice: amount == null ? null : { amount, currency }, stale })

describe('underlyingCurrency', () => {
  it('maps wrapped floor currencies to the symbols the price map quotes', () => {
    expect(underlyingCurrency('WETH')).toBe('ETH')
    expect(underlyingCurrency('MATIC')).toBe('POL')
    expect(underlyingCurrency('eth')).toBe('ETH')
    expect(underlyingCurrency('USDC')).toBe('USDC')
  })
})

describe('collectionSlugsForValuation', () => {
  it('dedupes slugs and reports truncation past the scan bound', () => {
    const many = Array.from({ length: MAX_VALUATION_COLLECTIONS + 3 }, (_, i) => item(`c-${i}`))
    const { slugs, truncatedCollections } = collectionSlugsForValuation([...many, item('c-0')])
    expect(slugs).toHaveLength(MAX_VALUATION_COLLECTIONS)
    expect(truncatedCollections).toBe(true)
    expect(collectionSlugsForValuation([item('a'), item('a')]).slugs).toEqual(['a'])
  })
})

describe('computeCollectiblesValuation', () => {
  const usdFor = (symbol) => ({ ETH: 4000, POL: 0.5 })[symbol] ?? null

  it('sums floor × quantity over priced collections only', () => {
    const items = [item('cats'), item('dogs', 3), item('mystery')]
    const statsBySlug = new Map([
      ['cats', stats('0.5', 'ETH')], // 0.5 × 4000 = 2000
      ['dogs', stats('100', 'MATIC')], // 100 × 0.5 × 3 = 150
      ['mystery', stats(null, null)], // no floor -> unpriced
    ])
    const v = computeCollectiblesValuation(items, statsBySlug, usdFor)
    expect(v.estimatedUsd).toBeCloseTo(2150)
    expect(v.pricedItems).toBe(4)
    expect(v.unpricedItems).toBe(1)
    expect(v.truncated).toBe(false)
  })

  it('counts items as unpriced when the floor currency has no USD price (never silently valued)', () => {
    const v = computeCollectiblesValuation([item('weird')], new Map([['weird', stats('10', 'DOGE')]]), usdFor)
    expect(v.estimatedUsd).toBeNull()
    expect(v.unpricedItems).toBe(1)
  })

  it('returns a null estimate (not zero) when nothing is priced', () => {
    const v = computeCollectiblesValuation([item('a')], new Map(), usdFor)
    expect(v.estimatedUsd).toBeNull()
    expect(v.pricedItems).toBe(0)
  })

  it('propagates truncation and staleness so the label can disclose them', () => {
    const v = computeCollectiblesValuation(
      [item('cats')],
      new Map([['cats', stats('1', 'ETH', true)]]),
      usdFor,
      { hasMoreItems: true }
    )
    expect(v.truncated).toBe(true)
    expect(v.stale).toBe(true)
  })
})
