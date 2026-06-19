import { Suspense, lazy } from 'react'
import { RANGES } from '../../lib/account/computePnlSeries'
import { formatSignedUsd } from '../../lib/account/format'
import EmptyState from './EmptyState'
import './PnlChart.css'

// Lazy-load the Recharts bundle so it stays out of the initial route chunk.
const PnlChartCanvas = lazy(() => import('./PnlChartCanvas'))

const RANGE_LABEL = { '7D': '7D', '30D': '30D', '90D': '90D', ALL: 'All' }

/**
 * PnlChart — hero cumulative realized-P&L time series (spec 020 US2).
 * Range selector (7D/30D/90D/All, default 30D), accessible point inspection,
 * a screen-reader summary, and an honest empty/low-data state.
 */
function PnlChart({ series, onRangeChange, onCreateWager }) {
  const { range, points, isEmpty, isLowData, endValueUsd } = series

  const rangeLabel = RANGE_LABEL[range] || range
  const srSummary = isEmpty
    ? 'Net profit and loss over time: no activity yet.'
    : `Net profit and loss over the ${rangeLabel} range: ${formatSignedUsd(endValueUsd)}.`

  return (
    <section className="account-chart" aria-label="Performance over time">
      <header className="account-chart-head">
        <h3 className="account-chart-title">Net P&amp;L over time</h3>
        <div className="account-range" role="group" aria-label="Chart time range">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              className={`account-range-btn${r === range ? ' active' : ''}`}
              aria-pressed={r === range}
              onClick={() => onRangeChange?.(r)}
            >
              {RANGE_LABEL[r]}
            </button>
          ))}
        </div>
      </header>

      <p className="sr-only">{srSummary}</p>

      {isEmpty ? (
        <EmptyState
          title="No performance history yet"
          message="Create or accept your first wager to start tracking your net profit and loss over time."
          ctaLabel={onCreateWager ? 'Create a wager' : undefined}
          onCta={onCreateWager}
        />
      ) : (
        <>
          <Suspense fallback={<div className="account-chart-loading" aria-hidden="true">Loading chart…</div>}>
            <PnlChartCanvas points={points} />
          </Suspense>
          {isLowData && (
            <p className="account-chart-note">Not enough activity yet to show a full trend.</p>
          )}
          {/* Screen-reader data table fallback */}
          <table className="sr-only">
            <caption>Cumulative net P&amp;L by date ({rangeLabel})</caption>
            <thead>
              <tr><th>Date</th><th>Cumulative net P&amp;L (USD)</th></tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.timestamp}>
                  <td>{new Date(p.timestamp).toLocaleDateString()}</td>
                  <td>{formatSignedUsd(p.cumulativeUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  )
}

export default PnlChart
