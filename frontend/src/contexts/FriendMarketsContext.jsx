import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAccount } from 'wagmi'
import { fetchFriendMarketsForUser } from '../utils/blockchainService'
import { FriendMarketsContext } from './FriendMarketsContext'

const STORAGE_KEY = 'friendMarkets'
const DISMISSED_STORAGE_PREFIX = 'mywagers_dismissed:'

function loadFromStorage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function saveToStorage(markets) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(markets))
  } catch {
    // localStorage may be full or unavailable — non-fatal
  }
}

function dismissedKey(address) {
  return `${DISMISSED_STORAGE_PREFIX}${(address || '').toLowerCase()}`
}

function loadDismissed(address) {
  if (!address) return []
  try {
    const stored = localStorage.getItem(dismissedKey(address))
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function saveDismissed(address, ids) {
  if (!address) return
  try {
    localStorage.setItem(dismissedKey(address), JSON.stringify(ids))
  } catch {
    // non-fatal
  }
}

export function FriendMarketsProvider({ children }) {
  const { address, isConnected } = useAccount()
  const [friendMarkets, setFriendMarkets] = useState(() => loadFromStorage())
  const [loading, setLoading] = useState(false)
  const [dismissedIdsArr, setDismissedIdsArr] = useState(() => loadDismissed(address))

  // Fetch friend markets from blockchain when wallet connects
  useEffect(() => {
    if (!address || !isConnected) return

    let cancelled = false

    const fetchMarkets = async (attempt = 0) => {
      setLoading(true)
      try {
        const blockchainMarkets = await fetchFriendMarketsForUser(address)
        if (cancelled) return

        const marketsWithUniqueIds = blockchainMarkets.map(m => ({
          ...m,
          uniqueId: `${m.contractAddress || 'unknown'}-${m.id}`
        }))

        setFriendMarkets(marketsWithUniqueIds)
        saveToStorage(marketsWithUniqueIds)
      } catch (error) {
        console.error('[FriendMarketsContext] Error fetching friend markets:', error)
        if (!cancelled && attempt < 2) {
          const delay = (attempt + 1) * 2000
          setTimeout(() => fetchMarkets(attempt + 1), delay)
          return
        }
        // On final failure, keep existing state (localStorage cache) as fallback
      }
      if (!cancelled) setLoading(false)
    }

    fetchMarkets()
    return () => { cancelled = true }
  }, [address, isConnected])

  // Manual refresh
  const refresh = useCallback(async () => {
    if (!address || !isConnected) return
    setLoading(true)
    try {
      const blockchainMarkets = await fetchFriendMarketsForUser(address)
      const marketsWithUniqueIds = blockchainMarkets.map(m => ({
        ...m,
        uniqueId: `${m.contractAddress || 'unknown'}-${m.id}`
      }))
      setFriendMarkets(marketsWithUniqueIds)
      saveToStorage(marketsWithUniqueIds)
    } catch (error) {
      console.error('[FriendMarketsContext] Error refreshing friend markets:', error)
    }
    setLoading(false)
  }, [address, isConnected])

  // Optimistic add after creation (before next blockchain fetch)
  const addMarket = useCallback((market) => {
    setFriendMarkets(prev => {
      const updated = [...prev, market]
      saveToStorage(updated)
      return updated
    })
  }, [])

  // Reload the dismissed set when the active account changes so we don't
  // leak one wallet's dismissed list into another.
  useEffect(() => {
    setDismissedIdsArr(loadDismissed(address))
  }, [address])

  const dismissedIds = useMemo(() => new Set(dismissedIdsArr.map(String)), [dismissedIdsArr])

  const dismissMarket = useCallback((marketId) => {
    if (marketId == null) return
    const id = String(marketId)
    setDismissedIdsArr(prev => {
      if (prev.includes(id)) return prev
      const next = [...prev, id]
      saveDismissed(address, next)
      return next
    })
  }, [address])

  const dismissMarkets = useCallback((marketIds) => {
    const incoming = (marketIds || []).filter(v => v != null).map(String)
    if (incoming.length === 0) return
    setDismissedIdsArr(prev => {
      const merged = Array.from(new Set([...prev, ...incoming]))
      if (merged.length === prev.length) return prev
      saveDismissed(address, merged)
      return merged
    })
  }, [address])

  const restoreMarket = useCallback((marketId) => {
    if (marketId == null) return
    const id = String(marketId)
    setDismissedIdsArr(prev => {
      if (!prev.includes(id)) return prev
      const next = prev.filter(x => x !== id)
      saveDismissed(address, next)
      return next
    })
  }, [address])

  const isDismissed = useCallback(
    (marketId) => dismissedIds.has(String(marketId)),
    [dismissedIds]
  )

  return (
    <FriendMarketsContext.Provider
      value={{
        friendMarkets,
        loading,
        refresh,
        addMarket,
        setFriendMarkets,
        dismissedIds,
        dismissMarket,
        dismissMarkets,
        restoreMarket,
        isDismissed,
      }}
    >
      {children}
    </FriendMarketsContext.Provider>
  )
}
