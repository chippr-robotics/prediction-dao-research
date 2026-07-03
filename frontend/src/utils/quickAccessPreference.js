/**
 * Per-device persistence for which quick access cards show on the dashboard
 * (spec 038 US5). Follows the qrColorPreference.js pattern: plain-string
 * localStorage, graceful fallbacks, never throws. Stores the HIDDEN set —
 * cards absent from it (including any card added in the future) default to
 * visible, so a stale/empty value never hides anything unexpectedly.
 */

const QUICK_ACCESS_PREF_KEY = 'fairwins_quickaccess_v1'

const listeners = new Set()

function notify() {
  listeners.forEach((listener) => {
    try {
      listener()
    } catch (error) {
      console.warn('Error in quickAccessPreference listener:', error)
    }
  })
}

/**
 * Read the set of hidden quick access card ids for this device.
 * @returns {string[]} hidden card ids (empty array if none hidden, or on missing/corrupt storage)
 */
export function getHiddenCards() {
  try {
    const saved = localStorage.getItem(QUICK_ACCESS_PREF_KEY)
    if (!saved) return []
    const parsed = JSON.parse(saved)
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []
  } catch (error) {
    console.warn('Error reading quick access preference:', error)
    return []
  }
}

/**
 * Whether a given card id should currently be shown. Unknown/future ids
 * default to visible — only explicitly hidden ids are hidden.
 * @param {string} id - quick access card id
 * @returns {boolean}
 */
export function isCardVisible(id) {
  return !getHiddenCards().includes(id)
}

/**
 * Persist a card's visibility for this device. Storage failures (private
 * browsing, quota) degrade to session-only state — the in-memory listeners
 * still fire so the UI stays consistent for the current session.
 * @param {string} id - quick access card id
 * @param {boolean} visible - true to show, false to hide
 */
export function setCardVisible(id, visible) {
  const hidden = getHiddenCards()
  const next = visible
    ? hidden.filter((cardId) => cardId !== id)
    : (hidden.includes(id) ? hidden : [...hidden, id])
  try {
    localStorage.setItem(QUICK_ACCESS_PREF_KEY, JSON.stringify(next))
  } catch (error) {
    console.warn('Error saving quick access preference:', error)
  }
  notify()
}

/**
 * Subscribe to visibility changes made via setCardVisible (e.g. from a
 * different component instance, like the Preferences panel updating what
 * the Dashboard shows). Returns an unsubscribe function.
 * @param {() => void} listener
 * @returns {() => void} unsubscribe
 */
export function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
