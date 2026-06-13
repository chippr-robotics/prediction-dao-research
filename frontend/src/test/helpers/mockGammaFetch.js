import { vi } from 'vitest'

/**
 * Install a URL-aware `fetch` mock for Gamma API tests.
 *
 * @param {Array<{ match: (url: string) => boolean, json?: any, ok?: boolean, status?: number, error?: Error }>} routes
 *   Ordered routes; the first whose `match(url)` is true wins. `error` rejects
 *   the call (e.g. to simulate a network failure / abort).
 * @returns the vi.fn so tests can assert on requested URLs.
 *
 * This is test-only code; URL matching here drives fixtures, not real requests.
 */
export function installGammaFetch(routes = []) {
  const fn = vi.fn(async (url, options = {}) => {
    const route = routes.find((r) => r.match(String(url)))
    if (route?.error) throw route.error
    if (options?.signal?.aborted) {
      const err = new Error('aborted')
      err.name = 'AbortError'
      throw err
    }
    return {
      ok: route?.ok ?? true,
      status: route?.status ?? 200,
      json: async () => route?.json ?? {},
      text: async () => JSON.stringify(route?.json ?? {}),
    }
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

/** Convenience matchers. */
export const urlHas = (needle) => (url) => url.includes(needle)
export const urlHasAll = (...needles) => (url) => needles.every((n) => url.includes(n))
