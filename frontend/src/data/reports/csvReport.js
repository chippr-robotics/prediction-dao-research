/**
 * CSV renderer for the wager tax/activity report
 * (spec 016-wager-tax-report, FR-006/FR-007/FR-008; contracts/report-line-item.md;
 * extended by spec 051 to the full activity-ledger column contract —
 * specs/051-unified-activity-ledger/contracts/ledger-entry.md).
 *
 * Emits a metadata preamble (account, network, period, generated-at, valuation
 * note, disclosures, disclaimer) followed by the line-item table and a totals
 * block. Full, untruncated transaction hashes and addresses (FR-006).
 *
 * Two column sets share one renderer: ledger-built reports (`report.source ===
 * 'ledger'`) carry every activity class with status/valuation fidelity;
 * legacy wager-only reports keep the original 11 columns byte-for-byte.
 */

import Papa from 'papaparse'

/** Legacy canonical column order (spec 016), shared with the PDF renderer. */
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

/** Spec 051 extended column order (contracts/ledger-entry.md). */
export const LEDGER_REPORT_COLUMNS = [
  'Timestamp (UTC)',
  'Class',
  'Kind',
  'Direction',
  'Status',
  'Failure Reason',
  'Token',
  'Amount',
  'USD Value',
  'Valuation',
  'Cost Basis',
  'Network Fee',
  'Transaction Hash',
  'From',
  'To',
  'Wager ID',
  'Entry ID',
]

export function feeCell(item) {
  if (typeof item.feeNative === 'number') {
    return `${item.feeNative} ${item.feeNativeSymbol || ''}`.trim()
  }
  return item.feeUnavailableReason || 'N/A'
}

/** Real activity time or an explicit flag — never a fabricated date (FR-006). */
function timestampCell(item) {
  return item.timestamp != null ? new Date(item.timestamp).toISOString() : 'unavailable'
}

function legacyRow(item) {
  return [
    timestampCell(item),
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

function ledgerRow(item) {
  const unvalued = item.valuationStatus === 'unvalued'
  return [
    timestampCell(item),
    item.class ?? 'wager',
    item.kind ?? item.direction,
    item.direction,
    item.status ?? 'settled',
    item.failureReason ?? '',
    item.tokenTicker,
    item.amount,
    // Flagged, never silently zeroed (FR-016).
    unvalued ? 'unvalued' : item.usdValue.toFixed(2),
    item.valuationStatus ?? 'valued',
    unvalued ? 'unvalued' : item.costBasis.toFixed(2),
    feeCell(item),
    item.txHash,
    item.fromAddress,
    item.toAddress,
    item.wagerId,
    item.entryId ?? '',
  ]
}

export function reportColumns(report) {
  return report?.source === 'ledger' ? LEDGER_REPORT_COLUMNS : REPORT_COLUMNS
}

/** Map a line item to its column row (shared with the PDF renderer). */
export function lineItemToRow(item, report) {
  return report?.source === 'ledger' ? ledgerRow(item) : legacyRow(item)
}

/**
 * @param {object} report - ActivityReport from buildReport
 * @returns {string} CSV text (RFC 4180)
 */
export function render(report) {
  const preamble = [
    ['Activity / Tax Report'],
    ['Account', report.account],
    ['Network', `${report.networkName}${report.isTestnet ? ' (testnet)' : ''}`],
    ['Period', report.period.label],
    ['Generated', new Date(report.generatedAt).toISOString()],
    ['Valuation', report.valuationNote],
  ]
  // Spec 051 disclosures: stale sources and any device-history pruning marker.
  if (report.staleClasses?.length) {
    preamble.push(['Coverage note', `Could not refresh: ${report.staleClasses.join(', ')} — entries for these classes may be missing.`])
  }
  if (report.prunedBefore != null) {
    preamble.push(['Retention note', `Device-local entries before ${new Date(report.prunedBefore).toISOString()} were pruned; on-chain activity remains recoverable.`])
  }
  if (report.totals?.overall?.failedCount > 0) {
    preamble.push(['Failed operations', `${report.totals.overall.failedCount} failed operation(s) are listed but excluded from all totals.`])
  }
  preamble.push(['Disclaimer', report.disclaimer], [])

  const table = [reportColumns(report), ...report.lineItems.map((it) => lineItemToRow(it, report))]

  const totals = [[], ['Totals by token (settled activity only)']]
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
