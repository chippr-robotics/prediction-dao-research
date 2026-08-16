/**
 * TaxReportsPanel — the "Reporting" tab in My Account
 * (spec 016-wager-tax-report, extended by spec 051; contracts/reports-ui.md;
 * redesigned for issue #1026).
 *
 * The page is now a statement CENTRE rather than a form: one primary action,
 * the statement you just made, and the ones you made before. Every choice —
 * type, period, sections — moved into StatementSheet, so nothing a member has
 * to read stands between them and the thing they came for.
 *
 * What did NOT move is the disclosure. A statement that could not read part of
 * your activity, or that excluded failed operations from its totals, says so
 * here as well as on the document, because the figures on this page are the
 * ones a member checks first.
 */

import { useCallback, useState } from 'react'
import { useTaxReport, REPORT_STATUS } from '../../hooks/useTaxReport'
import NavIcon from '../nav/NavIcon'
import StatementSheet from './reporting/StatementSheet'
import './reporting/Reporting.css'
import { buildStatementModel, formatUsd, formatUsdSigned } from '../../data/reports/statement/model'
import { TYPE_ICONS } from './reporting/reportingIcons'

/** The figures a member checks before opening the file. */
function ResultCard({ report, statement, onDownload, onRemake }) {
  const model = buildStatementModel(report, statement)
  const summary = model.summary
  const empty = model.settled.length === 0 && model.failed.length === 0

  return (
    <section className="statement-result" aria-label="Latest statement">
      <header className="statement-result-head">
        <span className="statement-result-icon" aria-hidden="true">
          <NavIcon name={TYPE_ICONS[model.type] || 'bank'} size={20} />
        </span>
        <div className="statement-result-title">
          <h4>{model.title}</h4>
          <p>
            {model.period.label} · {model.networkName}
            {model.isTestnet ? ' · testnet' : ''}
          </p>
        </div>
      </header>

      {empty ? (
        <p className="statement-result-empty">No activity recorded for this period.</p>
      ) : (
        <dl className="statement-result-figures">
          <div>
            <dt>In</dt>
            <dd className="is-positive">{formatUsd(summary.moneyIn)}</dd>
          </div>
          <div>
            <dt>Out</dt>
            <dd className="is-negative">{formatUsd(summary.moneyOut)}</dd>
          </div>
          <div>
            <dt>Net</dt>
            <dd className={summary.net < 0 ? 'is-negative' : 'is-positive'}>{formatUsdSigned(summary.net)}</dd>
          </div>
          <div>
            <dt>Entries</dt>
            <dd>{summary.entryCount}</dd>
          </div>
        </dl>
      )}

      {/* The same qualifications the document prints, at the point a member
          first reads the numbers. */}
      <ul className="statement-result-notes">
        {model.staleClasses.length > 0 && (
          <li className="is-warning">
            <NavIcon name="alert" size={14} />
            {`${model.staleClassLabels.join(', ')} could not be read — these figures may understate your activity.`}
          </li>
        )}
        {summary.failedCount > 0 && (
          <li>
            <NavIcon name="ban" size={14} />
            {`${summary.failedCount} failed operation${summary.failedCount === 1 ? '' : 's'} listed, excluded from every total.`}
          </li>
        )}
        {model.scopeNote && (
          <li className="is-warning">
            <NavIcon name="alert" size={14} />
            Partial statement — other activity in this period is not included.
          </li>
        )}
      </ul>

      <div className="statement-result-actions">
        <button type="button" className="statement-primary-btn is-compact" onClick={() => onDownload('pdf')}>
          <NavIcon name="download" size={16} />
          PDF
        </button>
        <button type="button" className="statement-secondary-btn" onClick={() => onDownload('csv')}>
          <NavIcon name="table" size={15} />
          CSV
        </button>
        <button type="button" className="statement-ghost-btn" onClick={onRemake}>
          Change
        </button>
      </div>
    </section>
  )
}

function SavedStatements({ entries, onRedownload, onRemove }) {
  if (!entries.length) {
    return (
      <p className="statement-saved-empty">
        Statements you generate are listed here and can be re-made at any time from the chain.
      </p>
    )
  }
  return (
    <ul className="statement-saved-list">
      {entries.map((entry) => (
        <li key={entry.id} className="statement-saved-item">
          <span className="statement-saved-icon" aria-hidden="true">
            <NavIcon name="reports" size={18} />
          </span>
          <span className="statement-saved-meta">
            <span className="statement-saved-label">{entry.label || 'Statement'}</span>
            <span className="statement-saved-date">
              Generated {new Date(entry.createdAt).toLocaleDateString()}
            </span>
          </span>
          <span className="statement-saved-actions">
            <button
              type="button"
              className="statement-icon-btn"
              onClick={() => onRedownload(entry, 'pdf')}
              aria-label={`Re-download ${entry.label} as PDF`}
              title="PDF"
            >
              <NavIcon name="download" size={16} />
            </button>
            <button
              type="button"
              className="statement-icon-btn"
              onClick={() => onRedownload(entry, 'csv')}
              aria-label={`Re-download ${entry.label} as CSV`}
              title="CSV"
            >
              <NavIcon name="table" size={16} />
            </button>
            <button
              type="button"
              className="statement-icon-btn is-danger"
              onClick={() => onRemove(entry.id)}
              aria-label={`Remove ${entry.label}`}
              title="Remove"
            >
              <NavIcon name="ban" size={16} />
            </button>
          </span>
        </li>
      ))}
    </ul>
  )
}

export default function TaxReportsPanel({ hookOptions, previewOpenSheet = false } = {}) {
  const {
    account, chainId, status, progress, report, error, entries,
    generate, downloadPdf, downloadCsv, redownload, removeEntry,
  } = useTaxReport(hookOptions)

  const [sheetOpen, setSheetOpen] = useState(previewOpenSheet)
  // The choices the CURRENT result was built from. Held so a re-download and a
  // history re-make reproduce the same statement rather than a default one.
  const [statement, setStatement] = useState(null)

  const generating = status === REPORT_STATUS.GENERATING
  const networkName = hookOptions?.getNetwork?.(chainId)?.name || null

  const handleGenerate = useCallback(
    async ({ format, period, statement: choices }) => {
      setStatement(choices)
      const built = await generate(period)
      if (!built) return
      setSheetOpen(false)
      if (format === 'csv') downloadCsv(built)
      else downloadPdf(built, choices)
    },
    [generate, downloadCsv, downloadPdf],
  )

  const handleDownload = useCallback(
    (format) => {
      if (format === 'csv') downloadCsv()
      else downloadPdf(undefined, statement || {})
    },
    [downloadCsv, downloadPdf, statement],
  )

  if (!account) {
    return (
      <div className="tax-reports-section">
        <p className="statement-connect">Connect your wallet to generate a statement.</p>
      </div>
    )
  }

  return (
    <div className="tax-reports-section">
      <header className="statement-centre-head">
        <div className="statement-centre-copy">
          <h3>Statements</h3>
          <p>A record of your on-chain activity you can file, share or hand to an accountant.</p>
        </div>
        <button
          type="button"
          className="statement-primary-btn"
          onClick={() => setSheetOpen(true)}
          disabled={generating}
        >
          <NavIcon name="plus" size={17} />
          {/* Wrapped so the icon is not `svg:only-child` — the global icon-only
              padding reset in index.css counts element children only, and would
              otherwise strip this button's padding and push the label outside
              its own pill (spec 090 screenshot round 2). */}
          <span>New statement</span>
        </button>
      </header>

      <div aria-live="polite" className="statement-status">
        {generating && (
          <p className="statement-progress">
            <span className="statement-spinner" aria-hidden="true" />
            {progress.label} ({Math.round(progress.fraction * 100)}%)
          </p>
        )}
        {/* While the sheet is open it owns the error, so the member reads it
            once rather than seeing the same alert twice through the scrim. */}
        {status === REPORT_STATUS.ERROR && error && !sheetOpen && (
          <p className="statement-error" role="alert">
            <NavIcon name="alert" size={15} />
            {error}
          </p>
        )}
      </div>

      {status === REPORT_STATUS.READY && report && (
        <ResultCard
          report={report}
          statement={statement || {}}
          onDownload={handleDownload}
          onRemake={() => setSheetOpen(true)}
        />
      )}

      <section className="statement-saved">
        <h4>Saved statements</h4>
        <SavedStatements
          entries={entries}
          // A re-make honours the same choices as a fresh statement; passing the
          // raw handler would silently return a different document under the
          // same label.
          onRedownload={(entry, format) => redownload(entry, format, statement || {})}
          onRemove={removeEntry}
        />
      </section>

      <p className="statement-legal">
        Informational record of on-chain activity — not tax advice, and not a statement of account balances.
      </p>

      {sheetOpen && (
        <StatementSheet
          onClose={() => setSheetOpen(false)}
          onGenerate={handleGenerate}
          busy={generating}
          error={status === REPORT_STATUS.ERROR ? error : null}
          nowMs={hookOptions?.now?.()}
          networkName={networkName}
          account={account}
        />
      )}
    </div>
  )
}
