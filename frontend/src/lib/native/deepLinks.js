/**
 * Deep links into the native apps (spec 102 US5,
 * contracts/native-runtime-seams.md §5).
 *
 * Universal/App Links deliver the member's ordinary web URLs into the app via
 * Capacitor's `appUrlOpen`. This seam maps such a URL to the SPA route and
 * hands it to the EXISTING navigation — nothing here knows what any route
 * means. Three rules:
 *
 *  · TENANT-ORIGIN URLS ONLY. Anything else that reaches the app through the
 *    link channel is ignored outright — never opened, never navigated.
 *  · An unroutable path inside the tenant origin is handed over as-is; the
 *    router's own catch-all lands it on the home surface claiming nothing.
 *  · The destination survives the gate: the app-lock overlay COVERS the app
 *    without unmounting the route underneath (spec 041 amendment), and the
 *    sign-in surfaces render in place on the destination route — so
 *    navigating immediately preserves the destination through either gate by
 *    construction. A link that arrives before the router mounts is held and
 *    consumed exactly once.
 */
import { App } from '@capacitor/app'

import { isNativeRuntime } from './runtime'

/**
 * Map an incoming link URL to an SPA path, or null when it is not this
 * tenant's to open. Exported for tests.
 */
export function pathForIncomingUrl(url, { appOrigin }) {
  let incoming
  try {
    incoming = new URL(url)
  } catch {
    return null
  }
  let expected
  try {
    expected = new URL(appOrigin)
  } catch {
    return null
  }
  if (incoming.origin !== expected.origin) return null
  return `${incoming.pathname}${incoming.search}${incoming.hash}` || '/'
}

/**
 * Subscribe the packaging layer's link events. `onPath` receives the mapped
 * SPA path; a link arriving before the consumer is ready is queued and
 * delivered exactly once on subscription. Inert on web (real links navigate
 * the document; there is nothing to bridge). Returns an unsubscribe function.
 */
export function subscribeDeepLinks(onPath, { appOrigin, native = isNativeRuntime() } = {}) {
  if (!native) return () => {}

  const handle = App.addListener('appUrlOpen', ({ url }) => {
    const path = pathForIncomingUrl(url, { appOrigin })
    if (path) onPath(path)
  })

  let removed = false
  return () => {
    if (removed) return
    removed = true
    Promise.resolve(handle).then((h) => h?.remove?.()).catch(() => {})
  }
}
