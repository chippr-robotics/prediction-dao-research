/**
 * Statement document rendering (issue #1026).
 *
 * A PDF's layout cannot be asserted in a unit test — that is what the preview
 * harness and the design review are for. What IS asserted here is that the
 * renderer survives the shapes that actually break documents (an empty period,
 * a period with only failures, no assets, a one-bucket range), that the
 * WinAnsi sanitizer catches the characters jsPDF silently corrupts, and that
 * two statements of the same period never collide on a file name.
 */

import { describe, it, expect } from 'vitest'
import { renderStatement, statementFileName } from '../../data/reports/statement/statementPdf'
import { sanitize } from '../../data/reports/statement/layout'
import { statementTheme } from '../../data/reports/statement/theme'
import { STATEMENT_TYPES } from '../../data/reports/statement/reportTypes'
import { render as renderPdf, fileName as pdfFileName } from '../../data/reports/pdfReport'
import { computeTotals } from '../../data/reports/reportBuilder'

const BRAND = {
  id: 'test',
  displayName: 'Test Platform',
  tagline: 'A tagline',
  appUrl: 'https://example.test',
  copyrightNotice: 'Test Ltd.',
  supportEmail: 'help@example.test',
}
const THEME = statementTheme({ primary: '#36B37E' })

const PERIOD = {
  kind: 'custom',
  from: Date.UTC(2026, 6, 1),
  to: Date.UTC(2026, 6, 31, 23, 59, 59, 999),
  label: 'July 2026',
}

function item(over = {}) {
  return {
    entryId: 'oc:1',
    class: 'wager',
    classLabel: 'Wager',
    kind: 'deposit',
    direction: 'deposit',
    valueDirection: 'out',
    status: 'settled',
    timestamp: Date.UTC(2026, 6, 5),
    tokenTicker: 'USDC',
    amount: '250',
    amountNumber: 250,
    usdValue: 250,
    costBasis: 250,
    valuationStatus: 'valued',
    feeNative: 0.01,
    feeNativeSymbol: 'POL',
    platformFee: { status: 'n/a', legs: [], usd: null, bps: null },
    txHash: `0x${'d'.repeat(64)}`,
    fromAddress: '0xaaa',
    toAddress: '0xbbb',
    selfTransfer: false,
    ...over,
  }
}

function report(lineItems, over = {}) {
  return {
    account: '0x7A16fF8270133F063aAb6C9977183D9e72835428',
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
    valuationNote: 'Valued at par.',
    disclaimer: 'Not tax advice.',
    ...over,
  }
}

const draw = (r, options = {}) => renderStatement(r, { brand: BRAND, theme: THEME, ...options })

describe('sanitize (WinAnsi safety)', () => {
  // These render as a DIFFERENT character in jsPDF's standard fonts, which on a
  // financial document turns a negative figure into something unreadable.
  it('replaces the characters jsPDF cannot encode', () => {
    expect(sanitize('−1,234')).toBe('-1,234')
    expect(sanitize('a → b')).toBe('a -> b')
    expect(sanitize('x…')).toBe('x...')
  })

  // En dash and em dash DO encode; downgrading them would flatten the
  // typography for nothing.
  it('leaves the dashes WinAnsi supports alone', () => {
    expect(sanitize('1 – 31 July — really')).toBe('1 – 31 July — really')
  })
})

describe('renderStatement', () => {
  it('produces a PDF for a populated period', () => {
    const blob = draw(report([item(), item({ entryId: 'oc:2', kind: 'payout', valueDirection: 'in', usdValue: 400, amountNumber: 400 })]))
    expect(blob.type).toBe('application/pdf')
    expect(blob.size).toBeGreaterThan(1000)
  })

  it('produces a valid statement for a period with no activity at all', () => {
    const blob = draw(report([]))
    expect(blob.type).toBe('application/pdf')
    expect(blob.size).toBeGreaterThan(0)
  })

  it('renders a period whose only entries failed', () => {
    const blob = draw(report([item({ status: 'failed', failureReason: 'Reverted' })]))
    expect(blob.size).toBeGreaterThan(0)
  })

  // Every degenerate shape below produced a throw or an unreadable page at some
  // point during design: a one-day range (a single chart bucket), an entry with
  // no token, and an entry with no date.
  it.each([
    ['a single-day period', report([item()], { period: { ...PERIOD, to: PERIOD.from + 3600e3, label: '1 July 2026' } })],
    ['an entry with no token symbol', report([item({ tokenTicker: '' })])],
    ['an entry with no date', report([item({ timestamp: null })])],
    ['an entry with no USD basis', report([item({ valuationStatus: 'unvalued', usdValue: 0 })])],
    ['a bridge with a destination leg', report([item({
      class: 'bridge', classLabel: 'Bridge', kind: 'bridge_transfer', valueDirection: 'none',
      selfTransfer: true, destinationNetworkName: 'Base', destinationTxHash: `0x${'e'.repeat(64)}`,
    })])],
    ['unreadable activity classes', report([item()], { staleClasses: ['earn', 'staking'] })],
    ['a testnet', report([item()], { isTestnet: true, networkName: 'Mordor', chainId: 63 })],
  ])('renders %s', (_label, r) => {
    expect(draw(r).size).toBeGreaterThan(0)
  })

  it('renders with every section switched off', () => {
    const blob = draw(report([item()]), {
      sections: {
        summary: false, charts: false, byToken: false,
        byActivity: false, register: false, fees: false, failed: false,
      },
    })
    // Still a document: the masthead and the disclosures always survive, because
    // a member has to be able to tell whose statement this is and how to read it.
    expect(blob.size).toBeGreaterThan(1000)
  })

  it('renders each built-in statement type', () => {
    for (const type of Object.values(STATEMENT_TYPES)) {
      expect(draw(report([item()]), { type }).size).toBeGreaterThan(0)
    }
  })
})

describe('file names', () => {
  // A member exporting a wagering and an earnings statement for the same month
  // must not end up with two files of the same name.
  it('names the scope so two statements of one period never collide', () => {
    const r = report([item()])
    const wagers = statementFileName(r, { brand: BRAND, type: STATEMENT_TYPES.WAGERS })
    const earnings = statementFileName(r, { brand: BRAND, type: STATEMENT_TYPES.EARNINGS })
    expect(wagers).not.toBe(earnings)
    expect(wagers).toContain('wagers')
    expect(wagers).toContain('2026-07-01')
  })

  it('names the file for the tenant, not a hardcoded platform', () => {
    expect(statementFileName(report([item()]), { brand: BRAND })).toMatch(/^test-platform-statement_/)
  })

  // Existing tooling and the saved-report history depend on the legacy name.
  it('leaves the legacy wager-only report name byte-for-byte', () => {
    const legacy = { ...report([item()]), source: undefined }
    expect(pdfFileName(legacy)).toBe('wager-report_Polygon_2026-07-01_2026-07-31.pdf')
  })

  it('renders through the app entry point using the active tenant', () => {
    expect(renderPdf(report([item()])).type).toBe('application/pdf')
  })
})
