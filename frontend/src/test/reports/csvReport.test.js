import { describe, it, expect } from 'vitest'
import { render, fileName, REPORT_COLUMNS } from '../../data/reports/csvReport'
import { buildReport } from '../../data/reports/reportBuilder'
import { resolveCustomPeriod } from '../../utils/reportPeriods'
import { makeFixtureDataSource, USER, REGISTRY, CHAIN_ID } from '../fixtures/wagers'

const networkMeta = {
  name: 'Polygon', isTestnet: false,
  nativeCurrency: { symbol: 'MATIC', decimals: 18 }, wagerRegistry: REGISTRY,
}
const tokenResolver = async () => ({ ticker: 'USDC', decimals: 6, address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' })

async function fullYearReport() {
  return buildReport({
    account: USER, chainId: CHAIN_ID,
    period: resolveCustomPeriod(Date.UTC(2026, 0, 1), Date.UTC(2026, 11, 31, 23, 59, 59, 999)),
    dataSource: makeFixtureDataSource(), networkMeta, tokenResolver, generatedAt: Date.UTC(2026, 5, 18),
  })
}

describe('csvReport (FR-006/FR-007/FR-008)', () => {
  it('renders all 11 columns and one row per line item', async () => {
    const csv = render(await fullYearReport())
    for (const col of REPORT_COLUMNS) expect(csv).toContain(col)
    // 5 line items → all 5 wager-derived tx hashes present, untruncated
    for (const h of ['0xa1', '0xa3', '0xb2', '0xc1', '0xc2']) expect(csv).toContain(h)
  })

  it('includes metadata + disclaimer in the preamble', async () => {
    const csv = render(await fullYearReport())
    expect(csv).toContain('Account')
    expect(csv).toContain(USER)
    expect(csv).toContain('not tax advice')
  })

  it('flags fees that were not paid by the user rather than leaving them blank', async () => {
    const csv = render(await fullYearReport())
    expect(csv).toMatch(/Not sent by you/i)
  })

  it('builds a period-stamped file name', async () => {
    const name = fileName(await fullYearReport())
    expect(name).toBe('wager-report_Polygon_2026-01-01_2026-12-31.csv')
  })
})
