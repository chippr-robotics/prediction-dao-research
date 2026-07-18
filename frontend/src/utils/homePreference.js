/**
 * Per-device persistence for the home surface's defaults (spec 058 US4):
 * which mode the home opens in (Pay / Request / Wager) and which currency
 * kind the amount hero starts on. Follows the qrColorPreference.js
 * pattern: plain localStorage, graceful fallbacks, never throws — the
 * defaults must apply on first paint at /app, including while disconnected,
 * which is why this is device-scoped rather than wallet-keyed.
 *
 * The currency is stored as a network-agnostic KIND ('stable' | 'native'),
 * never a symbol: the actual symbol is resolved per network at render time
 * (useChainTokens), so the display stays honest on networks whose stablecoin
 * is not USDC.
 *
 * Contract: specs/058-send-request-home/contracts/home-preferences.md
 */

const HOME_PREF_KEY = 'fairwins_home_v1'

export const HOME_MODES = ['pay', 'request', 'wager']
export const CURRENCY_KINDS = ['stable', 'native']

const DEFAULT_MODE = 'pay'
const DEFAULT_CURRENCY_KIND = 'stable'

const listeners = new Set()

function notify() {
  listeners.forEach((listener) => {
    try {
      listener()
    } catch (error) {
      console.warn('Error in homePreference listener:', error)
    }
  })
}

/** Read the raw stored object; {} on missing/corrupt/unavailable storage. */
function read() {
  try {
    const saved = localStorage.getItem(HOME_PREF_KEY)
    if (!saved) return {}
    const parsed = JSON.parse(saved)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch (error) {
    console.warn('Error reading home preference:', error)
    return {}
  }
}

/** Merge a patch into storage, preserving unknown fields (forward compat). */
function write(patch) {
  try {
    localStorage.setItem(HOME_PREF_KEY, JSON.stringify({ ...read(), ...patch }))
  } catch (error) {
    // Private browsing / quota: degrade to session-only state — listeners
    // still fire so open consumers stay consistent for this session.
    console.warn('Error saving home preference:', error)
  }
  notify()
}

/**
 * The home mode the app should open in.
 * @returns {'pay'|'request'|'wager'} stored value, or 'pay' on anything invalid
 */
export function getDefaultHomeMode() {
  const { defaultMode } = read()
  return HOME_MODES.includes(defaultMode) ? defaultMode : DEFAULT_MODE
}

/** Persist the default home mode; invalid values are ignored. */
export function setDefaultHomeMode(mode) {
  if (!HOME_MODES.includes(mode)) return
  write({ defaultMode: mode })
}

/**
 * The currency kind the amount hero starts on.
 * @returns {'stable'|'native'} stored value, or 'stable' on anything invalid
 */
export function getDefaultCurrencyKind() {
  const { defaultCurrencyKind } = read()
  return CURRENCY_KINDS.includes(defaultCurrencyKind) ? defaultCurrencyKind : DEFAULT_CURRENCY_KIND
}

/** Persist the default currency kind; invalid values are ignored. */
export function setDefaultCurrencyKind(kind) {
  if (!CURRENCY_KINDS.includes(kind)) return
  write({ defaultCurrencyKind: kind })
}

/**
 * Subscribe to changes made via the setters (e.g. the Preferences panel
 * updating what the home surface shows). Returns an unsubscribe function.
 * @param {() => void} listener
 * @returns {() => void} unsubscribe
 */
export function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
