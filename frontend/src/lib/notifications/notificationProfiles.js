/**
 * Notification Profiles (spec 059) — Signal-style interruption modes layered
 * over the per-category delivery preferences (deliveryPreferences.js).
 *
 * A profile is a named allow-list over the notification domains plus two
 * always-break-through exceptions (action-required items, deadline reminders)
 * and an optional weekly schedule. At most one profile is active at a time:
 * a single activation override (manual on with optional expiry, or manual off
 * suppressing one scheduled window) layers over lazy schedule evaluation, so
 * the active state is always computed correctly at read time — no timer has
 * to fire for the gate to be right after the app was closed at a boundary.
 *
 * While a profile is active, resolveEntryDelivery() decides per fresh entry:
 * allowed domain → the base-layer mode; exception match → base-layer mode but
 * never below 'app' (a break-through that stays invisible isn't one); anything
 * else → 'silent' (durable feed only — nothing is ever dropped). With no
 * active profile the result is bit-identical to resolveDelivery(domain).
 *
 * Device-scoped, same never-throws localStorage + pub/sub pattern as
 * deliveryPreferences.js; separate key so the two stores version independently.
 */

import { NOTIFICATION_CATEGORIES, resolveDelivery } from './deliveryPreferences'

const PROFILES_KEY = 'fairwins_notif_profiles_v1'
const STORE_VERSION = 1

/** One-tap presets mirrored from Signal's creation flow. */
export const PROFILE_EMOJI_PRESETS = [
  { name: 'Work', emoji: '💪' },
  { name: 'Sleep', emoji: '😴' },
  { name: 'Driving', emoji: '🚗' },
  { name: 'Downtime', emoji: '😊' },
  { name: 'Focus', emoji: '💡' },
]

/**
 * Entry `type`s emitted by data/notifications/deadlineWarnings.js — the
 * "deadline reminder" exception matches exactly these.
 */
export const DEADLINE_REMINDER_TYPES = ['warn-acceptance', 'warn-resolution']

export const MAX_PROFILE_NAME_LENGTH = 32

/** Signal's schedule defaults: 9 AM – 5 PM, no days preselected. */
export const DEFAULT_SCHEDULE = Object.freeze({ enabled: false, start: '09:00', end: '17:00', days: [] })

const KNOWN_DOMAINS = NOTIFICATION_CATEGORIES.map((c) => c.domain)
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const HOUR_MS = 3_600_000
const DAY_MIN = 1440

const listeners = new Set()

function notify() {
  listeners.forEach((listener) => {
    try {
      listener()
    } catch (error) {
      console.warn('Error in notification profile listener:', error)
    }
  })
}

function readRaw() {
  try {
    const saved = localStorage.getItem(PROFILES_KEY)
    if (!saved) return {}
    const parsed = JSON.parse(saved)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (error) {
    console.warn('Error reading notification profiles:', error)
    return {}
  }
}

function writeRaw(store) {
  try {
    localStorage.setItem(PROFILES_KEY, JSON.stringify({ ...store, version: STORE_VERSION }))
  } catch (error) {
    // Private browsing / quota: session-only state; listeners still fire so
    // open surfaces stay consistent.
    console.warn('Error saving notification profiles:', error)
  }
}

function normalizeName(name) {
  if (typeof name !== 'string') return null
  const trimmed = name.trim()
  if (!trimmed || trimmed.length > MAX_PROFILE_NAME_LENGTH) return null
  return trimmed
}

function normalizeSchedule(raw) {
  if (!raw || typeof raw !== 'object') return null
  const start = HHMM_RE.test(raw.start) ? raw.start : DEFAULT_SCHEDULE.start
  const end = HHMM_RE.test(raw.end) ? raw.end : DEFAULT_SCHEDULE.end
  const days = [...new Set(Array.isArray(raw.days) ? raw.days : [])]
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    .sort((a, b) => a - b)
  // A schedule can never be enabled with zero days (spec FR-005).
  const enabled = raw.enabled === true && days.length > 0
  return { enabled, start, end, days }
}

function normalizeProfile(raw) {
  if (!raw || typeof raw !== 'object') return null
  if (typeof raw.id !== 'string' || !raw.id) return null
  const name = normalizeName(raw.name)
  if (!name) return null
  return {
    id: raw.id,
    name,
    emoji: typeof raw.emoji === 'string' && raw.emoji ? raw.emoji : null,
    allowedDomains: [...new Set(Array.isArray(raw.allowedDomains) ? raw.allowedDomains : [])].filter((d) =>
      KNOWN_DOMAINS.includes(d)
    ),
    allowActionRequired: raw.allowActionRequired !== false,
    allowDeadlineReminders: raw.allowDeadlineReminders !== false,
    schedule: normalizeSchedule(raw.schedule),
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : 0,
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0,
  }
}

function normalizeOverride(raw, profiles) {
  if (!raw || typeof raw !== 'object') return null
  if (!profiles.some((p) => p.id === raw.profileId)) return null
  if (raw.kind === 'enabled') {
    return {
      kind: 'enabled',
      profileId: raw.profileId,
      until: Number.isFinite(raw.until) ? raw.until : null,
      at: Number.isFinite(raw.at) ? raw.at : 0,
    }
  }
  if (raw.kind === 'disabled') {
    return { kind: 'disabled', profileId: raw.profileId, at: Number.isFinite(raw.at) ? raw.at : 0 }
  }
  return null
}

/**
 * Fully normalized store — safe on missing, corrupt, or future-versioned data.
 * @returns {{ profiles: Array, override: object|null }}
 */
function readStore() {
  const raw = readRaw()
  const profiles = (Array.isArray(raw.profiles) ? raw.profiles : []).map(normalizeProfile).filter(Boolean)
  return { profiles, override: normalizeOverride(raw.override, profiles) }
}

// ---------------------------------------------------------------------------
// Schedule math (device-local wall time)
// ---------------------------------------------------------------------------

function parseMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** Window length in minutes; end <= start spans midnight (end === start ⇒ 24 h). */
function windowDurationMin(schedule) {
  return ((parseMinutes(schedule.end) - parseMinutes(schedule.start)) + DAY_MIN) % DAY_MIN || DAY_MIN
}

/** Start of the window beginning on the calendar day containing `dayMs`, or null if that weekday isn't selected. */
function windowStartOnDay(schedule, dayMs) {
  const day = new Date(dayMs)
  day.setHours(0, 0, 0, 0)
  if (!schedule.days.includes(day.getDay())) return null
  return day.getTime() + parseMinutes(schedule.start) * 60_000
}

/**
 * The schedule window containing `atMs`, if any. Overnight windows belong to
 * their start day, so both today's and yesterday's starts are candidates.
 * @returns {{ startMs: number, endMs: number } | null}
 */
function windowAt(schedule, atMs) {
  if (!schedule?.enabled) return null
  const durationMs = windowDurationMin(schedule) * 60_000
  for (const offsetMs of [0, -86_400_000]) {
    const startMs = windowStartOnDay(schedule, atMs + offsetMs)
    if (startMs == null) continue
    const endMs = startMs + durationMs
    if (atMs >= startMs && atMs < endMs) return { startMs, endMs }
  }
  return null
}

/**
 * ms timestamp of the profile's next scheduled activation strictly after
 * `nowMs` (up to a week out), or null without an enabled schedule.
 */
export function getNextScheduleStart(profile, nowMs = Date.now()) {
  const schedule = profile?.schedule
  if (!schedule?.enabled) return null
  for (let dayOffset = 0; dayOffset <= 7; dayOffset += 1) {
    const startMs = windowStartOnDay(schedule, nowMs + dayOffset * 86_400_000)
    if (startMs != null && startMs > nowMs) return startMs
  }
  return null
}

/**
 * End of the profile's current window (when inside one) or of its next window
 * — feeds the "Until <end>" manual option and status lines. Null without an
 * enabled schedule.
 */
export function getNextScheduleEnd(profile, nowMs = Date.now()) {
  const schedule = profile?.schedule
  if (!schedule?.enabled) return null
  const current = windowAt(schedule, nowMs)
  if (current) return current.endMs
  const nextStart = getNextScheduleStart(profile, nowMs)
  return nextStart == null ? null : nextStart + windowDurationMin(schedule) * 60_000
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/** All profiles, normalized (creation order). */
export function getProfiles() {
  return readStore().profiles
}

/** @returns {object|null} */
export function getProfile(id) {
  return readStore().profiles.find((p) => p.id === id) || null
}

function generateId() {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Create and persist a profile. Exceptions default ON (missing a custody
 * approval or a claim deadline costs real money — see spec 059 research R3).
 * @returns {object|null} the created profile, or null for an invalid name
 */
export function createProfile(input = {}) {
  const name = normalizeName(input.name)
  if (!name) return null
  const now = Date.now()
  const profile = normalizeProfile({
    ...input,
    id: generateId(),
    name,
    createdAt: now,
    updatedAt: now,
  })
  const store = readStore()
  writeRaw({ profiles: [...store.profiles, profile], override: store.override })
  notify()
  return profile
}

/**
 * Shallow-merge a validated patch into an existing profile.
 * @returns {object|null} the updated profile, or null (unknown id / invalid patch)
 */
export function updateProfile(id, patch = {}) {
  const store = readStore()
  const existing = store.profiles.find((p) => p.id === id)
  if (!existing) return null
  if ('name' in patch && !normalizeName(patch.name)) return null
  const updated = normalizeProfile({ ...existing, ...patch, id, updatedAt: Date.now(), createdAt: existing.createdAt })
  writeRaw({
    profiles: store.profiles.map((p) => (p.id === id ? updated : p)),
    override: store.override,
  })
  notify()
  return updated
}

/** Remove a profile; an activation override referencing it is pruned too. */
export function deleteProfile(id) {
  const store = readStore()
  if (!store.profiles.some((p) => p.id === id)) return
  writeRaw({
    profiles: store.profiles.filter((p) => p.id !== id),
    override: store.override?.profileId === id ? null : store.override,
  })
  notify()
}

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

/**
 * Manually turn a profile on, replacing any prior override wholesale — at most
 * one profile is ever active (FR-008).
 * @param {string} id
 * @param {{ until?: number|null }} [options] absolute ms expiry ("For 1 hour",
 *   "Until <schedule end>") or null/omitted for indefinite
 */
export function enableProfile(id, { until = null } = {}) {
  const store = readStore()
  if (!store.profiles.some((p) => p.id === id)) return
  writeRaw({
    profiles: store.profiles,
    override: { kind: 'enabled', profileId: id, until: Number.isFinite(until) ? until : null, at: Date.now() },
  })
  notify()
}

/**
 * Turn the currently active profile off. If it is inside a scheduled window,
 * a 'disabled' override suppresses just that window (it reactivates at the
 * next scheduled start); otherwise the manual override is simply cleared.
 */
export function disableActiveProfile(nowMs = Date.now()) {
  const { profile } = getActiveStatus(nowMs)
  if (!profile) return
  const store = readStore()
  const inWindow = windowAt(profile.schedule, nowMs) != null
  writeRaw({
    profiles: store.profiles,
    override: inWindow ? { kind: 'disabled', profileId: profile.id, at: nowMs } : null,
  })
  notify()
}

/** Prune an override that no longer applies; returns the live override (or null). */
function pruneOverride(store, nowMs) {
  const ov = store.override
  if (!ov) return null
  const profile = store.profiles.find((p) => p.id === ov.profileId)
  let live = ov
  if (!profile) live = null
  else if (ov.kind === 'enabled' && ov.until != null && ov.until <= nowMs) live = null
  else if (ov.kind === 'disabled') {
    const window = windowAt(profile.schedule, ov.at)
    if (!window || nowMs >= window.endMs) live = null
  }
  if (live !== ov) {
    writeRaw({ profiles: store.profiles, override: live })
    notify()
  }
  return live
}

/**
 * The single source of truth for "which profile is interrupting right now".
 * Lazy: correct at any call time with no timer dependency; expired overrides
 * are pruned (persist + notify only when something actually changed).
 * @returns {{ profile: object|null, source: 'manual'|'schedule'|null, until: number|null }}
 */
export function getActiveStatus(nowMs = Date.now()) {
  const store = readStore()
  const override = pruneOverride(store, nowMs)

  if (override?.kind === 'enabled') {
    const profile = store.profiles.find((p) => p.id === override.profileId)
    return { profile, source: 'manual', until: override.until }
  }

  // Pure schedule evaluation; a live 'disabled' override suppresses only its profile.
  let best = null
  for (const profile of store.profiles) {
    if (override?.kind === 'disabled' && override.profileId === profile.id) continue
    const window = windowAt(profile.schedule, nowMs)
    if (window && (!best || window.startMs > best.window.startMs)) best = { profile, window }
  }
  if (best) return { profile: best.profile, source: 'schedule', until: best.window.endMs }
  return { profile: null, source: null, until: null }
}

/** Convenience for the quick-access "For 1 hour" action. */
export function oneHourFrom(nowMs = Date.now()) {
  return nowMs + HOUR_MS
}

// ---------------------------------------------------------------------------
// Delivery gate
// ---------------------------------------------------------------------------

/**
 * Resolve how a fresh activity entry should be delivered right now, composing
 * the active profile (if any) over the base per-category preference. With no
 * active profile this is exactly resolveDelivery(entry.domain) — the
 * no-profile path must stay bit-identical to the pre-profile behavior.
 * @param {{ domain?: string, type?: string, actionable?: boolean }} entry
 * @returns {'push'|'app'|'silent'}
 */
export function resolveEntryDelivery(entry, nowMs = Date.now()) {
  const domain = entry?.domain || 'wagers'
  const { profile } = getActiveStatus(nowMs)
  if (!profile) return resolveDelivery(domain)
  if (profile.allowedDomains.includes(domain)) return resolveDelivery(domain)
  const isException =
    (profile.allowActionRequired && entry?.actionable === true) ||
    (profile.allowDeadlineReminders && DEADLINE_REMINDER_TYPES.includes(entry?.type))
  if (isException) {
    // Break-throughs are never left invisible: 'silent' base upgrades to 'app'
    // for exception matches only (spec FR-010).
    const mode = resolveDelivery(domain)
    return mode === 'silent' ? 'app' : mode
  }
  return 'silent'
}

/**
 * Subscribe to profile/activation changes. Returns an unsubscribe function.
 * @param {() => void} listener
 */
export function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
