import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useNotificationProfiles } from '../../hooks/useNotificationProfiles'
import {
  PROFILE_EMOJI_PRESETS,
  MAX_PROFILE_NAME_LENGTH,
  DEFAULT_SCHEDULE,
  isScheduleDraftValid,
} from '../../lib/notifications/notificationProfiles'
import { NOTIFICATION_CATEGORIES } from '../../lib/notifications/deliveryPreferences'
import ProfileWizard from '../notifications/profiles/ProfileWizard'
import ProfileScheduleFields from '../notifications/profiles/ProfileScheduleFields'
import { profileStatusText } from '../notifications/profiles/statusText'
import NotificationPreferencesPanel from './NotificationPreferencesPanel'
import './NotificationProfilesPanel.css'

/**
 * Inline edit surface for one profile (spec 059 US5): rename, emoji, category
 * allow-list, exceptions, schedule, delete. Draft state is local; Save writes
 * through the store in one update.
 */
function ProfileEditor({ profile, onSave, onDelete, onClose }) {
  const [name, setName] = useState(profile.name)
  const [emoji, setEmoji] = useState(profile.emoji)
  const [allowed, setAllowed] = useState(() => new Set(profile.allowedDomains))
  const [allowActionRequired, setAllowActionRequired] = useState(profile.allowActionRequired)
  const [allowDeadlineReminders, setAllowDeadlineReminders] = useState(profile.allowDeadlineReminders)
  const [schedule, setSchedule] = useState(() => profile.schedule || { ...DEFAULT_SCHEDULE })
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const nameValid = name.trim().length > 0 && name.trim().length <= MAX_PROFILE_NAME_LENGTH
  const valid = nameValid && isScheduleDraftValid(schedule)

  const toggleDomain = (domain) => {
    setAllowed((prev) => {
      const next = new Set(prev)
      if (next.has(domain)) next.delete(domain)
      else next.add(domain)
      return next
    })
  }

  const save = () => {
    onSave({
      name,
      emoji,
      allowedDomains: [...allowed],
      allowActionRequired,
      allowDeadlineReminders,
      schedule: schedule.enabled ? schedule : null,
    })
  }

  return (
    <div className="notif-profile-editor" role="group" aria-label={`Edit profile ${profile.name}`}>
      <div className="notif-profile-editor-name">
        <label>
          <span className="sr-only">Profile name</span>
          <input
            type="text"
            value={name}
            maxLength={MAX_PROFILE_NAME_LENGTH}
            placeholder="Profile name"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      </div>

      <div className="notif-profile-editor-emojis" role="group" aria-label="Profile emoji">
        {PROFILE_EMOJI_PRESETS.map((preset) => (
          <button
            key={preset.name}
            type="button"
            aria-pressed={emoji === preset.emoji}
            aria-label={`${preset.name} emoji`}
            className={`notif-profile-emoji-btn ${emoji === preset.emoji ? 'selected' : ''}`}
            onClick={() => setEmoji(emoji === preset.emoji ? null : preset.emoji)}
          >
            {preset.emoji}
          </button>
        ))}
      </div>

      <h5 className="notif-profile-editor-heading">Allowed notifications</h5>
      <ul className="notif-profile-editor-domains">
        {NOTIFICATION_CATEGORIES.map((category) => (
          <li key={category.domain}>
            <label className="notif-profile-editor-domain">
              <input
                type="checkbox"
                checked={allowed.has(category.domain)}
                onChange={() => toggleDomain(category.domain)}
              />
              <span>{category.label}</span>
            </label>
          </li>
        ))}
      </ul>

      <h5 className="notif-profile-editor-heading">Exceptions</h5>
      <div className="notif-profile-editor-exception">
        <span id={`edit-${profile.id}-action`}>Always allow action-required items</span>
        <button
          type="button"
          role="switch"
          aria-checked={allowActionRequired}
          aria-labelledby={`edit-${profile.id}-action`}
          className={`notif-pref-switch ${allowActionRequired ? 'on' : ''}`}
          onClick={() => setAllowActionRequired((v) => !v)}
        >
          <span className="sr-only">{allowActionRequired ? 'On' : 'Off'}</span>
        </button>
      </div>
      <div className="notif-profile-editor-exception">
        <span id={`edit-${profile.id}-deadline`}>Always allow deadline reminders</span>
        <button
          type="button"
          role="switch"
          aria-checked={allowDeadlineReminders}
          aria-labelledby={`edit-${profile.id}-deadline`}
          className={`notif-pref-switch ${allowDeadlineReminders ? 'on' : ''}`}
          onClick={() => setAllowDeadlineReminders((v) => !v)}
        >
          <span className="sr-only">{allowDeadlineReminders ? 'On' : 'Off'}</span>
        </button>
      </div>

      <h5 className="notif-profile-editor-heading">Schedule</h5>
      <ProfileScheduleFields value={schedule} onChange={setSchedule} idPrefix={`edit-${profile.id}`} />

      <div className="notif-profile-editor-actions">
        {confirmingDelete ? (
          <>
            <span className="notif-profile-delete-confirm-text">Delete this profile?</span>
            <button type="button" className="notif-profile-delete-btn" onClick={onDelete}>
              Delete
            </button>
            <button type="button" className="notif-profile-cancel-btn" onClick={() => setConfirmingDelete(false)}>
              Keep
            </button>
          </>
        ) : (
          <>
            <button type="button" className="notif-profile-delete-btn" onClick={() => setConfirmingDelete(true)}>
              Delete profile
            </button>
            <span className="notif-profile-editor-spacer" />
            <button type="button" className="notif-profile-cancel-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="notif-profile-save-btn" disabled={!valid} onClick={save}>
              Save
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * NotificationProfilesPanel — the single "Notifications" area of the
 * Preferences tab (spec 059). Lists this device's profiles with truthful
 * active state, offers per-profile on/off, editing, deletion, and hosts the
 * 4-step creation wizard. The base-layer NotificationPreferencesPanel (which
 * keeps deciding HOW allowed updates are delivered) is embedded below in a
 * "Delivery settings" disclosure so the tab has exactly one notifications
 * section.
 */
function NotificationProfilesPanel() {
  const {
    profiles,
    activeStatus,
    updateProfile,
    deleteProfile,
    enableProfile,
    disableActiveProfile,
  } = useNotificationProfiles()
  const location = useLocation()
  const [wizardOpen, setWizardOpen] = useState(() => location.hash === '#notification-profiles-new')
  const [editingId, setEditingId] = useState(null)
  const [deliveryOpen, setDeliveryOpen] = useState(false)

  // Deep links from the quick-access surface: #notification-profiles scrolls
  // here; #notification-profiles-new also opens the wizard (covers hash
  // changes after mount — the initial hash is handled by the lazy state).
  useEffect(() => {
    const hash = location.hash
    if (hash !== '#notification-profiles' && hash !== '#notification-profiles-new') return
    const id = window.setTimeout(() => {
      if (hash === '#notification-profiles-new') setWizardOpen(true)
      document.getElementById('notification-profiles')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
    return () => window.clearTimeout(id)
  }, [location.hash])

  const toggleProfile = (profile, isActive) => {
    if (isActive) disableActiveProfile()
    else enableProfile(profile.id)
  }

  return (
    <div className="notif-profiles-panel" id="notification-profiles">
      <h3 className="notif-profiles-title">Notification profiles</h3>
      <p className="notif-profiles-hint">
        Profiles decide when you get interrupted: while one is on, only the
        updates it allows will notify you — everything else waits quietly in
        your activity feed. Turn profiles on manually or on a schedule.
      </p>

      {wizardOpen ? (
        <ProfileWizard onClose={() => setWizardOpen(false)} />
      ) : (
        <>
          {profiles.length === 0 ? (
            <p className="notif-profiles-empty">
              No profiles yet. Create one — like Sleep or Work — to control
              when FairWins can interrupt you.
            </p>
          ) : (
            <ul className="notif-profiles-list">
              {profiles.map((profile) => {
                const isActive = activeStatus.profile?.id === profile.id
                const editing = editingId === profile.id
                return (
                  <li key={profile.id} className="notif-profiles-row">
                    <div className="notif-profiles-row-main">
                      <span className="notif-profiles-emoji" aria-hidden="true">
                        {profile.emoji || '🔔'}
                      </span>
                      <div className="notif-profiles-row-text">
                        <span className="notif-profiles-name">{profile.name}</span>
                        <span className="notif-profiles-status">
                          {profileStatusText(profile, activeStatus)}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="notif-profiles-edit"
                        aria-expanded={editing}
                        onClick={() => setEditingId(editing ? null : profile.id)}
                      >
                        {editing ? 'Close' : 'Edit'}
                      </button>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={isActive}
                        aria-label={`${profile.name} profile ${isActive ? 'on' : 'off'}`}
                        className={`notif-pref-switch ${isActive ? 'on' : ''}`}
                        onClick={() => toggleProfile(profile, isActive)}
                      >
                        <span className="sr-only">{isActive ? 'On' : 'Off'}</span>
                      </button>
                    </div>
                    {editing && (
                      <ProfileEditor
                        profile={profile}
                        onSave={(patch) => {
                          updateProfile(profile.id, patch)
                          setEditingId(null)
                        }}
                        onDelete={() => {
                          deleteProfile(profile.id)
                          setEditingId(null)
                        }}
                        onClose={() => setEditingId(null)}
                      />
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          <button type="button" className="notif-profiles-new" onClick={() => setWizardOpen(true)}>
            + New profile
          </button>

          {/* Base-layer delivery controls (spec 059 consolidation): the former
              standalone Notifications section lives here so the Preferences
              tab has exactly one notifications surface. Profiles decide WHEN
              you're interrupted; these decide HOW allowed updates arrive. */}
          <div className="notif-profiles-delivery">
            <button
              type="button"
              className="notif-profiles-delivery-toggle"
              aria-expanded={deliveryOpen}
              aria-controls="notif-profiles-delivery-body"
              onClick={() => setDeliveryOpen((v) => !v)}
            >
              <span>Delivery settings</span>
              <span className="notif-profiles-delivery-chevron" aria-hidden="true">
                {deliveryOpen ? '▲' : '▼'}
              </span>
            </button>
            {deliveryOpen && (
              <div id="notif-profiles-delivery-body" className="notif-profiles-delivery-body">
                <NotificationPreferencesPanel embedded />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default NotificationProfilesPanel
