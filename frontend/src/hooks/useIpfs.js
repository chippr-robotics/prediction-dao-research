/**
 * useIpfs Hook
 * 
 * Custom React hook for accessing IPFS data in components.
 * Provides loading states, error handling, and automatic caching.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  fetchFromIpfs,
  fetchTokenMetadata,
  fetchMarketData,
  fetchMarketMetadata,
  fetchByCid,
  batchFetch,
  clearCache,
  clearCacheEntry,
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
