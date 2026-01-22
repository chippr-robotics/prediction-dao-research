/**
 * Market Cache Service
 *
 * Provides caching utilities for market data to reduce blockchain RPC calls
 * and improve dashboard load times.
 *
 * Features:
 * - LocalStorage-based caching for persistence across sessions
 * - Extended TTL (5 minutes) for better UX
 * - Stale-while-revalidate pattern support
 * - Event query caching with block range tracking
 * - Integrates with unified cacheService
 *
 * NOTE: This module is maintained for backwards compatibility.
 * New code should use cacheService.js directly.
 */

import {
  setCache,
  getCache,
  clearCache,
  clearCachesByPrefix,
  CACHE_CONFIG as UNIFIED_CONFIG
} from './cacheService'

// Legacy cache configuration (for backwards compatibility)
// Actual values come from cacheService.js
const CACHE_CONFIG = {
  MARKETS_KEY: 'fairwins_markets_v2',
  EVENTS_KEY_PREFIX: 'fairwins_events_',
  // Extended TTL: 5 minutes for market data (improved from 2 minutes)
  DEFAULT_MARKET_TTL: UNIFIED_CONFIG.markets.ttl,
  // Default TTL: 5 minutes for event data
  DEFAULT_EVENTS_TTL: UNIFIED_CONFIG.events.ttl,
  // Stale threshold: 40% of TTL - data is "stale" but still usable
  STALE_THRESHOLD: UNIFIED_CONFIG.markets.staleFactor
}

/**
 * Cache market data with timestamp
 * Uses localStorage for longer persistence across sessions
 * @param {Array} markets - Array of market objects
 * @param {number|null} lastBlock - Optional last block number for incremental updates
 */
export function cacheMarkets(markets, lastBlock = null) {
  try {
    // Use unified cache service with localStorage persistence
    const dataWithMeta = {
      markets: markets,
      lastBlock: lastBlock,
      marketCount: markets?.length || 0
    }
    setCache('markets', dataWithMeta)
  } catch (error) {
    // Storage might be full or disabled - fail silently
    console.warn('Failed to cache market data:', error.message)
  }
}

/**
 * Load cached markets if not expired
 * Uses unified cache service with stale-while-revalidate pattern
 * @param {number} maxAge - Maximum age in milliseconds (default: 5 minutes) - ignored, uses config
 * @returns {Object|null} Cached data with isStale flag, or null if not found/expired
 */
export function loadCachedMarkets(_maxAge = CACHE_CONFIG.DEFAULT_MARKET_TTL) {
  try {
    const cached = getCache('markets')
    if (!cached) return null

    const { data, age, isStale, timestamp } = cached

    // Return data with stale indicator for background refresh
    return {
      markets: data.markets || data, // Support both old and new format
      lastBlock: data.lastBlock || null,
      timestamp: timestamp,
      age: age,
      isStale: isStale
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
    // Clear markets cache using unified service
    clearCache('markets')

    // Clear all event caches
    clearCachesByPrefix('events')

    // Also clear from sessionStorage for legacy data
    try {
      const keysToRemove = []
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i)
        if (key && key.startsWith(CACHE_CONFIG.EVENTS_KEY_PREFIX)) {
          keysToRemove.push(key)
        }
      }
      keysToRemove.forEach(key => sessionStorage.removeItem(key))
    } catch {
      // Ignore sessionStorage errors
    }
  } catch (error) {
    console.warn('Failed to clear market cache:', error.message)
  }
}

/**
 * Check if markets cache exists and is valid (not stale)
 * @returns {boolean} True if valid non-stale cache exists
 */
export function hasValidMarketsCache() {
  const cached = getCache('markets')
  return cached !== null && !cached.isStale
}

/**
 * Check if markets cache exists (even if stale)
 * @returns {boolean} True if any cache exists
 */
export function hasAnyMarketsCache() {
  const cached = getCache('markets')
  return cached !== null
}

/**
 * Get cache statistics for debugging/monitoring
 * @returns {Object} Cache statistics
 */
export function getCacheStats() {
  try {
    const cached = getCache('markets')
    let marketsCacheInfo = null

    if (cached) {
      const data = cached.data
      marketsCacheInfo = {
        marketCount: data.markets?.length || data?.length || 0,
        age: cached.age,
        ageSeconds: Math.round(cached.age / 1000),
        isStale: cached.isStale,
        lastBlock: data.lastBlock,
        storage: 'localStorage'
      }
    }

    // Count event caches in sessionStorage
    let eventCacheCount = 0
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i)
        if (key && key.startsWith(CACHE_CONFIG.EVENTS_KEY_PREFIX)) {
          eventCacheCount++
        }
      }
    } catch {
      // Ignore
    }

    return {
      hasMarketsCache: cached !== null,
      marketsCache: marketsCacheInfo,
      eventCacheCount: eventCacheCount,
      ttlSeconds: Math.round(CACHE_CONFIG.DEFAULT_MARKET_TTL / 1000)
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
