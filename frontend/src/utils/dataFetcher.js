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

import {
  cacheMarkets,
  loadCachedMarkets,
  clearMarketCache
} from './marketCache'

import logger from './logger'

// Request deduplication: Track in-flight requests to prevent duplicates
const inFlightRequests = new Map()

/**
 * Deduplicate requests - returns existing promise if same request is in-flight
 * @param {string} key - Unique key for the request
 * @param {Function} fetcher - Function that returns a promise
 * @returns {Promise} The deduplicated promise
 */
function deduplicateRequest(key, fetcher) {
  // If request is already in-flight, return the existing promise
  if (inFlightRequests.has(key)) {
    logger.log(`Deduplicating request: ${key}`)
    return inFlightRequests.get(key)
  }

  // Create new request
  const promise = fetcher()
    .finally(() => {
      // Clean up after request completes (success or failure)
      inFlightRequests.delete(key)
    })

  // Store in-flight request
  inFlightRequests.set(key, promise)
  return promise
}

/**
 * Fetch markets based on demo mode with caching support
 * Uses stale-while-revalidate pattern for blockchain data:
 * - Returns cached data immediately if available
 * - Refreshes in background if cache is stale
 *
 * @param {boolean} demoMode - Whether to use mock data
 * @param {Object} contracts - Contract instances for live data fetching (optional)
 * @param {Object} options - Additional options
 * @param {boolean} options.forceRefresh - Skip cache and fetch fresh data
 * @param {Function} options.onBackgroundRefresh - Callback when background refresh completes
 * @returns {Promise<Array>} Array of market objects
 */
export async function fetchMarkets(demoMode, _contracts = null, options = {}) {
  const { forceRefresh = false, onBackgroundRefresh = null } = options
  logger.log('fetchMarkets called with demoMode:', demoMode, 'forceRefresh:', forceRefresh)

  if (demoMode) {
    // Return mock data (no caching needed)
    logger.log('Using demo mode - returning mock markets')
    return getMockMarkets()
  }

  // Try to load from cache first (unless forcing refresh)
  if (!forceRefresh) {
    const cached = loadCachedMarkets()
    if (cached) {
      logger.log(`Cache hit: ${cached.markets.length} markets, age: ${Math.round(cached.age / 1000)}s, stale: ${cached.isStale}`)

      // If cache is stale, trigger background refresh (deduplicated)
      if (cached.isStale && onBackgroundRefresh) {
        logger.log('Cache is stale, triggering background refresh')
        deduplicateRequest('fetchMarkets:background', () => fetchMarketsFromBlockchain())
          .then(freshMarkets => {
            logger.log('Background refresh complete:', freshMarkets.length, 'markets')
            cacheMarkets(freshMarkets)
            onBackgroundRefresh(freshMarkets)
          })
          .catch(error => {
            logger.warn('Background refresh failed:', error.message)
          })
      }

      // Return cached data immediately
      return cached.markets
    }
  }

  try {
    // Fetch from Mordor testnet (with request deduplication)
    logger.log('Live mode - fetching from blockchain (cache miss or refresh)')
    const requestKey = forceRefresh ? 'fetchMarkets:force' : 'fetchMarkets:normal'
    const markets = await deduplicateRequest(requestKey, () => fetchMarketsFromBlockchain())
    logger.log('Fetched', markets.length, 'markets from blockchain')

    // Cache the results
    cacheMarkets(markets)

    return markets
  } catch (error) {
    logger.error('Failed to fetch markets from blockchain:', error)
    // In live mode, return empty array instead of falling back to mock data
    // This makes it clear to the user that blockchain data is not available
    logger.warn('Returning empty array - no blockchain data available')
    return []
  }
}

/**
 * Clear all market caches
 * Useful when user performs an action that changes market data
 */
export { clearMarketCache }

/**
 * Fetch markets by category based on demo mode
 * @param {boolean} demoMode - Whether to use mock data
 * @param {string} category - Category to filter by
 * @param {Object} contracts - Contract instances for live data fetching (optional)
 * @returns {Promise<Array>} Array of market objects
 */
export async function fetchMarketsByCategory(demoMode, category, _contracts = null) {
  if (demoMode) {
    return getMockMarketsByCategory(category)
  }

  try {
    return await deduplicateRequest(
      `fetchMarketsByCategory:${category}`,
      () => fetchMarketsByCategoryFromBlockchain(category)
    )
  } catch (error) {
    logger.error('Failed to fetch markets by category from blockchain:', error)
    logger.warn('Falling back to mock data due to blockchain error')
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
export async function fetchMarketById(demoMode, id, _contracts = null) {
  if (demoMode) {
    return getMockMarketById(id)
  }

  try {
    return await deduplicateRequest(
      `fetchMarketById:${id}`,
      () => fetchMarketByIdFromBlockchain(id)
    )
  } catch (error) {
    logger.error('Failed to fetch market by ID from blockchain:', error)
    logger.warn('Falling back to mock data due to blockchain error')
    return getMockMarketById(id)
  }
}

/**
 * Fetch proposals based on demo mode
 * @param {boolean} demoMode - Whether to use mock data
 * @param {Object} contracts - Contract instances for live data fetching (optional)
 * @returns {Promise<Array>} Array of proposal objects
 */
export async function fetchProposals(demoMode, _contracts = null) {
  if (demoMode) {
    return getMockProposals()
  }

  try {
    return await deduplicateRequest(
      'fetchProposals',
      () => fetchProposalsFromBlockchain()
    )
  } catch (error) {
    logger.error('Failed to fetch proposals from blockchain:', error)
    logger.warn('Falling back to mock data due to blockchain error')
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
export async function fetchPositions(demoMode, userAddress, _contracts = null) {
  if (demoMode) {
    return getMockPositions()
  }

  try {
    return await deduplicateRequest(
      `fetchPositions:${userAddress}`,
      () => fetchPositionsFromBlockchain(userAddress)
    )
  } catch (error) {
    logger.error('Failed to fetch positions from blockchain:', error)
    logger.warn('Falling back to mock data due to blockchain error')
    return getMockPositions()
  }
}

/**
 * Fetch welfare metrics based on demo mode
 * @param {boolean} demoMode - Whether to use mock data
 * @param {Object} contracts - Contract instances for live data fetching (optional)
 * @returns {Promise<Array>} Array of welfare metric objects
 */
export async function fetchWelfareMetrics(demoMode, _contracts = null) {
  if (demoMode) {
    return getMockWelfareMetrics()
  }

  try {
    return await deduplicateRequest(
      'fetchWelfareMetrics',
      () => fetchWelfareMetricsFromBlockchain()
    )
  } catch (error) {
    logger.error('Failed to fetch welfare metrics from blockchain:', error)
    logger.warn('Falling back to mock data due to blockchain error')
    return getMockWelfareMetrics()
  }
}

/**
 * Fetch categories based on demo mode
 * @param {boolean} demoMode - Whether to use mock data
 * @param {Object} contracts - Contract instances for live data fetching (optional)
 * @returns {Promise<Array>} Array of unique category strings
 */
export async function fetchCategories(demoMode, _contracts = null) {
  if (demoMode) {
    return getMockCategories()
  }

  try {
    return await deduplicateRequest(
      'fetchCategories',
      () => fetchCategoriesFromBlockchain()
    )
  } catch (error) {
    logger.error('Failed to fetch categories from blockchain:', error)
    logger.warn('Falling back to mock data due to blockchain error')
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
export async function fetchMarketsByCorrelationGroup(demoMode, correlationGroupId, _contracts = null) {
  if (demoMode) {
    return getMockMarketsByCorrelationGroup(correlationGroupId)
  }
  
  // Note: Correlation groups are currently a frontend-only feature
  // When implemented on-chain, this should fetch from blockchain
  logger.warn('Correlation groups not yet implemented on blockchain. Using mock data.')
  return getMockMarketsByCorrelationGroup(correlationGroupId)
}
