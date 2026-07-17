import { getNextScheduleStart } from '../../../lib/notifications/notificationProfiles'

/** Locale-aware short time, e.g. "6:00 PM" / "18:00". */
export function formatTime(ms) {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

/** Locale-aware weekday + time, e.g. "Mon 9:00 PM". */
export function formatDayTime(ms) {
  return new Date(ms).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })
}

/**
 * One-line truthful status for a profile (spec 059 FR-014): whether it is on,
 * how it was activated (manual vs scheduled), when it turns off if known, and
 * — for off profiles with a schedule — when it next turns on.
 * @param {object} profile
 * @param {{ profile: object|null, source: string|null, until: number|null }} activeStatus
 * @param {number} [nowMs]
 */
export function profileStatusText(profile, activeStatus, nowMs = Date.now()) {
  const isActive = activeStatus.profile?.id === profile.id
  if (isActive) {
    const how = activeStatus.source === 'schedule' ? 'Scheduled' : 'Manual'
    if (activeStatus.until != null) return `On until ${formatTime(activeStatus.until)} · ${how}`
    return `On · ${how}`
  }
  const nextStart = getNextScheduleStart(profile, nowMs)
  if (nextStart != null) return `Off · Turns on ${formatDayTime(nextStart)}`
  return 'Off'
}
