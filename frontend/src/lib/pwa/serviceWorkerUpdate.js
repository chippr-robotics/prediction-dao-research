/**
 * Service-worker update lifecycle for the FairWins PWA.
 *
 * Registers the worker, watches for a newer version in the background, and exposes a
 * small external store so React can surface an "update available" notification and let
 * the user apply it on their terms.
 *
 * Flow:
 *   1. registerServiceWorker() runs once at startup (production only).
 *   2. The browser (and our periodic poll) fetches /sw.js; a byte-different worker
 *      installs and parks in `waiting` behind the current controller.
 *   3. We detect the waiting worker and flip `updateReady` → the app shows a prompt.
 *   4. applyUpdate() posts SKIP_WAITING to the waiting worker; when it takes control
 *      `controllerchange` fires and we reload once so the new bundle is live.
 *
 * The reload is gated on `userTriggeredUpdate` so the first-ever activation (which also
 * fires controllerchange via clients.claim()) never reloads the page unexpectedly.
 */

// How often to poll for a new worker while the app is open (1 hour).
const CHECK_INTERVAL_MS = 60 * 60 * 1000

let registration = null
let waitingWorker = null
let updateReady = false
let userTriggeredUpdate = false
let reloading = false
const listeners = new Set()

function emit() {
  listeners.forEach((l) => l())
}

function markUpdateReady(worker) {
  waitingWorker = worker || waitingWorker
  if (!updateReady) {
    updateReady = true
    emit()
  }
}

/** Subscribe to update-state changes. Returns an unsubscribe function. */
export function subscribe(callback) {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

/** useSyncExternalStore snapshot: is a new version installed and waiting? */
export function getUpdateReadySnapshot() {
  return updateReady
}

// A worker reaching `installed` while a controller already exists means it's an update
// waiting behind the running version (as opposed to the very first install).
function watchInstalling(worker) {
  if (!worker) return
  worker.addEventListener('statechange', () => {
    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
      markUpdateReady(worker)
    }
  })
}

/**
 * Register the service worker and wire up background update detection.
 * No-op where service workers are unavailable.
 */
export function registerServiceWorker() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return
  if (!('serviceWorker' in navigator)) return

  window.addEventListener('load', async () => {
    try {
      registration = await navigator.serviceWorker.register('/sw.js')

      // A newer worker may already be waiting from a previous visit/tab.
      if (registration.waiting && navigator.serviceWorker.controller) {
        markUpdateReady(registration.waiting)
      }

      registration.addEventListener('updatefound', () => {
        watchInstalling(registration.installing)
      })

      // Reload exactly once, and only for a user-approved update.
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!userTriggeredUpdate || reloading) return
        reloading = true
        window.location.reload()
      })

      // Background freshness: poll periodically and whenever the tab regains focus.
      const check = () => {
        registration?.update().catch(() => {})
      }
      setInterval(check, CHECK_INTERVAL_MS)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
    } catch (error) {
      console.warn('Service worker registration failed:', error)
    }
  })
}

/**
 * Apply a waiting update: promote the new worker and let controllerchange reload us.
 * @returns {boolean} true if an update was pending and has been triggered.
 */
export function applyUpdate() {
  if (!waitingWorker) return false
  userTriggeredUpdate = true
  waitingWorker.postMessage({ type: 'SKIP_WAITING' })
  return true
}

/** Manually poll for a new worker (e.g. a "Check for updates" button). */
export function checkForUpdate() {
  if (!registration) return Promise.resolve()
  return registration.update().catch(() => {})
}

// Test-only: reset module singletons between cases.
export function __resetForTests() {
  registration = null
  waitingWorker = null
  updateReady = false
  userTriggeredUpdate = false
  reloading = false
  listeners.clear()
}
