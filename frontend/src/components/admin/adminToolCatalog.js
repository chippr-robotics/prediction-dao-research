/**
 * Admin tools in the Apps store (spec 093 follow-up) — the adapter between the
 * admin app matrix and the member-facing store surfaces.
 *
 * The store's job here is DISCOVERY, not authority: these entries are derived
 * client-side from `adminApps.js` and the operator's ROLE FLAGS, never from
 * the on-chain MiniAppRegistry — the registry has no role-gated visibility,
 * and publishing operator tooling there would list it for every member. An
 * account without a qualifying role derives an empty list and the store
 * renders no operator section at all; and as everywhere in the admin surface,
 * visibility is presentation — the /admin routes and the contracts keep
 * enforcing for real.
 *
 * Identity note: favorites (Quick Access pins) are keyed by id, and registry
 * apps use positive integers, so admin tools use a disjoint string namespace
 * (`admin-tool:<appId>`). The appId is recoverable from the favorite id alone
 * — a pin must survive without a lookup table.
 */
import { buildAdminApps, adminAppById, ADMIN_APP_IDS } from './adminApps'

/** Favorite-id namespace for admin tools; disjoint from registry integer ids. */
export const ADMIN_TOOL_ID_PREFIX = 'admin-tool:'

export function adminToolFavoriteId(appId) {
  return `${ADMIN_TOOL_ID_PREFIX}${appId}`
}

export function isAdminToolFavoriteId(id) {
  return typeof id === 'string' && id.startsWith(ADMIN_TOOL_ID_PREFIX)
}

/** The admin app id inside a favorite id, or null when it is not one / unknown. */
export function adminAppIdFromFavoriteId(id) {
  if (!isAdminToolFavoriteId(id)) return null
  const appId = id.slice(ADMIN_TOOL_ID_PREFIX.length)
  return ADMIN_APP_IDS.includes(appId) ? appId : null
}

/**
 * The operator-tool entries the given role flags entitle, in Control Room
 * order. Same source and same gates as the Control Room tiles — the store
 * never shows a tool the launcher would not.
 */
export function adminToolEntries(flags) {
  return buildAdminApps(flags).map((app) => ({
    favoriteId: adminToolFavoriteId(app.id),
    appId: app.id,
    name: app.name,
    description: app.blurb,
    icon: app.icon,
    path: `/admin/${app.id}`,
    permissionless: Boolean(app.permissionless),
  }))
}

/** Glyph for a pinned admin tool's tile (drawer strip), by favorite id. */
export function adminToolGlyph(favoriteId) {
  const appId = adminAppIdFromFavoriteId(favoriteId)
  return appId ? adminAppById(appId).icon : null
}
