/**
 * Market Cache Service
 *
 * Provides caching utilities for market data to reduce blockchain RPC calls
 * and improve dashboard load times.
 *
 * Features:
 * - SessionStorage-based caching for persistence across page navigations
 * - TTL-based expiration
 * - Stale-while-revalidate pattern support
 * - Event query caching with block range tracking
 */

// Cache configuration
const CACHE_CONFIG = {
  MARKETS_KEY: 'fairwins_markets_cache',
  EVENTS_KEY_PREFIX: 'fairwins_events_',
  // Default TTL: 2 minutes for market data
  DEFAULT_MARKET_TTL: 2 * 60 * 1000,
  // Default TTL: 5 minutes for event data (less frequently updated)
  DEFAULT_EVENTS_TTL: 5 * 60 * 1000,
  // Stale threshold: 50% of TTL - data is "stale" but still usable
  STALE_THRESHOLD: 0.5
}

/**
 * Cache market data with timestamp
 * @param {Array} markets - Array of market objects
 * @param {number|null} lastBlock - Optional last block number for incremental updates
 */
export function cacheMarkets(markets, lastBlock = null) {
  try {
    const cacheData = {
      timestamp: Date.now(),
      lastBlock: lastBlock,
      markets: markets
    }
    sessionStorage.setItem(CACHE_CONFIG.MARKETS_KEY, JSON.stringify(cacheData))
  } catch (error) {
    // SessionStorage might be full or disabled - fail silently
    console.warn('Failed to cache market data:', error.message)
  }
}

/**
 * Load cached markets if not expired
 * @param {number} maxAge - Maximum age in milliseconds (default: 2 minutes)
 * @returns {Object|null} Cached data with isStale flag, or null if not found/expired
 */
export function loadCachedMarkets(maxAge = CACHE_CONFIG.DEFAULT_MARKET_TTL) {
  try {
    const cached = sessionStorage.getItem(CACHE_CONFIG.MARKETS_KEY)
    if (!cached) return null

    const data = JSON.parse(cached)
    const age = Date.now() - data.timestamp

    // Cache is completely expired
    if (age > maxAge) {
      sessionStorage.removeItem(CACHE_CONFIG.MARKETS_KEY)
      return null
    }

    // Return data with stale indicator for background refresh
    return {
      markets: data.markets,
      lastBlock: data.lastBlock,
      timestamp: data.timestamp,
      age: age,
      isStale: age > maxAge * CACHE_CONFIG.STALE_THRESHOLD
    }
  } catch (error) {
    console.warn('Failed to load cached markets:', error.message)
    return null
  }
}

/**
 * Cache event data for a specific market
 * @param {string|number} marketId - Market identifier
 * @param {Array} events - Array of event objects
 * @param {number} fromBlock - Starting block of the query
 * @param {number} toBlock - Ending block of the query
 */
export function cacheEventData(marketId, events, fromBlock, toBlock) {
  try {
    const key = `${CACHE_CONFIG.EVENTS_KEY_PREFIX}${marketId}`
    const cacheData = {
      timestamp: Date.now(),
      fromBlock: fromBlock,
      toBlock: toBlock,
      events: events
    }
    sessionStorage.setItem(key, JSON.stringify(cacheData))
  } catch (error) {
    console.warn(`Failed to cache events for market ${marketId}:`, error.message)
  }
}

/**
 * Load cached events for a market
 * @param {string|number} marketId - Market identifier
 * @param {number} maxAge - Maximum age in milliseconds (default: 5 minutes)
 * @returns {Object|null} Cached event data or null if not found/expired
 */
export function loadCachedEvents(marketId, maxAge = CACHE_CONFIG.DEFAULT_EVENTS_TTL) {
  try {
    const key = `${CACHE_CONFIG.EVENTS_KEY_PREFIX}${marketId}`
    const cached = sessionStorage.getItem(key)
    if (!cached) return null

    const data = JSON.parse(cached)
    const age = Date.now() - data.timestamp

    if (age > maxAge) {
      sessionStorage.removeItem(key)
      return null
    }

    return {
      events: data.events,
      fromBlock: data.fromBlock,
      toBlock: data.toBlock,
      timestamp: data.timestamp,
      age: age
    }
  } catch (error) {
    console.warn(`Failed to load cached events for market ${marketId}:`, error.message)
    return null
  }
}

/**
 * Clear all market-related caches
 */
export function clearMarketCache() {
  try {
    // Clear markets cache
    sessionStorage.removeItem(CACHE_CONFIG.MARKETS_KEY)

    // Clear all event caches
    const keysToRemove = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)
      if (key && key.startsWith(CACHE_CONFIG.EVENTS_KEY_PREFIX)) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach(key => sessionStorage.removeItem(key))
  } catch (error) {
    console.warn('Failed to clear market cache:', error.message)
  }
}

/**
 * Check if markets cache exists and is valid
 * @returns {boolean} True if valid cache exists
 */
export function hasValidMarketsCache() {
  const cached = loadCachedMarkets()
  return cached !== null && !cached.isStale
}

/**
 * Get cache statistics for debugging/monitoring
 * @returns {Object} Cache statistics
 */
export function getCacheStats() {
  try {
    const marketsCache = sessionStorage.getItem(CACHE_CONFIG.MARKETS_KEY)
    let marketsCacheInfo = null

    if (marketsCache) {
      const data = JSON.parse(marketsCache)
      marketsCacheInfo = {
        marketCount: data.markets?.length || 0,
        age: Date.now() - data.timestamp,
        lastBlock: data.lastBlock
      }
    }

    // Count event caches
    let eventCacheCount = 0
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)
      if (key && key.startsWith(CACHE_CONFIG.EVENTS_KEY_PREFIX)) {
        eventCacheCount++
      }
    }

    return {
      hasMarketsCache: marketsCache !== null,
      marketsCache: marketsCacheInfo,
      eventCacheCount: eventCacheCount
    }
  } catch (error) {
    return { error: error.message }
  }
}

export default {
  cacheMarkets,
  loadCachedMarkets,
  cacheEventData,
  loadCachedEvents,
  clearMarketCache,
  hasValidMarketsCache,
  getCacheStats
}
