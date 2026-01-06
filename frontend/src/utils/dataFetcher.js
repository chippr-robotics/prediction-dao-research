/**
 * Data Fetcher Utility
 * 
 * This module provides a unified interface for fetching data that can switch between
 * mock data (for demos/testing) and real blockchain data based on user preferences.
 * 
 * Usage:
 * ```javascript
 * import { useDataFetcher } from '../hooks/useDataFetcher'
 * 
 * function MyComponent() {
 *   const { getMarkets, getProposals } = useDataFetcher()
 *   const markets = await getMarkets()
 * }
 * ```
 */

import { 
  getMockMarkets, 
  getMockMarketsByCategory,
  getMockMarketById,
  getMockProposals,
  getMockPositions,
  getMockWelfareMetrics,
  getMockCategories,
  getMockMarketsByCorrelationGroup
} from './mockDataLoader'

import {
  fetchMarketsFromBlockchain,
  fetchMarketsByCategoryFromBlockchain,
  fetchMarketByIdFromBlockchain,
  fetchProposalsFromBlockchain,
  fetchPositionsFromBlockchain,
  fetchWelfareMetricsFromBlockchain,
  fetchCategoriesFromBlockchain
} from './blockchainService'

/**
 * Fetch markets based on demo mode
 * @param {boolean} demoMode - Whether to use mock data
 * @param {Object} contracts - Contract instances for live data fetching (optional)
 * @returns {Promise<Array>} Array of market objects
 */
export async function fetchMarkets(demoMode, contracts = null) {
  console.log('fetchMarkets called with demoMode:', demoMode)
  
  if (demoMode) {
    // Return mock data
    console.log('Using demo mode - returning mock markets')
    return getMockMarkets()
  }
  
  try {
    // Fetch from Mordor testnet
    console.log('Live mode - fetching from blockchain')
    const markets = await fetchMarketsFromBlockchain()
    console.log('Fetched', markets.length, 'markets from blockchain')
    return markets
  } catch (error) {
    console.error('Failed to fetch markets from blockchain:', error)
    // In live mode, return empty array instead of falling back to mock data
    // This makes it clear to the user that blockchain data is not available
    console.warn('Returning empty array - no blockchain data available')
    return []
  }
}

/**
 * Fetch markets by category based on demo mode
 * @param {boolean} demoMode - Whether to use mock data
 * @param {string} category - Category to filter by
 * @param {Object} contracts - Contract instances for live data fetching (optional)
 * @returns {Promise<Array>} Array of market objects
 */
export async function fetchMarketsByCategory(demoMode, category, contracts = null) {
  if (demoMode) {
    return getMockMarketsByCategory(category)
  }
  
  try {
    return await fetchMarketsByCategoryFromBlockchain(category)
  } catch (error) {
    console.error('Failed to fetch markets by category from blockchain:', error)
    console.warn('Falling back to mock data due to blockchain error')
    return getMockMarketsByCategory(category)
  }
}

/**
 * Fetch a single market by ID based on demo mode
 * @param {boolean} demoMode - Whether to use mock data
 * @param {number} id - Market ID
 * @param {Object} contracts - Contract instances for live data fetching (optional)
 * @returns {Promise<Object|null>} Market object or null if not found
 */
export async function fetchMarketById(demoMode, id, contracts = null) {
  if (demoMode) {
    return getMockMarketById(id)
  }
  
  try {
    return await fetchMarketByIdFromBlockchain(id)
  } catch (error) {
    console.error('Failed to fetch market by ID from blockchain:', error)
    console.warn('Falling back to mock data due to blockchain error')
    return getMockMarketById(id)
  }
}

/**
 * Fetch proposals based on demo mode
 * @param {boolean} demoMode - Whether to use mock data
 * @param {Object} contracts - Contract instances for live data fetching (optional)
 * @returns {Promise<Array>} Array of proposal objects
 */
export async function fetchProposals(demoMode, contracts = null) {
  if (demoMode) {
    return getMockProposals()
  }
  
  try {
    return await fetchProposalsFromBlockchain()
  } catch (error) {
    console.error('Failed to fetch proposals from blockchain:', error)
    console.warn('Falling back to mock data due to blockchain error')
    return getMockProposals()
  }
}

/**
 * Fetch user positions based on demo mode
 * @param {boolean} demoMode - Whether to use mock data
 * @param {string} userAddress - User wallet address
 * @param {Object} contracts - Contract instances for live data fetching (optional)
 * @returns {Promise<Array>} Array of position objects
 */
export async function fetchPositions(demoMode, userAddress, contracts = null) {
  if (demoMode) {
    return getMockPositions()
  }
  
  try {
    return await fetchPositionsFromBlockchain(userAddress)
  } catch (error) {
    console.error('Failed to fetch positions from blockchain:', error)
    console.warn('Falling back to mock data due to blockchain error')
    return getMockPositions()
  }
}

/**
 * Fetch welfare metrics based on demo mode
 * @param {boolean} demoMode - Whether to use mock data
 * @param {Object} contracts - Contract instances for live data fetching (optional)
 * @returns {Promise<Array>} Array of welfare metric objects
 */
export async function fetchWelfareMetrics(demoMode, contracts = null) {
  if (demoMode) {
    return getMockWelfareMetrics()
  }
  
  try {
    return await fetchWelfareMetricsFromBlockchain()
  } catch (error) {
    console.error('Failed to fetch welfare metrics from blockchain:', error)
    console.warn('Falling back to mock data due to blockchain error')
    return getMockWelfareMetrics()
  }
}

/**
 * Fetch categories based on demo mode
 * @param {boolean} demoMode - Whether to use mock data
 * @param {Object} contracts - Contract instances for live data fetching (optional)
 * @returns {Promise<Array>} Array of unique category strings
 */
export async function fetchCategories(demoMode, contracts = null) {
  if (demoMode) {
    return getMockCategories()
  }
  
  try {
    return await fetchCategoriesFromBlockchain()
  } catch (error) {
    console.error('Failed to fetch categories from blockchain:', error)
    console.warn('Falling back to mock data due to blockchain error')
    return getMockCategories()
  }
}

/**
 * Fetch markets by correlation group based on demo mode
 * @param {boolean} demoMode - Whether to use mock data
 * @param {string} correlationGroupId - Correlation group ID
 * @param {Object} contracts - Contract instances for live data fetching (optional)
 * @returns {Promise<Array>} Array of market objects
 */
export async function fetchMarketsByCorrelationGroup(demoMode, correlationGroupId, contracts = null) {
  if (demoMode) {
    return getMockMarketsByCorrelationGroup(correlationGroupId)
  }
  
  // Note: Correlation groups are currently a frontend-only feature
  // When implemented on-chain, this should fetch from blockchain
  console.warn('Correlation groups not yet implemented on blockchain. Using mock data.')
  return getMockMarketsByCorrelationGroup(correlationGroupId)
}
