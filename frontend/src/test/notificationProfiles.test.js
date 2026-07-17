/**
 * Notification profile store tests (spec 059): CRUD + validation, corrupt
 * storage fallback, activation overrides (manual durations, window
 * suppression), schedule window math incl. overnight spans, and the
 * resolveEntryDelivery gate matrix — including bit-parity with the base layer
 * when no profile is active.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  PROFILE_EMOJI_PRESETS,
  DEADLINE_REMINDER_TYPES,
  MAX_PROFILE_NAME_LENGTH,
  getProfiles,
  getProfile,
  createProfile,
  updateProfile,
  deleteProfile,
  enableProfile,
  disableActiveProfile,
  getActiveStatus,
  getNextScheduleStart,
  getNextScheduleEnd,
  oneHourFrom,
  resolveEntryDelivery,
  subscribe,
} from '../lib/notifications/notificationProfiles'
import { setDeliveryMode, setPushEnabled, resolveDelivery } from '../lib/notifications/deliveryPreferences'

// Tue 2026-07-14 12:00:00 local time (getDay() === 2).
const NOW = new Date(2026, 6, 14, 12, 0, 0).getTime()
const HOUR = 3_600_000
const DAY = 86_400_000

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => vi.useRealTimers())

const entry = (over = {}) => ({ id: 'e1', domain: 'wagers', type: 't', actionable: false, ...over })

describe('CRUD + validation', () => {
  it('creates with defaults: exceptions on, empty allow-list, no schedule', () => {
    const p = createProfile({ name: 'Sleep', emoji: '😴' })
    expect(p).toMatchObject({
      name: 'Sleep',
      emoji: '😴',
      allowedDomains: [],
      allowActionRequired: true,
      allowDeadlineReminders: true,
      schedule: null,
    })
    expect(p.id).toBeTruthy()
    expect(getProfiles()).toHaveLength(1)
    expect(getProfile(p.id)).toMatchObject({ name: 'Sleep' })
  })

  it('rejects empty and over-long names', () => {
    expect(createProfile({ name: '' })).toBeNull()
    expect(createProfile({ name: '   ' })).toBeNull()
    expect(createProfile({ name: 'x'.repeat(MAX_PROFILE_NAME_LENGTH + 1) })).toBeNull()
    expect(getProfiles()).toHaveLength(0)
  })

  it('drops unknown domains and dedupes the allow-list', () => {
    const p = createProfile({ name: 'Work', allowedDomains: ['wagers', 'wagers', 'nope', 'dao'] })
    expect(p.allowedDomains).toEqual(['wagers', 'dao'])
  })

  it('updates fields and rejects invalid patches', () => {
    const p = createProfile({ name: 'Work' })
    const updated = updateProfile(p.id, { name: 'Deep Work', allowedDomains: ['custody'] })
    expect(updated).toMatchObject({ name: 'Deep Work', allowedDomains: ['custody'] })
    expect(updateProfile(p.id, { name: '' })).toBeNull()
    expect(getProfile(p.id).name).toBe('Deep Work')
    expect(updateProfile('missing', { name: 'X' })).toBeNull()
  })

  it('normalizes schedules: zero days can never be enabled', () => {
    const p = createProfile({ name: 'S', schedule: { enabled: true, start: '21:00', end: '07:00', days: [] } })
    expect(p.schedule.enabled).toBe(false)
    const q = updateProfile(p.id, { schedule: { enabled: true, start: '21:00', end: '07:00', days: [2, 2, 9, -1] } })
    expect(q.schedule).toEqual({ enabled: true, start: '21:00', end: '07:00', days: [2] })
  })

  it('deletes profiles and notifies subscribers on changes', () => {
    const listener = vi.fn()
    const unsub = subscribe(listener)
    const p = createProfile({ name: 'Work' })
    deleteProfile(p.id)
    expect(getProfiles()).toHaveLength(0)
    expect(listener).toHaveBeenCalledTimes(2)
    unsub()
  })

  it('exposes the five Signal-style presets', () => {
    expect(PROFILE_EMOJI_PRESETS.map((p) => p.name)).toEqual(['Work', 'Sleep', 'Driving', 'Downtime', 'Focus'])
  })
})

describe('corrupt/foreign storage', () => {
  it('degrades to an empty store on garbage JSON', () => {
    localStorage.setItem('fairwins_notif_profiles_v1', '{bad json')
    expect(getProfiles()).toEqual([])
    expect(getActiveStatus().profile).toBeNull()
  })

  it('drops malformed profiles and dangling overrides', () => {
    localStorage.setItem(
      'fairwins_notif_profiles_v1',
      JSON.stringify({
        version: 99,
        profiles: [{ id: 'ok', name: 'Fine' }, { name: 'no-id' }, { id: 'x2' }, 42, null],
        override: { kind: 'enabled', profileId: 'ghost', until: null, at: 0 },
      })
    )
    expect(getProfiles().map((p) => p.name)).toEqual(['Fine'])
    expect(getActiveStatus().profile).toBeNull()
  })
})

describe('activation overrides', () => {
  it('manual indefinite enable stays on and reports no expiry', () => {
    const p = createProfile({ name: 'Focus' })
    enableProfile(p.id)
    expect(getActiveStatus()).toMatchObject({ profile: { id: p.id }, source: 'manual', until: null })
    expect(getActiveStatus(NOW + 7 * DAY).profile.id).toBe(p.id)
  })

  it('"for 1 hour" expires and prunes lazily', () => {
    const p = createProfile({ name: 'Focus' })
    enableProfile(p.id, { until: oneHourFrom(NOW) })
    expect(getActiveStatus(NOW + HOUR - 1000).profile.id).toBe(p.id)
    expect(getActiveStatus(NOW + HOUR).profile).toBeNull()
    // Pruned: a later read at an earlier time no longer sees the override.
    expect(getActiveStatus(NOW).profile).toBeNull()
  })

  it('at most one profile is active — enabling B replaces A', () => {
    const a = createProfile({ name: 'A' })
    const b = createProfile({ name: 'B' })
    enableProfile(a.id)
    enableProfile(b.id)
    expect(getActiveStatus().profile.id).toBe(b.id)
  })

  it('enable of an unknown id is a no-op', () => {
    enableProfile('ghost')
    expect(getActiveStatus().profile).toBeNull()
  })

  it('deleting the active profile deactivates it', () => {
    const p = createProfile({ name: 'A' })
    enableProfile(p.id)
    deleteProfile(p.id)
    expect(getActiveStatus().profile).toBeNull()
  })

  it('disabling a manually enabled profile turns it fully off', () => {
    const p = createProfile({ name: 'A' })
    enableProfile(p.id)
    disableActiveProfile()
    expect(getActiveStatus().profile).toBeNull()
  })
})

describe('schedule evaluation', () => {
  const workdays = { enabled: true, start: '09:00', end: '17:00', days: [1, 2, 3, 4, 5] }

  it('is active inside the window on a selected day, inactive outside', () => {
    const p = createProfile({ name: 'Work', schedule: workdays })
    expect(getActiveStatus(NOW)).toMatchObject({ profile: { id: p.id }, source: 'schedule' })
    // until = today 17:00
    expect(getActiveStatus(NOW).until).toBe(new Date(2026, 6, 14, 17, 0, 0).getTime())
    expect(getActiveStatus(new Date(2026, 6, 14, 8, 59, 0).getTime()).profile).toBeNull()
    expect(getActiveStatus(new Date(2026, 6, 14, 17, 0, 0).getTime()).profile).toBeNull()
  })

  it('is inactive on an unselected day', () => {
    createProfile({ name: 'Work', schedule: workdays })
    // Sat 2026-07-18 12:00
    expect(getActiveStatus(new Date(2026, 6, 18, 12, 0, 0).getTime()).profile).toBeNull()
  })

  it('overnight windows span midnight and belong to the start day', () => {
    const p = createProfile({ name: 'Sleep', schedule: { enabled: true, start: '21:00', end: '07:00', days: [2] } })
    // Tue 23:00 — inside
    expect(getActiveStatus(new Date(2026, 6, 14, 23, 0, 0).getTime()).profile.id).toBe(p.id)
    // Wed 06:00 — still inside Tuesday's window
    const wedSix = new Date(2026, 6, 15, 6, 0, 0).getTime()
    expect(getActiveStatus(wedSix)).toMatchObject({ profile: { id: p.id }, source: 'schedule' })
    expect(getActiveStatus(wedSix).until).toBe(new Date(2026, 6, 15, 7, 0, 0).getTime())
    // Wed 23:00 — Wednesday not selected
    expect(getActiveStatus(new Date(2026, 6, 15, 23, 0, 0).getTime()).profile).toBeNull()
  })

  it('manual off inside a window suppresses only that window', () => {
    const p = createProfile({ name: 'Work', schedule: workdays })
    disableActiveProfile(NOW)
    expect(getActiveStatus(new Date(2026, 6, 14, 16, 0, 0).getTime()).profile).toBeNull()
    // Next day 10:00 — window reactivates
    expect(getActiveStatus(new Date(2026, 6, 15, 10, 0, 0).getTime()).profile.id).toBe(p.id)
  })

  it('manual enable beats another profile\'s schedule; expiry re-evaluates schedules', () => {
    const work = createProfile({ name: 'Work', schedule: workdays })
    const focus = createProfile({ name: 'Focus' })
    enableProfile(focus.id, { until: NOW + HOUR })
    expect(getActiveStatus(NOW).profile.id).toBe(focus.id)
    // After expiry, Work's still-open window takes back over.
    expect(getActiveStatus(NOW + HOUR + 1000).profile.id).toBe(work.id)
  })

  it('overlapping schedules: the most recent start wins', () => {
    createProfile({ name: 'AllDay', schedule: { enabled: true, start: '08:00', end: '18:00', days: [2] } })
    const later = createProfile({ name: 'Lunch', schedule: { enabled: true, start: '11:00', end: '13:00', days: [2] } })
    expect(getActiveStatus(NOW).profile.id).toBe(later.id)
  })

  it('getNextScheduleStart / getNextScheduleEnd', () => {
    const p = createProfile({ name: 'Work', schedule: workdays })
    // Inside Tuesday's window: end is today 17:00; next start is Wed 09:00.
    expect(getNextScheduleEnd(p, NOW)).toBe(new Date(2026, 6, 14, 17, 0, 0).getTime())
    expect(getNextScheduleStart(p, NOW)).toBe(new Date(2026, 6, 15, 9, 0, 0).getTime())
    // Friday 18:00 → next start Monday 09:00.
    const friEve = new Date(2026, 6, 17, 18, 0, 0).getTime()
    expect(getNextScheduleStart(p, friEve)).toBe(new Date(2026, 6, 20, 9, 0, 0).getTime())
    expect(getNextScheduleEnd(p, friEve)).toBe(new Date(2026, 6, 20, 17, 0, 0).getTime())
    // No schedule → null.
    const bare = createProfile({ name: 'Bare' })
    expect(getNextScheduleStart(bare, NOW)).toBeNull()
    expect(getNextScheduleEnd(bare, NOW)).toBeNull()
  })
})

describe('resolveEntryDelivery gate', () => {
  it('no active profile ⇒ identical to the base layer', () => {
    for (const mode of ['push', 'app', 'silent']) {
      setDeliveryMode('wagers', mode)
      setPushEnabled(mode === 'push')
      expect(resolveEntryDelivery(entry())).toBe(resolveDelivery('wagers'))
    }
    expect(resolveEntryDelivery({})).toBe(resolveDelivery('wagers')) // domain fallback
  })

  it('allowed domain ⇒ base-layer mode', () => {
    const p = createProfile({ name: 'W', allowedDomains: ['wagers'] })
    enableProfile(p.id)
    setDeliveryMode('wagers', 'push')
    setPushEnabled(true)
    expect(resolveEntryDelivery(entry())).toBe('push')
    setDeliveryMode('wagers', 'silent')
    expect(resolveEntryDelivery(entry())).toBe('silent') // allowed ≠ upgraded
  })

  it('blocked domain without exception ⇒ silent', () => {
    const p = createProfile({ name: 'W', allowedDomains: ['wagers'] })
    enableProfile(p.id)
    setDeliveryMode('dao', 'push')
    setPushEnabled(true)
    expect(resolveEntryDelivery(entry({ domain: 'dao' }))).toBe('silent')
  })

  it('action-required exception breaks through; toggle respected', () => {
    const p = createProfile({ name: 'W', allowedDomains: [] })
    enableProfile(p.id)
    setDeliveryMode('custody', 'app')
    expect(resolveEntryDelivery(entry({ domain: 'custody', actionable: true }))).toBe('app')
    updateProfile(p.id, { allowActionRequired: false })
    expect(resolveEntryDelivery(entry({ domain: 'custody', actionable: true }))).toBe('silent')
  })

  it('deadline-reminder exception matches the warn types; toggle respected', () => {
    const p = createProfile({ name: 'W', allowedDomains: [], allowActionRequired: false })
    enableProfile(p.id)
    for (const type of DEADLINE_REMINDER_TYPES) {
      expect(resolveEntryDelivery(entry({ type, actionable: true }))).toBe('app')
    }
    updateProfile(p.id, { allowDeadlineReminders: false })
    expect(resolveEntryDelivery(entry({ type: 'warn-acceptance', actionable: true }))).toBe('silent')
  })

  it('exception on a silent base category upgrades to app — exceptions only', () => {
    const p = createProfile({ name: 'W', allowedDomains: [] })
    enableProfile(p.id)
    setDeliveryMode('custody', 'silent')
    expect(resolveEntryDelivery(entry({ domain: 'custody', actionable: true }))).toBe('app')
    // Non-exception on the same silent category stays silent.
    expect(resolveEntryDelivery(entry({ domain: 'custody' }))).toBe('silent')
  })

  it('empty allow-list with both exceptions off ⇒ total silence', () => {
    const p = createProfile({
      name: 'DND',
      allowedDomains: [],
      allowActionRequired: false,
      allowDeadlineReminders: false,
    })
    enableProfile(p.id)
    setDeliveryMode('wagers', 'push')
    setPushEnabled(true)
    expect(resolveEntryDelivery(entry({ actionable: true, type: 'warn-acceptance' }))).toBe('silent')
  })
})
