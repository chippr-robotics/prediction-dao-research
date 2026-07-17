import { useNotificationPreferences } from '../../hooks/useNotificationPreferences'
import {
  NOTIFICATION_CATEGORIES,
  DELIVERY_MODES,
} from '../../lib/notifications/deliveryPreferences'
import { isPushSupported } from '../../lib/notifications/pushDelivery'
import './NotificationPreferencesPanel.css'

const MODE_LABELS = {
  push: 'Push',
  app: 'In-app',
  silent: 'Silent',
}

const MODE_HINTS = {
  push: 'Phone notification + in-app',
  app: 'In-app toast + activity feed',
  silent: 'Activity feed only',
}

/**
 * NotificationPreferencesPanel — the base-layer delivery controls: (1) enable
 * mobile push and (2) choose, per notification category, whether it's pushed
 * to the device, shown in-app only, or kept silent (feed only). Since spec 059
 * this no longer stands alone on the Preferences tab — it renders inside the
 * NotificationProfilesPanel's "Delivery settings" disclosure (`embedded`),
 * which suppresses the standalone heading/hint so the page has a single
 * Notifications section. Device-scoped (a phone's push permission is
 * per-device), so no wallet is required. Persisted via
 * lib/notifications/deliveryPreferences.js.
 */
function NotificationPreferencesPanel({ embedded = false }) {
  const { prefs, permission, setMode, enablePush, disablePush } = useNotificationPreferences()
  const supported = isPushSupported()
  const blocked = permission === 'denied'
  const pushOn = prefs.pushEnabled && permission === 'granted'

  const handleTogglePush = async () => {
    if (pushOn) {
      disablePush()
    } else {
      await enablePush()
    }
  }

  return (
    <div className="notif-pref-panel">
      {!embedded && <h3 className="notif-pref-title">Notifications</h3>}
      <p className="notif-pref-hint">
        Choose how each kind of update reaches you. Turn on mobile push to get
        device notifications for new activity while FairWins is open.
      </p>

      <div className="notif-pref-master">
        <div className="notif-pref-master-text">
          <span className="notif-pref-master-label" id="notif-pref-push-label">
            Mobile push notifications
          </span>
          <span className="notif-pref-master-sub">
            {!supported
              ? 'This browser cannot show system notifications.'
              : blocked
                ? 'Notifications are blocked in your browser settings — allow them for this site to enable push.'
                : pushOn
                  ? 'On — Push categories notify this device while the app is open.'
                  : 'Off — enable to receive Push-category alerts on this device.'}
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={pushOn}
          aria-labelledby="notif-pref-push-label"
          className={`notif-pref-switch ${pushOn ? 'on' : ''}`}
          disabled={!supported || blocked}
          onClick={handleTogglePush}
        >
          <span className="sr-only">{pushOn ? 'Mobile push on' : 'Mobile push off'}</span>
        </button>
      </div>

      <ul className="notif-pref-list">
        {NOTIFICATION_CATEGORIES.map((category) => {
          const current = prefs.modes[category.domain] || 'app'
          const groupLabelId = `notif-pref-cat-${category.domain}`
          return (
            <li key={category.domain} className="notif-pref-row">
              <div className="notif-pref-row-text">
                <span className="notif-pref-row-label" id={groupLabelId}>{category.label}</span>
                <span className="notif-pref-row-desc">{category.description}</span>
                {current === 'push' && !pushOn && (
                  <span className="notif-pref-row-warn">
                    Enable mobile push above to receive these on your device.
                  </span>
                )}
              </div>
              <div
                className="notif-pref-segmented"
                role="radiogroup"
                aria-labelledby={groupLabelId}
              >
                {DELIVERY_MODES.map((mode) => {
                  const selected = current === mode
                  return (
                    <button
                      key={mode}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      title={MODE_HINTS[mode]}
                      className={`notif-pref-seg ${selected ? 'selected' : ''}`}
                      onClick={() => setMode(category.domain, mode)}
                    >
                      {MODE_LABELS[mode]}
                    </button>
                  )
                })}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default NotificationPreferencesPanel
