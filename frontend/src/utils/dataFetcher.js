/**
 * Data Fetcher Utility
 *
 * This module provides a unified interface for fetching data that can switch between
 * mock data (for demos/testing) and real blockchain data based on user preferences.
 *
 * Features:
 * - Automatic caching with stale-while-revalidate pattern
 * - Background refresh for instant UX
 * - Request deduplication
 * - Extended TTLs for all data types
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
  fetchCategoriesFromBlockchain,
  fetchCorrelationGroups as fetchCorrelationGroupsFromBlockchain
} from './blockchainService'

import {
  cacheMarkets,
  loadCachedMarkets,
  clearMarketCache
} from './marketCache'

import {
  fetchWithCache,
  invalidateCachesForAction,
  warmCaches,
  getCacheStats,
  CACHE_CONFIG,
  clearAllCaches
} from './cacheService'

/**
 * Fetch markets based on demo mode with caching support
 * Uses stale-while-revalidate pattern for blockchain data:
 * - Returns cached data immediately if available (even if stale)
 * - Refreshes in background if cache is stale
 * - Uses localStorage for persistence across sessions
 *
 * @param {boolean} demoMode - Whether to use mock data
 * @param {Object} contracts - Contract instances for live data fetching (optional)
 * @param {Object} options - Additional options
 * @param {boolean} options.forceRefresh - Skip cache and fetch fresh data
 * @param {Function} options.onBackgroundRefresh - Callback when background refresh completes
 * @param {Function} options.onStaleData - Callback when returning stale cached data
 * @returns {Promise<Array>} Array of market objects
 */
export async function fetchMarkets(demoMode, _contracts = null, options = {}) {
  const { forceRefresh = false, onBackgroundRefresh = null, onStaleData = null } = options
  console.log('fetchMarkets called with demoMode:', demoMode, 'forceRefresh:', forceRefresh)

  if (demoMode) {
    // Return mock data (no caching needed)
    console.log('Using demo mode - returning mock markets')
    return getMockMarkets()
  }

  try {
    // Use unified cache service with stale-while-revalidate
    const result = await fetchWithCache({
      configKey: 'markets',
      fetchFn: fetchMarketsFromBlockchain,
      forceRefresh,
      onBackgroundRefresh: onBackgroundRefresh
        ? (freshData) => {
            console.log('Background refresh complete:', freshData.markets?.length || freshData?.length, 'markets')
            // Also update legacy cache for compatibility
            const markets = freshData.markets || freshData
            cacheMarkets(markets, freshData.lastBlock)
            onBackgroundRefresh(markets)
          }
        : null,
      onStaleData: onStaleData
        ? (data, age) => {
            const markets = data.markets || data
            console.log(`Returning stale data: ${markets?.length} markets, age: ${Math.round(age / 1000)}s`)
            onStaleData(markets, age)
          }
        : null
    })

    // Extract markets from cached data structure
    const markets = result.data?.markets || result.data || []

    if (result.fromCache) {
      console.log(`Cache ${result.isStale ? 'stale' : 'hit'}: ${markets.length} markets, age: ${Math.round((result.age || 0) / 1000)}s`)
    } else {
      console.log('Fetched', markets.length, 'markets from blockchain')
      // Update legacy cache for compatibility
      cacheMarkets(markets)
    }

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
export async function fetchMarketById(demoMode, id, _contracts = null) {
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
 * Fetch proposals based on demo mode with caching
 * Uses 10-minute TTL since proposals change less frequently
 *
 * @param {boolean} demoMode - Whether to use mock data
 * @param {Object} contracts - Contract instances for live data fetching (optional)
 * @param {Object} options - Additional options
 * @param {boolean} options.forceRefresh - Skip cache and fetch fresh
 * @param {Function} options.onBackgroundRefresh - Callback for background refresh
 * @returns {Promise<Array>} Array of proposal objects
 */
export async function fetchProposals(demoMode, _contracts = null, options = {}) {
  const { forceRefresh = false, onBackgroundRefresh = null } = options

  if (demoMode) {
    return getMockProposals()
  }

  try {
    const result = await fetchWithCache({
      configKey: 'proposals',
      fetchFn: fetchProposalsFromBlockchain,
      forceRefresh,
      onBackgroundRefresh
    })

    if (result.fromCache) {
      console.log(`Proposals cache ${result.isStale ? 'stale' : 'hit'}: ${result.data?.length || 0} proposals`)
    }

    return result.data || []
  } catch (error) {
    console.error('Failed to fetch proposals from blockchain:', error)
    console.warn('Falling back to mock data due to blockchain error')
    return getMockProposals()
  }
}

/**
 * Fetch user positions based on demo mode with caching
 * Uses 2-minute TTL since positions change with trades
 * Cache is per-user address
 *
 * @param {boolean} demoMode - Whether to use mock data
 * @param {string} userAddress - User wallet address
 * @param {Object} contracts - Contract instances for live data fetching (optional)
 * @param {Object} options - Additional options
 * @param {boolean} options.forceRefresh - Skip cache and fetch fresh
 * @param {Function} options.onBackgroundRefresh - Callback for background refresh
 * @returns {Promise<Array>} Array of position objects
 */
export async function fetchPositions(demoMode, userAddress, _contracts = null, options = {}) {
  const { forceRefresh = false, onBackgroundRefresh = null } = options

  if (demoMode) {
    return getMockPositions()
  }

  if (!userAddress) {
    return []
  }

  try {
    const cacheKey = `${CACHE_CONFIG.positions.keyPrefix}${userAddress.toLowerCase()}`
    const result = await fetchWithCache({
      configKey: 'positions',
      customKey: cacheKey,
      fetchFn: () => fetchPositionsFromBlockchain(userAddress),
      forceRefresh,
      onBackgroundRefresh
    })

    if (result.fromCache) {
      console.log(`Positions cache ${result.isStale ? 'stale' : 'hit'}: ${result.data?.length || 0} positions`)
    }

    return result.data || []
  } catch (error) {
    console.error('Failed to fetch positions from blockchain:', error)
    console.warn('Falling back to mock data due to blockchain error')
    return getMockPositions()
  }
}

/**
 * Fetch welfare metrics based on demo mode with caching
 * Uses 15-minute TTL since metrics don't change frequently
 *
 * @param {boolean} demoMode - Whether to use mock data
 * @param {Object} contracts - Contract instances for live data fetching (optional)
 * @param {Object} options - Additional options
 * @param {boolean} options.forceRefresh - Skip cache and fetch fresh
 * @param {Function} options.onBackgroundRefresh - Callback for background refresh
 * @returns {Promise<Array>} Array of welfare metric objects
 */
export async function fetchWelfareMetrics(demoMode, _contracts = null, options = {}) {
  const { forceRefresh = false, onBackgroundRefresh = null } = options

  if (demoMode) {
    return getMockWelfareMetrics()
  }

  try {
    const result = await fetchWithCache({
      configKey: 'welfareMetrics',
      fetchFn: fetchWelfareMetricsFromBlockchain,
      forceRefresh,
      onBackgroundRefresh
    })

    if (result.fromCache) {
      console.log(`Welfare metrics cache ${result.isStale ? 'stale' : 'hit'}: ${result.data?.length || 0} metrics`)
    }

    return result.data || []
  } catch (error) {
    console.error('Failed to fetch welfare metrics from blockchain:', error)
    console.warn('Falling back to mock data due to blockchain error')
    return getMockWelfareMetrics()
  }
}

/**
 * Fetch categories based on demo mode with caching
 * Uses 30-minute TTL since categories rarely change
 *
 * @param {boolean} demoMode - Whether to use mock data
 * @param {Object} contracts - Contract instances for live data fetching (optional)
 * @param {Object} options - Additional options
 * @param {boolean} options.forceRefresh - Skip cache and fetch fresh
 * @param {Function} options.onBackgroundRefresh - Callback for background refresh
 * @returns {Promise<Array>} Array of unique category strings
 */
export async function fetchCategories(demoMode, _contracts = null, options = {}) {
  const { forceRefresh = false, onBackgroundRefresh = null } = options

  if (demoMode) {
    return getMockCategories()
  }

  try {
    const result = await fetchWithCache({
      configKey: 'categories',
      fetchFn: fetchCategoriesFromBlockchain,
      forceRefresh,
      onBackgroundRefresh
    })

    if (result.fromCache) {
      console.log(`Categories cache ${result.isStale ? 'stale' : 'hit'}: ${result.data?.length || 0} categories`)
    }

    return result.data || []
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
export async function fetchMarketsByCorrelationGroup(demoMode, correlationGroupId, _contracts = null) {
  if (demoMode) {
    return getMockMarketsByCorrelationGroup(correlationGroupId)
  }

  // Note: Correlation groups are currently a frontend-only feature
  // When implemented on-chain, this should fetch from blockchain
  console.warn('Correlation groups not yet implemented on blockchain. Using mock data.')
  return getMockMarketsByCorrelationGroup(correlationGroupId)
}

/**
 * Fetch correlation groups with caching
 * Uses 10-minute TTL
 *
 * @param {boolean} demoMode - Whether to use mock data
 * @param {Object} options - Additional options
 * @param {boolean} options.forceRefresh - Skip cache and fetch fresh
 * @param {Function} options.onBackgroundRefresh - Callback for background refresh
 * @returns {Promise<Array>} Array of correlation group objects
 */
export async function fetchCorrelationGroups(demoMode, options = {}) {
  const { forceRefresh = false, onBackgroundRefresh = null } = options

  if (demoMode) {
    // Return empty array for demo mode as correlation groups are blockchain-specific
    return []
  }

  try {
    const result = await fetchWithCache({
      configKey: 'correlationGroups',
      fetchFn: fetchCorrelationGroupsFromBlockchain,
      forceRefresh,
      onBackgroundRefresh
    })

    if (result.fromCache) {
      console.log(`Correlation groups cache ${result.isStale ? 'stale' : 'hit'}: ${result.data?.length || 0} groups`)
    }

    return result.data || []
  } catch (error) {
    console.error('Failed to fetch correlation groups:', error)
    return []
  }
}

/**
 * Fetch a single market by ID with caching
 * Uses 3-minute TTL per market
 *
 * @param {boolean} demoMode - Whether to use mock data
 * @param {number} id - Market ID
 * @param {Object} contracts - Contract instances (optional)
 * @param {Object} options - Additional options
 * @returns {Promise<Object|null>} Market object or null
 */
export async function fetchMarketByIdCached(demoMode, id, _contracts = null, options = {}) {
  const { forceRefresh = false, onBackgroundRefresh = null } = options

  if (demoMode) {
    return getMockMarketById(id)
  }

  try {
    const cacheKey = `${CACHE_CONFIG.singleMarket.keyPrefix}${id}`
    const result = await fetchWithCache({
      configKey: 'singleMarket',
      customKey: cacheKey,
      fetchFn: () => fetchMarketByIdFromBlockchain(id),
      forceRefresh,
      onBackgroundRefresh
    })

    if (result.fromCache) {
      console.log(`Market ${id} cache ${result.isStale ? 'stale' : 'hit'}`)
    }

    return result.data || null
  } catch (error) {
    console.error(`Failed to fetch market ${id}:`, error)
    return getMockMarketById(id)
  }
}

/**
 * Invalidate caches after an action (trade, create market, etc.)
 * @param {string} action - Action type
 * @param {Object} context - Action context
 */
export { invalidateCachesForAction }

/**
 * Warm caches on app initialization
 * @param {Object} fetchFunctions - Fetch functions to use
 */
export { warmCaches }

/**
 * Get cache statistics
 * @returns {Object} Cache statistics
 */
export { getCacheStats }

/**
 * Clear all caches
 */
export { clearAllCaches }
