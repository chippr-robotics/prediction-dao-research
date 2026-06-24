import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useActivity } from '../../hooks/useActivity'
import { domainLabel } from '../../data/notifications/domains'
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
 * Unified activity feed panel (spec 031; generalizes spec 012). Renders entries from EVERY domain
 * (wagers, DAO, token, membership) with a per-domain tag, a view-only per-domain filter, and a generic
 * deep-link. Opening the feed does NOT mark entries read — acknowledging an entry (which navigates) or the
 * explicit "Mark all read" control does.
 */
function ActivityFeed({ onClose }) {
  const navigate = useNavigate()
  const { entries, unreadCount, lastPolledAt, markEntryRead, markAllRead } = useActivity()
  const panelRef = useRef(null)
  // View-only domain filter (FR-025): local, resets on open, never touches entries/unread/action-needed.
  const [domainFilter, setDomainFilter] = useState(null)

  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  // Clock snapshot taken once per open — the panel remounts on every open.
  const [now] = useState(() => Date.now())
  const isStale = lastPolledAt != null && now - lastPolledAt > STALE_AFTER_MS

  const domains = useMemo(
    () => [...new Set((entries || []).map((e) => e.domain || 'wagers'))],
    [entries]
  )
  const shown = useMemo(
    () => (domainFilter ? entries.filter((e) => (e.domain || 'wagers') === domainFilter) : entries),
    [entries, domainFilter]
  )

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
    }
  }

  const acknowledge = (entry) => {
    markEntryRead(entry.id)
    onClose()
    if (entry.link?.to) {
      navigate(entry.link.to, entry.link.state ? { state: entry.link.state } : undefined)
      return
    }
    // Fallback for migrated/legacy wager entries that predate `link`.
    const refId = entry.refId ?? (entry.wagerId != null ? String(entry.wagerId) : null)
    if (refId && (entry.domain || 'wagers') === 'wagers') {
      navigate('/app', { state: { openWagerId: refId } })
    }
  }

  return (
    <div
      className="activity-feed"
      role="dialog"
      aria-label="Activity"
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

      {domains.length > 1 && (
        <div className="activity-feed-filters" role="group" aria-label="Filter activity by domain">
          <button
            type="button"
            className={`activity-feed-filter${domainFilter === null ? ' active' : ''}`}
            aria-pressed={domainFilter === null}
            onClick={() => setDomainFilter(null)}
          >
            All
          </button>
          {domains.map((d) => (
            <button
              key={d}
              type="button"
              className={`activity-feed-filter${domainFilter === d ? ' active' : ''}`}
              aria-pressed={domainFilter === d}
              onClick={() => setDomainFilter(d)}
            >
              {domainLabel(d)}
            </button>
          ))}
        </div>
      )}

      {isStale && <p className="activity-feed-stale">Updated {relativeTime(lastPolledAt, now)}</p>}
      {shown.length === 0 ? (
        <p className="activity-feed-empty">You&rsquo;re all caught up</p>
      ) : (
        <ul className="activity-feed-list">
          {shown.map((entry) => (
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
                <span className="entry-body">
                  <span className="entry-domain">{domainLabel(entry.domain || 'wagers')}</span>
                  <span className="entry-message">{entry.message}</span>
                </span>
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
