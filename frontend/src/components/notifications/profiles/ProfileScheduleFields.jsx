import { DEFAULT_SCHEDULE } from '../../../lib/notifications/notificationProfiles'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function parseMinutes(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number)
  return h * 60 + m
}

/**
 * Shared weekly-schedule editor (spec 059) used by the creation wizard and the
 * profile edit surface. Mirrors Signal's "Add a schedule" step: an enable
 * switch, native start/end time inputs (locale-aware for free), and an
 * S M T W T F S day-toggle row. End at or before start spans midnight; a
 * schedule cannot be saved enabled with zero days (parents gate on
 * isScheduleDraftValid).
 *
 * @param {{ value: object|null, onChange: (schedule) => void, idPrefix: string }} props
 */
function ProfileScheduleFields({ value, onChange, idPrefix }) {
  const schedule = value || DEFAULT_SCHEDULE
  const overnight = parseMinutes(schedule.end) <= parseMinutes(schedule.start)
  const needsDays = schedule.enabled && schedule.days.length === 0

  const patch = (fields) => onChange({ ...schedule, ...fields })

  const toggleDay = (day) => {
    const days = schedule.days.includes(day)
      ? schedule.days.filter((d) => d !== day)
      : [...schedule.days, day].sort((a, b) => a - b)
    patch({ days })
  }

  return (
    <div className="profile-schedule-fields">
      <div className="profile-schedule-master">
        <span className="profile-schedule-label" id={`${idPrefix}-schedule-label`}>
          Schedule
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={schedule.enabled}
          aria-labelledby={`${idPrefix}-schedule-label`}
          className={`notif-pref-switch ${schedule.enabled ? 'on' : ''}`}
          onClick={() => patch({ enabled: !schedule.enabled })}
        >
          <span className="sr-only">{schedule.enabled ? 'Schedule on' : 'Schedule off'}</span>
        </button>
      </div>

      <div className={`profile-schedule-times ${schedule.enabled ? '' : 'muted'}`}>
        <label className="profile-schedule-time">
          <span>Start</span>
          <input
            type="time"
            value={schedule.start}
            onChange={(e) => e.target.value && patch({ start: e.target.value })}
          />
        </label>
        <label className="profile-schedule-time">
          <span>End</span>
          <input
            type="time"
            value={schedule.end}
            onChange={(e) => e.target.value && patch({ end: e.target.value })}
          />
        </label>
      </div>
      {overnight && (
        <p className="profile-schedule-note">Ends the next day (overnight schedule).</p>
      )}

      <div
        className={`profile-schedule-days ${schedule.enabled ? '' : 'muted'}`}
        role="group"
        aria-label="Days of week"
      >
        {DAY_INITIALS.map((initial, day) => {
          const selected = schedule.days.includes(day)
          return (
            <button
              key={DAY_NAMES[day]}
              type="button"
              aria-pressed={selected}
              aria-label={DAY_NAMES[day]}
              className={`profile-schedule-day ${selected ? 'selected' : ''}`}
              onClick={() => toggleDay(day)}
            >
              {initial}
            </button>
          )
        })}
      </div>
      {needsDays && (
        <p className="profile-schedule-warn" role="alert">
          Pick at least one day to enable the schedule.
        </p>
      )}
    </div>
  )
}

export default ProfileScheduleFields
