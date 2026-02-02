/**
 * useInfiniteMarkets Hook
 *
 * Provides infinite scroll loading for markets with trending-based ordering.
 * Loads an initial page instantly, then builds a trending index in the background.
 * Once the index is ready, markets are re-sorted by activity.
 *
 * Features:
 * - Instant initial page load (< 2 seconds regardless of total market count)
 * - Background index building using trading events
 * - Automatic re-sorting when index completes
 * - Infinite scroll support
 * - Category filtering
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useUserPreferences } from './useUserPreferences'
import {
  fetchMarketsByIds,
  fetchActiveMarketsPaginated
} from '../utils/blockchainService'
import {
  buildIndexInBackground,
  getTrendingMarketIds,
  getCategoryMarketIds,
  isCategoryIndexReady,
  isIndexReady,
  isIndexBuilding,
  getIndexBuildProgress,
  onIndexReady,
  invalidateIndex
} from '../utils/marketIndexService'
import { getMockMarkets } from '../utils/mockDataLoader'
import { logger } from '../utils/logger'

const DEFAULT_PAGE_SIZE = 20
const MAX_FETCH_ATTEMPTS = 10 // Max pages to fetch when filling category

/**
 * Filter markets by category
 * @param {Array} markets - Markets to filter
 * @param {string|null} category - Category to filter by (null = all)
 * @returns {Array} Filtered markets
 */
function filterByCategory(markets, category) {
  if (!category || category === 'all' || category === 'trending') {
    return markets
  }
  return markets.filter(m => m.category?.toLowerCase() === category.toLowerCase())
}

/**
 * Check if we need to fetch more markets to fill category
 * @param {string|null} category - Category filter
 * @returns {boolean} Whether we're filtering by category
 */
function isFilteringByCategory(category) {
  return category && category !== 'all' && category !== 'trending'
}

/**
 * Hook for infinite scroll market loading with trending support
 *
 * @param {Object} options - Hook options
 * @param {string} options.category - Category to filter by (null for all/trending)
 * @param {number} options.pageSize - Number of markets per page (default: 20)
 * @param {boolean} options.autoLoad - Start loading on mount (default: true)
 * @returns {Object} Hook state and methods
 */
export function useInfiniteMarkets({
  category = null,
  pageSize = DEFAULT_PAGE_SIZE,
  autoLoad = true
} = {}) {
  const { preferences } = useUserPreferences()
  const demoMode = preferences.demoMode

  // State
  const [markets, setMarkets] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [error, setError] = useState(null)
  const [indexReady, setIndexReady] = useState(isIndexReady())
  const [indexProgress, setIndexProgress] = useState(getIndexBuildProgress())

  // Refs - use refs for guards to avoid dependency loops
  const offsetRef = useRef(0)
  const loadedIdsRef = useRef(new Set())
  const initialLoadDone = useRef(false)
  const isLoadingRef = useRef(false)
  const isLoadingMoreRef = useRef(false)

  /**
   * Load initial page of markets
   * Uses instant pagination, then starts background index build
   * For category views, fetches additional pages until we have enough markets
   */
  const loadInitialPage = useCallback(async () => {
    // Use ref to check loading to avoid dependency on state
    if (isLoadingRef.current) return
    isLoadingRef.current = true

    setIsLoading(true)
    setError(null)
    offsetRef.current = 0
    loadedIdsRef.current = new Set()

    try {
      if (demoMode) {
        // Demo mode: use mock data
        const mockMarkets = getMockMarkets()
        const filtered = filterByCategory(mockMarkets, category)
        setMarkets(filtered.slice(0, pageSize))
        setHasMore(filtered.length > pageSize)
        initialLoadDone.current = true
        setIsLoading(false)
        return
      }

      const needsCategoryFill = isFilteringByCategory(category)

      // OPTIMIZATION: Use category index when available for category views
      if (needsCategoryFill && isCategoryIndexReady()) {
        logger.debug(`Using category index for ${category}`)
        const { marketIds, hasMore: more, fromIndex } = getCategoryMarketIds(category, {
          offset: 0,
          limit: pageSize
        })

        if (fromIndex && marketIds.length > 0) {
          // Category index available - fetch only needed markets
          const fetchedMarkets = await fetchMarketsByIds(marketIds)
          fetchedMarkets.forEach(m => loadedIdsRef.current.add(m.id))

          setMarkets(fetchedMarkets)
          setHasMore(more)
          offsetRef.current = pageSize

          initialLoadDone.current = true
          setIsLoading(false)
          isLoadingRef.current = false
          return
        }
      }

      // Fallback: fetch all and filter client-side (when index not ready)
      let allFiltered = []
      let currentOffset = 0
      let hasMorePages = true
      let fetchAttempts = 0

      // Fetch pages until we have enough category-filtered markets
      while (hasMorePages && allFiltered.length < pageSize && fetchAttempts < MAX_FETCH_ATTEMPTS) {
        fetchAttempts++

        // Get page of markets
        const { marketIds, hasMore: more } = await getTrendingMarketIds({
          offset: currentOffset,
          limit: pageSize,
          requireIndex: false
        })

        if (marketIds.length === 0) {
          hasMorePages = false
          break
        }

        // Filter out already loaded IDs
        const newIds = marketIds.filter(id => !loadedIdsRef.current.has(id))

        if (newIds.length > 0) {
          // Fetch the market data
          const fetchedMarkets = await fetchMarketsByIds(newIds)

          // Track loaded IDs
          fetchedMarkets.forEach(m => loadedIdsRef.current.add(m.id))

          // Apply category filter
          const filtered = filterByCategory(fetchedMarkets, category)
          allFiltered = [...allFiltered, ...filtered]
        }

        currentOffset += pageSize
        hasMorePages = more

        // For non-category views, one page is enough
        if (!needsCategoryFill) break
      }

      // Update offset to track how far we've fetched
      offsetRef.current = currentOffset

      setMarkets(allFiltered.slice(0, pageSize))
      setHasMore(hasMorePages || allFiltered.length > pageSize)

      // Start background index building
      if (!isIndexReady() && !isIndexBuilding()) {
        buildIndexInBackground({
          daysBack: 7,
          onProgress: setIndexProgress,
          onComplete: (indexData) => {
            if (indexData) {
              setIndexReady(true)
              logger.debug('Index complete, re-sorting markets')
            }
          }
        })
      }

      initialLoadDone.current = true
    } catch (err) {
      logger.debug('Failed to load initial markets:', err)
      setError(err.message || 'Failed to load markets')
    } finally {
      isLoadingRef.current = false
      setIsLoading(false)
    }
  }, [demoMode, category, pageSize])

  /**
   * Load more markets (infinite scroll)
   * For category views, fetches additional pages until we have enough new markets
   */
  const loadMore = useCallback(async () => {
    // Use refs to check loading to avoid dependency on state
    if (isLoadingMoreRef.current || !hasMore || isLoadingRef.current) return
    isLoadingMoreRef.current = true
    setIsLoadingMore(true)

    try {
      if (demoMode) {
        // Demo mode: paginate mock data
        const mockMarkets = getMockMarkets()
        const filtered = filterByCategory(mockMarkets, category)
        const nextPage = filtered.slice(offsetRef.current, offsetRef.current + pageSize)
        setMarkets(prev => [...prev, ...nextPage])
        offsetRef.current += pageSize
        setHasMore(offsetRef.current < filtered.length)
        setIsLoadingMore(false)
        return
      }

      const needsCategoryFill = isFilteringByCategory(category)

      // OPTIMIZATION: Use category index when available for category views
      if (needsCategoryFill && isCategoryIndexReady()) {
        logger.debug(`Using category index for loadMore: ${category}`)
        const { marketIds, hasMore: more, fromIndex } = getCategoryMarketIds(category, {
          offset: offsetRef.current,
          limit: pageSize
        })

        if (fromIndex) {
          if (marketIds.length > 0) {
            const fetchedMarkets = await fetchMarketsByIds(marketIds)
            fetchedMarkets.forEach(m => loadedIdsRef.current.add(m.id))
            setMarkets(prev => [...prev, ...fetchedMarkets])
          }
          offsetRef.current += pageSize
          setHasMore(more)

          isLoadingMoreRef.current = false
          setIsLoadingMore(false)
          return
        }
      }

      // Fallback: fetch all and filter client-side
      let newFiltered = []
      let currentOffset = offsetRef.current
      let hasMorePages = true
      let fetchAttempts = 0

      // Fetch pages until we have enough category-filtered markets
      while (hasMorePages && newFiltered.length < pageSize && fetchAttempts < MAX_FETCH_ATTEMPTS) {
        fetchAttempts++

        // Get next page of market IDs
        const { marketIds, hasMore: more } = await getTrendingMarketIds({
          offset: currentOffset,
          limit: pageSize,
          requireIndex: false
        })

        if (marketIds.length === 0) {
          hasMorePages = false
          break
        }

        // Filter out already loaded markets
        const newIds = marketIds.filter(id => !loadedIdsRef.current.has(id))

        if (newIds.length > 0) {
          // Fetch the market data
          const fetchedMarkets = await fetchMarketsByIds(newIds)

          // Track loaded IDs
          fetchedMarkets.forEach(m => loadedIdsRef.current.add(m.id))

          // Apply category filter
          const filtered = filterByCategory(fetchedMarkets, category)
          newFiltered = [...newFiltered, ...filtered]
        }

        currentOffset += pageSize
        hasMorePages = more

        // For non-category views, one page is enough
        if (!needsCategoryFill) break
      }

      // Update offset
      offsetRef.current = currentOffset

      if (newFiltered.length > 0) {
        setMarkets(prev => [...prev, ...newFiltered])
      }
      setHasMore(hasMorePages)
    } catch (err) {
      logger.debug('Failed to load more markets:', err)
      setError(err.message || 'Failed to load more markets')
    } finally {
      isLoadingMoreRef.current = false
      setIsLoadingMore(false)
    }
  }, [demoMode, category, pageSize, hasMore])

  /**
   * Refresh markets (force reload)
   */
  const refresh = useCallback(async () => {
    // Invalidate the index to get fresh data
    invalidateIndex()
    setIndexReady(false)
    setIndexProgress(0)
    initialLoadDone.current = false
    await loadInitialPage()
  }, [loadInitialPage])

  /**
   * Re-sort markets when index becomes ready
   */
  const resortByTrending = useCallback(async () => {
    if (!indexReady || markets.length === 0) return

    try {
      // Get all trending IDs we need
      const { marketIds } = await getTrendingMarketIds({
        offset: 0,
        limit: offsetRef.current,
        requireIndex: true
      })

      // Create a map for quick lookup
      const orderMap = new Map(marketIds.map((id, index) => [id, index]))

      // Sort current markets by trending order
      setMarkets(prev => {
        const sorted = [...prev].sort((a, b) => {
          const orderA = orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER
          const orderB = orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER
          return orderA - orderB
        })
        return sorted
      })
    } catch (err) {
      logger.debug('Failed to resort markets by trending:', err)
    }
  }, [indexReady, markets.length])

  // Track previous category to detect changes
  const prevCategoryRef = useRef(category)

  // Combined load effect - handles both initial load and category changes
  useEffect(() => {
    const categoryChanged = prevCategoryRef.current !== category
    prevCategoryRef.current = category

    if (!autoLoad) return

    // Load on category change or initial mount
    if (categoryChanged || !initialLoadDone.current) {
      // Reset state for new category
      if (categoryChanged) {
        initialLoadDone.current = false
        loadedIdsRef.current = new Set()
        offsetRef.current = 0
        setMarkets([])
        setHasMore(true)
      }
      loadInitialPage()
    }
  }, [autoLoad, category, loadInitialPage])

  // Subscribe to index ready events
  useEffect(() => {
    const unsubscribe = onIndexReady(() => {
      setIndexReady(true)
      setIndexProgress(100)
    })
    return unsubscribe
  }, [])

  // Re-sort when index becomes ready
  useEffect(() => {
    if (indexReady && initialLoadDone.current) {
      resortByTrending()
    }
  }, [indexReady, resortByTrending])

  // Memoize return value
  return useMemo(() => ({
    // Data
    markets,

    // Loading states
    isLoading,
    isLoadingMore,
    hasMore,
    error,

    // Index status
    isIndexReady: indexReady,
    indexProgress,

    // Actions
    loadMore,
    refresh,

    // Stats
    totalLoaded: markets.length
  }), [
    markets,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    indexReady,
    indexProgress,
    loadMore,
    refresh
  ])
}

/**
 * Hook for getting a limited set of trending markets (for dashboard)
 *
 * @param {Object} options - Hook options
 * @param {number} options.limit - Maximum markets to fetch (default: 50)
 * @returns {Object} Hook state
 */
export function useTrendingMarkets({ limit = 50 } = {}) {
  const { preferences } = useUserPreferences()
  const demoMode = preferences.demoMode

  const [markets, setMarkets] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function loadTrending() {
      setIsLoading(true)
      setError(null)

      try {
        if (demoMode) {
          const mockMarkets = getMockMarkets()
          setMarkets(mockMarkets.slice(0, limit))
          setIsLoading(false)
          return
        }

        // Use paginated fetch for initial data
        const { markets: fetchedMarkets } = await fetchActiveMarketsPaginated({
          offset: 0,
          limit
        })

        setMarkets(fetchedMarkets)

        // Build index in background for future sorting
        if (!isIndexReady() && !isIndexBuilding()) {
          buildIndexInBackground({
            daysBack: 7,
            onComplete: async (indexData) => {
              if (indexData) {
                // Re-fetch with trending order once index is ready
                const { marketIds } = await getTrendingMarketIds({
                  offset: 0,
                  limit,
                  requireIndex: true
                })
                const trendingMarkets = await fetchMarketsByIds(marketIds)
                setMarkets(trendingMarkets)
              }
            }
          })
        }
      } catch (err) {
        logger.debug('Failed to load trending markets:', err)
        setError(err.message || 'Failed to load markets')
      } finally {
        setIsLoading(false)
      }
    }

    loadTrending()
  }, [demoMode, limit])

  return useMemo(() => ({
    markets,
    isLoading,
    error
  }), [markets, isLoading, error])
}
