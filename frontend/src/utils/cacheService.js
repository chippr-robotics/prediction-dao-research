/**
 * Unified Cache Service
 *
 * A comprehensive caching layer for the dashboard that provides:
 * - Configurable TTL per data type
 * - Stale-while-revalidate pattern for instant UX
 * - Request deduplication to prevent duplicate fetches
 * - LocalStorage persistence for longer-term caching
 * - SessionStorage for transient data
 * - Cache warming and preloading capabilities
 *
 * This service dramatically improves dashboard load times by:
 * 1. Returning cached data instantly (even if stale)
 * 2. Triggering background refresh when data is stale
 * 3. Preventing duplicate concurrent requests
 * 4. Persisting frequently-accessed data across sessions
 */

// Cache configuration with TTLs and storage preferences
const CACHE_CONFIG = {
  markets: {
    key: 'fairwins_markets_v2',
    ttl: 5 * 60 * 1000,          // 5 minutes
    staleFactor: 0.4,             // 40% of TTL = 2 minutes before considered stale
    storage: 'localStorage',      // Persist across sessions
    maxAge: 30 * 60 * 1000        // Max 30 minutes before force refresh
  },
  singleMarket: {
    keyPrefix: 'fairwins_market_',
    ttl: 3 * 60 * 1000,           // 3 minutes for individual markets
    staleFactor: 0.5,
    storage: 'sessionStorage',
    maxAge: 15 * 60 * 1000
  },
  proposals: {
    key: 'fairwins_proposals_v2',
    ttl: 10 * 60 * 1000,          // 10 minutes (proposals change less frequently)
    staleFactor: 0.5,
    storage: 'localStorage',
    maxAge: 60 * 60 * 1000        // Max 1 hour
  },
  positions: {
    keyPrefix: 'fairwins_positions_',
    ttl: 2 * 60 * 1000,           // 2 minutes (user-specific, changes with trades)
    staleFactor: 0.5,
    storage: 'sessionStorage',
    maxAge: 10 * 60 * 1000
  },
  welfareMetrics: {
    key: 'fairwins_welfare_metrics_v2',
    ttl: 15 * 60 * 1000,          // 15 minutes (metrics don't change often)
    staleFactor: 0.5,
    storage: 'localStorage',
    maxAge: 60 * 60 * 1000
  },
  categories: {
    key: 'fairwins_categories_v2',
    ttl: 30 * 60 * 1000,          // 30 minutes (categories rarely change)
    staleFactor: 0.5,
    storage: 'localStorage',
    maxAge: 2 * 60 * 60 * 1000    // Max 2 hours
  },
  correlationGroups: {
    key: 'fairwins_correlation_groups_v2',
    ttl: 10 * 60 * 1000,          // 10 minutes
    staleFactor: 0.5,
    storage: 'localStorage',
    maxAge: 60 * 60 * 1000
  },
  events: {
    keyPrefix: 'fairwins_events_',
    ttl: 5 * 60 * 1000,           // 5 minutes for event data
    staleFactor: 0.5,
    storage: 'sessionStorage',
    maxAge: 30 * 60 * 1000
  }
}

// In-flight request tracking for deduplication
const inFlightRequests = new Map()

// Cache version for migration
const CACHE_VERSION = 2

/**
 * Get storage interface based on config
 */
function getStorage(storageType) {
  try {
    if (storageType === 'localStorage') {
      return window.localStorage
    }
    return window.sessionStorage
  } catch {
    // Storage not available (SSR or privacy mode)
    return null
  }
}

/**
 * Store data in cache with timestamp
 */
export function setCache(configKey, data, customKey = null) {
  const config = CACHE_CONFIG[configKey]
  if (!config) {
    console.warn(`Unknown cache config: ${configKey}`)
    return false
  }

  const storage = getStorage(config.storage)
  if (!storage) return false

  const key = customKey || config.key
  const cacheData = {
    version: CACHE_VERSION,
    timestamp: Date.now(),
    data: data
  }

  try {
    storage.setItem(key, JSON.stringify(cacheData))
    return true
  } catch (error) {
    // Storage full or disabled
    console.warn(`Failed to cache ${configKey}:`, error.message)
    // Try to clear old caches to make room
    clearExpiredCaches()
    return false
  }
}

/**
 * Get data from cache
 * Returns { data, age, isStale, isExpired } or null if not found
 */
export function getCache(configKey, customKey = null) {
  const config = CACHE_CONFIG[configKey]
  if (!config) {
    console.warn(`Unknown cache config: ${configKey}`)
    return null
  }

  const storage = getStorage(config.storage)
  if (!storage) return null

  const key = customKey || config.key

  try {
    const cached = storage.getItem(key)
    if (!cached) return null

    const cacheData = JSON.parse(cached)

    // Version check for migration
    if (cacheData.version !== CACHE_VERSION) {
      storage.removeItem(key)
      return null
    }

    const age = Date.now() - cacheData.timestamp
    const staleThreshold = config.ttl * config.staleFactor
    const isStale = age > staleThreshold
    const isExpired = age > config.maxAge

    // Remove if completely expired
    if (isExpired) {
      storage.removeItem(key)
      return null
    }

    return {
      data: cacheData.data,
      age,
      timestamp: cacheData.timestamp,
      isStale,
      isExpired: false,
      ttl: config.ttl,
      maxAge: config.maxAge
    }
  } catch (error) {
    console.warn(`Failed to read cache ${configKey}:`, error.message)
    return null
  }
}

/**
 * Clear a specific cache
 */
export function clearCache(configKey, customKey = null) {
  const config = CACHE_CONFIG[configKey]
  if (!config) return

  const storage = getStorage(config.storage)
  if (!storage) return

  const key = customKey || config.key

  try {
    storage.removeItem(key)
  } catch (error) {
    console.warn(`Failed to clear cache ${configKey}:`, error.message)
  }
}

/**
 * Clear all caches for a config type (useful for prefixed caches)
 */
export function clearCachesByPrefix(configKey) {
  const config = CACHE_CONFIG[configKey]
  if (!config?.keyPrefix) return

  const storage = getStorage(config.storage)
  if (!storage) return

  try {
    const keysToRemove = []
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key?.startsWith(config.keyPrefix)) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach(key => storage.removeItem(key))
  } catch (error) {
    console.warn(`Failed to clear caches for ${configKey}:`, error.message)
  }
}

/**
 * Clear all expired caches across all storage
 */
export function clearExpiredCaches() {
  try {
    const storages = [
      { storage: window.localStorage, name: 'localStorage' },
      { storage: window.sessionStorage, name: 'sessionStorage' }
    ]

    for (const { storage } of storages) {
      const keysToRemove = []
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i)
        if (key?.startsWith('fairwins_')) {
          try {
            const cached = storage.getItem(key)
            if (cached) {
              const cacheData = JSON.parse(cached)
              // Find matching config to check maxAge
              let maxAge = 60 * 60 * 1000 // Default 1 hour
              for (const configKey of Object.keys(CACHE_CONFIG)) {
                const config = CACHE_CONFIG[configKey]
                if (config.key === key || (config.keyPrefix && key.startsWith(config.keyPrefix))) {
                  maxAge = config.maxAge
                  break
                }
              }
              const age = Date.now() - cacheData.timestamp
              if (age > maxAge) {
                keysToRemove.push(key)
              }
            }
          } catch {
            // Invalid JSON, remove it
            keysToRemove.push(key)
          }
        }
      }
      keysToRemove.forEach(key => storage.removeItem(key))
    }
  } catch (error) {
    console.warn('Failed to clear expired caches:', error.message)
  }
}

/**
 * Clear all FairWins caches
 */
export function clearAllCaches() {
  try {
    const storages = [window.localStorage, window.sessionStorage]
    for (const storage of storages) {
      const keysToRemove = []
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i)
        if (key?.startsWith('fairwins_')) {
          keysToRemove.push(key)
        }
      }
      keysToRemove.forEach(key => storage.removeItem(key))
    }
    // Clear in-flight requests
    inFlightRequests.clear()
  } catch (error) {
    console.warn('Failed to clear all caches:', error.message)
  }
}

/**
 * Request deduplication - prevents duplicate concurrent fetches
 *
 * @param {string} requestKey - Unique key for this request
 * @param {Function} fetchFn - Async function to fetch data
 * @returns {Promise} - Resolves with fetched data
 */
export async function deduplicatedFetch(requestKey, fetchFn) {
  // Check if this request is already in flight
  if (inFlightRequests.has(requestKey)) {
    console.debug(`[Cache] Deduplicating request: ${requestKey}`)
    return inFlightRequests.get(requestKey)
  }

  // Create and track the request
  const promise = fetchFn()
    .finally(() => {
      // Remove from in-flight when done
      inFlightRequests.delete(requestKey)
    })

  inFlightRequests.set(requestKey, promise)
  return promise
}

/**
 * Fetch with caching and stale-while-revalidate pattern
 *
 * This is the main entry point for cached data fetching:
 * 1. Returns cached data immediately if available (even if stale)
 * 2. Triggers background refresh if data is stale
 * 3. Deduplicates concurrent requests
 *
 * @param {Object} options - Fetch options
 * @param {string} options.configKey - Cache config key (e.g., 'markets')
 * @param {string} options.customKey - Custom cache key (for prefixed caches)
 * @param {Function} options.fetchFn - Async function to fetch fresh data
 * @param {boolean} options.forceRefresh - Skip cache and fetch fresh
 * @param {Function} options.onBackgroundRefresh - Callback when background refresh completes
 * @param {Function} options.onStaleData - Callback when returning stale data
 * @returns {Promise<Object>} - { data, fromCache, isStale }
 */
export async function fetchWithCache({
  configKey,
  customKey = null,
  fetchFn,
  forceRefresh = false,
  onBackgroundRefresh = null,
  onStaleData = null
}) {
  const config = CACHE_CONFIG[configKey]
  if (!config) {
    console.warn(`Unknown cache config: ${configKey}`)
    const data = await fetchFn()
    return { data, fromCache: false, isStale: false }
  }

  const cacheKey = customKey || config.key

  // Try cache first (unless forcing refresh)
  if (!forceRefresh) {
    const cached = getCache(configKey, customKey)
    if (cached) {
      console.debug(`[Cache] Hit for ${cacheKey}: age=${Math.round(cached.age / 1000)}s, stale=${cached.isStale}`)

      if (cached.isStale) {
        // Notify about stale data
        if (onStaleData) {
          onStaleData(cached.data, cached.age)
        }

        // Trigger background refresh
        deduplicatedFetch(`bg_${cacheKey}`, async () => {
          try {
            console.debug(`[Cache] Background refresh for ${cacheKey}`)
            const freshData = await fetchFn()
            setCache(configKey, freshData, customKey)

            if (onBackgroundRefresh) {
              onBackgroundRefresh(freshData)
            }
            return freshData
          } catch (error) {
            console.warn(`[Cache] Background refresh failed for ${cacheKey}:`, error.message)
            throw error
          }
        }).catch(() => {
          // Silently ignore background refresh errors - we already have cached data
        })
      }

      return {
        data: cached.data,
        fromCache: true,
        isStale: cached.isStale,
        age: cached.age
      }
    }
  }

  // Cache miss or force refresh - fetch fresh data with deduplication
  console.debug(`[Cache] ${forceRefresh ? 'Force refresh' : 'Miss'} for ${cacheKey}`)

  try {
    const data = await deduplicatedFetch(cacheKey, async () => {
      const freshData = await fetchFn()
      setCache(configKey, freshData, customKey)
      return freshData
    })

    return { data, fromCache: false, isStale: false }
  } catch (error) {
    // On error, try to return stale cache as fallback
    const staleFallback = getCache(configKey, customKey)
    if (staleFallback) {
      console.warn(`[Cache] Fetch failed, using stale fallback for ${cacheKey}`)
      return {
        data: staleFallback.data,
        fromCache: true,
        isStale: true,
        error: error.message
      }
    }
    throw error
  }
}

/**
 * Invalidate related caches after an action
 *
 * @param {string} action - Action type ('trade', 'createProposal', 'createMarket')
 * @param {Object} context - Action context (e.g., { marketId, userAddress })
 */
export function invalidateCachesForAction(action, context = {}) {
  console.debug(`[Cache] Invalidating caches for action: ${action}`, context)

  switch (action) {
    case 'trade':
      // After a trade, positions changed and market prices may have updated
      if (context.userAddress) {
        clearCache('positions', `${CACHE_CONFIG.positions.keyPrefix}${context.userAddress}`)
      }
      if (context.marketId !== undefined) {
        clearCache('singleMarket', `${CACHE_CONFIG.singleMarket.keyPrefix}${context.marketId}`)
      }
      // Mark markets as stale (but don't clear - let stale-while-revalidate handle it)
      break

    case 'createMarket':
      // New market created - invalidate markets and categories
      clearCache('markets')
      clearCache('categories')
      clearCache('correlationGroups')
      break

    case 'createProposal':
      clearCache('proposals')
      break

    case 'resolveMarket':
      clearCache('markets')
      if (context.marketId !== undefined) {
        clearCache('singleMarket', `${CACHE_CONFIG.singleMarket.keyPrefix}${context.marketId}`)
      }
      break

    case 'refreshAll':
      clearAllCaches()
      break

    default:
      console.warn(`Unknown cache invalidation action: ${action}`)
  }
}

/**
 * Get cache statistics for debugging
 */
export function getCacheStats() {
  const stats = {
    version: CACHE_VERSION,
    caches: {},
    inFlightRequests: inFlightRequests.size
  }

  for (const [configKey, config] of Object.entries(CACHE_CONFIG)) {
    const cached = config.key
      ? getCache(configKey)
      : null // Skip prefixed caches in stats

    if (cached) {
      stats.caches[configKey] = {
        age: Math.round(cached.age / 1000),
        isStale: cached.isStale,
        ttl: Math.round(config.ttl / 1000),
        storage: config.storage,
        itemCount: Array.isArray(cached.data) ? cached.data.length : 1
      }
    } else {
      stats.caches[configKey] = null
    }
  }

  return stats
}

/**
 * Preload/warm caches for common data
 * Call this on app initialization for faster first load
 *
 * @param {Object} fetchFunctions - Object containing fetch functions for each data type
 */
export async function warmCaches(fetchFunctions = {}) {
  console.debug('[Cache] Warming caches...')

  const warmPromises = []

  // Only warm caches that don't have fresh data
  if (fetchFunctions.markets) {
    const marketsCache = getCache('markets')
    if (!marketsCache || marketsCache.isStale) {
      warmPromises.push(
        fetchWithCache({
          configKey: 'markets',
          fetchFn: fetchFunctions.markets
        }).catch(e => console.warn('[Cache] Failed to warm markets:', e.message))
      )
    }
  }

  if (fetchFunctions.categories) {
    const categoriesCache = getCache('categories')
    if (!categoriesCache || categoriesCache.isStale) {
      warmPromises.push(
        fetchWithCache({
          configKey: 'categories',
          fetchFn: fetchFunctions.categories
        }).catch(e => console.warn('[Cache] Failed to warm categories:', e.message))
      )
    }
  }

  if (fetchFunctions.correlationGroups) {
    const correlationCache = getCache('correlationGroups')
    if (!correlationCache || correlationCache.isStale) {
      warmPromises.push(
        fetchWithCache({
          configKey: 'correlationGroups',
          fetchFn: fetchFunctions.correlationGroups
        }).catch(e => console.warn('[Cache] Failed to warm correlation groups:', e.message))
      )
    }
  }

  // Run in parallel for faster warming
  await Promise.allSettled(warmPromises)
  console.debug('[Cache] Cache warming complete')
}

// Export config for testing/debugging
export { CACHE_CONFIG }

export default {
  setCache,
  getCache,
  clearCache,
  clearCachesByPrefix,
  clearExpiredCaches,
  clearAllCaches,
  deduplicatedFetch,
  fetchWithCache,
  invalidateCachesForAction,
  getCacheStats,
  warmCaches,
  CACHE_CONFIG
}
