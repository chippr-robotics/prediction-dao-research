/**
 * useEarnVaults (spec 050) — the curated Morpho vault list across EVERY
 * earn-enabled network, in one query. Like the portfolio, the list is
 * independent of the wallet's active network — each vault carries its
 * chainId and the UI badges it; submission handles any network switch.
 *
 * Status model (honest-state): 'loading' | 'ready' | 'unavailable'. A fetch
 * failure is an explicit 'unavailable' — the UI disables deposit entry
 * points instead of showing stale numbers.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getEarnNetworks } from '../config/networks'
import { fetchVaults } from '../lib/earn/morphoApi'

export function useEarnVaults() {
  const earnChainIds = useMemo(() => getEarnNetworks().map((net) => net.chainId), [])

  const [vaults, setVaults] = useState([])
  const [status, setStatus] = useState('loading')
  const reqIdRef = useRef(0)

  const load = useCallback(async () => {
    if (earnChainIds.length === 0) return
    const reqId = ++reqIdRef.current
    setStatus('loading')
    try {
      const list = await fetchVaults(earnChainIds)
      if (reqId !== reqIdRef.current) return
      setVaults(list)
      setStatus('ready')
    } catch {
      if (reqId !== reqIdRef.current) return
      setVaults([])
      setStatus('unavailable')
    }
  }, [earnChainIds])

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return useMemo(() => ({ vaults, status, refresh: load }), [vaults, status, load])
}

export default useEarnVaults
