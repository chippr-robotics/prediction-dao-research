/* FairWins service worker.
 *
 * Kept intentionally minimal: its job is to make the app a real, installable PWA
 * (Chromium's install criteria historically want a registered service worker with
 * a fetch handler) — NOT to aggressively cache. Aggressive caching of a web3 app
 * risks serving stale JS bundles against live on-chain state, so we only pre-cache
 * a tiny app-shell for an offline fallback and pass everything else straight to the
 * network. Bump CACHE_VERSION to invalidate the shell cache on deploy.
 */
const CACHE_VERSION = 'fairwins-shell-v1'
const OFFLINE_URLS = ['/', '/index.html', '/manifest.webmanifest']

self.addEventListener('install', (event) => {
  // NOTE: we deliberately do NOT call skipWaiting() here. On a fresh install there is
  // no controlling worker, so the new worker activates immediately anyway. On an UPDATE
  // the old worker keeps controlling open tabs and the new one parks in `waiting` until
  // the user approves the update (the app posts SKIP_WAITING). This gives a controlled,
  // user-driven update flow instead of swapping bundles out from under a live session.
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(OFFLINE_URLS).catch(() => undefined))
  )
})

// The page posts { type: 'SKIP_WAITING' } when the user clicks "Update now"; that
// promotes this waiting worker to active, which fires `controllerchange` on the client.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

// Activity notifications. When the running PWA raises a system
// notification for a 'push'-mode activity entry (via registration.showNotification),
// tapping it must focus the app and deep-link to that entry. The entry's router
// link ({ to, state }) rides along in notification.data; we hand it to a focused
// client (the ActivityNotificationBridge performs the in-app navigation) or, if
// no window is open, open one at the link's path.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const link = (event.notification.data && event.notification.data.link) || null
  const targetPath = (link && link.to) || '/app'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus()
          client.postMessage({ type: 'ACTIVITY_NAVIGATE', link: link || { to: targetPath } })
          return undefined
        }
      }
      return self.clients.openWindow ? self.clients.openWindow(targetPath) : undefined
    })
  )
})

// Forward-compat: real server-initiated Web Push. There is no push backend today
// (notifications are derived client-side), but wiring this listener now means a
// future backend can deliver push without another service-worker change.
self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = {}
  }
  const title = payload.title || 'FairWins'
  const options = {
    body: payload.body || payload.message || 'New activity',
    icon: '/assets/fairwins_no-text_logo.svg',
    badge: '/assets/fairwins_no-text_logo.svg',
    tag: payload.tag || 'fairwins-activity',
    data: { link: payload.link || null },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  // Only handle GET navigations for the offline fallback; everything else is network-only.
  if (request.method !== 'GET') return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(request).then((cached) => cached || caches.match('/index.html'))
      )
    )
    return
  }

  // Non-navigation GETs: try network, fall back to any cached shell asset if offline.
  event.respondWith(fetch(request).catch(() => caches.match(request)))
})
