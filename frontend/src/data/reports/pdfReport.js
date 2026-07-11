/**
 * PDF renderer for the wager tax/activity report
 * (spec 016-wager-tax-report, FR-007/FR-008/FR-009; contracts/report-line-item.md).
 *
 * Human-readable document: header (account, network, period, generated-at),
 * the canonical line-item table, per-stablecoin + overall totals, the par
 * valuation note, and the not-tax-advice disclaimer. Long hashes/addresses use
 * a small monospaced cell and wrap — never truncated (FR-006).
 */

import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { reportColumns, lineItemToRow } from './csvReport'

/**
 * @param {object} report - ActivityReport from buildReport
 * @returns {Blob} application/pdf
 */
export function render(report) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const marginX = 32
  let y = 40

  doc.setFontSize(16)
  doc.text('Wager Activity / Tax Report', marginX, y)
  y += 20

  doc.setFontSize(9)
  const headerLines = [
    `Account: ${report.account}`,
    `Network: ${report.networkName}${report.isTestnet ? ' (testnet)' : ''}`,
    `Period: ${report.period.label}`,
    `Generated: ${new Date(report.generatedAt).toISOString()}`,
  ]
  // Spec 051 disclosures mirror the CSV preamble.
  if (report.staleClasses?.length) {
    headerLines.push(`Coverage note: could not refresh ${report.staleClasses.join(', ')} — entries may be missing.`)
  }
  if (report.prunedBefore != null) {
    headerLines.push(`Retention note: device-local entries before ${new Date(report.prunedBefore).toISOString()} were pruned.`)
  }
  if (report.totals?.overall?.failedCount > 0) {
    headerLines.push(`${report.totals.overall.failedCount} failed operation(s) listed but excluded from all totals.`)
  }
  for (const line of headerLines) {
    doc.text(line, marginX, y)
    y += 13
  }

  autoTable(doc, {
    head: [reportColumns(report)],
    body: report.lineItems.map((it) => lineItemToRow(it, report)),
    startY: y + 6,
    styles: { fontSize: 6, font: 'courier', cellPadding: 2, overflow: 'linebreak' },
    headStyles: { fontSize: 6, fillColor: [40, 40, 40] },
    margin: { left: marginX, right: marginX },
  })

  let afterTableY = (doc.lastAutoTable?.finalY || y) + 18
  doc.setFontSize(9)
  doc.text('Totals by stablecoin', marginX, afterTableY)
  afterTableY += 13
  doc.setFontSize(8)
  for (const t of Object.values(report.totals.byTicker)) {
    doc.text(
      `${t.ticker}: deposits ${t.deposits}, payouts ${t.payouts}, refunds ${t.refunds}, net ${t.net}, USD ${t.usdValue.toFixed(2)}`,
      marginX,
      afterTableY,
    )
    afterTableY += 12
  }
  const o = report.totals.overall
  doc.text(`Overall: USD ${o.usdValue.toFixed(2)}, fees ${o.feesNative} ${o.feesNativeSymbol}`, marginX, afterTableY)
  afterTableY += 18

  doc.setFontSize(7)
  doc.setTextColor(90)
  for (const note of [report.valuationNote, report.disclaimer]) {
    const wrapped = doc.splitTextToSize(note, 760)
    doc.text(wrapped, marginX, afterTableY)
    afterTableY += 11 * wrapped.length + 4
  }

  return doc.output('blob')
}

/** Suggested download file name (FR-007). */
export function fileName(report) {
  const from = new Date(report.period.from).toISOString().slice(0, 10)
  const to = new Date(report.period.to).toISOString().slice(0, 10)
  return `wager-report_${report.networkName.replace(/\s+/g, '-')}_${from}_${to}.pdf`
}
