import { useState, useEffect } from 'react'
import './DevelopmentWarningBanner.css'

const DEV_WARNING_DISMISSED_KEY = 'dev_warning_banner_dismissed'
// Height calculated from: padding (0.75rem * 2 = 1.5rem ≈ 24px) + content height (≈ 20px) ≈ 44-48px
const DEV_BANNER_HEIGHT = '45px'

/**
 * Dismissible warning banner displayed at the top of the site
 * to inform users that the site is under active development
 */
function DevelopmentWarningBanner() {
  // Initialize state from localStorage to avoid effect
  const [isDismissed, setIsDismissed] = useState(() => {
    return localStorage.getItem(DEV_WARNING_DISMISSED_KEY) === 'true'
  })

  // Set CSS custom property for banner height
  useEffect(() => {
    if (!isDismissed) {
      document.documentElement.style.setProperty('--dev-banner-height', DEV_BANNER_HEIGHT)
    } else {
      document.documentElement.style.setProperty('--dev-banner-height', '0px')
    }

    // Cleanup: Reset to 0px when component unmounts
    return () => {
      document.documentElement.style.setProperty('--dev-banner-height', '0px')
    }
  }, [isDismissed])

  const handleDismiss = () => {
    setIsDismissed(true)
    localStorage.setItem(DEV_WARNING_DISMISSED_KEY, 'true')
  }

  if (isDismissed) {
    return null
  }

  return (
    <div 
      className="dev-warning-banner" 
      role="alert"
      aria-live="polite"
    >
      <div className="dev-warning-content">
        <span className="dev-warning-icon" aria-hidden="true">⚠️</span>
        <span className="dev-warning-text">
          This site is under active development. Check back soon!{' '}
          <a 
            href="https://chipprbots.com" 
            target="_blank" 
            rel="noopener noreferrer"
            className="dev-warning-link"
          >
            Visit chipprbots.com
          </a>
          {' '}for updates.
        </span>
        <button
          className="dev-warning-close"
          onClick={handleDismiss}
          aria-label="Dismiss warning banner"
          title="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

export default DevelopmentWarningBanner
