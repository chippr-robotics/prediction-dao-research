/**
 * usePredictPositions / usePredictOpenOrders (spec 057, US2 + US3) — the connected wallet's Polymarket
 * positions and open (unfilled) orders on the ACTIVE network, via the relay-gateway proxy.
 *
 * Mirror useCollectibles: tolerant WalletContext read (soft-fail to "disconnected" outside a provider),
 * race-safe request ids, full reset on account/chain switch. Off Polygon or with no gateway configured
 * they report {supported:false} and perform NO fetches (FR-018).
 */
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useChainId } from 'wagmi'
import { WalletContext } from '../contexts/WalletContext.js'
import { getCurrentChainId } from '../config/networks'
import { predictAvailable, fetchPositions, fetchOpenOrders } from '../lib/predict/predictClient'

/** Shared machine for a per-address read that returns a keyed list ({<key>: [...]}). */
function useAddressList(fetchFn, listKey) {
  const wallet = useContext(WalletContext) || {}
  const { address, isConnected } = wallet
  const chainId = useChainId() || getCurrentChainId()
  const supported = predictAvailable(chainId)

  const [items, setItems] = useState([])
  const [phase, setPhase] = useState('idle') // idle | loading | ready | degraded
  const reqIdRef = useRef(0)

  const load = useCallback(async () => {
    if (!supported || !isConnected || !address) return
    const reqId = ++reqIdRef.current
    setPhase('loading')
    try {
      const res = await fetchFn(chainId, address)
      if (reqId !== reqIdRef.current) return
      setItems(Array.isArray(res?.[listKey]) ? res[listKey] : [])
      setPhase('ready')
    } catch {
      if (reqId !== reqIdRef.current) return
      setItems([])
      setPhase('degraded')
    }
  }, [supported, isConnected, address, chainId, fetchFn, listKey])

  useEffect(() => {
    reqIdRef.current++
    setItems([])
    setPhase('idle')
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, chainId, supported])

  return useMemo(() => {
    let status = 'ready'
    if (!supported) status = 'unsupported'
    else if (!isConnected || !address) status = 'disconnected'
    else if (phase === 'idle' || phase === 'loading') status = 'loading'
    else if (phase === 'degraded') status = 'degraded'
    else if (items.length === 0) status = 'empty'
    return { supported, status, chainId, address, items, refresh: load }
  }, [supported, isConnected, address, chainId, items, phase, load])
}

/** The connected wallet's outcome positions (US2). */
export function usePredictPositions() {
  const { items, ...rest } = useAddressList(fetchPositions, 'positions')
  return { positions: items, ...rest }
}

/** The connected wallet's open (unfilled) orders (US3). */
export function usePredictOpenOrders() {
  const { items, ...rest } = useAddressList(fetchOpenOrders, 'orders')
  return { orders: items, ...rest }
}
