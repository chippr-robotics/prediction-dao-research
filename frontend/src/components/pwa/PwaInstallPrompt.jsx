import { useEffect, useMemo, useRef, useState } from 'react'
import { usePwaInstall } from '../../hooks/usePwaInstall'
import './PwaInstallPrompt.css'

// Small delay before the sheet rises, so it doesn't slam up the instant the page paints.
const SHOW_DELAY_MS = 1200

/**
 * PwaInstallPrompt — a bottom-sheet (mobile) / centered card (desktop) that invites
 * the visitor to install FairWins as an app when they're browsing in a normal tab.
 *
 * Visibility rules (all must hold):
 *   - not already running standalone / installed,
 *   - the user hasn't permanently opted out ("Don't show again" → Preferences toggle),
 *   - the user hasn't dismissed it for this session,
 *   - AND either a native install prompt is available (Chromium) or we're on iOS
 *     Safari (which needs manual Add-to-Home-Screen instructions).
 */
export default function PwaInstallPrompt() {
  const {
    isStandalone,
    isIos,
    canPrompt,
    hidden,
    snoozed,
    promptInstall,
    dismissForSession,
    setHidden,
  } = usePwaInstall()

  const [ready, setReady] = useState(false)
  const panelRef = useRef(null)

  const eligible = useMemo(
    () => !isStandalone && !hidden && !snoozed && (canPrompt || isIos),
    [isStandalone, hidden, snoozed, canPrompt, isIos]
  )

  // Delay the reveal slightly once eligible; reset on cleanup so a later
  // eligibility flip re-arms the delay rather than showing instantly.
  useEffect(() => {
    if (!eligible) return undefined
    const t = setTimeout(() => setReady(true), SHOW_DELAY_MS)
    return () => {
      clearTimeout(t)
      setReady(false)
    }
  }, [eligible])

  const open = eligible && ready

  // Escape closes (session-dismiss); lock background scroll; move focus into the sheet.
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') dismissForSession()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, dismissForSession])

  if (!open) return null

  const handleInstall = async () => {
    const outcome = await promptInstall()
    // Whether accepted or dismissed, don't nag again this session.
    if (outcome !== 'unavailable') dismissForSession()
  }

  const handleDontShowAgain = () => {
    setHidden(true)
  }

  return (
    <div
      className="pwa-install-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) dismissForSession()
      }}
    >
      <div
        ref={panelRef}
        className="pwa-install-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pwa-install-title"
        aria-describedby="pwa-install-desc"
        tabIndex={-1}
      >
        <div className="pwa-install-handle" aria-hidden="true" />

        <button
          type="button"
          className="pwa-install-close"
          onClick={dismissForSession}
          aria-label="Dismiss install prompt"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>

        <div className="pwa-install-head">
          <span className="pwa-install-icon" aria-hidden="true">
            <img src="/assets/fairwins_no-text_logo.svg" alt="" width="40" height="40" />
          </span>
          <div>
            <h3 id="pwa-install-title" className="pwa-install-title">Install FairWins</h3>
            <p id="pwa-install-desc" className="pwa-install-desc">
              Install the app on your device to easily access it anytime. No app store.
              No download. No hassle.
            </p>
          </div>
        </div>

        {isIos && !canPrompt ? (
          <ol className="pwa-install-ios-steps" aria-label="How to install on iOS">
            <li>
              Tap the Share icon
              <span className="pwa-install-ios-share" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M12 3v12M8 7l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              in the toolbar
            </li>
            <li>Select <strong>Add to Home Screen</strong></li>
          </ol>
        ) : (
          <button type="button" className="pwa-install-cta" onClick={handleInstall}>
            Install
          </button>
        )}

        <div className="pwa-install-actions">
          <button type="button" className="pwa-install-secondary" onClick={dismissForSession}>
            Continue in browser
          </button>
          <button type="button" className="pwa-install-dont-show" onClick={handleDontShowAgain}>
            Don&apos;t show again
          </button>
        </div>
      </div>
    </div>
  )
}
