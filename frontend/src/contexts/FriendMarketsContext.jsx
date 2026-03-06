import { useState, useEffect, useCallback } from 'react'
import { useAccount } from 'wagmi'
import { fetchFriendMarketsForUser } from '../utils/blockchainService'
import { FriendMarketsContext } from './FriendMarketsContext'

const STORAGE_KEY = 'friendMarkets'

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

export function FriendMarketsProvider({ children }) {
  const { address, isConnected } = useAccount()
  const [friendMarkets, setFriendMarkets] = useState(() => loadFromStorage())
  const [loading, setLoading] = useState(false)

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

  return (
    <FriendMarketsContext.Provider value={{ friendMarkets, loading, refresh, addMarket, setFriendMarkets }}>
      {children}
    </FriendMarketsContext.Provider>
  )
}
