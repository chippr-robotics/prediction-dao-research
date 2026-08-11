/**
 * TaxReportsPanel — the "Reporting" tab content in My Account
 * (spec 016-wager-tax-report, extended by spec 051; contracts/reports-ui.md).
 * Wires the "export current month" quick action, the period selector, the
 * generation state machine, result/empty/error states, downloads, and the
 * saved-report history together. Reports cover every activity class the unified
 * ledger tracks (wager/transfer/earn/pool/membership) on the connected network.
 */

import { useState } from 'react'
import { useTaxReport, REPORT_STATUS } from '../../hooks/useTaxReport'
import { PERIOD_KINDS } from '../../utils/reportPeriods'
import { classLabel } from '../../data/reports/activityClassification'
import { defaultSections, STATEMENT_TYPES } from '../../data/reports/statement/reportTypes'
import ReportPeriodSelector from './ReportPeriodSelector'
import ReportHistoryList from './ReportHistoryList'
import StatementOptions from './StatementOptions'

function Totals({ totals, showByClass = false }) {
  const byClass = showByClass && totals.byClass ? Object.values(totals.byClass) : []
  const overall = totals.overall
  return (
    <div className="report-totals">
      <h4>Totals by token</h4>
      <ul>
        {Object.values(totals.byTicker).map((t) => (
          <li key={t.ticker}>
            {t.ticker}: net {t.net} ({t.count} entries) — USD {t.usdValue.toFixed(2)}
            {t.moved ? ` · moved between your own networks: ${t.moved} (USD ${t.movedUsd.toFixed(2)})` : ''}
          </li>
        ))}
        <li>
          Overall: USD {overall.usdValue.toFixed(2)} · fees {overall.feesNative}{' '}
          {overall.feesNativeSymbol}
        </li>
        {/* Reported beside the overall, never inside it: moving your own assets
            between networks is neither income nor a disposal (spec 067 FR-036). */}
        {overall.movedUsd > 0 && (
          <li>
            Moved between your own networks: USD {overall.movedUsd.toFixed(2)} — not income and not a
            disposal, so it is excluded from the overall above.
          </li>
        )}
        {(overall.platformFeesUsd > 0 || overall.platformFeeUnknownCount > 0) && (
          <li>
            Platform fees charged: USD {(overall.platformFeesUsd || 0).toFixed(2)}
            {overall.platformFeeUnknownCount > 0
              ? ` · ${overall.platformFeeUnknownCount} entr${overall.platformFeeUnknownCount === 1 ? 'y' : 'ies'} with a platform fee that could not be valued in USD (shown as “unknown”, excluded from this total)`
              : ''}
          </li>
        )}
      </ul>
      {byClass.length > 0 && (
        <>
          <h4>Totals by activity type</h4>
          <ul>
            {byClass.map((c) => (
              // The human name, not the raw class: "pool" alone cannot tell a
              // wager pool from a liquidity pool (FR-039a).
              <li key={c.class}>
                {c.label || classLabel(c.class)}: {c.count} entr{c.count === 1 ? 'y' : 'ies'} — USD{' '}
                {c.usdValue.toFixed(2)}
                {c.movedUsd ? ` · moved between your own networks: USD ${c.movedUsd.toFixed(2)}` : ''}
                {c.platformFeesUsd ? ` · platform fees: USD ${c.platformFeesUsd.toFixed(2)}` : ''}
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

  // Statement type + sections (issue #1026). Defaults to the complete account
  // statement, so a member who never opens the options gets the whole record.
  const [statementOptions, setStatementOptions] = useState({
    type: STATEMENT_TYPES.FULL,
    classes: null,
    sections: defaultSections(),
  })

  const generating = status === REPORT_STATUS.GENERATING

  // One-click: build the current month-to-date report and download it as a PDF.
  const exportCurrentMonth = async () => {
    const built = await generate({ kind: PERIOD_KINDS.CURRENT_MONTH })
    if (built) downloadPdf(built, statementOptions)
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
        Generate a statement of your on-chain activity — wagers, transfers, bridges, liquidity, wager
        pools, earn, and membership — for a chosen period on the connected network. Choose a statement
        type and what to include below. This is an informational record, not tax advice.
      </p>

      <div className="report-quick-actions">
        <button type="button" className="report-quick-btn" onClick={exportCurrentMonth} disabled={generating}>
          Export current month (PDF)
        </button>
      </div>

      <StatementOptions value={statementOptions} onChange={setStatementOptions} disabled={generating} />

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
            <>
              <p className="report-empty">
                {report.source === 'ledger'
                  ? 'No activity in this period.'
                  : 'No wager activity in this period.'}
              </p>
              {/*
                The coverage note used to live only in the non-empty branch, which suppressed it
                exactly when it mattered most: a period in which EVERY class failed to load
                rendered as a bare "No activity in this period." — a total data-collection failure
                presented as a truthful zero, and the one case a member cannot detect. An empty
                report with unread classes is not a report of no activity; it is a report that
                could not look.
              */}
              {report.staleClasses?.length > 0 && (
                <p className="report-note" role="status">
                  {`This is not a confirmed zero: ${report.staleClasses.join(', ')} could not be read for this network, so activity in those categories would not appear here.`}
                </p>
              )}
            </>
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
              {report.selfTransferNote && (
                <p className="report-note">{report.selfTransferNote}</p>
              )}
              <Totals totals={report.totals} showByClass={report.source === 'ledger'} />
            </>
          )}
          <div className="report-download-actions">
            {/* The PDF is the statement, so it carries the type and section
                choices; the CSV is the complete machine-readable record and is
                deliberately never narrowed by them. */}
            <button type="button" onClick={() => downloadPdf(undefined, statementOptions)}>
              Download statement (PDF)
            </button>
            <button type="button" onClick={() => downloadCsv()}>Download full data (CSV)</button>
          </div>
        </div>
      )}

      {/* A re-download must honour the SAME statement choices as a fresh one.
          Passing `redownload` straight through dropped them, so a member who
          picked a wagering statement got a full account statement back from
          their own history — with different totals under the same label. */}
      <ReportHistoryList
        entries={entries}
        onRedownload={(entry, format) => redownload(entry, format, statementOptions)}
        onRemove={removeEntry}
      />
    </div>
  )
}
