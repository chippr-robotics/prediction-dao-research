/**
 * useDataFetcher Hook
 * 
 * Provides a unified interface for fetching data that respects the user's demo mode preference.
 * Components using this hook will automatically fetch mock data or real blockchain data
 * based on the user's settings.
 */

import { useMemo, useCallback } from 'react'
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
  clearMarketCache
} from '../utils/dataFetcher'

/**
 * Hook to access data fetching functions that respect demo mode
 * @returns {Object} Data fetching functions
 */
export function useDataFetcher() {
  const { preferences } = useUserPreferences()
  const demoMode = preferences.demoMode

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

  const getMarketsByCategory = useCallback(
    (category, contracts = null) => fetchMarketsByCategory(demoMode, category, contracts),
    [demoMode]
  )

  const getMarketById = useCallback(
    (id, contracts = null) => fetchMarketById(demoMode, id, contracts),
    [demoMode]
  )

  const getProposals = useCallback(
    (contracts = null) => fetchProposals(demoMode, contracts),
    [demoMode]
  )

  const getPositions = useCallback(
    (userAddress, contracts = null) => fetchPositions(demoMode, userAddress, contracts),
    [demoMode]
  )

  const getWelfareMetrics = useCallback(
    (contracts = null) => fetchWelfareMetrics(demoMode, contracts),
    [demoMode]
  )

  const getCategories = useCallback(
    (contracts = null) => fetchCategories(demoMode, contracts),
    [demoMode]
  )

  const getMarketsByCorrelationGroup = useCallback(
    (correlationGroupId, contracts = null) =>
      fetchMarketsByCorrelationGroup(demoMode, correlationGroupId, contracts),
    [demoMode]
  )

  // Memoize the returned object to prevent unnecessary re-renders
  return useMemo(
    () => ({
      demoMode,
      getMarkets,
      getMarketsByCategory,
      getMarketById,
      getProposals,
      getPositions,
      getWelfareMetrics,
      getCategories,
      getMarketsByCorrelationGroup,
      clearCache
    }),
    [
      demoMode,
      getMarkets,
      getMarketsByCategory,
      getMarketById,
      getProposals,
      getPositions,
      getWelfareMetrics,
      getCategories,
      getMarketsByCorrelationGroup,
      clearCache
    ]
  )
}
