import { useEffect, useState } from 'react'
import { formatRelativeTime } from '../../lib/account/format'
import './FreshnessIndicator.css'

/**
 * FreshnessIndicator — "updated Ns ago" + manual refresh (spec 020 US5).
 * Ticks ~1s for display only; shows a stale/error badge without blanking.
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
