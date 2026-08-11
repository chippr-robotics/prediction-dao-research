import { useUserPreferences } from '../../hooks/useUserPreferences'
import { usePrivacy } from '../../hooks/usePrivacy'
import AccordionSection from './AccordionSection'
import NavIcon from '../nav/NavIcon'
import './PrivacyPreferencesPanel.css'

/**
 * PrivacyPreferencesPanel — the "Privacy" card of the Settings tab (spec 047).
 *
 * A single app-wide tilt-to-hide switch (default on). On devices without motion
 * sensing (desktop / sensor-less) or where motion access is denied, the panel
 * explains the feature is mobile-only and currently inactive, and — where the
 * platform requires it (iOS) — enabling triggers the motion-permission prompt
 * from the tap gesture.
 */
function PrivacyPreferencesPanel() {
  const { preferences, setTiltToHide } = useUserPreferences()
  const { support, permission, requestMotionPermission } = usePrivacy()

  const on = preferences?.tiltToHide !== false
  const unsupported = support === 'unsupported'
  const denied = permission === 'denied'

  const handleToggle = () => {
    const next = !on
    setTiltToHide(next)
    // On iOS the sensor needs an explicit, gesture-triggered permission grant.
    if (next && permission !== 'granted') {
      requestMotionPermission()
    }
  }

  let sub
  if (!on) {
    sub = 'Off — balances stay visible regardless of how you hold your phone.'
  } else if (unsupported) {
    sub = 'On — but tilt-to-hide needs a mobile device with motion sensing, so it is inactive here.'
  } else if (denied) {
    sub = 'On — but motion access was denied, so balances cannot hide. Allow motion access to use it.'
  } else {
    sub = 'On — balances hide when you lay your phone flat and show when you hold it up.'
  }

  // The collapsed summary must not claim the feature is working when it cannot:
  // "On" on a sensor-less or permission-denied device says so in the header.
  let summary = 'Tilt to hide off'
  if (on && unsupported) summary = 'Tilt to hide on — inactive on this device'
  else if (on && denied) summary = 'Tilt to hide on — motion access denied'
  else if (on) summary = 'Tilt to hide on'

  return (
    <AccordionSection
      id="privacy-prefs"
      title="Privacy"
      summary={summary}
      badge={on && (unsupported || denied) ? 'Inactive' : null}
      badgeTone="warn"
      icon={<NavIcon name="lock" size={18} />}
      className="privacy-prefs"
    >
      <div className="privacy-prefs-row">
        <div className="privacy-prefs-text">
          <span className="privacy-prefs-label" id="privacy-prefs-tilt-label">
            Hide balances when phone is flat
          </span>
          <span className="privacy-prefs-sub">{sub}</span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby="privacy-prefs-tilt-label"
          className={`privacy-prefs-switch ${on ? 'on' : ''}`}
          onClick={handleToggle}
        >
          <span className="sr-only">{on ? 'Tilt to hide on' : 'Tilt to hide off'}</span>
        </button>
      </div>
    </AccordionSection>
  )
}

export default PrivacyPreferencesPanel
