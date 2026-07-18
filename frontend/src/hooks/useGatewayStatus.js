import { useState, useEffect, useCallback, useRef } from 'react'

/**
 * useGatewayStatus — poll the relay-gateway `GET /status` endpoint for the
 * operations control plane.
 *
 * The gateway is GAS INFRASTRUCTURE with no admin API by design: this hook is
 * strictly read-only telemetry. `/status` (not `/healthz` — Google's GFE
 * intercepts that literal path on Cloud Run) returns:
 *
 *   { status: 'ok'|..., killSwitch: boolean,
 *     chains: { <chainId>: { rpc: 'up'|'down',
 *                            gasWalletRunwayHrs?, paymasterDepositRunwayHrs? } } }
 *
 * The runway fields are operator telemetry the gateway only discloses to
 * callers presenting a valid X-Origin-Auth header (injected zone-wide by
 * Cloudflare in production) — when absent we render the public subset.
 */

const POLL_MS = 60_000
const FETCH_TIMEOUT_MS = 5_000

export function gatewayBaseUrl() {
  return (import.meta.env.VITE_RELAYER_URL || '').trim().replace(/\/$/, '')
}

/** Normalize a raw /status payload into what the control plane renders. */
export function parseGatewayStatus(data) {
  if (!data || typeof data !== 'object') return null
  const chains = Object.entries(data.chains || {}).map(([chainId, c]) => ({
    chainId: Number(chainId),
    rpc: c?.rpc === 'up' ? 'up' : 'down',
    gasWalletRunwayHrs: typeof c?.gasWalletRunwayHrs === 'number' ? c.gasWalletRunwayHrs : null,
    paymasterDepositRunwayHrs:
      typeof c?.paymasterDepositRunwayHrs === 'number' ? c.paymasterDepositRunwayHrs : null,
  }))
  return {
    ok: data.status === 'ok',
    killSwitch: data.killSwitch === true,
    chains,
    // Operator telemetry present only when the gateway trusted our origin.
    hasOperatorTelemetry: chains.some(
      (c) => c.gasWalletRunwayHrs != null || c.paymasterDepositRunwayHrs != null
    ),
  }
}

export function useGatewayStatus() {
  const configured = Boolean(gatewayBaseUrl())
  const [state, setState] = useState({
    loading: configured,
    reachable: false,
    status: null,
    lastChecked: null,
  })
  const timerRef = useRef(null)

  const fetchStatus = useCallback(async () => {
    const base = gatewayBaseUrl()
    if (!base) return
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const res = await fetch(`${base}/status`, { method: 'GET', signal: controller.signal })
      const data = res.ok ? await res.json().catch(() => null) : null
      setState({
        loading: false,
        reachable: res.ok && data != null,
        status: parseGatewayStatus(data),
        lastChecked: Date.now(),
      })
    } catch {
      setState({ loading: false, reachable: false, status: null, lastChecked: Date.now() })
    } finally {
      clearTimeout(timeout)
    }
  }, [])

  useEffect(() => {
    if (!configured) return undefined
    fetchStatus()
    timerRef.current = setInterval(fetchStatus, POLL_MS)
    return () => clearInterval(timerRef.current)
  }, [configured, fetchStatus])

  return { configured, refresh: fetchStatus, ...state }
}
