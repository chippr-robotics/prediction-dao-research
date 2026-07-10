import { useUserPreferences } from '../../hooks/useUserPreferences'
import './PortfolioPreferencesPanel.css'

/**
 * PortfolioPreferencesPanel — the "Portfolio" area of the Preferences tab
 * (spec 044 follow-up). One switch: whether the cross-chain portfolio also
 * scans and lists assets on test networks (Sepolia, Amoy, Mordor).
 */
function PortfolioPreferencesPanel() {
  const { preferences, setShowTestnetAssets } = useUserPreferences()
  const on = Boolean(preferences?.showTestnetAssets)

  return (
    <div className="portfolio-prefs">
      <h3 className="portfolio-prefs-title">Portfolio</h3>
      <div className="portfolio-prefs-row">
        <div className="portfolio-prefs-text">
          <span className="portfolio-prefs-label" id="portfolio-prefs-testnet-label">
            Show testnet tokens
          </span>
          <span className="portfolio-prefs-sub">
            {on
              ? 'On — the portfolio also lists assets on test networks (Sepolia, Amoy, Mordor).'
              : 'Off — the portfolio lists mainnet assets only (Ethereum, Ethereum Classic, Polygon).'}
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby="portfolio-prefs-testnet-label"
          className={`portfolio-prefs-switch ${on ? 'on' : ''}`}
          onClick={() => setShowTestnetAssets(!on)}
        >
          <span className="sr-only">
            {on ? 'Testnet tokens shown' : 'Testnet tokens hidden'}
          </span>
        </button>
      </div>
    </div>
  )
}

export default PortfolioPreferencesPanel
