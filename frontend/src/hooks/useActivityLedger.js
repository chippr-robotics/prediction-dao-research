/**
 * useActivityLedger — reactive view of the unified activity ledger (spec 051)
 * for the active (account, chainId). One query hook for every consumer
 * (Account tab, Transfer activity tab, reports) so surfaces cannot diverge
 * (FR-002/FR-014). Polling follows the dashboard's 60s model; client-record
 * writes (transfers) also trigger an immediate refresh via the transferStore
 * change event.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useWallet } from './useWalletManagement'
import { getDefaultLedgerRepository } from '../data/ledger'
import { subscribeTransfers } from '../lib/transfer/transferStore'

const POLL_MS = 60_000

export function useActivityLedger({ filter, period, pollMs = POLL_MS } = {}) {
  const { address, chainId, isConnected, provider } = useWallet() || {}
  const [state, setState] = useState({ entries: [], staleClasses: [], prunedBefore: null })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const reqIdRef = useRef(0)

  const repository = useMemo(() => getDefaultLedgerRepository(), [])

  // Stable serialized deps so object literals don't re-trigger the effect.
  const filterKey = JSON.stringify(filter ?? null)
  const periodKey = JSON.stringify(period ?? null)

  const load = useCallback(async () => {
    if (!isConnected || !address || chainId == null) {
      setState({ entries: [], staleClasses: [], prunedBefore: null })
      setIsLoading(false)
      return
    }
    const reqId = ++reqIdRef.current
    setIsLoading(true)
    setError(null)
    try {
      const result = await repository.listEntries({
        account: address,
        chainId,
        provider,
        filter: filterKey === 'null' ? undefined : JSON.parse(filterKey),
        period: periodKey === 'null' ? undefined : JSON.parse(periodKey),
      })
      if (reqId !== reqIdRef.current) return
      setState(result)
    } catch (err) {
      if (reqId !== reqIdRef.current) return
      setError(err?.message || 'Failed to load activity')
      // keep last-known entries — stale beats blank (constitution III)
    } finally {
      if (reqId === reqIdRef.current) setIsLoading(false)
    }
  }, [isConnected, address, chainId, provider, repository, filterKey, periodKey])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!isConnected || !address) return undefined
    const id = setInterval(() => load(), pollMs)
    const unsubscribe = subscribeTransfers(() => load())
    return () => {
      clearInterval(id)
      unsubscribe()
    }
  }, [isConnected, address, load, pollMs])

  return {
    entries: state.entries,
    staleClasses: state.staleClasses,
    prunedBefore: state.prunedBefore,
    isLoading,
    error,
    refresh: load,
  }
}

export default useActivityLedger
