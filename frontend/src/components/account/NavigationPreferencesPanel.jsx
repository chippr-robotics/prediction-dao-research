import { useState } from 'react'
import AccordionSection from './AccordionSection'
import NavIcon from '../nav/NavIcon'
import { NAV_DENSITIES, loadNavDensity, setNavDensity } from '../../lib/nav/navPreferences'
import './NavigationPreferencesPanel.css'

/**
 * NavigationPreferencesPanel (spec 081 US4) — row density for the global nav menu.
 *
 * Device-scoped and applied with no reload: the store notifies its subscribers on commit and the
 * drawer re-reads, so the member sees the change on the menu they are about to open rather than
 * being told to refresh. One collapsed card on the Settings tab, in the same shape as the other
 * preference panels: its header states the current value so the tab scans without opening anything.
 *
 * Compact tightens padding and type but never takes an interactive target below 36x36 CSS px —
 * above WCAG 2.2 AA Target Size (Minimum). That floor is enforced in AppNavDrawer.css and asserted
 * in the density test; it is not a matter of taste.
 */

const DENSITY_LABELS = { comfortable: 'Comfortable', compact: 'Compact' }
const DENSITY_HINTS = {
  comfortable: 'Roomier rows, tuned for touch.',
  compact: 'Tighter rows and smaller labels — about a third more of the menu on screen at once.',
}

function NavigationPreferencesPanel() {
  // The setter persists synchronously; a local bump re-reads storage so the checked state is
  // always current.
  const [, forceRender] = useState(0)
  const density = loadNavDensity()

  const pickDensity = (next) => {
    setNavDensity(next)
    forceRender((n) => n + 1)
  }

  return (
    <AccordionSection
      id="menu-density"
      title="Menu density"
      summary={DENSITY_LABELS[density]}
      icon={<NavIcon name="menu" size={18} />}
      className="navigation-preferences-panel"
    >
      <p className="navigation-preferences-panel-hint">
        How tightly the navigation menu draws its rows. This is a per-device setting and applies
        straight away.
      </p>

      <fieldset className="navigation-preferences-group">
        <legend className="navigation-preferences-legend">Density</legend>
        <div className="navigation-preferences-options" role="radiogroup" aria-label="Menu density">
          {NAV_DENSITIES.map((value) => (
            <label
              key={value}
              className={`navigation-preferences-option ${density === value ? 'active' : ''}`}
            >
              <input
                type="radio"
                name="nav-density"
                value={value}
                checked={density === value}
                onChange={() => pickDensity(value)}
              />
              <span>{DENSITY_LABELS[value]}</span>
            </label>
          ))}
        </div>
        <p className="navigation-preferences-note">{DENSITY_HINTS[density]}</p>
      </fieldset>
    </AccordionSection>
  )
}

export default NavigationPreferencesPanel
