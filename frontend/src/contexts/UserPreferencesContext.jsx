import { useState, useEffect, useCallback } from 'react'
import { useWeb3 } from '../hooks/useWeb3'
import {
  saveUserPreference,
  getUserPreference,
  clearUserPreferences,
} from '../utils/userStorage'
import { UserPreferencesContext } from './UserPreferencesContext.js'

/**
 * UserPreferencesProvider manages user preferences tied to wallet address
 * - Automatically loads preferences when wallet connects
 * - Persists preferences to session/local storage
 * - Clears preferences when wallet disconnects (optional)
 */
export function UserPreferencesProvider({ children }) {
  const { account, isConnected } = useWeb3()
  const [preferences, setPreferences] = useState({
    recentSearches: [],
    favoriteMarkets: [],
    defaultSlippage: 0.5,
    polymarketCategories: [],
    showTestnetAssets: false,
  })
  const [isLoading, setIsLoading] = useState(false)

  // Load preferences when wallet connects
  useEffect(() => {
    if (isConnected && account) {
      loadPreferences(account)
    } else {
      // Reset to defaults when disconnected
      setPreferences({
        recentSearches: [],
        favoriteMarkets: [],
        defaultSlippage: 0.5,
        polymarketCategories: [],
        showTestnetAssets: false,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, isConnected])

  const loadPreferences = useCallback((walletAddress) => {
    setIsLoading(true)
    try {
      const recentSearches = getUserPreference(walletAddress, 'recent_searches', [], true)
      const favoriteMarkets = getUserPreference(walletAddress, 'favorite_markets', [], true)
      const defaultSlippage = getUserPreference(walletAddress, 'default_slippage', 0.5, true)
      const polymarketCategories = getUserPreference(walletAddress, 'polymarket_categories', [], true)
      const showTestnetAssets = getUserPreference(walletAddress, 'show_testnet_assets', false, true)

      setPreferences({
        recentSearches,
        favoriteMarkets,
        defaultSlippage,
        polymarketCategories,
        showTestnetAssets,
      })
    } catch (error) {
      console.error('Error loading user preferences:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const savePreference = useCallback((key, value) => {
    if (!account) {
      console.warn('Cannot save preference: no wallet connected')
      return
    }

    try {
      saveUserPreference(account, key, value, true)
      setPreferences(prev => ({
        ...prev,
        [key]: value
      }))
    } catch (error) {
      console.error('Error saving preference:', error)
    }
  }, [account])

  const addRecentSearch = useCallback((searchTerm) => {
    if (!account || !searchTerm) return

    setPreferences(prev => {
      const searches = [searchTerm, ...prev.recentSearches.filter(s => s !== searchTerm)].slice(0, 10)
      saveUserPreference(account, 'recent_searches', searches, true)
      return { ...prev, recentSearches: searches }
    })
  }, [account])

  const clearRecentSearches = useCallback(() => {
    if (!account) return

    saveUserPreference(account, 'recent_searches', [], true)
    setPreferences(prev => ({ ...prev, recentSearches: [] }))
  }, [account])

  const toggleFavoriteMarket = useCallback((marketId) => {
    if (!account) return

    setPreferences(prev => {
      const isFavorite = prev.favoriteMarkets.includes(marketId)
      const favorites = isFavorite
        ? prev.favoriteMarkets.filter(id => id !== marketId)
        : [...prev.favoriteMarkets, marketId]

      saveUserPreference(account, 'favorite_markets', favorites, true)
      return { ...prev, favoriteMarkets: favorites }
    })
  }, [account])

  const setDefaultSlippage = useCallback((slippage) => {
    if (!account) return

    saveUserPreference(account, 'default_slippage', slippage, true)
    setPreferences(prev => ({ ...prev, defaultSlippage: slippage }))
  }, [account])

  const setPolymarketCategories = useCallback((categories) => {
    if (!account) return

    const next = Array.isArray(categories) ? categories : []
    saveUserPreference(account, 'polymarket_categories', next, true)
    setPreferences(prev => ({ ...prev, polymarketCategories: next }))
  }, [account])

  const setShowTestnetAssets = useCallback((show) => {
    if (!account) return

    const next = Boolean(show)
    saveUserPreference(account, 'show_testnet_assets', next, true)
    setPreferences(prev => ({ ...prev, showTestnetAssets: next }))
  }, [account])

  const clearAllPreferences = useCallback(() => {
    if (!account) return

    clearUserPreferences(account)
    setPreferences({
      recentSearches: [],
      favoriteMarkets: [],
      defaultSlippage: 0.5,
      polymarketCategories: [],
      showTestnetAssets: false,
    })
  }, [account])

  const value = {
    preferences,
    isLoading,
    addRecentSearch,
    clearRecentSearches,
    toggleFavoriteMarket,
    setDefaultSlippage,
    setPolymarketCategories,
    setShowTestnetAssets,
    savePreference,
    clearAllPreferences,
  }

  return (
    <UserPreferencesContext.Provider value={value}>
      {children}
    </UserPreferencesContext.Provider>
  )
}
