/**
 * ReportHistoryList — lists a user's previously generated reports (metadata)
 * with re-download and remove actions (spec 016-wager-tax-report,
 * FR-010/FR-011; contracts/reports-ui.md). Documents are regenerated on demand;
 * only metadata is stored.
 */

export default function ReportHistoryList({ entries = [], onRedownload, onRemove }) {
  if (!entries.length) {
    return <p className="report-history-empty">No saved reports yet.</p>
  }

  return (
    <div className="report-history">
      <h4>Saved reports</h4>
      <ul className="report-history-list">
        {entries.map((entry) => (
          <li key={entry.id} className="report-history-item">
            <div className="report-history-meta">
              <span className="report-history-label">{entry.label || 'Report'}</span>
              <span className="report-history-date">
                Generated {new Date(entry.createdAt).toLocaleDateString()}
              </span>
            </div>
            <div className="report-history-actions">
              <button type="button" onClick={() => onRedownload?.(entry, 'pdf')} aria-label={`Re-download ${entry.label} as PDF`}>
                PDF
              </button>
              <button type="button" onClick={() => onRedownload?.(entry, 'csv')} aria-label={`Re-download ${entry.label} as CSV`}>
                CSV
              </button>
              <button type="button" className="report-history-remove" onClick={() => onRemove?.(entry.id)} aria-label={`Remove ${entry.label}`}>
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
