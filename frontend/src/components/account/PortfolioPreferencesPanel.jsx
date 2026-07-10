import { useUserPreferences } from '../../hooks/useUserPreferences'
import './PortfolioPreferencesPanel.css'

/**
 * PortfolioPreferencesPanel — the "Portfolio" area of the Preferences tab
 * (spec 044 v1.1 + v1.2). Two switches: whether the cross-chain portfolio
 * also scans test networks, and whether zero-balance assets are listed
 * (default hidden, FR-023).
 */
function PrefSwitch({ id, label, sub, on, onToggle }) {
  return (
    <div className="portfolio-prefs-row">
      <div className="portfolio-prefs-text">
        <span className="portfolio-prefs-label" id={id}>
          {label}
        </span>
        <span className="portfolio-prefs-sub">{sub}</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby={id}
        className={`portfolio-prefs-switch ${on ? 'on' : ''}`}
        onClick={onToggle}
      >
        <span className="sr-only">{on ? `${label} on` : `${label} off`}</span>
      </button>
    </div>
  )
}

function PortfolioPreferencesPanel() {
  const { preferences, setShowTestnetAssets, setShowZeroBalances } = useUserPreferences()
  const testnetsOn = Boolean(preferences?.showTestnetAssets)
  const zerosOn = Boolean(preferences?.showZeroBalances)

  return (
    <div className="portfolio-prefs">
      <h3 className="portfolio-prefs-title">Portfolio</h3>
      <PrefSwitch
        id="portfolio-prefs-testnet-label"
        label="Show testnet tokens"
        sub={
          testnetsOn
            ? 'On — the portfolio also lists assets on test networks (Sepolia, Amoy, Mordor).'
            : 'Off — the portfolio lists mainnet assets only (Ethereum, Ethereum Classic, Polygon).'
        }
        on={testnetsOn}
        onToggle={() => setShowTestnetAssets(!testnetsOn)}
      />
      <PrefSwitch
        id="portfolio-prefs-zero-label"
        label="Show zero-balance assets"
        sub={
          zerosOn
            ? 'On — assets you hold none of are listed with a 0 balance.'
            : 'Off — only assets with a balance are listed.'
        }
        on={zerosOn}
        onToggle={() => setShowZeroBalances(!zerosOn)}
      />
    </div>
  )
}

export default PortfolioPreferencesPanel
