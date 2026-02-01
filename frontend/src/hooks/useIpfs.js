/**
 * useIpfs Hook
 * 
 * Custom React hook for accessing IPFS data in components.
 * Provides loading states, error handling, and automatic caching.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  fetchFromIpfs,
  fetchTokenMetadata,
  fetchMarketData,
  fetchMarketMetadata,
  fetchByCid,
  batchFetch,
  clearCache,
  clearCacheEntry,
  fetchEncryptedEnvelope,
} from '../utils/ipfsService'

/**
 * Hook for fetching generic data from IPFS
 * @param {string|null} path - IPFS path or CID to fetch
 * @param {Object} options - Hook options
 * @param {boolean} options.enabled - Whether to auto-fetch (default: true)
 * @param {boolean} options.skipCache - Skip cache on fetch
 * @returns {Object} Hook state and methods
 */
export function useIpfs(path, options = {}) {
  const { enabled = true, skipCache = false } = options
  
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchData = useCallback(async () => {
    if (!path) {
      setData(null)
      setError(null)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const result = await fetchFromIpfs(path, { skipCache })
      setData(result)
    } catch (err) {
      console.error('Error fetching from IPFS:', err)
      setError(err.message)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [path, skipCache])

  useEffect(() => {
    if (enabled) {
      fetchData()
    }
  }, [enabled, fetchData])

  const refetch = useCallback(() => {
    return fetchData()
  }, [fetchData])

  const clearCached = useCallback(() => {
    if (path) {
      clearCacheEntry(path)
    }
  }, [path])

  return {
    data,
    loading,
    error,
    refetch,
    clearCached,
  }
}

/**
 * Hook for fetching token metadata from IPFS
 * @param {string|null} tokenAddress - Token contract address
 * @param {Object} options - Hook options
 * @returns {Object} Hook state and methods
 */
export function useTokenMetadata(tokenAddress, options = {}) {
  const { enabled = true, skipCache = false } = options
  
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchData = useCallback(async () => {
    if (!tokenAddress) {
      setData(null)
      setError(null)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const result = await fetchTokenMetadata(tokenAddress, { skipCache })
      setData(result)
    } catch (err) {
      console.error('Error fetching token metadata:', err)
      setError(err.message)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [tokenAddress, skipCache])

  useEffect(() => {
    if (enabled) {
      fetchData()
    }
  }, [enabled, fetchData])

  const refetch = useCallback(() => {
    return fetchData()
  }, [fetchData])

  return {
    metadata: data,
    loading,
    error,
    refetch,
  }
}

/**
 * Hook for fetching market data from IPFS
 * @param {string|null} marketId - Market identifier
 * @param {Object} options - Hook options
 * @returns {Object} Hook state and methods
 */
export function useMarketData(marketId, options = {}) {
  const { enabled = true, skipCache = false } = options
  
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchData = useCallback(async () => {
    if (!marketId) {
      setData(null)
      setError(null)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const result = await fetchMarketData(marketId, { skipCache })
      setData(result)
    } catch (err) {
      console.error('Error fetching market data:', err)
      setError(err.message)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [marketId, skipCache])

  useEffect(() => {
    if (enabled) {
      fetchData()
    }
  }, [enabled, fetchData])

  const refetch = useCallback(() => {
    return fetchData()
  }, [fetchData])

  return {
    marketData: data,
    loading,
    error,
    refetch,
  }
}

/**
 * Hook for fetching market metadata from IPFS
 * @param {string|null} marketId - Market identifier
 * @param {Object} options - Hook options
 * @returns {Object} Hook state and methods
 */
export function useMarketMetadata(marketId, options = {}) {
  const { enabled = true, skipCache = false } = options
  
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchData = useCallback(async () => {
    if (!marketId) {
      setData(null)
      setError(null)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const result = await fetchMarketMetadata(marketId, { skipCache })
      setData(result)
    } catch (err) {
      console.error('Error fetching market metadata:', err)
      setError(err.message)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [marketId, skipCache])

  useEffect(() => {
    if (enabled) {
      fetchData()
    }
  }, [enabled, fetchData])

  const refetch = useCallback(() => {
    return fetchData()
  }, [fetchData])

  return {
    metadata: data,
    loading,
    error,
    refetch,
  }
}

/**
 * Hook for fetching data by CID from IPFS
 * @param {string|null} cid - IPFS content identifier
 * @param {Object} options - Hook options
 * @returns {Object} Hook state and methods
 */
export function useIpfsByCid(cid, options = {}) {
  const { enabled = true, skipCache = false } = options
  
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchData = useCallback(async () => {
    if (!cid) {
      setData(null)
      setError(null)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const result = await fetchByCid(cid, { skipCache })
      setData(result)
    } catch (err) {
      console.error('Error fetching from IPFS by CID:', err)
      setError(err.message)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [cid, skipCache])

  useEffect(() => {
    if (enabled) {
      fetchData()
    }
  }, [enabled, fetchData])

  const refetch = useCallback(() => {
    return fetchData()
  }, [fetchData])

  return {
    data,
    loading,
    error,
    refetch,
  }
}

/**
 * Hook for batch fetching multiple items from IPFS
 * @param {Array<string>} paths - Array of IPFS paths or CIDs
 * @param {Object} options - Hook options
 * @returns {Object} Hook state and methods
 */
export function useBatchIpfs(paths, options = {}) {
  const { enabled = true, skipCache = false } = options
  
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchData = useCallback(async () => {
    if (!paths || paths.length === 0) {
      setData([])
      setError(null)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const results = await batchFetch(paths, { skipCache })
      setData(results)
    } catch (err) {
      console.error('Error batch fetching from IPFS:', err)
      setError(err.message)
      setData([])
    } finally {
      setLoading(false)
    }
  }, [paths, skipCache])

  useEffect(() => {
    if (enabled) {
      fetchData()
    }
  }, [enabled, fetchData])

  const refetch = useCallback(() => {
    return fetchData()
  }, [fetchData])

  return {
    data,
    loading,
    error,
    refetch,
  }
}

/**
 * Hook providing utility functions for IPFS cache management
 * @returns {Object} Cache management functions
 */
export function useIpfsCache() {
  const clearAll = useCallback(() => {
    clearCache()
  }, [])

  const clearEntry = useCallback((path) => {
    clearCacheEntry(path)
  }, [])

  return {
    clearAll,
    clearEntry,
  }
}

/**
 * Hook for lazy loading encrypted envelopes from IPFS for friend markets.
 *
 * Instead of fetching all envelopes on page load (which can hit rate limits),
 * this hook allows fetching envelopes on-demand when the user views a market.
 *
 * @param {Array} markets - Array of friend markets (may have needsIpfsFetch flag)
 * @returns {Object} - Markets with fetched envelopes and fetch functions
 */
export function useLazyIpfsEnvelope(markets) {
  // Cache: Map<marketId, { envelope, timestamp, error }>
  const [envelopeCache, setEnvelopeCache] = useState(new Map())
  // Track which markets are currently fetching
  const [fetchingMarkets, setFetchingMarkets] = useState(new Set())

  // Merge cached envelopes into markets
  const marketsWithEnvelopes = useMemo(() => {
    if (!markets || markets.length === 0) return []

    return markets.map(market => {
      const cached = envelopeCache.get(market.id)
      if (cached && cached.envelope) {
        // Market has a fetched envelope - merge it in
        return {
          ...market,
          metadata: cached.envelope,
          needsIpfsFetch: false,
          ipfsEnvelopeError: null
        }
      }
      if (cached && cached.error) {
        // Fetch failed - pass the error along
        return {
          ...market,
          ipfsEnvelopeError: cached.error
        }
      }
      return market
    })
  }, [markets, envelopeCache])

  /**
   * Fetch the encrypted envelope for a specific market
   * @param {string} marketId - Market ID to fetch envelope for
   * @returns {Promise<Object|null>} - The fetched envelope or null on error
   */
  const fetchEnvelope = useCallback(async (marketId) => {
    const market = markets?.find(m => m.id === marketId)
    if (!market) {
      console.warn(`[useLazyIpfsEnvelope] Market ${marketId} not found`)
      return null
    }

    // Skip if already fetched
    if (envelopeCache.has(marketId) && envelopeCache.get(marketId).envelope) {
      return envelopeCache.get(marketId).envelope
    }

    // Skip if no CID
    if (!market.ipfsCid) {
      console.warn(`[useLazyIpfsEnvelope] Market ${marketId} has no IPFS CID`)
      return null
    }

    // Skip if already fetching
    if (fetchingMarkets.has(marketId)) {
      return null
    }

    try {
      setFetchingMarkets(prev => new Set(prev).add(marketId))
      console.log(`[useLazyIpfsEnvelope] Fetching envelope for market ${marketId}, CID: ${market.ipfsCid}`)

      const envelope = await fetchEncryptedEnvelope(market.ipfsCid)

      setEnvelopeCache(prev => {
        const next = new Map(prev)
        next.set(marketId, { envelope, timestamp: Date.now(), error: null })
        return next
      })

      console.log(`[useLazyIpfsEnvelope] Fetched envelope for market ${marketId}`)
      return envelope
    } catch (err) {
      console.error(`[useLazyIpfsEnvelope] Failed to fetch envelope for market ${marketId}:`, err)

      setEnvelopeCache(prev => {
        const next = new Map(prev)
        next.set(marketId, { envelope: null, timestamp: Date.now(), error: err.message })
        return next
      })

      return null
    } finally {
      setFetchingMarkets(prev => {
        const next = new Set(prev)
        next.delete(marketId)
        return next
      })
    }
  }, [markets, envelopeCache, fetchingMarkets])

  /**
   * Check if a market's envelope is currently being fetched
   * @param {string} marketId - Market ID to check
   * @returns {boolean}
   */
  const isMarketFetching = useCallback((marketId) => {
    return fetchingMarkets.has(marketId)
  }, [fetchingMarkets])

  /**
   * Check if a market needs its envelope fetched
   * @param {string} marketId - Market ID to check
   * @returns {boolean}
   */
  const needsFetch = useCallback((marketId) => {
    const market = markets?.find(m => m.id === marketId)
    if (!market) return false
    if (!market.needsIpfsFetch || !market.ipfsCid) return false
    if (envelopeCache.has(marketId)) return false
    return true
  }, [markets, envelopeCache])

  /**
   * Clear cached envelope for a market (allows retry)
   * @param {string} marketId - Market ID to clear
   */
  const clearEnvelope = useCallback((marketId) => {
    setEnvelopeCache(prev => {
      const next = new Map(prev)
      next.delete(marketId)
      return next
    })
  }, [])

  return {
    markets: marketsWithEnvelopes,
    fetchEnvelope,
    isMarketFetching,
    needsFetch,
    clearEnvelope
  }
}

/**
 * Hook for lazy loading market metadata from IPFS.
 *
 * Markets loaded in bulk don't fetch metadata immediately to avoid rate limiting.
 * This hook fetches metadata on-demand when viewing specific markets.
 *
 * @param {Array} markets - Array of markets (may have needsMetadataFetch flag and metadataUri)
 * @returns {Object} - Markets with fetched metadata and fetch functions
 */
export function useLazyMarketMetadata(markets) {
  // Cache: Map<marketId, { metadata, timestamp, error }>
  const [metadataCache, setMetadataCache] = useState(new Map())
  // Track which markets are currently fetching
  const [fetchingMarkets, setFetchingMarkets] = useState(new Set())

  // Merge cached metadata into markets
  const marketsWithMetadata = useMemo(() => {
    if (!markets || markets.length === 0) return []

    return markets.map(market => {
      const cached = metadataCache.get(market.id)
      if (cached && cached.metadata) {
        // Market has fetched metadata - merge it in
        const metadata = cached.metadata
        return {
          ...market,
          proposalTitle: metadata.name || market.proposalTitle,
          description: metadata.description || market.description,
          category: metadata.properties?.category || market.category,
          subcategory: metadata.properties?.subcategory || market.subcategory,
          image: metadata.image || market.image,
          tags: metadata.properties?.tags || market.tags,
          resolutionCriteria: metadata.properties?.resolution_criteria || market.resolutionCriteria,
          h3_index: metadata.properties?.h3_index || market.h3_index,
          needsMetadataFetch: false,
          metadataError: null
        }
      }
      if (cached && cached.error) {
        // Fetch failed - pass the error along
        return {
          ...market,
          metadataError: cached.error
        }
      }
      return market
    })
  }, [markets, metadataCache])

  /**
   * Fetch metadata for a specific market
   * @param {number|string} marketId - Market ID to fetch metadata for
   * @returns {Promise<Object|null>} - The fetched metadata or null on error
   */
  const fetchMetadata = useCallback(async (marketId) => {
    const market = markets?.find(m => m.id === marketId || m.id === String(marketId))
    if (!market) {
      console.warn(`[useLazyMarketMetadata] Market ${marketId} not found`)
      return null
    }

    // Skip if already fetched
    if (metadataCache.has(marketId) && metadataCache.get(marketId).metadata) {
      return metadataCache.get(marketId).metadata
    }

    // Skip if no URI
    if (!market.metadataUri) {
      console.warn(`[useLazyMarketMetadata] Market ${marketId} has no metadata URI`)
      return null
    }

    // Skip if already fetching
    if (fetchingMarkets.has(marketId)) {
      return null
    }

    try {
      setFetchingMarkets(prev => new Set(prev).add(marketId))
      console.log(`[useLazyMarketMetadata] Fetching metadata for market ${marketId}`)

      // Import dynamically to avoid circular dependencies
      const { fetchMarketMetadataFromUri } = await import('../utils/blockchainService')
      const metadata = await fetchMarketMetadataFromUri(market.metadataUri)

      if (metadata) {
        setMetadataCache(prev => {
          const next = new Map(prev)
          next.set(marketId, { metadata, timestamp: Date.now(), error: null })
          return next
        })
        console.log(`[useLazyMarketMetadata] Fetched metadata for market ${marketId}`)
        return metadata
      }
      return null
    } catch (err) {
      console.error(`[useLazyMarketMetadata] Failed to fetch metadata for market ${marketId}:`, err)

      setMetadataCache(prev => {
        const next = new Map(prev)
        next.set(marketId, { metadata: null, timestamp: Date.now(), error: err.message })
        return next
      })

      return null
    } finally {
      setFetchingMarkets(prev => {
        const next = new Set(prev)
        next.delete(marketId)
        return next
      })
    }
  }, [markets, metadataCache, fetchingMarkets])

  /**
   * Check if a market's metadata is currently being fetched
   * @param {number|string} marketId - Market ID to check
   * @returns {boolean}
   */
  const isMarketFetching = useCallback((marketId) => {
    return fetchingMarkets.has(marketId)
  }, [fetchingMarkets])

  /**
   * Check if a market needs its metadata fetched
   * @param {number|string} marketId - Market ID to check
   * @returns {boolean}
   */
  const needsFetch = useCallback((marketId) => {
    const market = markets?.find(m => m.id === marketId || m.id === String(marketId))
    if (!market) return false
    if (!market.needsMetadataFetch || !market.metadataUri) return false
    if (metadataCache.has(marketId)) return false
    return true
  }, [markets, metadataCache])

  /**
   * Clear cached metadata for a market (allows retry)
   * @param {number|string} marketId - Market ID to clear
   */
  const clearMetadata = useCallback((marketId) => {
    setMetadataCache(prev => {
      const next = new Map(prev)
      next.delete(marketId)
      return next
    })
  }, [])

  return {
    markets: marketsWithMetadata,
    fetchMetadata,
    isMarketFetching,
    needsFetch,
    clearMetadata
  }
}
