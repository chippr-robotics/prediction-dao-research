/**
 * Statement view model (issue #1026).
 *
 * These assert the CLAIMS the document makes, not its pixels: that a scoped
 * statement re-derives its totals instead of relabelling the account's, that
 * bridged value is never conflated with other neutral value, and that anything
 * the figures cannot account for comes back as a count the document can print.
 */

import { describe, it, expect } from 'vitest'
import {
  buildStatementModel,
  buildTokenRows,
  buildFlowSeries,
  chooseBucket,
  decimalsFor,
  formatList,
  formatTokenAmount,
  formatUsd,
  formatUsdSigned,
  splitHash,
} from '../../data/reports/statement/model'
import { STATEMENT_TYPES } from '../../data/reports/statement/reportTypes'
import { computeTotals } from '../../data/reports/reportBuilder'

const PERIOD = {
  kind: 'custom',
  from: Date.UTC(2026, 6, 1),
  to: Date.UTC(2026, 6, 31, 23, 59, 59, 999),
  label: 'July 2026',
}

function entry(over = {}) {
  return {
    entryId: over.entryId || `oc:${Math.random().toString(16).slice(2)}`,
    class: 'wager',
    classLabel: 'Wager',
    kind: 'deposit',
    direction: 'deposit',
    valueDirection: 'out',
    status: 'settled',
    timestamp: Date.UTC(2026, 6, 5),
    tokenTicker: 'USDC',
    amount: '100',
    amountNumber: 100,
    usdValue: 100,
    costBasis: 100,
    valuationStatus: 'valued',
    feeNative: 0.01,
    feeNativeSymbol: 'POL',
    platformFee: { status: 'n/a', legs: [], usd: null, bps: null },
    txHash: `0x${'a'.repeat(64)}`,
    fromAddress: '0xaaa',
    toAddress: '0xbbb',
    selfTransfer: false,
    ...over,
  }
}

function report(lineItems, over = {}) {
  return {
    account: '0xabc',
    chainId: 137,
    networkName: 'Polygon',
    isTestnet: false,
    period: PERIOD,
    generatedAt: Date.UTC(2026, 7, 1),
    source: 'ledger',
    lineItems,
    totals: computeTotals(lineItems, 'POL'),
    staleClasses: [],
    prunedBefore: null,
    ...over,
  }
}

describe('statement money formatting', () => {
  it('puts the sign outside the currency symbol', () => {
    expect(formatUsdSigned(-1493.32)).toBe('-$1,493.32')
    expect(formatUsdSigned(91.28)).toBe('+$91.28')
    expect(formatUsd(-5)).toBe('$5.00')
  })

  // jsPDF's standard fonts are WinAnsi; a U+2212 renders as a different glyph
  // entirely, so a negative figure would print as something that is not a number.
  it('uses only ASCII signs, never a typographic minus', () => {
    expect(formatUsdSigned(-1)).not.toMatch(/[−–—]/)
  })

  it('holds a column to one decimal count and shows the smallest real value', () => {
    expect(decimalsFor([5859.68, 4717.5])).toBe(2)
    expect(decimalsFor([0.85, 0.4])).toBe(4)
    expect(decimalsFor([0.000512])).toBe(6)
    expect(formatTokenAmount(4717.5, 2)).toBe('4,717.50')
  })
})

describe('per-asset movement', () => {
  // The report's own byTicker block is keyed on the wager vocabulary, so a
  // staking deposit lands in none of its columns; the statement must not print
  // an asset as "0 in, 0 out" beside a non-zero value.
  it('reads value direction, not the wager kind, so non-wager classes count', () => {
    const rows = buildTokenRows([
      entry({ class: 'staking', kind: 'stake', valueDirection: 'out', tokenTicker: 'WETH', amountNumber: 0.85, usdValue: 2635.5 }),
      entry({ class: 'earn', kind: 'yield_claim', valueDirection: 'in', tokenTicker: 'USDC', amountNumber: 41.28, usdValue: 41.28 }),
    ])
    const weth = rows.find((r) => r.ticker === 'WETH')
    expect(weth.outAmount).toBe(0.85)
    expect(weth.netUsd).toBe(-2635.5)
    expect(rows.find((r) => r.ticker === 'USDC').inUsd).toBe(41.28)
  })

  it('keeps bridged value apart from other neutral value', () => {
    const [row] = buildTokenRows([
      entry({ class: 'bridge', valueDirection: 'none', selfTransfer: true, amountNumber: 750, usdValue: 750 }),
      entry({ class: 'staking', kind: 'unstake_request', valueDirection: 'none', amountNumber: 100, usdValue: 100 }),
    ])
    expect(row.movedAmount).toBe(750)
    expect(row.neutralAmount).toBe(100)
    // Neither is netted: one is a self-transfer, the other changes no ownership.
    expect(row.netAmount).toBe(0)
  })
})

describe('statement scope', () => {
  const items = [
    entry({ class: 'wager', valueDirection: 'out', amountNumber: 250, usdValue: 250 }),
    entry({ class: 'wager', kind: 'payout', valueDirection: 'in', amountNumber: 400, usdValue: 400 }),
    entry({ class: 'earn', kind: 'vault_deposit', valueDirection: 'out', amountNumber: 2000, usdValue: 2000 }),
  ]

  it('re-derives totals from the entries in scope rather than relabelling the account total', () => {
    const full = buildStatementModel(report(items), { type: STATEMENT_TYPES.FULL })
    const wagers = buildStatementModel(report(items), { type: STATEMENT_TYPES.WAGERS })
    expect(full.summary.moneyOut).toBe(2250)
    expect(wagers.summary.moneyOut).toBe(250)
    expect(wagers.summary.net).toBe(150)
  })

  it('reports how much the scope excluded, so a partial statement can say so', () => {
    const wagers = buildStatementModel(report(items), { type: STATEMENT_TYPES.WAGERS })
    expect(wagers.excludedByScope).toBe(1)
    expect(wagers.scopeNote).toMatch(/covers only the activity types/i)
  })

  it('has no scope note when nothing was excluded', () => {
    expect(buildStatementModel(report(items), { type: STATEMENT_TYPES.FULL }).scopeNote).toBeNull()
  })

  // A statement of nothing is never what a member meant, and producing one
  // silently would read as "you had no activity".
  it('falls back to the full scope when a custom selection is empty', () => {
    const model = buildStatementModel(report(items), { type: STATEMENT_TYPES.CUSTOM, classes: [] })
    expect(model.scopeClasses).toBeNull()
    expect(model.settled).toHaveLength(3)
  })
})

describe('what the figures cannot account for', () => {
  it('counts failed entries apart and keeps them out of every total', () => {
    const model = buildStatementModel(
      report([
        entry({ valueDirection: 'out', amountNumber: 100, usdValue: 100 }),
        entry({ status: 'failed', valueDirection: 'out', amountNumber: 400, usdValue: 400, failureReason: 'Reverted' }),
      ]),
    )
    expect(model.summary.moneyOut).toBe(100)
    expect(model.summary.failedCount).toBe(1)
    expect(model.summary.entryCount).toBe(1)
    expect(model.summary.recordedCount).toBe(2)
  })

  // "Not failed" is not "settled": a pending entry has not confirmed, and three
  // captions used to call the whole set settled.
  it('counts pending entries separately from confirmed ones', () => {
    const model = buildStatementModel(
      report([entry({ status: 'pending' }), entry({ status: 'settled' })]),
    )
    expect(model.summary.pendingCount).toBe(1)
    expect(model.summary.entryCount).toBe(2)
  })

  it('counts undated and unvalued entries instead of dropping them', () => {
    const model = buildStatementModel(
      report([
        entry({ timestamp: null }),
        entry({ valuationStatus: 'unvalued', usdValue: 0 }),
      ]),
    )
    expect(model.summary.undatedCount).toBe(1)
    expect(model.summary.unvaluedCount).toBe(1)
    expect(model.flow.undated).toBe(1)
  })

  it('separates bridged value from other neutral value in the summary', () => {
    const model = buildStatementModel(
      report([
        entry({ class: 'bridge', valueDirection: 'none', selfTransfer: true, amountNumber: 750, usdValue: 750 }),
        entry({ class: 'staking', kind: 'unstake_request', valueDirection: 'none', amountNumber: 400, usdValue: 1240 }),
      ]),
    )
    expect(model.summary.movedUsd).toBe(750)
    expect(model.summary.movedCount).toBe(1)
    expect(model.summary.neutralOtherUsd).toBe(1240)
    expect(model.summary.neutralOtherCount).toBe(1)
  })

  it('names stale classes the way the rest of the document names them', () => {
    const model = buildStatementModel(report([entry()], { staleClasses: ['earn', 'staking'] }))
    expect(model.staleClassLabels).toEqual(['Earn', 'Staking'])
  })

  // A page-one banner alone let a reader reconcile an incomplete row with no
  // signal that it was incomplete.
  it('marks a class that could not be fully read wherever it appears', () => {
    const model = buildStatementModel(
      report([entry({ class: 'earn', kind: 'vault_deposit' }), entry({ class: 'wager' })], {
        staleClasses: ['earn'],
      }),
    )
    const rows = model.activity.rows
    expect(rows.find((r) => r.key === 'earn').label).toBe('Earn (partial)')
    expect(rows.find((r) => r.key === 'earn').partial).toBe(true)
    expect(rows.find((r) => r.key === 'wager').partial).toBe(false)
  })

  // Same rule as the platform fee: a dash reads as zero, and the document
  // cannot claim nothing moved when it could not value what did.
  it('counts unvalued neutral entries apart from valued ones, per class', () => {
    const model = buildStatementModel(
      report([
        entry({ class: 'miniapp', valueDirection: 'none', valuationStatus: 'unvalued', usdValue: 0 }),
        entry({ class: 'staking', kind: 'unstake_request', valueDirection: 'none', usdValue: 1240 }),
      ]),
    )
    const miniapp = model.activity.rows.find((r) => r.key === 'miniapp')
    expect(miniapp.neutralUnvalued).toBe(1)
    expect(miniapp.neutralUsd).toBe(0)
    expect(model.activity.rows.find((r) => r.key === 'staking').neutralUsd).toBe(1240)
  })

  it('does not report an unvalued bridge as zero dollars moved', () => {
    const model = buildStatementModel(
      report([
        entry({ class: 'bridge', valueDirection: 'none', selfTransfer: true, valuationStatus: 'unvalued', usdValue: 0 }),
      ]),
    )
    expect(model.summary.movedCount).toBe(1)
    expect(model.summary.movedUnvalued).toBe(1)
    expect(model.summary.movedUsd).toBe(0)
  })

  // A transaction that reverts still burns gas — real money out of the wallet.
  // computeTotals skips failed entries wholesale, so it never sees that fee.
  it('counts gas spent on failed operations and reports it separately', () => {
    const model = buildStatementModel(
      report([
        entry({ feeNative: 0.01 }),
        entry({ status: 'failed', feeNative: 0.0031, failureReason: 'Reverted' }),
      ]),
    )
    expect(model.summary.networkFeesFailed).toBeCloseTo(0.0031, 6)
    expect(model.summary.networkFees).toBeCloseTo(0.0131, 6)
  })
})

describe('prose helpers', () => {
  // "Earn, Staking could not be read" is not a sentence.
  it('joins a list the way a sentence does', () => {
    expect(formatList(['Earn'])).toBe('Earn')
    expect(formatList(['Earn', 'Staking'])).toBe('Earn and Staking')
    expect(formatList(['Earn', 'Staking', 'Wager'])).toBe('Earn, Staking and Wager')
  })

  // Left to wrap on its own, a hash broke wherever the column ran out and a
  // bridge row (which carries two) doubled in height.
  it('splits a hash at a fixed midpoint so both halves are equal', () => {
    const hash = `0x${'a'.repeat(64)}`
    const [first, second] = splitHash(hash).split('\n')
    expect(first.length).toBe(second.length)
    expect(first + second).toBe(hash)
  })

  it('leaves a short reference alone', () => {
    expect(splitHash('0xabc')).toBe('0xabc')
  })
})

describe('flow series', () => {
  it('picks a bucket width the period can actually show', () => {
    expect(chooseBucket(Date.UTC(2026, 6, 1), Date.UTC(2026, 6, 31))).toBe('day')
    expect(chooseBucket(Date.UTC(2026, 0, 1), Date.UTC(2026, 11, 31))).toBe('month')
  })

  it('keeps empty buckets so a quiet stretch reads as a gap', () => {
    const { buckets } = buildFlowSeries([entry({ timestamp: Date.UTC(2026, 6, 5) })], PERIOD)
    expect(buckets).toHaveLength(31)
    expect(buckets[4].outUsd).toBe(100)
    expect(buckets[10].outUsd).toBe(0)
  })

  // Plotting a bridge on either side would draw money that never moved in or out.
  it('leaves neutral value off both sides of the chart', () => {
    const { buckets } = buildFlowSeries(
      [entry({ class: 'bridge', valueDirection: 'none', selfTransfer: true, usdValue: 750 })],
      PERIOD,
    )
    expect(buckets.every((b) => b.inUsd === 0 && b.outUsd === 0)).toBe(true)
  })
})
