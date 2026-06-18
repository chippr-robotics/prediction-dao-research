/**
 * TaxReportsPanel — the "Tax Reports" tab content in My Account
 * (spec 016-wager-tax-report; contracts/reports-ui.md). Wires the period
 * selector, generation state machine, result/empty/error states, downloads,
 * and the saved-report history together.
 */

import { useTaxReport, REPORT_STATUS } from '../../hooks/useTaxReport'
import ReportPeriodSelector from './ReportPeriodSelector'
import ReportHistoryList from './ReportHistoryList'

function Totals({ totals }) {
  return (
    <div className="report-totals">
      <h4>Totals</h4>
      <ul>
        {Object.values(totals.byTicker).map((t) => (
          <li key={t.ticker}>
            {t.ticker}: net {t.net} ({t.count} transfers) — USD {t.usdValue.toFixed(2)}
          </li>
        ))}
        <li>
          Overall: USD {totals.overall.usdValue.toFixed(2)} · fees {totals.overall.feesNative}{' '}
          {totals.overall.feesNativeSymbol}
        </li>
      </ul>
    </div>
  )
}

export default function TaxReportsPanel({ hookOptions } = {}) {
  const {
    account, status, progress, report, error, entries, isEmpty,
    generate, downloadPdf, downloadCsv, redownload, removeEntry,
  } = useTaxReport(hookOptions)

  const generating = status === REPORT_STATUS.GENERATING

  if (!account) {
    return (
      <div className="tax-reports-section">
        <p>Connect your wallet to generate a wager activity / tax report.</p>
      </div>
    )
  }

  return (
    <div className="tax-reports-section">
      <h3>Wager activity / tax report</h3>
      <p className="tax-reports-intro">
        Generate a downloadable record of every wager-related stablecoin transfer for a chosen
        period. This is an informational record, not tax advice.
      </p>

      <ReportPeriodSelector onGenerate={generate} disabled={generating} />

      <div aria-live="polite" className="report-status">
        {generating && (
          <p className="report-progress">
            {progress.label} ({Math.round(progress.fraction * 100)}%)
          </p>
        )}
        {status === REPORT_STATUS.ERROR && error && (
          <p className="report-error" role="alert">{error}</p>
        )}
      </div>

      {status === REPORT_STATUS.READY && report && (
        <div className="report-result">
          {isEmpty ? (
            <p className="report-empty">No wager activity in this period.</p>
          ) : (
            <>
              <p>
                {`${report.lineItems.length} transfer(s) for ${report.period.label} on ${report.networkName}.`}
              </p>
              <Totals totals={report.totals} />
            </>
          )}
          <div className="report-download-actions">
            <button type="button" onClick={() => downloadPdf()}>Download PDF</button>
            <button type="button" onClick={() => downloadCsv()}>Download CSV</button>
          </div>
        </div>
      )}

      <ReportHistoryList entries={entries} onRedownload={redownload} onRemove={removeEntry} />
    </div>
  )
}
