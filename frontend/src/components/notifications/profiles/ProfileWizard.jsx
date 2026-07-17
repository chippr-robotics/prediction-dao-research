import { useEffect, useRef, useState } from 'react'
import {
  PROFILE_EMOJI_PRESETS,
  MAX_PROFILE_NAME_LENGTH,
  DEFAULT_SCHEDULE,
  createProfile,
  isScheduleDraftValid,
} from '../../../lib/notifications/notificationProfiles'
import { NOTIFICATION_CATEGORIES } from '../../../lib/notifications/deliveryPreferences'
import ProfileScheduleFields from './ProfileScheduleFields'
import './ProfileWizard.css'

const STEP_TITLES = ['Name your profile', 'Allowed notifications', 'Add a schedule', 'Profile created']

/**
 * Four-step notification-profile creation flow (spec 059), mirroring Signal's:
 * (1) name + emoji with one-tap presets, (2) category allow-list + the two
 * always-break-through exceptions, (3) optional weekly schedule (skippable),
 * (4) confirmation with usage hints. State survives back/forward navigation;
 * the profile is persisted when the member continues past step 3.
 *
 * @param {{ onClose: (createdProfile?: object) => void }} props
 */
function ProfileWizard({ onClose }) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState(null)
  const [allowed, setAllowed] = useState(() => new Set())
  const [allowActionRequired, setAllowActionRequired] = useState(true)
  const [allowDeadlineReminders, setAllowDeadlineReminders] = useState(true)
  const [schedule, setSchedule] = useState(() => ({ ...DEFAULT_SCHEDULE }))
  const [created, setCreated] = useState(null)
  const headingRef = useRef(null)

  // Move focus to the step heading on every step change so keyboard and
  // screen-reader users land at the top of the new step.
  useEffect(() => {
    headingRef.current?.focus()
  }, [step])

  const nameValid = name.trim().length > 0 && name.trim().length <= MAX_PROFILE_NAME_LENGTH
  const scheduleValid = isScheduleDraftValid(schedule)
  const nothingAllowed = allowed.size === 0 && !allowActionRequired && !allowDeadlineReminders

  const applyPreset = (preset) => {
    setName(preset.name)
    setEmoji(preset.emoji)
  }

  const toggleDomain = (domain) => {
    setAllowed((prev) => {
      const next = new Set(prev)
      if (next.has(domain)) next.delete(domain)
      else next.add(domain)
      return next
    })
  }

  const finishScheduleStep = () => {
    const profile = createProfile({
      name,
      emoji,
      allowedDomains: [...allowed],
      allowActionRequired,
      allowDeadlineReminders,
      schedule: schedule.enabled ? schedule : null,
    })
    setCreated(profile)
    setStep(3)
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose(created || undefined)
    }
  }

  return (
    <div
      className="profile-wizard"
      role="dialog"
      aria-label="New notification profile"
      onKeyDown={handleKeyDown}
    >
      <div className="profile-wizard-top">
        {step > 0 && step < 3 && (
          <button
            type="button"
            className="profile-wizard-back"
            aria-label="Back"
            onClick={() => setStep(step - 1)}
          >
            ←
          </button>
        )}
        {step < 3 && (
          <button
            type="button"
            className="profile-wizard-close"
            aria-label="Cancel new profile"
            onClick={() => onClose()}
          >
            ✕
          </button>
        )}
      </div>

      <h3 className="profile-wizard-title" tabIndex={-1} ref={headingRef}>
        {STEP_TITLES[step]}
      </h3>
      <p className="sr-only" aria-live="polite">{`Step ${step + 1} of 4`}</p>

      {step === 0 && (
        <div className="profile-wizard-step">
          <div className="profile-wizard-name-row">
            <span className="profile-wizard-emoji" aria-hidden="true">
              {emoji || '🔔'}
            </span>
            <label className="profile-wizard-name-label">
              <span className="sr-only">Profile name</span>
              <input
                type="text"
                value={name}
                maxLength={MAX_PROFILE_NAME_LENGTH}
                placeholder="Profile name"
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            {name && (
              <button
                type="button"
                className="profile-wizard-clear"
                aria-label="Clear name"
                onClick={() => {
                  setName('')
                  setEmoji(null)
                }}
              >
                ✕
              </button>
            )}
          </div>
          <ul className="profile-wizard-presets">
            {PROFILE_EMOJI_PRESETS.map((preset) => (
              <li key={preset.name}>
                <button type="button" onClick={() => applyPreset(preset)}>
                  <span aria-hidden="true">{preset.emoji}</span> {preset.name}
                </button>
              </li>
            ))}
          </ul>
          <div className="profile-wizard-actions">
            <button
              type="button"
              className="profile-wizard-next"
              disabled={!nameValid}
              onClick={() => setStep(1)}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="profile-wizard-step">
          <p className="profile-wizard-hint">
            Choose the updates that can notify you while this profile is on.
            Everything else stays quiet but is kept in your activity feed.
          </p>
          <ul className="profile-wizard-domains">
            {NOTIFICATION_CATEGORIES.map((category) => {
              const checked = allowed.has(category.domain)
              return (
                <li key={category.domain}>
                  <label className="profile-wizard-domain">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleDomain(category.domain)}
                    />
                    <span className="profile-wizard-domain-text">
                      <span className="profile-wizard-domain-label">{category.label}</span>
                      <span className="profile-wizard-domain-desc">{category.description}</span>
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>

          <h4 className="profile-wizard-subheading">Exceptions</h4>
          <div className="profile-wizard-exception">
            <span id="pw-exc-action" className="profile-wizard-exception-label">
              Always allow action-required items
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={allowActionRequired}
              aria-labelledby="pw-exc-action"
              className={`notif-pref-switch ${allowActionRequired ? 'on' : ''}`}
              onClick={() => setAllowActionRequired((v) => !v)}
            >
              <span className="sr-only">{allowActionRequired ? 'On' : 'Off'}</span>
            </button>
          </div>
          <div className="profile-wizard-exception">
            <span id="pw-exc-deadline" className="profile-wizard-exception-label">
              Always allow deadline reminders
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={allowDeadlineReminders}
              aria-labelledby="pw-exc-deadline"
              className={`notif-pref-switch ${allowDeadlineReminders ? 'on' : ''}`}
              onClick={() => setAllowDeadlineReminders((v) => !v)}
            >
              <span className="sr-only">{allowDeadlineReminders ? 'On' : 'Off'}</span>
            </button>
          </div>
          {nothingAllowed && (
            <p className="profile-wizard-warn">
              Nothing is allowed — while this profile is on you will get no
              notifications at all. Updates still appear in your activity feed.
            </p>
          )}
          <div className="profile-wizard-actions">
            <button type="button" className="profile-wizard-next" onClick={() => setStep(2)}>
              Next
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="profile-wizard-step">
          <p className="profile-wizard-hint">
            Set up a schedule to enable this notification profile automatically.
          </p>
          <ProfileScheduleFields value={schedule} onChange={setSchedule} idPrefix="pw" />
          <div className="profile-wizard-actions">
            <button
              type="button"
              className="profile-wizard-next"
              disabled={!scheduleValid}
              onClick={finishScheduleStep}
            >
              {schedule.enabled ? 'Next' : 'Skip'}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="profile-wizard-step profile-wizard-done">
          <span className="profile-wizard-done-emoji" aria-hidden="true">
            {created?.emoji || '🔔'}
          </span>
          <ul className="profile-wizard-done-hints">
            <li>You can turn your profile on or off from the activity panel in the header.</li>
            <li>{created?.schedule ? 'Your schedule will turn it on automatically.' : 'Add a schedule in settings to automate your profile.'}</li>
          </ul>
          <div className="profile-wizard-actions">
            <button type="button" className="profile-wizard-next" onClick={() => onClose(created || undefined)}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ProfileWizard
