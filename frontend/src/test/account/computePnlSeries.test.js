import { describe, it, expect } from 'vitest'
import { computePnlSeries, DEFAULT_RANGE } from '../../lib/account/computePnlSeries'

const DAY = 24 * 60 * 60 * 1000
const NOW = 1_000_000 * DAY // fixed "now" in ms

const tx = (daysAgo, direction, usd) => ({
  timestamp: NOW - daysAgo * DAY,
  direction,
  usdValue: usd,
})

describe('computePnlSeries (spec 020 — US2)', () => {
  it('is empty for no transfers', () => {
    const s = computePnlSeries([], '30D', NOW)
    expect(s.isEmpty).toBe(true)
    expect(s.isLowData).toBe(true)
    expect(s.points).toHaveLength(0)
    expect(s.endValueUsd).toBe(0)
  })

  it('defaults to 30D for an invalid range', () => {
    const s = computePnlSeries([tx(1, 'deposit', 10)], 'bogus', NOW)
    expect(s.range).toBe(DEFAULT_RANGE)
  })

  it('accumulates +payout/+refund and -deposit', () => {
    const transfers = [tx(5, 'deposit', 100), tx(3, 'payout', 250)]
    const s = computePnlSeries(transfers, '30D', NOW)
    expect(s.points.map((p) => p.cumulativeUsd)).toEqual([-100, 150])
    expect(s.endValueUsd).toBe(150)
    expect(s.isLowData).toBe(false)
  })

  it('seeds a windowed range with the pre-range cumulative value', () => {
    // deposit 40d ago (outside 30D), payout 2d ago (inside)
    const transfers = [tx(40, 'deposit', 100), tx(2, 'payout', 250)]
    const s = computePnlSeries(transfers, '30D', NOW)
    // first in-range point should reflect the prior -100 plus +250 = 150
    expect(s.points[0].cumulativeUsd).toBe(150)
    expect(s.endValueUsd).toBe(150)
  })

  it('shows a flat seed line when all events precede the window', () => {
    const transfers = [tx(40, 'deposit', 100), tx(35, 'payout', 250)]
    const s = computePnlSeries(transfers, '7D', NOW)
    expect(s.isEmpty).toBe(false)
    expect(s.points).toHaveLength(1)
    expect(s.points[0].cumulativeUsd).toBe(150)
    expect(s.endValueUsd).toBe(150)
  })

  it('ALL end value equals net realized total', () => {
    const transfers = [tx(100, 'deposit', 100), tx(90, 'payout', 50), tx(10, 'deposit', 20)]
    const s = computePnlSeries(transfers, 'ALL', NOW)
    expect(s.endValueUsd).toBe(-70)
  })

  it('collapses dense histories to daily buckets', () => {
    // 400 transfers within range → must bucket below threshold
    const transfers = []
    for (let i = 0; i < 400; i++) transfers.push({ timestamp: NOW - i * (DAY / 20), direction: 'payout', usdValue: 1 })
    const s = computePnlSeries(transfers, 'ALL', NOW)
    expect(s.points.length).toBeLessThanOrEqual(40) // ~20 days of buckets
    expect(s.points.length).toBeGreaterThan(1)
  })
})
