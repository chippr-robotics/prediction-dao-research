import { useState } from 'react'
import { useChainTokens } from '../../hooks/useChainTokens'
import {
  HOME_MODES,
  getDefaultHomeMode,
  setDefaultHomeMode,
  getDefaultCurrencyKind,
  setDefaultCurrencyKind,
} from '../../utils/homePreference'
import './HomePreferencesPanel.css'

/**
 * HomePreferencesPanel (spec 058 US4) — choose which mode the home surface
 * opens in (Pay / Request / Wager) and which currency the amount hero starts
 * on. Device-scoped, no wallet required (the choice must apply on first paint
 * at /app, before any connect). Currency options are rendered with the ACTIVE
 * network's real symbols but stored as a network-agnostic kind, so the
 * setting follows the user honestly across networks.
 */

const MODE_LABELS = { pay: 'Pay', request: 'Request', wager: 'Wager' }

function HomePreferencesPanel() {
  // Setters persist synchronously; a local bump re-reads storage so the
  // checked states are always current.
  const [, forceRender] = useState(0)
  const tokens = useChainTokens()

  const mode = getDefaultHomeMode()
  const kind = getDefaultCurrencyKind()

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
        Choose what the app opens on and which currency the amount starts in.
      </p>

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
