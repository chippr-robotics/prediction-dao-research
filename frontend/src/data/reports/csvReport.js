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
import { classLabel, formatPlatformFee, PLATFORM_FEE_STATUS } from './activityClassification'

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

/**
 * Spec 051 extended column order (contracts/ledger-entry.md), widened by spec
 * 067 with the platform fee actually charged and the cross-chain leg of a
 * bridge — one row naming both networks and both transactions (FR-035/FR-036).
 */
export const LEDGER_REPORT_COLUMNS = [
  'Timestamp (UTC)',
  'Class',
  'Activity',
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
  'Platform Fee',
  'Platform Fee USD',
  'Transaction Hash',
  'Destination Network',
  'Destination Transaction Hash',
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

/**
 * The platform fee in USD: a figure only where one is actually known. `unknown`
 * covers both "a chargeable action never reported what it took" and "the fee is
 * known in tokens but the entry carries no basis to value it" — neither may be
 * rendered as 0.00, which would read as "you were charged nothing" (FR-036).
 */
export function platformFeeUsdCell(item) {
  const fee = item.platformFee
  if (!fee || fee.status === PLATFORM_FEE_STATUS.NOT_APPLICABLE) return ''
  return fee.usd != null ? fee.usd.toFixed(2) : 'unknown'
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
    // Human activity name alongside the machine class: 'pool' alone cannot tell
    // a wager pool from a liquidity pool (FR-039a).
    item.classLabel ?? classLabel(item.class),
    item.kind ?? item.direction,
    // The VALUE direction — in / out / none. A bridge reads `none` because
    // moving your own assets between networks is neither (FR-036).
    item.valueDirection ?? item.direction,
    item.status ?? 'settled',
    item.failureReason ?? '',
    item.tokenTicker,
    item.amount,
    // Flagged, never silently zeroed (FR-016).
    unvalued ? 'unvalued' : item.usdValue.toFixed(2),
    item.valuationStatus ?? 'valued',
    unvalued ? 'unvalued' : item.costBasis.toFixed(2),
    feeCell(item),
    formatPlatformFee(item.platformFee),
    platformFeeUsdCell(item),
    item.txHash,
    item.destinationNetworkName ?? '',
    item.destinationTxHash ?? '',
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
    ['FairWins Activity Report'],
    ['Account', report.account],
    ['Network', `${report.networkName}${report.isTestnet ? ' (testnet)' : ''}`],
    ['Chain ID', String(report.chainId ?? '')],
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
  // Spec 067 FR-036: state the cross-chain treatment on the export itself.
  if (report.selfTransferNote) {
    preamble.push(['Cross-network transfers', report.selfTransferNote])
  }
  if (report.totals?.overall?.platformFeeUnknownCount > 0) {
    preamble.push([
      'Platform fee note',
      `${report.totals.overall.platformFeeUnknownCount} entr${report.totals.overall.platformFeeUnknownCount === 1 ? 'y' : 'ies'} ` +
        'carry a platform fee that could not be valued in USD; they are excluded from the platform-fee total below and marked "unknown".',
    ])
  }
  preamble.push(['Disclaimer', report.disclaimer], [])

  const table = [reportColumns(report), ...report.lineItems.map((it) => lineItemToRow(it, report))]

  const totals = [[], ['Totals by token (settled activity only)']]
  for (const t of Object.values(report.totals.byTicker)) {
    const row = [
      t.ticker,
      `deposits ${t.deposits}`,
      `payouts ${t.payouts}`,
      `refunds ${t.refunds}`,
      `net ${t.net}`,
      `USD ${t.usdValue.toFixed(2)}`,
    ]
    // Value moved between the member's own networks sits outside net — it is
    // neither a receipt nor a disposal (FR-036).
    if (t.moved) row.push(`moved between your networks ${t.moved} (USD ${t.movedUsd.toFixed(2)})`)
    totals.push(row)
  }

  // Collated per-activity breakdown — the multi-use view the flat table cannot
  // give (spec 051 classes). Only the ledger path carries real class labels.
  const byClass = report.totals?.byClass
  if (report.source === 'ledger' && byClass && Object.keys(byClass).length) {
    totals.push([], ['Totals by activity type (settled activity only)'])
    for (const c of Object.values(byClass)) {
      const row = [
        c.class,
        c.label ?? classLabel(c.class),
        `entries ${c.count}`,
        `in USD ${c.inUsd.toFixed(2)}`,
        `out USD ${c.outUsd.toFixed(2)}`,
        `USD ${c.usdValue.toFixed(2)}`,
      ]
      if (c.movedUsd) row.push(`moved between your networks USD ${c.movedUsd.toFixed(2)}`)
      if (c.platformFeesUsd) row.push(`platform fees USD ${c.platformFeesUsd.toFixed(2)}`)
      totals.push(row)
    }
  }

  const overall = report.totals.overall
  totals.push([
    'Overall',
    `USD ${overall.usdValue.toFixed(2)}`,
    `fees ${overall.feesNative} ${overall.feesNativeSymbol}`,
  ])
  // Reported beside the overall, never inside it: a self-transfer is not income
  // and not a disposal, and the platform fee is the only cost it carries.
  if (overall.movedUsd) {
    totals.push([
      'Moved between your own networks',
      `USD ${overall.movedUsd.toFixed(2)}`,
      'not income, not a disposal — excluded from the overall above',
    ])
  }
  if (report.source === 'ledger' && (overall.platformFeesUsd || overall.platformFeeUnknownCount)) {
    totals.push([
      'Platform fees charged',
      `USD ${(overall.platformFeesUsd || 0).toFixed(2)}`,
      overall.platformFeeUnknownCount
        ? `${overall.platformFeeUnknownCount} entr${overall.platformFeeUnknownCount === 1 ? 'y' : 'ies'} with an unvalued platform fee excluded`
        : '',
    ])
  }

  return Papa.unparse([...preamble, ...table, ...totals])
}

/**
 * Suggested download file name (FR-007). The unified ledger export is
 * multi-use, so it names itself by activity, not "wager"; the legacy
 * wager-only path keeps its historical name for stable tooling.
 */
export function fileName(report) {
  const from = new Date(report.period.from).toISOString().slice(0, 10)
  const to = new Date(report.period.to).toISOString().slice(0, 10)
  const net = report.networkName.replace(/\s+/g, '-')
  const stem = report.source === 'ledger' ? 'fairwins-activity' : 'wager-report'
  return `${stem}_${net}_${from}_${to}.csv`
}
