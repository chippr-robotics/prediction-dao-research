/**
 * Onramp gateway client (spec 060) — the SPA side of the relay-gateway's /v1/onramp/* buy-crypto
 * proxy. The gateway holds the CDP credentials and mints single-use Coinbase hosted-session tokens
 * (secure init) after screening the destination; this client only ever sees the finished
 * pay.coinbase.com URL. Soft-fail by design: with VITE_RELAYER_URL unset — or on any error — the
 * feature reports unavailable and the wallet-sheet Buy button hides entirely (FR-006/FR-007),
 * mirroring the collectibles/predict gateway clients. FairWins never custodies funds, never sees
 * the payment, and adds no fee (FR-004/FR-008).
 */
import { getNetwork } from '../../config/networks'

const FETCH_TIMEOUT_MS = 12_000

/** Transport failure, timeout, 4xx/5xx, killswitch, or quota exhaustion — callers hide/degrade. */
export class OnrampUnavailable extends Error {
  constructor(message, { code, cause } = {}) {
    super(message)
    this.name = 'OnrampUnavailable'
    this.code = code || 'unavailable'
    if (cause !== undefined) this.cause = cause
  }
}

/** The configured gateway base URL, or '' when unset. Read at call time so tests can stub the env. */
export function onrampGatewayUrl() {
  return (import.meta.env.VITE_RELAYER_URL || '').trim().replace(/\/$/, '')
}

/**
 * Whether buying exists at all for this chain: Coinbase Onramp must serve the network (static
 * capability — mainnets only, never testnets) AND a gateway must be configured. False hides the
 * Buy button entirely; the dynamic layer (fetchOnrampOptions) then confirms the live catalog.
 */
export function onrampAvailable(chainId) {
  return Boolean(getNetwork(chainId)?.capabilities?.onramp) && onrampGatewayUrl() !== ''
}

async function request(path, { method = 'GET', body } = {}) {
  const base = onrampGatewayUrl()
  if (!base) throw new OnrampUnavailable('onramp gateway is not configured', { code: 'unconfigured' })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  let res
  try {
    res = await fetch(`${base}${path}`, {
      method,
      ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    })
  } catch (e) {
    throw new OnrampUnavailable(`onramp gateway unreachable: ${e?.message || e}`, {
      code: e?.name === 'AbortError' ? 'timeout' : 'network_error',
      cause: e,
    })
  } finally {
    clearTimeout(timer)
  }

  if (res.ok) return res.json()

  let errBody = null
  try {
    errBody = await res.json()
  } catch {
    /* non-JSON error */
  }
  const code = errBody?.error?.code || `http_${res.status}`
  const err = new OnrampUnavailable(errBody?.error?.reason || `onramp request failed (${res.status})`, { code })
  err.status = res.status
  throw err
}

/**
 * Dynamic availability + purchasable assets for a chain →
 * { chainId, available, assets, defaultAsset, fetchedAt, stale }.
 */
export function fetchOnrampOptions(chainId) {
  return request(`/v1/onramp/options?chainId=${encodeURIComponent(chainId)}`)
}

/**
 * Mint a single-use Coinbase session for a screened destination → { url }.
 * The URL expires in ~5 minutes and must be opened immediately from the user gesture.
 */
export function createOnrampSession({ address, chainId, asset }) {
  return request('/v1/onramp/session', { method: 'POST', body: { address, chainId, asset } })
}
