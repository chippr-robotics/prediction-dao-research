import { useState } from 'react'
import { QUICK_ACCESS_CARDS } from '../../constants/quickAccessCards'
import { isCardVisible, setCardVisible } from '../../utils/quickAccessPreference'
import './PreferencesPanel.css'

/**
 * PreferencesPanel — lets a user choose which quick access cards show on
 * the dashboard (spec 038 FR-013/FR-015). Device-scoped, no wallet required.
 */
function PreferencesPanel() {
  // Re-derive visibility from storage on every render of this local state
  // bump; setCardVisible persists synchronously so reading it back here is
  // always current with the toggle that was just clicked.
  const [, forceRender] = useState(0)

  const handleToggle = (id, nextVisible) => {
    setCardVisible(id, nextVisible)
    forceRender((n) => n + 1)
  }

  return (
    <div className="preferences-panel">
      <h3 className="preferences-panel-title">Quick access cards</h3>
      <p className="preferences-panel-hint">
        Choose which cards appear on your quick access view. Hidden cards can be turned back on anytime.
      </p>
      <ul className="preferences-panel-list">
        {QUICK_ACCESS_CARDS.map((card) => {
          const visible = isCardVisible(card.id)
          const switchId = `pref-card-${card.id}`
          return (
            <li key={card.id} className="preferences-panel-row">
              <label htmlFor={switchId} className="preferences-panel-label">{card.label}</label>
              <button
                id={switchId}
                type="button"
                role="switch"
                aria-checked={visible}
                className={`preferences-panel-switch ${visible ? 'on' : ''}`}
                onClick={() => handleToggle(card.id, !visible)}
              >
                <span className="preferences-panel-switch-thumb" aria-hidden="true" />
                <span className="sr-only">{visible ? 'Visible on quick access' : 'Hidden from quick access'}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default PreferencesPanel
