/**
 * Member-configured RPC endpoints (spec 069).
 *
 * FairWins is a multi-network control plane: every asset carries its own chainId and
 * reads fan out across all supported networks at once, independent of whichever chain
 * the wallet happens to sit on. That makes the RPC route a piece of infrastructure the
 * MEMBER owns, not a build-time constant — a member with a paid Alchemy/QuickNode key
 * wants their reads on it, with a failover for when it rate-limits.
 *
 * This module is the single source of truth for those overrides.
 *
 * Three deliberate choices:
 *
 * 1. DEVICE-SCOPED, NOT ACCOUNT-SCOPED. Reads happen with no wallet connected (the
 *    landing portfolio, capability probes), so an account-keyed store would leave the
 *    app's busiest read paths on the build defaults. Endpoints live in the non-wallet
 *    global preference blob (`utils/userStorage#saveGlobalPreference`).
 *
 * 2. NEVER IN A BACKUP. An endpoint entry can carry a provider credential. The spec-032
 *    backup blob is exportable plaintext-at-rest for everything except the spec-062 key
 *    vault, so endpoints are intentionally absent from `lib/backup/syncedObjects.js` —
 *    a member re-enters them per device. Do not "fix" that by adding an entry there.
 *
 * 3. SYNCHRONOUS + FRAMEWORK-FREE. `wagmi.js` builds its transports at module load and
 *    ~20 non-React read paths call `makeReadProvider` outside any component, so
 *    resolution must work without React and without awaiting anything.
 *
 * Credentials are redacted (`redactRpcUrl`) at every display and log boundary — see the
 * T148 leak (scripts/ops/verify-protocol-addresses.js printed keyed URLs verbatim into
 * CI logs). Nothing in this module ever console-logs a URL or token unredacted.
 */

import { getGlobalPreference, saveGlobalPreference } from '../../utils/userStorage'

/** Global-preference key holding the per-chain override map. */
export const ENDPOINTS_PREF_KEY = 'network_endpoints'

/** Auth modes a provider credential can be presented in. */
export const AUTH_MODES = {
  /** No credential, or one already embedded in the URL path/query (Alchemy, QuickNode). */
  NONE: 'none',
  /** Custom header, e.g. `x-api-key: …` (Chainstack, NOWNodes, self-hosted gateways). */
  HEADER: 'header',
  /** `Authorization: Bearer …` (Tenderly, dRPC tokens, JWT-gated nodes). */
  BEARER: 'bearer',
}

const MAX_URL_LENGTH = 2048
const MAX_TOKEN_LENGTH = 512
const MAX_HEADER_NAME_LENGTH = 64

/**
 * Hosts the production Content-Security-Policy `connect-src` allows the browser to
 * reach (frontend/nginx.conf + nginx.conf.template). A custom endpoint on any other
 * host is BLOCKED BY THE BROWSER before a request leaves the page, so the panel warns
 * about it up front rather than letting the member discover it as a dead network.
 *
 * Entries are matched as either an exact host or, for `*.`-prefixed patterns, any
 * subdomain of the suffix — the same semantics as the CSP host-source grammar, so this
 * list and the header stay one statement in two places. Keep in sync with
 * `src/test/nginxCspConnectSrc.test.js`, which asserts the header carries them.
 */
export const CSP_RPC_HOST_PATTERNS = [
  // Curated build defaults (config/networks.js).
  'rpc-amoy.polygon.technology',
  'polygon-bor-rpc.publicnode.com',
  'rpc.mordor.etccooperative.org',
  'etc.rivet.link',
  'ethereum-rpc.publicnode.com',
  'ethereum-sepolia-rpc.publicnode.com',
  'ethereum-hoodi-rpc.publicnode.com',
  'arbitrum-one-rpc.publicnode.com',
  'base-rpc.publicnode.com',
  'optimism-rpc.publicnode.com',
  // Member-supplied endpoints: the providers whose hosts we allow so a pasted URL works.
  '*.publicnode.com',
  '*.infura.io',
  '*.alchemy.com',
  '*.quiknode.pro',
  '*.chainstacklabs.com',
  '*.core.chainstack.com',
  '*.ankr.com',
  '*.drpc.org',
  '*.blastapi.io',
  '*.llamarpc.com',
  '*.tenderly.co',
  '*.nodereal.io',
  '*.omniatech.io',
  '*.rpc.grove.city',
  '*.etccooperative.org',
  '*.rivet.link',
  '1rpc.io',
]

/** True when `host` matches a CSP host pattern (exact, or `*.suffix`). */
function hostMatchesPattern(host, pattern) {
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(2)
    return host === suffix || host.endsWith(`.${suffix}`)
  }
  return host === pattern
}

/**
 * Whether the browser will be allowed to connect to this URL under the production CSP.
 * Localhost is always treated as allowed — dev serves without the nginx policy.
 */
export function isCspAllowedRpcUrl(url) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  const host = parsed.hostname
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return true
  return CSP_RPC_HOST_PATTERNS.some((pattern) => hostMatchesPattern(host, pattern))
}

/**
 * An endpoint string safe to render or log.
 *
 * Providers embed the API key in the URL PATH (Alchemy, QuickNode) or a query parameter,
 * so protocol + host is the most that can be shown; `/…` states that a credential exists
 * without revealing it. Mirrors `safeRpcLabel` in scripts/ops/verify-protocol-addresses.js.
 */
export function redactRpcUrl(url) {
  if (!url) return ''
  try {
    const parsed = new URL(url)
    const hasSecret = (parsed.pathname && parsed.pathname !== '/') || parsed.search !== ''
    return `${parsed.protocol}//${parsed.host}${hasSecret ? '/…' : ''}`
  } catch {
    // Unparseable — say nothing rather than risk echoing a raw secret.
    return '(unparseable endpoint)'
  }
}

/**
 * Validate one URL a member typed.
 * @returns {{ ok: boolean, error?: string, warning?: string }}
 */
export function validateRpcUrl(url, { label = 'RPC URL' } = {}) {
  const trimmed = (url || '').trim()
  if (!trimmed) return { ok: true } // empty = "use the default"; not an error
  if (trimmed.length > MAX_URL_LENGTH) return { ok: false, error: `${label} is too long.` }

  let parsed
  try {
    parsed = new URL(trimmed)
  } catch {
    return { ok: false, error: `${label} is not a valid URL.` }
  }

  if (parsed.protocol === 'ws:' || parsed.protocol === 'wss:') {
    return { ok: false, error: `${label} must be an HTTPS endpoint — WebSocket RPC is not supported.` }
  }
  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLocal)) {
    return { ok: false, error: `${label} must use https:// (http:// is allowed only for localhost).` }
  }
  if (parsed.username || parsed.password) {
    return {
      ok: false,
      error: `${label} must not carry credentials in the URL — use the API key fields instead.`,
    }
  }
  if (!isCspAllowedRpcUrl(trimmed)) {
    return {
      ok: true,
      warning:
        `${parsed.hostname} is not in the app's content-security-policy allowlist, so the browser ` +
        'will block requests to it. Test the endpoint before relying on it.',
    }
  }
  return { ok: true }
}

/**
 * Validate a whole endpoint entry as typed in the panel.
 * @returns {{ ok: boolean, errors: Record<string,string>, warnings: string[] }}
 */
export function validateEndpointEntry(entry = {}) {
  const errors = {}
  const warnings = []

  const primary = validateRpcUrl(entry.url, { label: 'RPC URL' })
  if (!primary.ok) errors.url = primary.error
  else if (primary.warning) warnings.push(primary.warning)

  const failover = validateRpcUrl(entry.failoverUrl, { label: 'Failover RPC URL' })
  if (!failover.ok) errors.failoverUrl = failover.error
  else if (failover.warning) warnings.push(failover.warning)

  const url = (entry.url || '').trim()
  const failoverUrl = (entry.failoverUrl || '').trim()
  if (url && failoverUrl && url === failoverUrl) {
    errors.failoverUrl = 'The failover endpoint must differ from the primary endpoint.'
  }
  if (!url && failoverUrl) {
    errors.url = 'Set a primary RPC URL before adding a failover.'
  }

  const mode = entry.authMode || AUTH_MODES.NONE
  if (![AUTH_MODES.NONE, AUTH_MODES.HEADER, AUTH_MODES.BEARER].includes(mode)) {
    errors.authMode = 'Unknown authentication mode.'
  }
  const token = (entry.authToken || '').trim()
  if (mode !== AUTH_MODES.NONE) {
    if (!token) errors.authToken = 'Enter the API key or token, or set authentication to None.'
    else if (token.length > MAX_TOKEN_LENGTH) errors.authToken = 'API key is too long.'
    else if (/\s/.test(token)) errors.authToken = 'API key must not contain spaces.'
  }
  if (mode === AUTH_MODES.HEADER) {
    const headerName = (entry.authHeaderName || '').trim()
    if (!headerName) errors.authHeaderName = 'Enter the header name your provider expects.'
    else if (headerName.length > MAX_HEADER_NAME_LENGTH) errors.authHeaderName = 'Header name is too long.'
    // RFC 7230 token: no separators, no whitespace, no control characters.
    else if (!/^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/.test(headerName)) {
      errors.authHeaderName = 'Header name may only contain letters, numbers and - _ . characters.'
    }
  }
  if (!url && (mode !== AUTH_MODES.NONE || token)) {
    errors.url = 'Set a primary RPC URL before adding an API key.'
  }

  return { ok: Object.keys(errors).length === 0, errors, warnings }
}

/** Strip an entry down to the persisted shape, dropping empty/irrelevant fields. */
function normalizeEntry(entry = {}) {
  const url = (entry.url || '').trim()
  if (!url) return null
  const mode = [AUTH_MODES.HEADER, AUTH_MODES.BEARER].includes(entry.authMode)
    ? entry.authMode
    : AUTH_MODES.NONE
  const out = { url }
  const failoverUrl = (entry.failoverUrl || '').trim()
  if (failoverUrl && failoverUrl !== url) out.failoverUrl = failoverUrl
  const token = (entry.authToken || '').trim()
  if (mode !== AUTH_MODES.NONE && token) {
    out.authMode = mode
    out.authToken = token
    if (mode === AUTH_MODES.HEADER) out.authHeaderName = (entry.authHeaderName || '').trim()
  }
  return out
}

// ---------------------------------------------------------------------------
// Persistence + in-memory snapshot
// ---------------------------------------------------------------------------

/** @type {Record<string, object>|null} lazily loaded snapshot, keyed by chainId string. */
let snapshot = null
/** Bumped on every change so React consumers can re-derive providers. */
let revision = 0
const listeners = new Set()

function readFromStorage() {
  const raw = getGlobalPreference(ENDPOINTS_PREF_KEY, {})
  if (!raw || typeof raw !== 'object') return {}
  const out = {}
  for (const [chainKey, entry] of Object.entries(raw)) {
    const chainId = Number(chainKey)
    if (!Number.isFinite(chainId) || chainId <= 0) continue
    const normalized = normalizeEntry(entry)
    if (normalized) out[String(chainId)] = normalized
  }
  return out
}

/** The full override map, keyed by chainId string. Never returns null. */
export function loadEndpointSettings() {
  if (snapshot === null) snapshot = readFromStorage()
  return snapshot
}

/** One chain's override entry, or null when the chain runs on its build default. */
export function getEndpointSettings(chainId) {
  return loadEndpointSettings()[String(Number(chainId))] || null
}

/** Monotonic counter that changes whenever any endpoint setting changes. */
export function endpointsRevision() {
  return revision
}

/** Subscribe to endpoint changes. Returns an unsubscribe function. */
export function subscribeEndpointSettings(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function commit(next) {
  snapshot = next
  revision += 1
  saveGlobalPreference(ENDPOINTS_PREF_KEY, next)
  for (const listener of listeners) {
    try {
      listener(revision)
    } catch {
      // A bad subscriber must not break the save.
    }
  }
}

/**
 * Persist one chain's endpoint entry. An entry with no primary URL clears the override
 * (that is what "Reset to default" does), so a member can never end up with a stored
 * credential and no endpoint to use it on.
 *
 * @param {number} chainId
 * @param {{url?: string, failoverUrl?: string, authMode?: string, authHeaderName?: string, authToken?: string}} entry
 */
export function saveEndpointSettings(chainId, entry) {
  const key = String(Number(chainId))
  const normalized = normalizeEntry(entry)
  const next = { ...loadEndpointSettings() }
  if (normalized) next[key] = normalized
  else delete next[key]
  commit(next)
  return normalized
}

/** Drop one chain's override, returning it to the build default. */
export function resetEndpointSettings(chainId) {
  const key = String(Number(chainId))
  const current = loadEndpointSettings()
  if (!(key in current)) return
  const next = { ...current }
  delete next[key]
  commit(next)
}

/** Drop every override (used by tests and the panel's "reset all"). */
export function clearAllEndpointSettings() {
  commit({})
}

/** Test seam: forget the in-memory snapshot so the next read hits storage again. */
export function __resetEndpointStoreForTests() {
  snapshot = null
  revision = 0
  listeners.clear()
}
