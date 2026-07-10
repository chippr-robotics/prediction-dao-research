/**
 * Per-device notification delivery preferences.
 *
 * FairWins notifications are derived client-side by the ActivityProvider poll
 * loop (spec 031). Each notification belongs to a domain (wagers, dao, token,
 * membership, pools). This module lets a user pick, per domain, how that
 * domain's notifications are DELIVERED:
 *
 *   - 'push'   → raise a real OS/phone notification (Web Notifications API via
 *                the service worker) AND an in-app toast + feed entry.
 *   - 'app'    → in-app toast + feed entry only (the historical default).
 *   - 'silent' → feed entry only; no toast, no system notification.
 *
 * A master `pushEnabled` flag gates whether any 'push'-mode domain actually
 * raises a system notification — it only flips true once the user has granted
 * the browser notification permission (see pushDelivery.js). With it off, a
 * 'push' domain degrades to 'app' delivery (never silently dropped).
 *
 * Follows the qrColorPreference.js / quickAccessPreference.js device-scoped
 * pattern: plain-JSON localStorage, graceful fallbacks, never throws, in-memory
 * listeners so the Preferences UI and the delivery path stay in sync within a
 * session even when storage is unavailable (private browsing / quota).
 */

const DELIVERY_PREF_KEY = 'fairwins_notif_delivery_v1'

/** Delivery modes, most-intrusive first. */
export const DELIVERY_MODES = ['push', 'app', 'silent']

/**
 * User-facing notification categories, keyed by the entry `domain` the
 * ActivityProvider stamps (see data/notifications/domains.js). Order is the
 * order rendered in the Preferences panel. Keeping this list here — rather than
 * deriving from DOMAIN_META — means the panel only ever shows domains that
 * actually produce feed entries, and each gets a human description.
 */
export const NOTIFICATION_CATEGORIES = [
  { domain: 'wagers', label: 'Wagers', description: 'Accept, resolve, claim, refund, and deadline reminders' },
  { domain: 'pools', label: 'Wager Pools', description: 'Pool closed, resolved, cancelled, and members joining' },
  { domain: 'membership', label: 'Membership', description: 'Renewals, upgrades, and redeemable vouchers' },
  { domain: 'dao', label: 'Governance', description: 'Proposals to vote on, queue, or execute' },
  { domain: 'token', label: 'Token admin', description: 'Role changes and pause/unpause events' },
  { domain: 'custody', label: 'Custody', description: 'Vault approvals needed, executions, owner/threshold changes, and policy rule changes' },
]

const KNOWN_DOMAINS = NOTIFICATION_CATEGORIES.map((c) => c.domain)

/** The historical behavior — toast + feed — so an unconfigured install is unchanged. */
export const DEFAULT_MODE = 'app'

const listeners = new Set()

function notify() {
  listeners.forEach((listener) => {
    try {
      listener()
    } catch (error) {
      console.warn('Error in notification delivery preference listener:', error)
    }
  })
}

function readRaw() {
  try {
    const saved = localStorage.getItem(DELIVERY_PREF_KEY)
    if (!saved) return {}
    const parsed = JSON.parse(saved)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (error) {
    console.warn('Error reading notification delivery preferences:', error)
    return {}
  }
}

function writeRaw(value) {
  try {
    localStorage.setItem(DELIVERY_PREF_KEY, JSON.stringify(value))
  } catch (error) {
    // Private browsing / quota: fall back to session-only state; listeners still
    // fire below so the current session stays consistent.
    console.warn('Error saving notification delivery preferences:', error)
  }
}

/**
 * Full, normalized preferences for this device — every known domain resolved to
 * a valid mode, plus the master push flag. Safe to call on every render.
 * @returns {{ pushEnabled: boolean, modes: Record<string, 'push'|'app'|'silent'> }}
 */
export function getNotificationPrefs() {
  const raw = readRaw()
  const savedModes = raw && typeof raw.modes === 'object' && raw.modes ? raw.modes : {}
  const modes = {}
  for (const domain of KNOWN_DOMAINS) {
    const mode = savedModes[domain]
    modes[domain] = DELIVERY_MODES.includes(mode) ? mode : DEFAULT_MODE
  }
  return { pushEnabled: raw.pushEnabled === true, modes }
}

/**
 * The configured delivery mode for a domain (falls back to DEFAULT_MODE for an
 * unknown/unconfigured domain, so a new domain is never accidentally silenced).
 * @param {string} domain
 * @returns {'push'|'app'|'silent'}
 */
export function getDeliveryMode(domain) {
  const mode = getNotificationPrefs().modes[domain]
  return mode || DEFAULT_MODE
}

/**
 * Persist the delivery mode for a domain. No-op for an unknown mode.
 * @param {string} domain
 * @param {'push'|'app'|'silent'} mode
 */
export function setDeliveryMode(domain, mode) {
  if (!DELIVERY_MODES.includes(mode)) return
  const raw = readRaw()
  const modes = { ...(raw.modes && typeof raw.modes === 'object' ? raw.modes : {}), [domain]: mode }
  writeRaw({ ...raw, modes })
  notify()
}

/** Whether the user has opted into (and been granted) mobile push. */
export function isPushEnabled() {
  return getNotificationPrefs().pushEnabled
}

/**
 * Set the master mobile-push flag. Only flip this true once the browser
 * notification permission is actually granted (pushDelivery.js#ensurePushPermission).
 * @param {boolean} enabled
 */
export function setPushEnabled(enabled) {
  const raw = readRaw()
  writeRaw({ ...raw, pushEnabled: enabled === true })
  notify()
}

/**
 * Resolve how an entry of the given domain should actually be delivered right
 * now, collapsing the master push flag: a 'push' domain degrades to 'app' when
 * push is disabled so nothing is ever silently dropped.
 * @param {string} domain
 * @returns {'push'|'app'|'silent'}
 */
export function resolveDelivery(domain) {
  const { pushEnabled, modes } = getNotificationPrefs()
  const mode = modes[domain] || DEFAULT_MODE
  if (mode === 'push' && !pushEnabled) return 'app'
  return mode
}

/**
 * Subscribe to preference changes (e.g. the Preferences panel updating what the
 * delivery path does). Returns an unsubscribe function.
 * @param {() => void} listener
 * @returns {() => void} unsubscribe
 */
export function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
