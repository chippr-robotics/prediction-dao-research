import { createContext, useState, useEffect, useCallback } from 'react'
import { useWeb3 } from '../hooks/useWeb3'
import { 
  saveUserPreference, 
  getUserPreference, 
  clearUserPreferences,
  getClearPathStatus,
  updateClearPathStatus
} from '../utils/userStorage'

export const UserPreferencesContext = createContext(null)

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
    clearPathStatus: { active: false, lastUpdated: null }
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
        clearPathStatus: { active: false, lastUpdated: null }
      })
    }
  }, [account, isConnected])

  const loadPreferences = useCallback((walletAddress) => {
    setIsLoading(true)
    try {
      const recentSearches = getUserPreference(walletAddress, 'recent_searches', [], true)
      const favoriteMarkets = getUserPreference(walletAddress, 'favorite_markets', [], true)
      const defaultSlippage = getUserPreference(walletAddress, 'default_slippage', 0.5, true)
      const clearPathStatus = getClearPathStatus(walletAddress)

      setPreferences({
        recentSearches,
        favoriteMarkets,
        defaultSlippage,
        clearPathStatus
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

  const setClearPathStatus = useCallback((active) => {
    if (!account) return

    updateClearPathStatus(account, active)
    setPreferences(prev => ({
      ...prev,
      clearPathStatus: { active, lastUpdated: Date.now() }
    }))
  }, [account])

  const clearAllPreferences = useCallback(() => {
    if (!account) return

    clearUserPreferences(account)
    setPreferences({
      recentSearches: [],
      favoriteMarkets: [],
      defaultSlippage: 0.5,
      clearPathStatus: { active: false, lastUpdated: null }
    })
  }, [account])

  const value = {
    preferences,
    isLoading,
    addRecentSearch,
    clearRecentSearches,
    toggleFavoriteMarket,
    setDefaultSlippage,
    setClearPathStatus,
    savePreference,
    clearAllPreferences,
  }

  return (
    <UserPreferencesContext.Provider value={value}>
      {children}
    </UserPreferencesContext.Provider>
  )
}
