/**
 * Market Index Service
 *
 * Builds and maintains a trending index of markets based on trading activity.
 * Uses event logs (TokensPurchased, TokensSold) to track market interactions.
 * Index is built in the background to avoid blocking the UI.
 */

import { ethers } from 'ethers'
import { getContractAddress, NETWORK_CONFIG } from '../config/contracts'
import { MARKET_FACTORY_ABI, MarketStatus } from '../abis/ConditionalMarketFactory'
import { logger } from './logger'
import { batchFetchMarketCategories } from './blockchainService'

// Valid category names
const VALID_CATEGORIES = ['sports', 'politics', 'finance', 'tech', 'crypto', 'pop-culture', 'weather', 'other']

// Cache configuration
const INDEX_CACHE_KEY = 'market_trending_index'
const INDEX_TTL_MS = 5 * 60 * 1000 // 5 minutes
const BLOCKS_PER_DAY_ESTIMATE = 6500 // ~13 second blocks on ETC

// Index state
let indexData = null
let indexBuildingFlag = false
let indexBuildProgress = 0
let indexBuildCallbacks = []

/**
 * Get the market factory contract instance
 */
function getMarketFactoryContract() {
  const provider = new ethers.JsonRpcProvider(NETWORK_CONFIG.rpcUrl)
  const address = getContractAddress('marketFactory')
  return new ethers.Contract(address, MARKET_FACTORY_ABI, provider)
}

/**
 * Check if the cached index is still valid
 */
function isCacheValid() {
  try {
    const cached = sessionStorage.getItem(INDEX_CACHE_KEY)
    if (!cached) return false

    const { timestamp, data } = JSON.parse(cached)
    const isValid = Date.now() - timestamp < INDEX_TTL_MS

    if (isValid && data) {
      indexData = data
      return true
    }
    return false
  } catch {
    return false
  }
}

/**
 * Save index to cache
 */
function saveToCache(data) {
  try {
    sessionStorage.setItem(INDEX_CACHE_KEY, JSON.stringify({
      timestamp: Date.now(),
      data
    }))
  } catch (error) {
    logger.debug('Failed to cache market index:', error.message)
  }
}

/**
 * Check if the index is ready for use
 * @returns {boolean}
 */
export function isIndexReady() {
  return indexData !== null
}

/**
 * Check if index is currently being built
 * @returns {boolean}
 */
export function isIndexBuilding() {
  return indexBuildingFlag
}

/**
 * Get current index build progress (0-100)
 * @returns {number}
 */
export function getIndexBuildProgress() {
  return indexBuildProgress
}

/**
 * Invalidate the cached index
 */
export function invalidateIndex() {
  indexData = null
  indexBuildProgress = 0
  try {
    sessionStorage.removeItem(INDEX_CACHE_KEY)
  } catch {
    // Ignore storage errors
  }
}

/**
 * Register a callback to be notified when index build completes
 * @param {Function} callback - Called with the index data when ready
 * @returns {Function} Unsubscribe function
 */
export function onIndexReady(callback) {
  // If already ready, call immediately
  if (indexData) {
    setTimeout(() => callback(indexData), 0)
    return () => {}
  }

  indexBuildCallbacks.push(callback)
  return () => {
    indexBuildCallbacks = indexBuildCallbacks.filter(cb => cb !== callback)
  }
}

/**
 * Notify all subscribers that index is ready
 */
function notifyIndexReady() {
  const callbacks = [...indexBuildCallbacks]
  indexBuildCallbacks = []
  callbacks.forEach(cb => {
    try {
      cb(indexData)
    } catch (error) {
      logger.debug('Index ready callback error:', error)
    }
  })
}

/**
 * Query trading events within a block range
 * @param {ethers.Contract} contract - Market factory contract
 * @param {number} fromBlock - Start block
 * @param {number} toBlock - End block
 * @returns {Promise<Array>} Array of events
 */
async function queryTradingEvents(contract, fromBlock, toBlock) {
  try {
    // Query both buy and sell events
    const [buyEvents, sellEvents] = await Promise.all([
      contract.queryFilter(contract.filters.TokensPurchased(), fromBlock, toBlock),
      contract.queryFilter(contract.filters.TokensSold(), fromBlock, toBlock).catch(() => [])
    ])

    return [...buyEvents, ...sellEvents]
  } catch (error) {
    logger.debug('Failed to query trading events:', error.message)
    return []
  }
}

/**
 * Build the trending index from trading events
 * Counts interactions per market and sorts by activity
 *
 * @param {Object} options - Build options
 * @param {number} options.daysBack - How many days of activity to consider (default: 7)
 * @param {Function} options.onProgress - Progress callback (0-100)
 * @returns {Promise<Object>} Index data with trendingMarketIds array
 */
export async function buildTrendingIndex({ daysBack = 7, onProgress } = {}) {
  // Check cache first
  if (isCacheValid()) {
    logger.debug('Using cached trending index')
    if (onProgress) onProgress(100)
    return indexData
  }

  // Prevent concurrent builds
  if (indexBuildingFlag) {
    logger.debug('Index build already in progress')
    return new Promise((resolve) => {
      onIndexReady(resolve)
    })
  }

  indexBuildingFlag = true
  indexBuildProgress = 0

  try {
    const contract = getMarketFactoryContract()
    const provider = contract.runner

    // Get current block and calculate range
    const currentBlock = await provider.getBlockNumber()
    const blocksToFetch = daysBack * BLOCKS_PER_DAY_ESTIMATE
    const fromBlock = Math.max(0, currentBlock - blocksToFetch)

    logger.debug(`Building trending index from block ${fromBlock} to ${currentBlock}`)

    // Get market count for filtering
    const marketCount = await contract.marketCount()
    const totalMarkets = Number(marketCount)

    if (onProgress) onProgress(10)
    indexBuildProgress = 10

    // Query events in chunks to avoid RPC limits
    const CHUNK_SIZE = 10000
    const interactionCounts = new Map() // marketId -> interaction count
    const lastActivity = new Map() // marketId -> last block number

    let processedBlocks = 0
    const totalBlocks = currentBlock - fromBlock

    for (let start = fromBlock; start < currentBlock; start += CHUNK_SIZE) {
      const end = Math.min(start + CHUNK_SIZE - 1, currentBlock)

      const events = await queryTradingEvents(contract, start, end)

      // Count interactions per market
      for (const event of events) {
        const marketId = Number(event.args.marketId)
        interactionCounts.set(marketId, (interactionCounts.get(marketId) || 0) + 1)

        const currentLast = lastActivity.get(marketId) || 0
        if (event.blockNumber > currentLast) {
          lastActivity.set(marketId, event.blockNumber)
        }
      }

      // Update progress (10-80% for event fetching)
      processedBlocks += (end - start)
      const fetchProgress = 10 + Math.floor((processedBlocks / totalBlocks) * 70)
      if (onProgress) onProgress(fetchProgress)
      indexBuildProgress = fetchProgress

      // Yield to UI to prevent blocking
      await new Promise(resolve => setTimeout(resolve, 0))
    }

    if (onProgress) onProgress(85)
    indexBuildProgress = 85

    // Get market statuses to filter active only
    const marketStatuses = new Map()
    const statusCheckChunkSize = 50

    for (let i = 0; i < totalMarkets; i += statusCheckChunkSize) {
      const chunk = []
      for (let j = i; j < Math.min(i + statusCheckChunkSize, totalMarkets); j++) {
        chunk.push(contract.markets(j).then(m => ({ id: j, status: Number(m.status) })))
      }

      const results = await Promise.all(chunk)
      for (const { id, status } of results) {
        marketStatuses.set(id, status)
      }

      // Yield to UI
      await new Promise(resolve => setTimeout(resolve, 0))
    }

    if (onProgress) onProgress(95)
    indexBuildProgress = 95

    // Build sorted list of trending market IDs (active markets only)
    const trendingMarketIds = Array.from({ length: totalMarkets }, (_, i) => i)
      .filter(id => marketStatuses.get(id) === MarketStatus.Active)
      .sort((a, b) => {
        // Primary sort: interaction count (descending)
        const countDiff = (interactionCounts.get(b) || 0) - (interactionCounts.get(a) || 0)
        if (countDiff !== 0) return countDiff

        // Secondary sort: last activity (most recent first)
        const activityDiff = (lastActivity.get(b) || 0) - (lastActivity.get(a) || 0)
        if (activityDiff !== 0) return activityDiff

        // Tertiary sort: market ID (newest first)
        return b - a
      })

    if (onProgress) onProgress(96)
    indexBuildProgress = 96

    // NEW: Build category index using batched multicall
    logger.debug(`Building category index for ${trendingMarketIds.length} active markets`)
    const categoryMap = await batchFetchMarketCategories(trendingMarketIds)

    // Build category → marketIds mapping, sorted by activity within each category
    const categoryIndex = {}
    for (const cat of VALID_CATEGORIES) {
      categoryIndex[cat] = []
    }

    for (const marketId of trendingMarketIds) {
      const category = categoryMap.get(marketId) || 'other'
      const normalizedCat = VALID_CATEGORIES.includes(category) ? category : 'other'
      categoryIndex[normalizedCat].push(marketId)
    }

    // Log category distribution
    const categoryStats = Object.entries(categoryIndex)
      .filter(([, ids]) => ids.length > 0)
      .map(([cat, ids]) => `${cat}: ${ids.length}`)
    logger.debug(`Category distribution: ${categoryStats.join(', ')}`)

    if (onProgress) onProgress(98)
    indexBuildProgress = 98

    // Build the index data with category index
    indexData = {
      trendingMarketIds,
      interactionCounts: Object.fromEntries(interactionCounts),
      lastActivity: Object.fromEntries(lastActivity),
      totalMarkets,
      builtAt: Date.now(),
      blockRange: { from: fromBlock, to: currentBlock },
      // NEW: Category index
      categoryIndex,
      marketCategories: Object.fromEntries(categoryMap)
    }

    // Cache the result
    saveToCache(indexData)

    if (onProgress) onProgress(100)
    indexBuildProgress = 100

    logger.debug(`Built trending index with ${trendingMarketIds.length} active markets and category index`)

    return indexData
  } catch (error) {
    logger.debug('Failed to build trending index:', error)
    throw error
  } finally {
    indexBuildingFlag = false
    notifyIndexReady()
  }
}

/**
 * Start building the index in the background (non-blocking)
 * Uses requestIdleCallback or setTimeout fallback
 *
 * @param {Object} options - Build options
 * @param {number} options.daysBack - Days of activity to consider
 * @param {Function} options.onProgress - Progress callback
 * @param {Function} options.onComplete - Completion callback
 */
export function buildIndexInBackground({ daysBack = 7, onProgress, onComplete } = {}) {
  // Check cache first - if valid, complete immediately
  if (isCacheValid()) {
    logger.debug('Using cached index for background build')
    if (onProgress) onProgress(100)
    if (onComplete) onComplete(indexData)
    return
  }

  const startBuild = () => {
    buildTrendingIndex({ daysBack, onProgress })
      .then(data => {
        if (onComplete) onComplete(data)
      })
      .catch(error => {
        logger.debug('Background index build failed:', error)
        if (onComplete) onComplete(null)
      })
  }

  // Use requestIdleCallback if available, otherwise setTimeout
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(startBuild, { timeout: 5000 })
  } else {
    setTimeout(startBuild, 100)
  }
}

/**
 * Get paginated market IDs from the trending index
 * Falls back to sequential order if index isn't ready
 *
 * @param {Object} options - Pagination options
 * @param {number} options.offset - Starting offset
 * @param {number} options.limit - Number of markets to return
 * @param {boolean} options.requireIndex - If true, waits for index (default: false)
 * @returns {Promise<Object>} { marketIds: number[], hasMore: boolean, fromIndex: boolean }
 */
export async function getTrendingMarketIds({ offset = 0, limit = 20, requireIndex = false } = {}) {
  // If index is ready, use it
  if (indexData) {
    const marketIds = indexData.trendingMarketIds.slice(offset, offset + limit)
    const hasMore = offset + limit < indexData.trendingMarketIds.length
    return { marketIds, hasMore, fromIndex: true }
  }

  // If requiring index, wait for it
  if (requireIndex) {
    await new Promise(resolve => {
      onIndexReady(() => resolve())

      // Start building if not already
      if (!indexBuildingFlag) {
        buildIndexInBackground()
      }
    })

    return getTrendingMarketIds({ offset, limit, requireIndex: false })
  }

  // Fallback: return sequential market IDs (newest first)
  const contract = getMarketFactoryContract()
  const marketCount = await contract.marketCount()
  const total = Number(marketCount)

  // Generate IDs in reverse order (newest first)
  const startId = Math.max(0, total - 1 - offset)
  const endId = Math.max(0, startId - limit + 1)

  const marketIds = []
  for (let id = startId; id >= endId; id--) {
    marketIds.push(id)
  }

  const hasMore = endId > 0
  return { marketIds, hasMore, fromIndex: false }
}

/**
 * Get market IDs for a specific category from the category index
 * Uses pre-built category index for fast lookups
 *
 * @param {string} category - Category to filter by (e.g., 'sports', 'politics')
 * @param {Object} options - Pagination options
 * @param {number} options.offset - Starting offset (default: 0)
 * @param {number} options.limit - Number of markets to return (default: 20)
 * @returns {Object} { marketIds: number[], hasMore: boolean, fromIndex: boolean }
 */
export function getCategoryMarketIds(category, { offset = 0, limit = 20 } = {}) {
  // Check if category index is available
  if (!indexData?.categoryIndex) {
    logger.debug('Category index not available yet')
    return { marketIds: [], hasMore: false, fromIndex: false }
  }

  const normalizedCategory = category?.toLowerCase() || 'other'
  const categoryIds = indexData.categoryIndex[normalizedCategory] || []

  if (categoryIds.length === 0) {
    logger.debug(`No markets found for category: ${normalizedCategory}`)
    return { marketIds: [], hasMore: false, fromIndex: true }
  }

  const marketIds = categoryIds.slice(offset, offset + limit)
  const hasMore = offset + limit < categoryIds.length

  logger.debug(`getCategoryMarketIds(${normalizedCategory}): returning ${marketIds.length} of ${categoryIds.length} markets`)

  return { marketIds, hasMore, fromIndex: true }
}

/**
 * Check if category index is ready
 * @returns {boolean} True if category index has been built
 */
export function isCategoryIndexReady() {
  return indexData?.categoryIndex !== null && indexData?.categoryIndex !== undefined
}

/**
 * Get market IDs for a specific category (async version with fallback)
 * Falls back to trending order if category index not ready
 *
 * @param {string} category - Category to filter by
 * @param {number} offset - Starting offset
 * @param {number} limit - Number of markets to return
 * @returns {Promise<Object>} { marketIds: number[], hasMore: boolean, fromIndex: boolean }
 */
export async function getMarketIdsByCategory(category, { offset = 0, limit = 20 } = {}) {
  // Try to use category index first
  const result = getCategoryMarketIds(category, { offset, limit })
  if (result.fromIndex) {
    return result
  }

  // Fallback: return trending order - let the component layer filter by category
  logger.debug('Category index not ready, falling back to trending order')
  return getTrendingMarketIds({ offset, limit })
}

/**
 * Get the interaction count for a specific market
 * @param {number} marketId - Market ID
 * @returns {number} Interaction count (0 if unknown)
 */
export function getMarketInteractionCount(marketId) {
  if (!indexData?.interactionCounts) return 0
  return indexData.interactionCounts[marketId] || 0
}

/**
 * Get index statistics
 * @returns {Object|null} Index stats or null if not ready
 */
export function getIndexStats() {
  if (!indexData) return null

  return {
    totalMarkets: indexData.totalMarkets,
    activeMarkets: indexData.trendingMarketIds.length,
    builtAt: indexData.builtAt,
    blockRange: indexData.blockRange
  }
}
