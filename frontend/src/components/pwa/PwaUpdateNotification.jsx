import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePwaUpdate } from '../../hooks/usePwaUpdate'
import './PwaUpdateNotification.css'

/**
 * PwaUpdateNotification — a small, dismissible toast shown when a newer version of the
 * installed app is ready. It doesn't apply the update itself; it routes the user to the
 * Software Update section of their wallet Preferences, where they confirm and install.
 */
export default function PwaUpdateNotification() {
  const { updateReady } = usePwaUpdate()
  const [dismissed, setDismissed] = useState(false)
  const navigate = useNavigate()

  if (!updateReady || dismissed) return null

  const goToUpdate = () => {
    navigate('/wallet?tab=preferences#pwa-update')
    setDismissed(true)
  }

  return (
    <div className="pwa-update-toast" role="status" aria-live="polite">
      <span className="pwa-update-toast-icon" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M21 12a9 9 0 1 1-2.64-6.36" strokeLinecap="round" />
          <path d="M21 3v5h-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <div className="pwa-update-toast-text">
        <strong>Update available</strong>
        <span>A new version of FairWins is ready to install.</span>
      </div>
      <div className="pwa-update-toast-actions">
        <button type="button" className="pwa-update-toast-cta" onClick={goToUpdate}>
          View update
        </button>
        <button
          type="button"
          className="pwa-update-toast-dismiss"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss update notification"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}
