/**
 * useDataFetcher Hook
 *
 * Provides a unified interface for fetching data that respects the user's demo mode preference.
 * Components using this hook will automatically fetch mock data or real blockchain data
 * based on the user's settings.
 *
 * Features:
 * - Automatic demo mode switching
 * - Stale-while-revalidate caching pattern
 * - Background refresh callbacks for instant UX
 * - Cache invalidation after actions
 * - Cache warming on initialization
 */

import { useMemo, useCallback, useRef, useEffect, useState } from 'react'
import { useUserPreferences } from './useUserPreferences'
import {
  fetchMarkets,
  fetchMarketsByCategory,
  fetchMarketById,
  fetchProposals,
  fetchPositions,
  fetchWelfareMetrics,
  fetchCategories,
  fetchMarketsByCorrelationGroup,
  fetchCorrelationGroups,
  fetchMarketByIdCached,
  clearMarketCache,
  invalidateCachesForAction,
  warmCaches as warmCachesFn,
  getCacheStats
} from '../utils/dataFetcher'

/**
 * Hook to access data fetching functions that respect demo mode
 * @returns {Object} Data fetching functions and cache utilities
 */
export function useDataFetcher() {
  const { preferences } = useUserPreferences()
  const demoMode = preferences.demoMode
  const cacheWarmedRef = useRef(false)

  // Warm caches on first mount (only in live mode)
  useEffect(() => {
    if (!demoMode && !cacheWarmedRef.current) {
      cacheWarmedRef.current = true
      // Warm markets cache in background - don't block UI
      warmCachesFn({
        markets: () => fetchMarkets(false, null, { forceRefresh: false })
      }).catch(e => console.debug('[useDataFetcher] Cache warming error:', e.message))
    }
  }, [demoMode])

  // Memoize individual functions to ensure stable references
  // getMarkets now accepts options for caching control
  const getMarkets = useCallback(
    (contracts = null, options = {}) => fetchMarkets(demoMode, contracts, options),
    [demoMode]
  )

  // Clear all market caches (useful after trading actions)
  const clearCache = useCallback(() => {
    clearMarketCache()
  }, [])

  // Invalidate caches for specific actions
  const invalidateCaches = useCallback((action, context = {}) => {
    invalidateCachesForAction(action, context)
  }, [])

  // Force refresh all data
  const forceRefreshAll = useCallback(() => {
    invalidateCachesForAction('refreshAll')
  }, [])

  const getMarketsByCategory = useCallback(
    (category, contracts = null) => fetchMarketsByCategory(demoMode, category, contracts),
    [demoMode]
  )

  // Legacy getMarketById (no caching) - kept for backwards compatibility
  const getMarketById = useCallback(
    (id, contracts = null) => fetchMarketById(demoMode, id, contracts),
    [demoMode]
  )

  // New cached version of getMarketById
  const getMarketByIdCached = useCallback(
    (id, contracts = null, options = {}) => fetchMarketByIdCached(demoMode, id, contracts, options),
    [demoMode]
  )

  const getProposals = useCallback(
    (contracts = null, options = {}) => fetchProposals(demoMode, contracts, options),
    [demoMode]
  )

  const getPositions = useCallback(
    (userAddress, contracts = null, options = {}) => fetchPositions(demoMode, userAddress, contracts, options),
    [demoMode]
  )

  const getWelfareMetrics = useCallback(
    (contracts = null, options = {}) => fetchWelfareMetrics(demoMode, contracts, options),
    [demoMode]
  )

  const getCategories = useCallback(
    (contracts = null, options = {}) => fetchCategories(demoMode, contracts, options),
    [demoMode]
  )

  const getMarketsByCorrelationGroup = useCallback(
    (correlationGroupId, contracts = null) =>
      fetchMarketsByCorrelationGroup(demoMode, correlationGroupId, contracts),
    [demoMode]
  )

  const getCorrelationGroups = useCallback(
    (options = {}) => fetchCorrelationGroups(demoMode, options),
    [demoMode]
  )

  // Get cache statistics (for debugging)
  const getCacheStatistics = useCallback(() => {
    return getCacheStats()
  }, [])

  // Memoize the returned object to prevent unnecessary re-renders
  return useMemo(
    () => ({
      // Core state
      demoMode,

      // Data fetching functions
      getMarkets,
      getMarketsByCategory,
      getMarketById,
      getMarketByIdCached,
      getProposals,
      getPositions,
      getWelfareMetrics,
      getCategories,
      getMarketsByCorrelationGroup,
      getCorrelationGroups,

      // Cache management
      clearCache,
      invalidateCaches,
      forceRefreshAll,
      getCacheStatistics
    }),
    [
      demoMode,
      getMarkets,
      getMarketsByCategory,
      getMarketById,
      getMarketByIdCached,
      getProposals,
      getPositions,
      getWelfareMetrics,
      getCategories,
      getMarketsByCorrelationGroup,
      getCorrelationGroups,
      clearCache,
      invalidateCaches,
      forceRefreshAll,
      getCacheStatistics
    ]
  )
}

/**
 * Hook for fetching data with automatic background refresh handling
 *
 * This is a convenience hook that wraps useDataFetcher with state management
 * for background refresh callbacks.
 *
 * @param {Function} fetchFn - One of the fetch functions from useDataFetcher
 * @param {any} initialData - Initial data to use before first fetch
 * @returns {Object} { data, loading, error, isStale, refresh }
 */
export function useDataWithBackgroundRefresh(fetchFn, initialData = null) {
  const [data, setData] = useState(initialData)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isStale, setIsStale] = useState(false)

  const handleBackgroundRefresh = useCallback((freshData) => {
    setData(freshData)
    setIsStale(false)
    console.log('[useDataWithBackgroundRefresh] Background refresh complete')
  }, [])

  const handleStaleData = useCallback((staleData, age) => {
    setIsStale(true)
    console.log(`[useDataWithBackgroundRefresh] Using stale data, age: ${Math.round(age / 1000)}s`)
  }, [])

  const fetchData = useCallback(async (forceRefresh = false) => {
    try {
      setLoading(true)
      setError(null)
      const result = await fetchFn(null, {
        forceRefresh,
        onBackgroundRefresh: handleBackgroundRefresh,
        onStaleData: handleStaleData
      })
      setData(result)
      setLoading(false)
    } catch (err) {
      setError(err.message || 'Failed to fetch data')
      setLoading(false)
    }
  }, [fetchFn, handleBackgroundRefresh, handleStaleData])

  // Fetch on mount
  useEffect(() => {
    fetchData()
  }, [fetchData])

  const refresh = useCallback(() => {
    fetchData(true)
  }, [fetchData])

  return { data, loading, error, isStale, refresh }
}
