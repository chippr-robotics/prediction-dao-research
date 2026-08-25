/**
 * The whole of this package's network layer (spec 095).
 *
 * THREE OUTCOMES, NEVER TWO. Every call resolves to exactly one of:
 *
 *   { state: 'ok',          status, body }            the gateway answered with JSON
 *   { state: 'error',       status, error, body }     the gateway answered, and said no
 *   { state: 'unreachable', reason }                  nothing answered, or what did was not JSON
 *
 * The middle one is the one that is easy to get wrong. A `403 insufficient_scope` is not an
 * outage — it is a specific, actionable fact the member needs to see verbatim, and collapsing it
 * into "request failed" throws away the only part of the response worth reading. Equally, an
 * unreachable gateway is not an empty result: nothing in this package may render `[]` or `0` for a
 * read that never happened.
 *
 * `fetch` is the only capability used here. It is not host-mediated — the platform CSP grants
 * `connect-src https:` scheme-wide (spec 069, so a member can point the app at their own node), and
 * the member types the origin themselves. `credentials: 'omit'` is explicit: this API authenticates
 * with a bearer token in a header and must never carry an ambient cookie.
 */

/** The public default, shown as a placeholder and used until the member saves something else. */
export const DEFAULT_BASE_URL = 'https://relay.fairwins.app'

/** The document that describes everything else. Deliberately the only path this module hardcodes. */
export const OPENAPI_PATH = '/v1/member/openapi.json'

/**
 * Drop the trailing run of `/`.
 *
 * SCANNED, NOT MATCHED. `replace(/\/+$/, '')` is quadratic on a rejecting input — a long run of
 * slashes followed by anything else makes the engine restart the run at every position — and both
 * callers below are handed a string the member typed. Walking back from the end is one pass.
 */
function stripTrailingSlashes(value) {
  let end = value.length
  while (end > 0 && value[end - 1] === '/') end -= 1
  return value.slice(0, end)
}

/**
 * Turn whatever the member typed into a base URL, or explain why it is not one.
 *
 * A bare host (`relay.fairwins.app`) is accepted and read as https — typing a scheme is not a
 * skill this console should test for. Anything else that is not http(s) is refused rather than
 * silently coerced, because a `ws://` or `file://` base would fail later with a browser error the
 * member cannot map back to what they typed.
 *
 * @param {string} raw
 * @returns {{ok: true, baseUrl: string} | {ok: false, reason: string}}
 */
export function normalizeBaseUrl(raw) {
  const text = String(raw ?? '').trim()
  if (!text) return { ok: false, reason: 'Enter the address of a FairWins gateway.' }

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`

  let url
  try {
    url = new URL(withScheme)
  } catch {
    return { ok: false, reason: `“${text}” is not a web address.` }
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, reason: `${url.protocol}// is not supported — use https (or http for a gateway on this machine).` }
  }
  // Keep any path prefix (a gateway behind `/api`), drop the trailing slash so joins stay clean.
  const trimmedPath = stripTrailingSlashes(url.pathname)
  return { ok: true, baseUrl: `${url.origin}${trimmedPath}` }
}

/** Join a normalized base with an absolute API path. */
export function apiUrl(baseUrl, path) {
  return `${stripTrailingSlashes(String(baseUrl || ''))}${path}`
}

/**
 * Read the platform's nested error body, or report that the response did not carry one.
 *
 * Every gateway error is `{ error: { code, reason } }`. A response that is not shaped like that is
 * still an error — it is just one this console has to describe in its own words rather than the
 * gateway's, and saying which of the two happened is part of being honest about what is known.
 */
function readErrorBody(parsed, status) {
  const error = parsed && typeof parsed === 'object' ? parsed.error : null
  if (error && typeof error === 'object' && typeof error.code === 'string' && error.code) {
    return { code: error.code, reason: typeof error.reason === 'string' ? error.reason : '' }
  }
  return {
    code: `http_${status}`,
    reason: 'The gateway answered with an error that did not carry a FairWins error code.',
  }
}

/** A network failure, described without guessing at a cause the browser did not give us. */
function describeNetworkFailure(err) {
  const detail = err && err.message ? String(err.message) : ''
  return detail
    ? `The gateway could not be reached (${detail}).`
    : 'The gateway could not be reached.'
}

/**
 * Perform one JSON request.
 *
 * Never throws except for an abort, which callers already handle as "this mount went away".
 *
 * @param {string} url absolute URL
 * @param {{token?: string, signal?: AbortSignal, method?: string, body?: unknown}} [options]
 */
export async function requestJson(url, options = {}) {
  const { token, signal, method = 'GET', body } = options

  const headers = { Accept: 'application/json' }
  // The token rides in a header and nowhere else: never a query parameter, never a logged URL.
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let response
  try {
    response = await fetch(url, {
      method,
      headers,
      signal,
      credentials: 'omit',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  } catch (err) {
    if (err && err.name === 'AbortError') throw err
    return { state: 'unreachable', reason: describeNetworkFailure(err) }
  }

  let text
  try {
    text = await response.text()
  } catch (err) {
    if (err && err.name === 'AbortError') throw err
    return { state: 'unreachable', reason: 'The connection dropped while the answer was arriving.' }
  }

  let parsed = null
  let parseFailed = false
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parseFailed = true
  }

  if (response.ok) {
    if (parseFailed) {
      // A 200 of HTML is the classic "you reached a proxy, not the gateway". Saying so beats
      // rendering an empty console and letting the member conclude their key is broken.
      return {
        state: 'unreachable',
        reason: `${url} answered, but not with JSON — check that this is a FairWins gateway and not a page in front of one.`,
      }
    }
    return { state: 'ok', status: response.status, body: parsed }
  }

  return {
    state: 'error',
    status: response.status,
    error: readErrorBody(parsed, response.status),
    body: parseFailed ? null : parsed,
    retryAfter: response.headers && response.headers.get ? response.headers.get('Retry-After') : null,
  }
}
