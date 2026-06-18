import { describe, it, expect } from 'vitest'
import { render, fileName } from '../../data/reports/pdfReport'
import { buildReport } from '../../data/reports/reportBuilder'
import { resolveCustomPeriod } from '../../utils/reportPeriods'
import { makeFixtureDataSource, USER, REGISTRY, CHAIN_ID } from '../fixtures/wagers'

const networkMeta = {
  name: 'Polygon', isTestnet: false,
  nativeCurrency: { symbol: 'MATIC', decimals: 18 }, wagerRegistry: REGISTRY,
}
const tokenResolver = async () => ({ ticker: 'USDC', decimals: 6, address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' })

async function report(period) {
  return buildReport({
    account: USER, chainId: CHAIN_ID, period,
    dataSource: makeFixtureDataSource(), networkMeta, tokenResolver, generatedAt: Date.UTC(2026, 5, 18),
  })
}

describe('pdfReport (FR-007/FR-008)', () => {
  it('renders a non-empty PDF blob for a populated period', async () => {
    const r = await report(resolveCustomPeriod(Date.UTC(2026, 0, 1), Date.UTC(2026, 11, 31, 23, 59, 59, 999)))
    const blob = render(r)
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('application/pdf')
    expect(blob.size).toBeGreaterThan(500)
  })

  it('renders a valid PDF even for an empty period (no rows)', async () => {
    const r = await report(resolveCustomPeriod(Date.UTC(2025, 0, 1), Date.UTC(2025, 11, 31)))
    const blob = render(r)
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.size).toBeGreaterThan(0)
  })

  it('builds a period-stamped pdf file name', async () => {
    const r = await report(resolveCustomPeriod(Date.UTC(2026, 0, 1), Date.UTC(2026, 11, 31)))
    expect(fileName(r)).toBe('wager-report_Polygon_2026-01-01_2026-12-31.pdf')
  })
})
