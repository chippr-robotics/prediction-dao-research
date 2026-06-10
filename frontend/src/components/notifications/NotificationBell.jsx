import { useState } from 'react'
import { useWallet } from '../../hooks/useWalletManagement'
import { useWagerActivityOptional } from '../../hooks/useWagerActivity'
import ActivityFeed from './ActivityFeed'
import './NotificationBell.css'

/**
 * Header bell — the single unread indicator for wager activity (spec 012,
 * FR-002/FR-004/FR-016). Renders nothing when disconnected or outside the
 * WagerActivityProvider (e.g. landing pages), so it can sit unconditionally
 * in the header actions.
 */
function NotificationBell() {
  const { isConnected } = useWallet()
  const activity = useWagerActivityOptional()
  const [open, setOpen] = useState(false)

  if (!activity || !isConnected) return null
  const { unreadCount } = activity

  return (
    <div className="notification-bell-wrap">
      <button
        type="button"
        className="notification-bell"
        aria-label={`Notifications, ${unreadCount} unread`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <svg
          className="notification-bell-icon"
          aria-hidden="true"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="notification-bell-count" data-testid="bell-count" aria-hidden="true">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
      {open && <ActivityFeed onClose={() => setOpen(false)} />}
    </div>
  )
}

export default NotificationBell
