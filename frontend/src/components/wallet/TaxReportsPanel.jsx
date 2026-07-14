/**
 * TaxReportsPanel — the "Reporting" tab content in My Account
 * (spec 016-wager-tax-report, extended by spec 051; contracts/reports-ui.md).
 * Wires the "export current month" quick action, the period selector, the
 * generation state machine, result/empty/error states, downloads, and the
 * saved-report history together. Reports cover every activity class the unified
 * ledger tracks (wager/transfer/earn/pool/membership) on the connected network.
 */

import { useTaxReport, REPORT_STATUS } from '../../hooks/useTaxReport'
import { PERIOD_KINDS } from '../../utils/reportPeriods'
import ReportPeriodSelector from './ReportPeriodSelector'
import ReportHistoryList from './ReportHistoryList'

function Totals({ totals, showByClass = false }) {
  const byClass = showByClass && totals.byClass ? Object.values(totals.byClass) : []
  return (
    <div className="report-totals">
      <h4>Totals by token</h4>
      <ul>
        {Object.values(totals.byTicker).map((t) => (
          <li key={t.ticker}>
            {t.ticker}: net {t.net} ({t.count} entries) — USD {t.usdValue.toFixed(2)}
          </li>
        ))}
        <li>
          Overall: USD {totals.overall.usdValue.toFixed(2)} · fees {totals.overall.feesNative}{' '}
          {totals.overall.feesNativeSymbol}
        </li>
      </ul>
      {byClass.length > 0 && (
        <>
          <h4>Totals by activity type</h4>
          <ul>
            {byClass.map((c) => (
              <li key={c.class}>
                {c.class}: {c.count} entr{c.count === 1 ? 'y' : 'ies'} — USD {c.usdValue.toFixed(2)}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

export default function TaxReportsPanel({ hookOptions } = {}) {
  const {
    account, status, progress, report, error, entries, isEmpty,
    generate, downloadPdf, downloadCsv, redownload, removeEntry,
  } = useTaxReport(hookOptions)

  const generating = status === REPORT_STATUS.GENERATING

  // One-click: build the current month-to-date report and download it as a PDF.
  const exportCurrentMonth = async () => {
    const built = await generate({ kind: PERIOD_KINDS.CURRENT_MONTH })
    if (built) downloadPdf(built)
  }

  if (!account) {
    return (
      <div className="tax-reports-section">
        <p>Connect your wallet to generate an activity report.</p>
      </div>
    )
  }

  return (
    <div className="tax-reports-section">
      <h3>Reporting</h3>
      <p className="tax-reports-intro">
        Generate a downloadable record of your on-chain activity — wagers, transfers, pools, earn,
        and membership — for a chosen period on the connected network. This is an informational
        record, not tax advice.
      </p>

      <div className="report-quick-actions">
        <button type="button" className="report-quick-btn" onClick={exportCurrentMonth} disabled={generating}>
          Export current month (PDF)
        </button>
      </div>

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
            <p className="report-empty">
              {report.source === 'ledger'
                ? 'No activity in this period.'
                : 'No wager activity in this period.'}
            </p>
          ) : (
            <>
              <p>
                {report.source === 'ledger'
                  ? `${report.lineItems.length} activity entr${report.lineItems.length === 1 ? 'y' : 'ies'} for ${report.period.label} on ${report.networkName}.`
                  : `${report.lineItems.length} transfer(s) for ${report.period.label} on ${report.networkName}.`}
              </p>
              {report.totals?.overall?.failedCount > 0 && (
                <p className="report-note">
                  {`${report.totals.overall.failedCount} failed operation(s) are listed but excluded from all totals.`}
                </p>
              )}
              {report.staleClasses?.length > 0 && (
                <p className="report-note" role="status">
                  {`Could not refresh: ${report.staleClasses.join(', ')} — entries for these classes may be missing.`}
                </p>
              )}
              <Totals totals={report.totals} showByClass={report.source === 'ledger'} />
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
