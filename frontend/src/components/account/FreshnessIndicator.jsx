import { useEffect, useState } from 'react'
import { formatRelativeTime } from '../../lib/account/format'
import './FreshnessIndicator.css'

/**
 * FreshnessIndicator — "updated Ns ago" + manual refresh (spec 020 US5).
 * Ticks ~1s for display only; shows a stale/error badge without blanking.
 *
 * Four statuses, because a partial read is neither of the other three (#1280):
 * `fresh` everything answered, `refreshing` in flight, `stale`/`error` nothing
 * new arrived so what is shown is last-known, and `partial` — a read DID just
 * happen but not of everything. Labelling a partial read "showing last known"
 * is its own fabrication: on a first load there IS no last-known, and the
 * entries beside it were fetched seconds ago. The panel names what went unread;
 * this line only has to stop claiming the update was complete.
 */
function FreshnessIndicator({ state, onRefresh, label = 'Updated' }) {
  const [, setTick] = useState(0)
  const status = state?.status || 'fresh'

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const isStale = status === 'stale' || status === 'error'

  return (
    <div className="account-freshness">
      {status === 'refreshing' ? (
        <span className="account-freshness-text">Updating…</span>
      ) : isStale ? (
        <span className="account-freshness-badge stale" role="status">Stale — showing last known</span>
      ) : status === 'partial' ? (
        <span className="account-freshness-badge stale" role="status">
          {state?.lastUpdated
            ? `Partly updated ${formatRelativeTime(state.lastUpdated)} — some sources unread`
            : 'Partly updated — some sources unread'}
        </span>
      ) : state?.lastUpdated ? (
        <span className="account-freshness-text">{label} {formatRelativeTime(state.lastUpdated)}</span>
      ) : (
        <span className="account-freshness-text">—</span>
      )}
      {onRefresh && (
        <button
          type="button"
          className="account-freshness-refresh"
          onClick={onRefresh}
          aria-label="Refresh account data"
          disabled={status === 'refreshing'}
        >
          ⟳
        </button>
      )}
    </div>
  )
}

export default FreshnessIndicator
