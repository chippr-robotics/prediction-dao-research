/**
 * CSV renderer for the wager tax/activity report
 * (spec 016-wager-tax-report, FR-006/FR-007/FR-008; contracts/report-line-item.md).
 *
 * Emits a metadata preamble (account, network, period, generated-at, valuation
 * note, disclaimer) followed by the canonical 11-column line-item table and a
 * totals block. Full, untruncated transaction hashes and addresses (FR-006).
 */

import Papa from 'papaparse'

/** Canonical column order shared with the PDF renderer. */
export const REPORT_COLUMNS = [
  'Timestamp (UTC)',
  'Direction',
  'Stablecoin',
  'Amount',
  'USD Value',
  'Cost Basis',
  'Network Fee',
  'Transaction Hash',
  'From',
  'To',
  'Wager ID',
]

export function feeCell(item) {
  if (typeof item.feeNative === 'number') {
    return `${item.feeNative} ${item.feeNativeSymbol || ''}`.trim()
  }
  return item.feeUnavailableReason || 'N/A'
}

/** Map a line item to the canonical column row (shared with the PDF renderer). */
export function lineItemToRow(item) {
  return lineRow(item)
}

function lineRow(item) {
  return [
    new Date(item.timestamp).toISOString(),
    item.direction,
    item.tokenTicker,
    item.amount,
    item.usdValue.toFixed(2),
    item.costBasis.toFixed(2),
    feeCell(item),
    item.txHash,
    item.fromAddress,
    item.toAddress,
    item.wagerId,
  ]
}

/**
 * @param {object} report - ActivityReport from buildReport
 * @returns {string} CSV text (RFC 4180)
 */
export function render(report) {
  const preamble = [
    ['Wager Activity / Tax Report'],
    ['Account', report.account],
    ['Network', `${report.networkName}${report.isTestnet ? ' (testnet)' : ''}`],
    ['Period', report.period.label],
    ['Generated', new Date(report.generatedAt).toISOString()],
    ['Valuation', report.valuationNote],
    ['Disclaimer', report.disclaimer],
    [],
  ]

  const table = [REPORT_COLUMNS, ...report.lineItems.map(lineRow)]

  const totals = [[], ['Totals by stablecoin']]
  for (const t of Object.values(report.totals.byTicker)) {
    totals.push([
      t.ticker,
      `deposits ${t.deposits}`,
      `payouts ${t.payouts}`,
      `refunds ${t.refunds}`,
      `net ${t.net}`,
      `USD ${t.usdValue.toFixed(2)}`,
    ])
  }
  totals.push([
    'Overall',
    `USD ${report.totals.overall.usdValue.toFixed(2)}`,
    `fees ${report.totals.overall.feesNative} ${report.totals.overall.feesNativeSymbol}`,
  ])

  return Papa.unparse([...preamble, ...table, ...totals])
}

/** Suggested download file name (FR-007). */
export function fileName(report) {
  const from = new Date(report.period.from).toISOString().slice(0, 10)
  const to = new Date(report.period.to).toISOString().slice(0, 10)
  return `wager-report_${report.networkName.replace(/\s+/g, '-')}_${from}_${to}.csv`
}
