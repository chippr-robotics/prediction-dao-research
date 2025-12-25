import './DevelopmentWarningBanner.css'

/**
 * Persistent warning banner displayed at the top of the site
 * to inform users that the site is under active development
 */
function DevelopmentWarningBanner() {
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
            href="https://chipprhots.com" 
            target="_blank" 
            rel="noopener noreferrer"
            className="dev-warning-link"
          >
            Visit chipprhots.com
          </a>
          {' '}for updates.
        </span>
      </div>
    </div>
  )
}

export default DevelopmentWarningBanner
