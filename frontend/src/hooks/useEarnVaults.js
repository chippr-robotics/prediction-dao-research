/**
 * useEarnVaults (spec 050) — the curated Morpho vault list for the active
 * network. Capability-gated: on chains without earn support it stays inert
 * with status 'unsupported' so the panel renders the honest unavailable state.
 *
 * Status model (honest-state): 'unsupported' | 'loading' | 'ready' |
 * 'unavailable'. A fetch failure is an explicit 'unavailable' — the UI
 * disables deposit entry points instead of showing stale numbers.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useWallet } from './useWalletManagement'
import { isEarnAvailable } from '../config/networks'
import { fetchVaults } from '../lib/earn/morphoApi'

export function useEarnVaults() {
  const { chainId } = useWallet() || {}
  const supported = isEarnAvailable(chainId)

  const [vaults, setVaults] = useState([])
  const [status, setStatus] = useState('loading')
  const reqIdRef = useRef(0)

  const load = useCallback(async () => {
    if (!supported) return
    const reqId = ++reqIdRef.current
    setStatus('loading')
    try {
      const list = await fetchVaults(chainId)
      if (reqId !== reqIdRef.current) return
      setVaults(list)
      setStatus('ready')
    } catch {
      if (reqId !== reqIdRef.current) return
      setVaults([])
      setStatus('unavailable')
    }
  }, [supported, chainId])

  // Reset synchronously on chain change so another network's vaults never
  // linger (per-chain data isolation).
  useEffect(() => {
    reqIdRef.current++
    setVaults([])
    if (!supported) {
      setStatus('unsupported')
      return
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainId, supported])

  return useMemo(
    () => ({ vaults, status, isSupported: supported, refresh: load }),
    [vaults, status, supported, load],
  )
}

export default useEarnVaults
