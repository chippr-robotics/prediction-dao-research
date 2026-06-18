/**
 * Spec 017 / US3: the report is built from the subgraph's WagerTransfer rows
 * with ZERO open-ended log scans and at most one transaction-receipt call per
 * transfer (for the gas fee). Falls back to the bounded enumerate + scan path
 * only when the index has no transfer data (FR-014, FR-016, SC-004).
 */
import { describe, it, expect, vi } from 'vitest'
import { buildReport } from '../../data/reports/reportBuilder'
import { resolveCustomPeriod } from '../../utils/reportPeriods'
import { USER, REGISTRY, TOKEN, CHAIN_ID, BLOCKS } from '../fixtures/wagers'

const networkMeta = {
  name: 'Polygon',
  isTestnet: false,
  nativeCurrency: { symbol: 'MATIC', decimals: 18 },
  wagerRegistry: REGISTRY,
}
const tokenResolver = async () => ({ ticker: 'USDC', decimals: 6, address: TOKEN })
const FULL_2026 = resolveCustomPeriod(Date.UTC(2026, 0, 1), Date.UTC(2026, 11, 31, 23, 59, 59, 999))

// The USER's five transfers as the subgraph WagerTransfer query would return
// them (already party-filtered, time-ordered, timestamp in ms).
const TRANSFERS = [
  { wagerId: '1', direction: 'deposit', tokenAddress: TOKEN, amountRaw: '100000000', fromAddress: USER, toAddress: REGISTRY, txHash: '0xa1', blockNumber: 100, timestamp: BLOCKS[100] * 1000 },
  { wagerId: '2', direction: 'deposit', tokenAddress: TOKEN, amountRaw: '50000000', fromAddress: USER, toAddress: REGISTRY, txHash: '0xb2', blockNumber: 130, timestamp: BLOCKS[130] * 1000 },
  { wagerId: '3', direction: 'deposit', tokenAddress: TOKEN, amountRaw: '30000000', fromAddress: USER, toAddress: REGISTRY, txHash: '0xc1', blockNumber: 140, timestamp: BLOCKS[140] * 1000 },
  { wagerId: '1', direction: 'payout', tokenAddress: TOKEN, amountRaw: '200000000', fromAddress: REGISTRY, toAddress: USER, txHash: '0xa3', blockNumber: 200, timestamp: BLOCKS[200] * 1000 },
  { wagerId: '3', direction: 'refund', tokenAddress: TOKEN, amountRaw: '30000000', fromAddress: REGISTRY, toAddress: USER, txHash: '0xc2', blockNumber: 150, timestamp: BLOCKS[150] * 1000 },
]

function subgraphDataSource() {
  return {
    listTransfers: vi.fn(async () => TRANSFERS.map((t) => ({ ...t }))),
    // These MUST NOT be invoked on the subgraph path.
    enumerateWagers: vi.fn(async () => { throw new Error('enumerateWagers should not be called') }),
    getWagerEvents: vi.fn(async () => { throw new Error('getWagerEvents (log scan) should not be called') }),
    getBlock: vi.fn(async () => { throw new Error('getBlock should not be called when the index supplies timestamps') }),
    getTransactionReceipt: vi.fn(async (h) => ({ from: USER, gasUsed: 100000n, effectiveGasPrice: 30000000000n, blockNumber: 1, _h: h })),
  }
}

describe('buildReport — subgraph WagerTransfer path (US3, SC-004)', () => {
  it('builds from listTransfers with ZERO log scans and ≤1 receipt per transfer', async () => {
    const ds = subgraphDataSource()
    const report = await buildReport({
      account: USER, chainId: CHAIN_ID, period: FULL_2026,
      dataSource: ds, networkMeta, tokenResolver, generatedAt: Date.UTC(2026, 5, 17),
    })

    expect(ds.listTransfers).toHaveBeenCalledTimes(1)
    // No open-ended log scan, ever (FR-014).
    expect(ds.getWagerEvents).not.toHaveBeenCalled()
    // Timestamp comes from the index — no block lookups.
    expect(ds.getBlock).not.toHaveBeenCalled()
    // At most one receipt per transfer (5 distinct txHashes → 5 calls).
    expect(ds.getTransactionReceipt).toHaveBeenCalledTimes(TRANSFERS.length)
    expect(ds.getTransactionReceipt.mock.calls.length).toBeLessThanOrEqual(TRANSFERS.length)

    expect(report.lineItems).toHaveLength(5)
    expect(report.lineItems.every((i) => i.txHash && i.timestamp && i.tokenTicker === 'USDC')).toBe(true)
    // USDC net = (payout 200 + refund 30) - (deposits 100+50+30) = 50
    expect(report.totals.byTicker.USDC.net).toBeCloseTo(50, 9)
  })

  it('falls back to the bounded enumerate+scan path when the index has no transfers (FR-016)', async () => {
    const ds = {
      listTransfers: vi.fn(async () => null), // no subgraph transfer data
      enumerateWagers: vi.fn(async () => []),
      getWagerEvents: vi.fn(async () => []),
      getBlock: vi.fn(async () => null),
      getTransactionReceipt: vi.fn(async () => null),
    }
    const report = await buildReport({
      account: USER, chainId: CHAIN_ID, period: FULL_2026,
      dataSource: ds, networkMeta, tokenResolver, generatedAt: Date.UTC(2026, 5, 17),
    })
    expect(ds.listTransfers).toHaveBeenCalledTimes(1)
    // Fallback path engaged: enumeration runs (the #703 bounded path).
    expect(ds.enumerateWagers).toHaveBeenCalledTimes(1)
    expect(report.lineItems).toHaveLength(0)
  })
})
