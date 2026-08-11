import { useUserPreferences } from '../../hooks/useUserPreferences'
import AccordionSection from './AccordionSection'
import NavIcon from '../nav/NavIcon'
import './PortfolioPreferencesPanel.css'

/**
 * PortfolioPreferencesPanel — the "Portfolio" card of the Settings tab
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

  // Collapsed summary states BOTH switches — a member checking "why is my test
  // token missing?" gets the answer without opening anything.
  const summary = `Testnet tokens ${testnetsOn ? 'shown' : 'hidden'} · Zero balances ${
    zerosOn ? 'shown' : 'hidden'
  }`

  return (
    <AccordionSection
      id="portfolio-prefs"
      title="Portfolio"
      summary={summary}
      icon={<NavIcon name="coin" size={18} />}
      className="portfolio-prefs"
    >
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
    </AccordionSection>
  )
}

export default PortfolioPreferencesPanel
