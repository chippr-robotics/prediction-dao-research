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
 *   const markets = getMarkets()
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

/**
 * Fetch markets based on demo mode
 * @param {boolean} demoMode - Whether to use mock data
 * @param {Object} contracts - Contract instances for live data fetching (optional)
 * @returns {Promise<Array>} Array of market objects
 */
export async function fetchMarkets(demoMode, contracts = null) {
  if (demoMode) {
    // Return mock data
    return getMockMarkets()
  }
  
  // TODO: Implement live blockchain data fetching
  // Example:
  // if (!contracts?.marketFactory) {
  //   throw new Error('Market factory contract not available')
  // }
  // const marketCount = await contracts.marketFactory.getMarketCount()
  // const markets = []
  // for (let i = 0; i < marketCount; i++) {
  //   const market = await contracts.marketFactory.getMarket(i)
  //   markets.push(market)
  // }
  // return markets
  
  console.warn('Live data fetching not yet implemented. Falling back to mock data.')
  return getMockMarkets()
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
  
  // TODO: Implement live blockchain data fetching with category filter
  console.warn('Live data fetching not yet implemented. Falling back to mock data.')
  return getMockMarketsByCategory(category)
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
  
  // TODO: Implement live blockchain data fetching for single market
  console.warn('Live data fetching not yet implemented. Falling back to mock data.')
  return getMockMarketById(id)
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
  
  // TODO: Implement live blockchain data fetching
  console.warn('Live data fetching not yet implemented. Falling back to mock data.')
  return getMockProposals()
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
  
  // TODO: Implement live blockchain data fetching for user positions
  console.warn('Live data fetching not yet implemented. Falling back to mock data.')
  return getMockPositions()
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
  
  // TODO: Implement live blockchain data fetching
  console.warn('Live data fetching not yet implemented. Falling back to mock data.')
  return getMockWelfareMetrics()
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
  
  // TODO: Implement live blockchain data fetching
  console.warn('Live data fetching not yet implemented. Falling back to mock data.')
  return getMockCategories()
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
  
  // TODO: Implement live blockchain data fetching
  console.warn('Live data fetching not yet implemented. Falling back to mock data.')
  return getMockMarketsByCorrelationGroup(correlationGroupId)
}
