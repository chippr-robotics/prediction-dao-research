/**
 * Nav drawer display preferences (spec 081) — which sections are folded, and how tightly the
 * drawer draws its rows.
 *
 * Shaped exactly like `lib/miniapps/favorites.js` and `lib/network/endpointStore.js`: a
 * device-scoped entry in the global preference blob (`utils/userStorage#saveGlobalPreference`),
 * a lazily-loaded in-memory snapshot, and a revision counter with subscribers so the drawer and
 * the Preferences panel react to a change made in either surface without prop-drilling.
 *
 * DEVICE-SCOPED, NOT SYNCED, and deliberately absent from `lib/backup/syncedObjects.js`. Two
 * reasons, both load-bearing:
 *   - The drawer must render its correct shape on FIRST PAINT, before any wallet resolves. A
 *     menu that reflows once an account connects is worse than one that never folded, so these
 *     cannot live in wallet-scoped storage.
 *   - How one device's menu is folded, and how dense its rows are, is not account data. The
 *     same call was made for `miniapp_favorites` (spec 073) and `network_endpoints` (spec 069).
 *
 * Section keys are DERIVED from the group label (`sectionKey`), not enumerated, so a renamed,
 * tenant-hidden, or chain-hidden group needs no migration: its stored entry simply goes unread.
 */
import { getGlobalPreference, saveGlobalPreference } from '../../utils/userStorage'

/** Global-preference key holding the section expanded/collapsed map. */
export const NAV_SECTIONS_PREF_KEY = 'nav_sections'
/** Global-preference key holding the row density. */
export const NAV_DENSITY_PREF_KEY = 'nav_density'

export const NAV_DENSITIES = ['comfortable', 'compact']
export const DEFAULT_NAV_DENSITY = 'comfortable'

/**
 * Sections open when the member has expressed no preference. Quick Access is the member's own
 * shortcuts (and is height-bounded since the pinned strip replaced the unbounded row list);
 * Finance holds the money surfaces. Everything else starts folded so the whole menu fits one
 * screen — which is the entire point of the accordion.
 */
export const DEFAULT_EXPANDED_SECTIONS = {
  'quick-access': true,
  finance: true,
}

/** 'Quick Access' -> 'quick-access'. Stable across re-orderings; changes only if a label does. */
export function sectionKey(label) {
  return String(label ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function readSectionsFromStorage() {
  const raw = getGlobalPreference(NAV_SECTIONS_PREF_KEY, {})
  // A non-object (or an array, which would index numerically) is not a section map. Fall back to
  // the defaults rather than letting a foreign shape decide what the member can see.
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'boolean' && key) out[key] = value
  }
  return out
}

function readDensityFromStorage() {
  const raw = getGlobalPreference(NAV_DENSITY_PREF_KEY, DEFAULT_NAV_DENSITY)
  return NAV_DENSITIES.includes(raw) ? raw : DEFAULT_NAV_DENSITY
}

/** @type {Record<string, boolean>|null} lazily loaded snapshot */
let sectionSnapshot = null
/** @type {string|null} lazily loaded snapshot */
let densitySnapshot = null
/** Bumped on every change so React consumers can re-derive. */
let revision = 0
const listeners = new Set()

/** The stored section map — ONLY keys the member has actually set. Never returns null. */
export function loadSectionState() {
  if (sectionSnapshot === null) sectionSnapshot = readSectionsFromStorage()
  return sectionSnapshot
}

/** Stored choice, else the section's default, else collapsed. */
export function isSectionExpanded(key) {
  const stored = loadSectionState()
  if (Object.prototype.hasOwnProperty.call(stored, key)) return stored[key]
  return DEFAULT_EXPANDED_SECTIONS[key] === true
}

/** The device's row density. Never returns anything outside NAV_DENSITIES. */
export function loadNavDensity() {
  if (densitySnapshot === null) densitySnapshot = readDensityFromStorage()
  return densitySnapshot
}

/** Monotonic counter that changes whenever any nav preference changes. */
export function navPreferencesRevision() {
  return revision
}

/** Subscribe to nav preference changes. Returns an unsubscribe function. */
export function subscribeNavPreferences(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function notify() {
  revision += 1
  for (const listener of listeners) {
    try {
      listener(revision)
    } catch {
      // A bad subscriber must not break the save.
    }
  }
}

/** Record a member's fold/unfold of one section. */
export function setSectionExpanded(key, expanded) {
  if (!key) return
  const next = { ...loadSectionState(), [key]: Boolean(expanded) }
  sectionSnapshot = next
  saveGlobalPreference(NAV_SECTIONS_PREF_KEY, next)
  notify()
}

/** Flip one section, resolving its current state through the defaults. */
export function toggleSection(key) {
  setSectionExpanded(key, !isSectionExpanded(key))
}

/** Set the row density. An unknown value is ignored rather than persisted. */
export function setNavDensity(value) {
  if (!NAV_DENSITIES.includes(value)) return
  densitySnapshot = value
  saveGlobalPreference(NAV_DENSITY_PREF_KEY, value)
  notify()
}

/** Test seam: forget the in-memory snapshots so the next read hits storage again. */
export function __resetNavPreferencesForTests() {
  sectionSnapshot = null
  densitySnapshot = null
  revision = 0
  listeners.clear()
}
