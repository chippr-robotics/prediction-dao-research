import { describe, it, expect } from 'vitest'
import { buildReport } from '../../data/reports/reportBuilder'
import { resolvePreset, resolveCustomPeriod, PERIOD_KINDS } from '../../utils/reportPeriods'
import { makeFixtureDataSource, USER, REGISTRY, CHAIN_ID } from '../fixtures/wagers'

const networkMeta = {
  name: 'Polygon',
  isTestnet: false,
  nativeCurrency: { symbol: 'MATIC', decimals: 18 },
  wagerRegistry: REGISTRY,
  stablecoin: { address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', symbol: 'USDC', decimals: 6 },
}

// Token resolver injected so the test doesn't depend on global network config.
const tokenResolver = async () => ({ ticker: 'USDC', decimals: 6, address: networkMeta.stablecoin.address })

const NOW = Date.UTC(2026, 5, 17) // Jun 2026

function build(period) {
  return buildReport({
    account: USER,
    chainId: CHAIN_ID,
    period,
    dataSource: makeFixtureDataSource(),
    networkMeta,
    tokenResolver,
    generatedAt: NOW,
  })
}

describe('buildReport (orchestration, SC-002/SC-003/SC-004/SC-005)', () => {
  it('includes only in-period transfers and excludes out-of-period ones', async () => {
    // Last calendar year = 2025 → no fixture activity (all 2026).
    const empty = await build(resolvePreset(PERIOD_KINDS.LAST_CALENDAR_YEAR, NOW))
    expect(empty.lineItems).toHaveLength(0)
    expect(empty.totals.overall.count).toBe(0)

    // Jan 2026 only → deposits for wagers 1 (100) and 2 (50); NOT Feb payout or Mar refund.
    const jan = await build(resolveCustomPeriod(Date.UTC(2026, 0, 1), Date.UTC(2026, 0, 31, 23, 59, 59, 999)))
    expect(jan.lineItems.map((i) => i.wagerId).sort()).toEqual(['1', '2'])
    expect(jan.lineItems.every((i) => i.direction === 'deposit')).toBe(true)
  })

  it('produces full-year rows with all required fields populated (SC-003)', async () => {
    const r = await build(resolveCustomPeriod(Date.UTC(2026, 0, 1), Date.UTC(2026, 11, 31, 23, 59, 59, 999)))
    // wager1: deposit+payout, wager2: deposit, wager3: deposit+refund => 5 rows
    expect(r.lineItems).toHaveLength(5)
    for (const it of r.lineItems) {
      expect(it.timestamp).toBeTypeOf('number')
      expect(it.tokenTicker).toBe('USDC')
      expect(it.amountNumber).toBeGreaterThan(0)
      expect(it.usdValue).toBeGreaterThan(0)
      expect(it.costBasis).toBeGreaterThan(0)
      expect(it.txHash).toMatch(/^0x/)
      expect(it.fromAddress).toBeTruthy()
      expect(it.toAddress).toBeTruthy()
      // fee is either a number or explicitly flagged (never silently blank)
      expect(typeof it.feeNative === 'number' || typeof it.feeUnavailableReason === 'string').toBe(true)
    }
  })

  it('sorts line items by timestamp ascending', async () => {
    const r = await build(resolveCustomPeriod(Date.UTC(2026, 0, 1), Date.UTC(2026, 11, 31, 23, 59, 59, 999)))
    const ts = r.lineItems.map((i) => i.timestamp)
    expect(ts).toEqual([...ts].sort((a, b) => a - b))
  })

  it('totals reconcile exactly to the included line items (SC-004)', async () => {
    const r = await build(resolveCustomPeriod(Date.UTC(2026, 0, 1), Date.UTC(2026, 11, 31, 23, 59, 59, 999)))
    const sumUsd = r.lineItems.reduce((s, i) => s + i.usdValue, 0)
    const sumTickers = Object.values(r.totals.byTicker).reduce((s, t) => s + t.usdValue, 0)
    expect(r.totals.overall.usdValue).toBeCloseTo(sumUsd, 9)
    expect(sumTickers).toBeCloseTo(sumUsd, 9)
    // USDC net = (payout 200 + refund 30) - (deposits 100+50+30) = 50
    expect(r.totals.byTicker.USDC.net).toBeCloseTo(50, 9)
  })

  it('carries valuation note and not-tax-advice disclaimer (FR-009)', async () => {
    const r = await build(resolveCustomPeriod(Date.UTC(2026, 0, 1), Date.UTC(2026, 11, 31)))
    expect(r.valuationNote).toMatch(/\$1\.00/)
    expect(r.disclaimer).toMatch(/not tax advice/i)
  })
})
