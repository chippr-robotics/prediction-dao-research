/**
 * Device-wide preference for the PWA install prompt.
 *
 * This is deliberately NOT tied to a wallet address: a first-time visitor who
 * has never connected a wallet still needs to see (and be able to permanently
 * dismiss) the install bottom-sheet. So we persist it via the global-preference
 * helpers (localStorage, keyed per browser/device) rather than the wallet-scoped
 * user-preference store.
 *
 * Two levels of "don't bother me":
 *   - HIDDEN (persistent, this module): user chose "Don't show again". Survives
 *     reloads and is the flag surfaced/toggle-able in the wallet Preferences tab.
 *   - SNOOZED (per session, sessionStorage): user tapped "Continue in browser" or
 *     closed the sheet. Cleared when the tab/session ends.
 *
 * A tiny pub/sub (custom event) lets the bottom-sheet and the Preferences toggle
 * react to each other's changes within the same tab without a shared React
 * context. `storage` events cover cross-tab sync for free.
 */
import { getGlobalPreference, saveGlobalPreference } from '../../utils/userStorage'

export const INSTALL_PROMPT_HIDDEN_KEY = 'pwaInstallPromptHidden'
const SESSION_SNOOZE_KEY = 'fw_pwa_install_snoozed'
const CHANGE_EVENT = 'fw:pwa-install-pref-change'

/** True when the user has permanently opted out of the install prompt. */
export function isInstallPromptHidden() {
  return getGlobalPreference(INSTALL_PROMPT_HIDDEN_KEY, false) === true
}

/** Persist the permanent opt-out flag and notify subscribers. */
export function setInstallPromptHidden(hidden) {
  saveGlobalPreference(INSTALL_PROMPT_HIDDEN_KEY, Boolean(hidden))
  notify()
}

/** True when the prompt has been dismissed for the current browser session only. */
export function isInstallPromptSnoozed() {
  try {
    return sessionStorage.getItem(SESSION_SNOOZE_KEY) === '1'
  } catch {
    return false
  }
}

/** Dismiss the prompt for the rest of this session (does not persist across reloads). */
export function snoozeInstallPromptForSession() {
  try {
    sessionStorage.setItem(SESSION_SNOOZE_KEY, '1')
  } catch {
    // sessionStorage may be unavailable (private mode / SSR); non-fatal.
  }
  notify()
}

function notify() {
  try {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
  } catch {
    // window may be absent in non-DOM environments; non-fatal.
  }
}

/**
 * Subscribe to preference changes (in-tab custom event + cross-tab storage event).
 * Returns an unsubscribe function.
 */
export function subscribeInstallPref(callback) {
  const onStorage = (e) => {
    // Only react to the global-prefs bucket (and the coarse `null` all-cleared case).
    if (e.key === null || e.key === 'fw_global_prefs') callback()
  }
  window.addEventListener(CHANGE_EVENT, callback)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback)
    window.removeEventListener('storage', onStorage)
  }
}
