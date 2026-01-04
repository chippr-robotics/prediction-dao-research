/**
 * useDataFetcher Hook
 * 
 * Provides a unified interface for fetching data that respects the user's demo mode preference.
 * Components using this hook will automatically fetch mock data or real blockchain data
 * based on the user's settings.
 */

import { useUserPreferences } from './useUserPreferences'
import {
  fetchMarkets,
  fetchMarketsByCategory,
  fetchMarketById,
  fetchProposals,
  fetchPositions,
  fetchWelfareMetrics,
  fetchCategories,
  fetchMarketsByCorrelationGroup
} from '../utils/dataFetcher'

/**
 * Hook to access data fetching functions that respect demo mode
 * @returns {Object} Data fetching functions
 */
export function useDataFetcher() {
  const { preferences } = useUserPreferences()
  const demoMode = preferences.demoMode

  return {
    demoMode,
    getMarkets: (contracts = null) => fetchMarkets(demoMode, contracts),
    getMarketsByCategory: (category, contracts = null) => 
      fetchMarketsByCategory(demoMode, category, contracts),
    getMarketById: (id, contracts = null) => 
      fetchMarketById(demoMode, id, contracts),
    getProposals: (contracts = null) => 
      fetchProposals(demoMode, contracts),
    getPositions: (userAddress, contracts = null) => 
      fetchPositions(demoMode, userAddress, contracts),
    getWelfareMetrics: (contracts = null) => 
      fetchWelfareMetrics(demoMode, contracts),
    getCategories: (contracts = null) => 
      fetchCategories(demoMode, contracts),
    getMarketsByCorrelationGroup: (correlationGroupId, contracts = null) =>
      fetchMarketsByCorrelationGroup(demoMode, correlationGroupId, contracts)
  }
}
