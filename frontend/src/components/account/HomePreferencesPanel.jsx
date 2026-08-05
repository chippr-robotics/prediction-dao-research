import { useState } from 'react'
import { useChainTokens } from '../../hooks/useChainTokens'
import { useIsMobile } from '../../hooks/useMediaQuery'
import {
  HOME_MODES,
  getDefaultHomeMode,
  setDefaultHomeMode,
  getDefaultCurrencyKind,
  setDefaultCurrencyKind,
} from '../../utils/homePreference'
import {
  LANDING_VIEWS,
  getLandingViewPreference,
  setLandingViewPreference,
  resolveLandingView,
} from '../../utils/landingViewPreference'
import './HomePreferencesPanel.css'

/**
 * HomePreferencesPanel (spec 058 US4 + landing-view preference) — choose
 * which screen the app opens on (Home vs Portfolio), which mode the Home
 * surface itself opens in (Pay / Request / Wager), and which currency the
 * amount hero starts on. Device-scoped, no wallet required (the choice must
 * apply on first paint, before any connect). Currency options are rendered
 * with the ACTIVE network's real symbols but stored as a network-agnostic
 * kind, so the setting follows the user honestly across networks.
 */

const MODE_LABELS = { pay: 'Pay', request: 'Request', wager: 'Wager' }
const LANDING_VIEW_LABELS = { auto: 'Auto', home: 'Home', portfolio: 'Portfolio' }

function HomePreferencesPanel() {
  // Setters persist synchronously; a local bump re-reads storage so the
  // checked states are always current.
  const [, forceRender] = useState(0)
  const tokens = useChainTokens()
  const isMobile = useIsMobile()

  const landingView = getLandingViewPreference()
  const mode = getDefaultHomeMode()
  const kind = getDefaultCurrencyKind()

  const pickLandingView = (next) => {
    setLandingViewPreference(next)
    forceRender((n) => n + 1)
  }
  const pickMode = (next) => {
    setDefaultHomeMode(next)
    forceRender((n) => n + 1)
  }
  const pickKind = (next) => {
    setDefaultCurrencyKind(next)
    forceRender((n) => n + 1)
  }

  const currencyOptions = [
    { value: 'stable', label: tokens.stable || 'Stablecoin' },
    { value: 'native', label: tokens.native || 'Network coin' },
  ]

  return (
    <div className="home-preferences-panel">
      <h3 className="home-preferences-panel-title">Home screen</h3>
      <p className="home-preferences-panel-hint">
        Choose which screen the app opens on, what the Home screen starts on, and which currency
        the amount starts in.
      </p>

      <fieldset className="home-preferences-group">
        <legend className="home-preferences-legend">Opens on</legend>
        <div className="home-preferences-options" role="radiogroup" aria-label="Opens on">
          {LANDING_VIEWS.map((v) => (
            <label key={v} className={`home-preferences-option ${landingView === v ? 'active' : ''}`}>
              <input
                type="radio"
                name="landing-default-view"
                value={v}
                checked={landingView === v}
                onChange={() => pickLandingView(v)}
              />
              <span>{LANDING_VIEW_LABELS[v]}</span>
            </label>
          ))}
        </div>
        <p className="home-preferences-note">
          Auto follows this device&apos;s screen size — Home on a phone, Portfolio on a larger
          display (currently {LANDING_VIEW_LABELS[resolveLandingView(isMobile)]} on this device).
        </p>
      </fieldset>

      <fieldset className="home-preferences-group">
        <legend className="home-preferences-legend">Default view</legend>
        <div className="home-preferences-options" role="radiogroup" aria-label="Default home view">
          {HOME_MODES.map((m) => (
            <label key={m} className={`home-preferences-option ${mode === m ? 'active' : ''}`}>
              <input
                type="radio"
                name="home-default-mode"
                value={m}
                checked={mode === m}
                onChange={() => pickMode(m)}
              />
              <span>{MODE_LABELS[m]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="home-preferences-group">
        <legend className="home-preferences-legend">Default currency</legend>
        <div className="home-preferences-options" role="radiogroup" aria-label="Default currency">
          {currencyOptions.map((o) => (
            <label key={o.value} className={`home-preferences-option ${kind === o.value ? 'active' : ''}`}>
              <input
                type="radio"
                name="home-default-currency"
                value={o.value}
                checked={kind === o.value}
                onChange={() => pickKind(o.value)}
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
        <p className="home-preferences-note">
          Shown for the network you&apos;re on now ({tokens.networkName || 'current network'}); the
          choice follows you to each network&apos;s own {tokens.stable ? 'stablecoin' : 'tokens'}.
        </p>
      </fieldset>
    </div>
  )
}

export default HomePreferencesPanel
