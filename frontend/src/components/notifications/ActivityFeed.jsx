import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWagerActivity } from '../../hooks/useWagerActivity'
import './ActivityFeed.css'

const SEVERITY_ICONS = { success: '✓', warning: '⚠', error: '✗', info: 'ℹ' }
const STALE_AFTER_MS = 5 * 60_000

function relativeTime(thenMs, nowMs) {
  const diff = Math.max(0, nowMs - thenMs)
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

/**
 * Activity feed panel (spec 012, FR-002/FR-003/FR-004). Opening the feed does
 * NOT mark entries read — acknowledging an entry (which also navigates to the
 * wager) or the explicit "Mark all read" control does.
 */
function ActivityFeed({ onClose }) {
  const navigate = useNavigate()
  const { entries, unreadCount, lastPolledAt, markEntryRead, markAllRead } = useWagerActivity()
  const panelRef = useRef(null)

  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  // Clock snapshot taken once per open — the panel remounts on every open,
  // so relative times are fresh enough without an impure render read.
  const [now] = useState(() => Date.now())
  const isStale = lastPolledAt != null && now - lastPolledAt > STALE_AFTER_MS

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
    }
  }

  const acknowledge = (entry) => {
    markEntryRead(entry.id)
    onClose()
    navigate('/app', { state: { openWagerId: String(entry.wagerId) } })
  }

  return (
    <div
      className="activity-feed"
      role="dialog"
      aria-label="Wager activity"
      tabIndex={-1}
      ref={panelRef}
      onKeyDown={handleKeyDown}
    >
      <div className="activity-feed-header">
        <span className="activity-feed-title">Activity</span>
        {unreadCount > 0 && (
          <button type="button" className="activity-feed-mark-all" onClick={() => markAllRead()}>
            Mark all read
          </button>
        )}
      </div>
      {isStale && (
        <p className="activity-feed-stale">Updated {relativeTime(lastPolledAt, now)}</p>
      )}
      {entries.length === 0 ? (
        <p className="activity-feed-empty">You&rsquo;re all caught up</p>
      ) : (
        <ul className="activity-feed-list">
          {entries.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                className={[
                  'activity-feed-entry',
                  `severity-${entry.severity}`,
                  entry.read ? '' : 'unread',
                  entry.actionable ? 'actionable' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => acknowledge(entry)}
              >
                <span className="entry-icon" aria-hidden="true">
                  {SEVERITY_ICONS[entry.severity] || SEVERITY_ICONS.info}
                </span>
                <span className="entry-message">{entry.message}</span>
                <span className="entry-time">{relativeTime(entry.createdAt, now)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default ActivityFeed
