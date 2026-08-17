/**
 * Favorited mini-apps — Quick Access shortcuts (App Store UI, follow-up to spec 073).
 *
 * Mirrors `lib/network/endpointStore.js`: a device-scoped entry in the global preference blob
 * (`utils/userStorage#saveGlobalPreference`), a lazily-loaded in-memory snapshot, and a revision
 * counter so React consumers (the catalog panel and the nav drawer) can react to a change made in
 * either surface without prop-drilling.
 *
 * Device-scoped rather than synced (spec 032 backup): a favorite is a per-device shortcut to a
 * spot in the nav, not account data worth exporting, and this keeps it out of the plaintext-at-rest
 * backup blob for the same reason `network_endpoints` stays out of it.
 *
 * An entry stores the registry id (immutable, the true identity — see `appNamespaceKey` in
 * `registryClient.js`) alongside the slug and name captured at favorite-time, so the drawer can
 * render a link and a label without re-reading the registry. A vendor rename after the fact leaves
 * a stale label/slug until the member re-favorites; that is an acceptable staleness for a shortcut,
 * not a trust boundary the way the catalog listing itself is.
 *
 * Spec 093 follow-up: ADMIN TOOLS pin here too, so operators get the same Quick Access strip for
 * the tools they reach for. Their ids live in a disjoint string namespace (`admin-tool:<appId>` —
 * see `components/admin/adminToolCatalog.js`) so they can never collide with a registry id, and
 * they carry no slug: their destination is derived from the id (`/admin/<appId>`), not from a
 * registry record. A pin is a device-scoped shortcut the member chose — if the role behind a tool
 * is later revoked, the pin still renders and the /admin gate refuses honestly at the destination.
 */
import { getGlobalPreference, saveGlobalPreference } from '../../utils/userStorage'

/** Global-preference key holding the favorited app list. */
export const FAVORITES_PREF_KEY = 'miniapp_favorites'

/** Mirrors adminToolCatalog.js (which imports from the components tree; this module must not). */
const ADMIN_TOOL_ID_RE = /^admin-tool:[a-z][a-z0-9-]{1,40}$/

function normalizeEntry(raw) {
  const name = typeof raw?.name === 'string' ? raw.name : ''
  if (!name) return null
  // Admin-tool pins: string id in the reserved namespace, no slug.
  if (typeof raw?.id === 'string') {
    if (!ADMIN_TOOL_ID_RE.test(raw.id)) return null
    return { id: raw.id, slug: '', name }
  }
  // Registry pins: positive integer id + the slug the launch route needs.
  const id = Number(raw?.id)
  const slug = typeof raw?.slug === 'string' ? raw.slug : ''
  if (!Number.isInteger(id) || id <= 0 || !slug) return null
  return { id, slug, name }
}

function readFromStorage() {
  const raw = getGlobalPreference(FAVORITES_PREF_KEY, [])
  if (!Array.isArray(raw)) return []
  const seen = new Set()
  const out = []
  for (const rawEntry of raw) {
    const entry = normalizeEntry(rawEntry)
    if (!entry || seen.has(entry.id)) continue
    seen.add(entry.id)
    out.push(entry)
  }
  return out
}

/** @type {Array<{id:number, slug:string, name:string}>|null} lazily loaded snapshot */
let snapshot = null
/** Bumped on every change so React consumers can re-derive their lists. */
let revision = 0
const listeners = new Set()

/** The full favorites list, newest last. Never returns null. */
export function loadFavoriteApps() {
  if (snapshot === null) snapshot = readFromStorage()
  return snapshot
}

/** Registry ids compare numerically; admin-tool ids compare as their string form. */
function favoriteKey(id) {
  return typeof id === 'string' && ADMIN_TOOL_ID_RE.test(id) ? id : Number(id)
}

export function isFavoriteApp(id) {
  const key = favoriteKey(id)
  return loadFavoriteApps().some((fav) => fav.id === key)
}

/** Monotonic counter that changes whenever the favorites list changes. */
export function favoritesRevision() {
  return revision
}

/** Subscribe to favorites changes. Returns an unsubscribe function. */
export function subscribeFavoriteApps(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function commit(next) {
  snapshot = next
  revision += 1
  saveGlobalPreference(FAVORITES_PREF_KEY, next)
  for (const listener of listeners) {
    try {
      listener(revision)
    } catch {
      // A bad subscriber must not break the save.
    }
  }
}

/**
 * Add an app to Quick Access. A no-op when the app can't be identified (no registry id, slug or
 * name — the three things a shortcut needs) or is already favorited.
 */
export function addFavoriteApp({ id, slug, name } = {}) {
  const entry = normalizeEntry({ id, slug, name })
  if (!entry) return
  const current = loadFavoriteApps()
  if (current.some((fav) => fav.id === entry.id)) return
  commit([...current, entry])
}

/** Drop an app from Quick Access. A no-op when it wasn't favorited. */
export function removeFavoriteApp(id) {
  const key = favoriteKey(id)
  const current = loadFavoriteApps()
  const next = current.filter((fav) => fav.id !== key)
  if (next.length === current.length) return
  commit(next)
}

export function toggleFavoriteApp(app) {
  if (isFavoriteApp(app?.id)) removeFavoriteApp(app.id)
  else addFavoriteApp(app)
}

/** Test seam: forget the in-memory snapshot so the next read hits storage again. */
export function __resetFavoriteAppsForTests() {
  snapshot = null
  revision = 0
  listeners.clear()
}
