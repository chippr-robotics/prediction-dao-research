/**
 * Client-side "mobile push" delivery via the Web Notifications API.
 *
 * There is no notification backend (spec 031 derives everything client-side), so
 * "push" here means: while the installed PWA is running — including backgrounded
 * on a phone — the ActivityProvider poll loop raises a real OS notification
 * (tray / lock screen) for domains the user set to 'push'. Tapping it focuses the
 * app and deep-links to the entry (handled by public/sw.js#notificationclick).
 *
 * We prefer the ServiceWorkerRegistration.showNotification() path (works
 * backgrounded and supports actions/tags) and fall back to the `new Notification`
 * constructor where no SW controls the page. All calls are permission- and
 * feature-guarded and never throw — a failure degrades silently to the in-app
 * toast that always accompanies a push-mode entry.
 *
 * This module is deliberately backend-agnostic: if a real Web Push service is
 * added later, subscribeToPush() below is the single seam to extend (register a
 * PushSubscription with the backend) without touching the UI or delivery path.
 */

const NOTIFICATION_TAG_PREFIX = 'fairwins-activity'

/** Whether this environment can show system notifications at all. */
export function isPushSupported() {
  return typeof window !== 'undefined' && 'Notification' in window
}

/**
 * Current browser permission for notifications.
 * @returns {'granted'|'denied'|'default'|'unsupported'}
 */
export function getPermissionState() {
  if (!isPushSupported()) return 'unsupported'
  return Notification.permission
}

/**
 * Request notification permission if not already decided. Resolves to true only
 * when permission ends up granted. Safe to call from a user gesture (the browser
 * requires one for the prompt).
 * @returns {Promise<boolean>}
 */
export async function ensurePushPermission() {
  if (!isPushSupported()) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  try {
    const result = await Notification.requestPermission()
    return result === 'granted'
  } catch (error) {
    console.warn('[pushDelivery] permission request failed:', error)
    return false
  }
}

/**
 * Raise a system notification for an activity entry. No-op unless permission is
 * granted. Best-effort: prefers the service-worker registration (backgrounded
 * delivery), falls back to the page-level Notification constructor.
 * @param {{ id?: string, message: string, domain?: string, severity?: string, link?: object }} entry
 * @returns {Promise<boolean>} whether a notification was shown
 */
export async function showSystemNotification(entry) {
  if (!isPushSupported() || Notification.permission !== 'granted' || !entry) return false

  const title = 'FairWins'
  const options = {
    body: entry.message || 'New activity',
    // Tag by entry id so a re-detected entry replaces rather than stacks.
    tag: entry.id ? `${NOTIFICATION_TAG_PREFIX}:${entry.id}` : NOTIFICATION_TAG_PREFIX,
    icon: '/assets/fairwins_no-text_logo.svg',
    badge: '/assets/fairwins_no-text_logo.svg',
    // Carried through to sw.js#notificationclick for deep-link navigation.
    data: { link: entry.link || null, domain: entry.domain || null, entryId: entry.id || null },
  }

  try {
    if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
      const registration = await navigator.serviceWorker.ready
      if (registration && typeof registration.showNotification === 'function') {
        await registration.showNotification(title, options)
        return true
      }
    }
  } catch (error) {
    // Fall through to the constructor path below.
    console.warn('[pushDelivery] SW notification failed, falling back:', error)
  }

  try {
    const shown = new Notification(title, options)
    return Boolean(shown)
  } catch (error) {
    console.warn('[pushDelivery] Notification constructor failed:', error)
    return false
  }
}

/**
 * Backend seam (currently a no-op). If a real Web Push service is added, this is
 * where the page would `registration.pushManager.subscribe({ applicationServerKey })`
 * and POST the PushSubscription to the backend. Kept here so the UI/preferences
 * never need to change when server push lands.
 * @returns {Promise<null>}
 */
export async function subscribeToPush() {
  return null
}
