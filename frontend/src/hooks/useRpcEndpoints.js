/**
 * React binding for the member's RPC endpoint settings (spec 069).
 *
 * `useEndpointsRevision` is the piece read paths care about: provider instances are
 * memoized on chain lists, so without a changing dependency a member who repoints a
 * network keeps reading through the old endpoint until remount. Including the revision in
 * those memos makes a saved endpoint take effect on the next read.
 *
 * Wallet transports are built once at module load (`wagmi.js`), so a change to the chain
 * the WALLET signs through needs a reload — `useRpcEndpoints` reports that as
 * `reloadRecommended` and the panel says so plainly rather than pretending otherwise.
 */
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react'
import {
  endpointsRevision,
  getEndpointSettings,
  loadEndpointSettings,
  resetEndpointSettings,
  saveEndpointSettings,
  subscribeEndpointSettings,
  validateEndpointEntry,
} from '../lib/network/endpointStore'
import {
  authHeadersFor,
  describeRpcRoute,
  probeRpcEndpoint,
  resolveRpcEndpoints,
} from '../lib/network/rpcEndpoints'

/** Monotonic revision of the endpoint settings; changes on every save/reset. */
export function useEndpointsRevision() {
  return useSyncExternalStore(subscribeEndpointSettings, endpointsRevision, endpointsRevision)
}

/**
 * Full settings surface for the Network panel.
 *
 * @returns {{
 *   revision: number,
 *   settings: Record<string, object>,
 *   entryFor: (chainId: number) => object|null,
 *   routeFor: (chainId: number) => object,
 *   describe: (chainId: number) => object,
 *   save: (chainId: number, entry: object) => { ok: boolean, errors: object, warnings: string[] },
 *   reset: (chainId: number) => void,
 *   probe: (chainId: number, entry: object) => Promise<object>,
 *   reloadRecommended: boolean,
 * }}
 */
export function useRpcEndpoints() {
  const revision = useEndpointsRevision()
  const [reloadRecommended, setReloadRecommended] = useState(false)
  // Revision is the dependency on purpose: it is what makes a saved change visible here.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- revision IS the dependency
  const settings = useMemo(() => ({ ...loadEndpointSettings() }), [revision])

  const entryFor = useCallback((chainId) => getEndpointSettings(chainId), [])
  const routeFor = useCallback((chainId) => resolveRpcEndpoints(chainId), [])
  const describe = useCallback((chainId) => describeRpcRoute(chainId), [])

  const save = useCallback((chainId, entry) => {
    const result = validateEndpointEntry(entry)
    if (!result.ok) return result
    saveEndpointSettings(chainId, entry)
    setReloadRecommended(true)
    return result
  }, [])

  const reset = useCallback((chainId) => {
    resetEndpointSettings(chainId)
    setReloadRecommended(true)
  }, [])

  /**
   * Test an endpoint as currently typed (not as saved), so a member can prove a route
   * works before committing it. Auth headers are derived from the same entry, so a
   * header-authenticated endpoint is tested the way it will actually be used.
   */
  const probe = useCallback(async (chainId, entry) => {
    const route = resolveRpcEndpoints(chainId)
    const url = (entry?.url || '').trim() || route.primary?.url
    if (!url) return { ok: false, chainId: null, code: 'invalid-url', message: 'Nothing to test yet.' }
    return probeRpcEndpoint(url, {
      headers: authHeadersFor(entry),
      expectedChainId: Number(chainId),
    })
  }, [])

  return { revision, settings, entryFor, routeFor, describe, save, reset, probe, reloadRecommended }
}
