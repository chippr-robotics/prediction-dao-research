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
  // Take over as soon as the new worker is ready so users aren't stuck on an old one.
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(OFFLINE_URLS).catch(() => undefined))
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
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
