/**
 * Spec 051 T022 — reporting parity (US2, FR-014/FR-015, SC-002):
 * for the same (account, chainId, period), the report and the Account tab
 * consume the IDENTICAL ledger entry set, and totals agree. Also covers the
 * ledger-path line-item contract (all classes, failed flagged and excluded
 * from totals, unvalued flagged never zeroed).
 */
import { describe, it, expect } from 'vitest'
import { createLedgerRepository } from '../../data/ledger/ledgerRepository'
import { buildReport } from '../../data/reports/reportBuilder'
import { render as renderCsv } from '../../data/reports/csvReport'
import { resolveCustomPeriod } from '../../utils/reportPeriods'
import { wagerTransfersFromLedger } from '../../lib/account/ledgerAdapters'
import { computeSummary } from '../../lib/account/computeSummary'

const ACCOUNT = '0xabc0000000000000000000000000000000000001'
const CHAIN_ID = 137
const TX = (n) => '0x' + String(n).padStart(2, '0').repeat(32)
const T0 = Date.UTC(2026, 2, 1)

// One entry per class, plus a failed gasless transfer and an unvalued entry.
const FIXTURE_ENTRIES = [
  {
    entryId: `oc:137:wt:${TX(1)}-1-deposit`, chainId: CHAIN_ID, class: 'wager', kind: 'deposit',
    direction: 'out', status: 'settled', provenance: 'onchain', txHash: TX(1),
    tokenAddress: '0xusdc', amountRaw: '100000000', timestamp: T0, timestampProvenance: 'chain',
    refs: { wagerId: '1', dedupKey: 'wager:1:deposit' },
  },
  {
    entryId: `oc:137:wt:${TX(2)}-1-payout`, chainId: CHAIN_ID, class: 'wager', kind: 'payout',
    direction: 'in', status: 'settled', provenance: 'onchain', txHash: TX(2),
    tokenAddress: '0xusdc', amountRaw: '190000000', timestamp: T0 + 3600_000, timestampProvenance: 'chain',
    refs: { wagerId: '1', dedupKey: 'wager:1:payout' },
  },
  {
    entryId: 'cl:t-ok', chainId: CHAIN_ID, class: 'transfer', kind: 'send',
    direction: 'out', status: 'settled', provenance: 'client', txHash: TX(3),
    tokenAddress: '0xusdc', amount: 7.5, valueUsd: 7.5, valuationStatus: 'valued',
    timestamp: T0 + 2 * 3600_000, timestampProvenance: 'device', refs: { route: 'gasless' },
  },
  {
    entryId: 'cl:t-fail', chainId: CHAIN_ID, class: 'transfer', kind: 'send',
    direction: 'out', status: 'failed',
    failureReason: 'Smart Account does not have sufficient funds to execute the User Operation.',
    provenance: 'client', txHash: null, tokenAddress: '0xusdc', amount: 1,
    timestamp: T0 + 3 * 3600_000, timestampProvenance: 'device', refs: { route: 'gasless' },
  },
  {
    entryId: 'cl:earn-1', chainId: CHAIN_ID, class: 'earn', kind: 'vault_deposit',
    direction: 'out', status: 'settled', provenance: 'client', txHash: TX(4),
    tokenAddress: '0xusdc', amountRaw: '5000000', timestamp: T0 + 4 * 3600_000,
    timestampProvenance: 'device', refs: { vaultAddress: '0xvault' },
  },
  {
    entryId: `oc:137:${TX(5)}:voucher_purchase:9`, chainId: CHAIN_ID, class: 'membership',
    kind: 'voucher_purchase', direction: 'out', status: 'settled', provenance: 'onchain',
    txHash: TX(5), tokenAddress: null, amountRaw: null, valuationStatus: 'unvalued',
    timestamp: T0 + 5 * 3600_000, timestampProvenance: 'chain', refs: { voucherId: '9' },
  },
]

// Stablecoin fixture enrichment: USDC 6dp at par.
const enrich = async (entries) =>
  entries.map((e) => {
    const amount = e.amount ?? (e.amountRaw != null ? Number(e.amountRaw) / 1e6 : null)
    const valued = e.valuationStatus === 'unvalued' ? null : amount
    return {
      ...e,
      tokenSymbol: e.tokenAddress ? 'USDC' : 'MATIC',
      tokenDecimals: 6,
      amount,
      valueUsd: e.valueUsd ?? valued,
      valuationStatus: e.valuationStatus ?? (valued != null ? 'valued' : 'unvalued'),
    }
  })

function makeLedger() {
  return createLedgerRepository({
    sources: [{ class: 'wager', list: async () => FIXTURE_ENTRIES }],
    enrich,
  })
}

const PERIOD = resolveCustomPeriod(T0 - 1, T0 + 6 * 3600_000)
const NETWORK_META = { name: 'Polygon', isTestnet: false, nativeCurrency: { symbol: 'MATIC' } }

async function build() {
  return buildReport({
    account: ACCOUNT,
    chainId: CHAIN_ID,
    period: PERIOD,
    dataSource: { getTransactionReceipt: async () => null },
    networkMeta: NETWORK_META,
    ledger: makeLedger(),
    generatedAt: T0 + 7 * 3600_000,
  })
}

describe('report ↔ Account tab parity (spec 051 US2)', () => {
  it('the report line-item set is exactly the ledger entry set the Account tab renders', async () => {
    const ledger = makeLedger()
    const { entries } = await ledger.listEntries({
      account: ACCOUNT,
      chainId: CHAIN_ID,
      period: { fromMs: PERIOD.from, toMs: PERIOD.to },
    })
    const report = await build()
    expect(report.source).toBe('ledger')
    expect(new Set(report.lineItems.map((i) => i.entryId))).toEqual(
      new Set(entries.map((e) => e.entryId)),
    )
    expect(report.lineItems).toHaveLength(FIXTURE_ENTRIES.length)
  })

  it('report wager totals equal the dashboard summary computed from the same entries (SC-002)', async () => {
    const ledger = makeLedger()
    const { entries } = await ledger.listEntries({
      account: ACCOUNT,
      chainId: CHAIN_ID,
      period: { fromMs: PERIOD.from, toMs: PERIOD.to },
    })
    const report = await build()

    // Dashboard math over the same ledger (wager class, settled wager).
    const transfers = wagerTransfersFromLedger(entries)
    const summary = computeSummary({
      wagers: [{ id: '1', status: 'resolved', creator: ACCOUNT, winner: ACCOUNT }],
      transfers,
      address: ACCOUNT,
    })
    const usdc = report.totals.byTicker.USDC
    // deposits/payouts/refunds are the wager-kind columns; the report's wager
    // math must equal the dashboard's realized P&L over the same entries.
    expect(usdc.payouts).toBe(190)
    expect(usdc.deposits).toBe(100)
    expect(usdc.payouts - usdc.deposits).toBe(summary.netPnlUsd)
    // Every settled valued entry (wager + send + earn) contributes to USD volume.
    expect(usdc.usdValue).toBeCloseTo(100 + 190 + 7.5 + 5)
  })

  it('failed operations are listed but excluded from every total (FR-003/SC-006)', async () => {
    const report = await build()
    const failedRow = report.lineItems.find((i) => i.status === 'failed')
    expect(failedRow).toBeTruthy()
    expect(failedRow.failureReason).toMatch(/sufficient funds/)
    expect(report.totals.overall.failedCount).toBe(1)
    // Totals unchanged by the failed $1 send: settled USD volume only.
    expect(report.totals.byTicker.USDC.usdValue).toBeCloseTo(302.5)
    expect(report.totals.overall.usdValue).toBeCloseTo(302.5)
  })

  it('unvalued entries are flagged in the CSV, never zeroed or dropped (FR-016)', async () => {
    const report = await build()
    const csv = renderCsv(report)
    expect(csv).toContain('voucher_purchase')
    expect(csv).toContain('unvalued')
    expect(csv).toContain('Failed operations')
    // Every class made it into the export.
    for (const cls of ['wager', 'transfer', 'earn', 'membership']) expect(csv).toContain(cls)
  })

  it('collates settled activity by class for the multi-use ledger export', async () => {
    const report = await build()
    const byClass = report.totals.byClass
    // Every settled class is represented; the failed transfer is not counted.
    expect(byClass.wager.count).toBe(2)
    expect(byClass.transfer.count).toBe(1) // the failed send is excluded (FR-003)
    expect(byClass.earn.count).toBe(1)
    expect(byClass.membership.count).toBe(1)
    // Wager payout (190) is inbound; deposit (100) is outbound.
    expect(byClass.wager.inUsd).toBeCloseTo(190)
    expect(byClass.wager.outUsd).toBeCloseTo(100)
    // The CSV surfaces the collated breakdown.
    expect(renderCsv(report)).toContain('Totals by activity type')
  })

  it('entries outside the period are excluded from both surfaces identically', async () => {
    const ledger = makeLedger()
    const narrow = { fromMs: T0 + 90 * 60_000, toMs: T0 + 150 * 60_000 } // only the settled send
    const { entries } = await ledger.listEntries({ account: ACCOUNT, chainId: CHAIN_ID, period: narrow })
    const report = await buildReport({
      account: ACCOUNT,
      chainId: CHAIN_ID,
      period: { ...resolveCustomPeriod(narrow.fromMs, narrow.toMs) },
      dataSource: { getTransactionReceipt: async () => null },
      networkMeta: NETWORK_META,
      ledger,
      generatedAt: T0 + 7 * 3600_000,
    })
    expect(entries.map((e) => e.entryId)).toEqual(['cl:t-ok'])
    expect(report.lineItems.map((i) => i.entryId)).toEqual(['cl:t-ok'])
  })
})
