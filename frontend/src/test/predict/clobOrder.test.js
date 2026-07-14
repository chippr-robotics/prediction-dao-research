/**
 * clobOrder cost math (spec 057) — the honest cost breakdown the confirm UI shows before signing. Verifies
 * the ADDITIVE builder fee is included in the total for takers (FR-011/FR-012) and makers carry no fee. The
 * order struct/signing is owned by @polymarket/clob-client (validated live), not here.
 */
import { describe, it, expect } from 'vitest'
import { computeCost } from '../../lib/predict/clobOrder'

// Live platform fee 100 bps + FairWins 50 bps taker / 0 maker.
const FEE = { feeRateBps: 100, builderTakerFeeBps: 50, builderMakerFeeBps: 0 }

describe('computeCost', () => {
  it('includes the exact builder fee in a taker BUY total (shown == charged)', () => {
    // 100 shares @ 0.50 = 50 USDC notional. Builder 0.5% = 0.25. Polymarket's own fee is separate.
    const c = computeCost({ price: '0.5', size: '100', side: 'BUY', isMaker: false }, FEE)
    expect(c.notionalUnits).toBe(50_000000n)
    expect(c.builderFeeUnits).toBe(250000n) // 0.25 USDC
    expect(c.totalCostUnits).toBe(50_250000n) // 50.25 USDC (notional + our builder fee)
    expect(c.platformFeeRateBps).toBe(100) // carried on the order, not fabricated as a dollar line
    // The builder fee is its own labelled line; we never fabricate a platform-fee dollar amount.
    const labels = c.feeLines.map((l) => l.label)
    expect(labels).toEqual(['FairWins builder fee'])
    expect(c.feeLines[0].amount).toBe('0.25')
  })

  it('charges a taker SELL the builder fee against net proceeds', () => {
    const c = computeCost({ price: '0.5', size: '100', side: 'SELL', isMaker: false }, FEE)
    expect(c.netProceedsUnits).toBe(49_750000n) // 50 - 0.25
  })

  it('charges makers NO builder fee (and no platform rate on the order)', () => {
    const c = computeCost({ price: '0.5', size: '100', side: 'BUY', isMaker: true }, FEE)
    expect(c.builderFeeUnits).toBe(0n)
    expect(c.platformFeeRateBps).toBe(0)
    expect(c.totalCostUnits).toBe(50_000000n)
    expect(c.feeLines).toHaveLength(0) // no fee lines to show
  })
})
