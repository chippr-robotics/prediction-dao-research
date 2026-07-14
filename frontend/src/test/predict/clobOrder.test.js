/**
 * clobOrder (spec 057) — the CLOB order builder + honest cost math. Verifies the ADDITIVE builder fee
 * is included in the total for takers (FR-011/FR-012), makers carry no fee, and the `builder` field
 * carries the configured code.
 */
import { describe, it, expect } from 'vitest'
import { buildOrder, computeCost, CLOB_ORDER_TYPES, polymarketExchange, ZERO_BYTES32 } from '../../lib/predict/clobOrder'

const BUILDER = '0x6e0316783960e149b53466f0f2c5fdbaf5ce11ba15669491de980f6dedc493a3'
const TOKEN = '71321045679252212594626385532706912750332728571942532289631379312455583992563'
const MAKER = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'
// Live platform fee 100 bps + FairWins 50 bps taker / 0 maker.
const FEE = { feeRateBps: 100, builderTakerFeeBps: 50, builderMakerFeeBps: 0 }

describe('computeCost', () => {
  it('includes the additive builder fee in a taker BUY total (shown == charged)', () => {
    // 100 shares @ 0.50 = 50 USDC notional. Platform 1% = 0.5, builder 0.5% = 0.25.
    const c = computeCost({ price: '0.5', size: '100', side: 'BUY', isMaker: false }, FEE)
    expect(c.notionalUnits).toBe(50_000000n)
    expect(c.platformFeeUnits).toBe(500000n) // 0.50 USDC
    expect(c.builderFeeUnits).toBe(250000n) // 0.25 USDC
    expect(c.totalCostUnits).toBe(50_750000n) // 50.75 USDC
    // Both fees appear as their own labelled lines; the builder fee is never hidden.
    const labels = c.feeLines.map((l) => l.label)
    expect(labels).toContain('FairWins builder fee')
    expect(labels).toContain('Polymarket fee')
    expect(c.feeLines.find((l) => l.label === 'FairWins builder fee').amount).toBe('0.25')
  })

  it('charges a taker SELL its fees against net proceeds', () => {
    const c = computeCost({ price: '0.5', size: '100', side: 'SELL', isMaker: false }, FEE)
    expect(c.netProceedsUnits).toBe(49_250000n) // 50 - 0.5 - 0.25
  })

  it('charges makers NO platform fee and NO builder fee', () => {
    const c = computeCost({ price: '0.5', size: '100', side: 'BUY', isMaker: true }, FEE)
    expect(c.platformFeeUnits).toBe(0n)
    expect(c.builderFeeUnits).toBe(0n)
    expect(c.totalCostUnits).toBe(50_000000n)
    expect(c.feeLines).toHaveLength(0) // no fee lines to show
  })
})

describe('buildOrder', () => {
  it('attaches the builder code and matches shown total to the order', () => {
    const built = buildOrder({ tokenId: TOKEN, side: 'BUY', price: '0.5', size: '100', isMaker: false }, FEE, BUILDER, {
      maker: MAKER,
      now: 1_700_000_000_000,
    })
    expect(built.message.builder).toBe(BUILDER)
    expect(built.message.maker).toBe(MAKER)
    expect(built.message.tokenId).toBe(TOKEN)
    expect(built.message.side).toBe(0) // BUY
    expect(built.totalCost).toBe('50.75')
    expect(built.domain).toMatchObject({ name: 'Polymarket CTF Exchange', version: '2', chainId: 137 })
    expect(built.types).toBe(CLOB_ORDER_TYPES)
    // BUY: maker gives USDC notional, takes shares.
    expect(built.message.makerAmount).toBe('50000000')
    expect(built.message.takerAmount).toBe('100000000')
  })

  it('defaults to the zero builder code when unattributed (never stranded)', () => {
    const built = buildOrder({ tokenId: TOKEN, side: 'BUY', price: '0.5', size: '10', isMaker: false }, FEE, null, { maker: MAKER })
    expect(built.message.builder).toBe(ZERO_BYTES32)
  })

  it('selects the neg-risk exchange when flagged', () => {
    expect(polymarketExchange(false)).toBe('0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E')
    expect(polymarketExchange(true)).toBe('0xC5d563A36AE78145C45a50134d48A1215220f80a')
    const built = buildOrder({ tokenId: TOKEN, side: 'BUY', price: '0.5', size: '10' }, FEE, BUILDER, { maker: MAKER, negRisk: true })
    expect(built.domain.verifyingContract).toBe('0xC5d563A36AE78145C45a50134d48A1215220f80a')
  })
})
