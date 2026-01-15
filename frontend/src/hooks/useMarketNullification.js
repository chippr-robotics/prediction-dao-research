/**
 * useMarketNullification Hook
 *
 * Provides market-specific nullification checking and filtering for the frontend.
 * This hook is optimized for:
 * - Fast client-side market filtering
 * - Caching nullification data
 * - RSA accumulator proof verification
 *
 * @module useMarketNullification
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNullifierContracts } from './useNullifierContracts'
import {
  getMarketNullificationData,
  getAddressNullificationData,
  createNullificationSet,
  isMarketInNullificationSet,
  isAddressInNullificationSet,
  filterNullifiedMarkets,
  cacheNullificationData,
  loadCachedNullificationData,
  clearNullificationCache
} from '../utils/primeMapping'
import { RSAAccumulator, bytesToBigint } from '../utils/rsaAccumulator'

/**
 * Hook for checking market nullification status and filtering markets
 * @param {Object} options
 * @param {Object} options.provider - ethers provider
 * @param {boolean} options.useCache - Whether to use local storage cache (default: true)
 * @param {number} options.cacheMaxAge - Cache max age in ms (default: 5 minutes)
 * @returns {Object} Nullification utilities and state
 */
export function useMarketNullification({
  provider,
  useCache = true,
  cacheMaxAge = 5 * 60 * 1000
} = {}) {
  // Get contract interactions
  const {
    nullifiedMarkets,
    nullifiedAddresses,
    nullifierState,
    isMarketNullified: checkMarketOnChain,
    isAddressNullified: checkAddressOnChain,
    fetchNullifiedMarkets,
    fetchNullifiedAddresses,
    isLoading: contractLoading,
    isRegistryAvailable
  } = useNullifierContracts({ provider })

  // Local state
  const [isLoading, setIsLoading] = useState(true)
  const [marketHashSet, setMarketHashSet] = useState(new Set())
  const [addressHashSet, setAddressHashSet] = useState(new Set())
  const [accumulator, setAccumulator] = useState(null)
  const [lastUpdate, setLastUpdate] = useState(null)

  // ========== Initialize from cache or contract ==========

  useEffect(() => {
    const initialize = async () => {
      setIsLoading(true)

      // Try loading from cache first
      if (useCache) {
        const cached = loadCachedNullificationData(cacheMaxAge)
        if (cached) {
          setMarketHashSet(cached.marketHashes)
          setAddressHashSet(cached.addressHashes)
          if (cached.accumulator) {
            setAccumulator(cached.accumulator)
          }
          setLastUpdate(cached.timestamp)
          setIsLoading(false)
          return
        }
      }

      // Load from contract if no cache
      if (isRegistryAvailable && nullifiedMarkets.length > 0) {
        setMarketHashSet(new Set(nullifiedMarkets))
      }
      if (isRegistryAvailable && nullifiedAddresses.length > 0) {
        // Convert addresses to hashes
        const addressHashes = nullifiedAddresses.map(addr => {
          const { hash } = getAddressNullificationData(addr)
          return hash
        })
        setAddressHashSet(new Set(addressHashes))
      }

      // Initialize accumulator if available
      if (nullifierState.accumulator && nullifierState.rsaParams.n) {
        try {
          const acc = RSAAccumulator.fromContractParams(
            nullifierState.rsaParams.n,
            nullifierState.rsaParams.g,
            nullifierState.accumulator
          )
          setAccumulator(acc)
        } catch (err) {
          console.warn('Failed to initialize accumulator:', err)
        }
      }

      setLastUpdate(Date.now())
      setIsLoading(false)
    }

    initialize()
  }, [nullifiedMarkets, nullifiedAddresses, nullifierState, isRegistryAvailable, useCache, cacheMaxAge])

  // ========== Cache updates ==========

  useEffect(() => {
    if (!useCache || isLoading) return

    cacheNullificationData({
      marketHashes: marketHashSet,
      addressHashes: addressHashSet,
      accumulator: accumulator?.getValue()
    })
  }, [marketHashSet, addressHashSet, accumulator, useCache, isLoading])

  // ========== Market Checking Functions ==========

  /**
   * Check if a market is nullified (fast, client-side)
   * @param {Object} market - Market object
   * @returns {boolean}
   */
  const checkMarketNullified = useCallback((market) => {
    if (!isRegistryAvailable) return false
    if (marketHashSet.size === 0) return false

    try {
      const { hash } = getMarketNullificationData(market)
      return marketHashSet.has(hash)
    } catch (err) {
      console.warn('Error checking market nullification:', err)
      return false
    }
  }, [marketHashSet, isRegistryAvailable])

  /**
   * Check if a market hash is nullified (fast, client-side)
   * @param {string} marketHash - Market hash (bytes32)
   * @returns {boolean}
   */
  const checkMarketHashNullified = useCallback((marketHash) => {
    if (!isRegistryAvailable) return false
    return marketHashSet.has(marketHash)
  }, [marketHashSet, isRegistryAvailable])

  /**
   * Check if an address is nullified (fast, client-side)
   * @param {string} address - Ethereum address
   * @returns {boolean}
   */
  const checkAddressNullified = useCallback((address) => {
    if (!isRegistryAvailable) return false
    if (addressHashSet.size === 0) return false

    try {
      const { hash } = getAddressNullificationData(address)
      return addressHashSet.has(hash)
    } catch (err) {
      console.warn('Error checking address nullification:', err)
      return false
    }
  }, [addressHashSet, isRegistryAvailable])

  /**
   * Check market nullification on-chain (slower, but authoritative)
   * @param {Object} market - Market object
   * @returns {Promise<boolean>}
   */
  const verifyMarketNullifiedOnChain = useCallback(async (market) => {
    if (!isRegistryAvailable) return false

    try {
      const { hash } = getMarketNullificationData(market)
      return await checkMarketOnChain(hash)
    } catch (err) {
      console.warn('Error verifying market on-chain:', err)
      return false
    }
  }, [checkMarketOnChain, isRegistryAvailable])

  /**
   * Check address nullification on-chain (slower, but authoritative)
   * @param {string} address - Ethereum address
   * @returns {Promise<boolean>}
   */
  const verifyAddressNullifiedOnChain = useCallback(async (address) => {
    if (!isRegistryAvailable) return false

    try {
      return await checkAddressOnChain(address)
    } catch (err) {
      console.warn('Error verifying address on-chain:', err)
      return false
    }
  }, [checkAddressOnChain, isRegistryAvailable])

  // ========== Filtering Functions ==========

  /**
   * Filter out nullified markets from an array
   * @param {Object[]} markets - Array of market objects
   * @returns {Object[]} Filtered markets (non-nullified)
   */
  const filterMarkets = useCallback((markets) => {
    if (!isRegistryAvailable || marketHashSet.size === 0) {
      return markets
    }

    return markets.filter(market => {
      try {
        const { hash } = getMarketNullificationData(market)
        return !marketHashSet.has(hash)
      } catch {
        // If we can't compute hash, include the market (fail-open)
        return true
      }
    })
  }, [marketHashSet, isRegistryAvailable])

  /**
   * Get list of nullified markets from a set
   * @param {Object[]} markets - Array of market objects
   * @returns {Object[]} Only nullified markets
   */
  const getNullifiedFromList = useCallback((markets) => {
    if (!isRegistryAvailable || marketHashSet.size === 0) {
      return []
    }

    return markets.filter(market => {
      try {
        const { hash } = getMarketNullificationData(market)
        return marketHashSet.has(hash)
      } catch {
        return false
      }
    })
  }, [marketHashSet, isRegistryAvailable])

  /**
   * Partition markets into active and nullified
   * @param {Object[]} markets - Array of market objects
   * @returns {Object} { active: [], nullified: [] }
   */
  const partitionMarkets = useCallback((markets) => {
    if (!isRegistryAvailable || marketHashSet.size === 0) {
      return { active: markets, nullified: [] }
    }

    const active = []
    const nullified = []

    for (const market of markets) {
      try {
        const { hash } = getMarketNullificationData(market)
        if (marketHashSet.has(hash)) {
          nullified.push(market)
        } else {
          active.push(market)
        }
      } catch {
        active.push(market) // Fail-open
      }
    }

    return { active, nullified }
  }, [marketHashSet, isRegistryAvailable])

  // ========== Refresh Functions ==========

  /**
   * Refresh nullification data from contract
   */
  const refresh = useCallback(async () => {
    setIsLoading(true)
    clearNullificationCache()

    try {
      const [markets, addresses] = await Promise.all([
        fetchNullifiedMarkets(),
        fetchNullifiedAddresses()
      ])

      setMarketHashSet(new Set(markets))

      const addressHashes = addresses.map(addr => {
        const { hash } = getAddressNullificationData(addr)
        return hash
      })
      setAddressHashSet(new Set(addressHashes))

      setLastUpdate(Date.now())
    } catch (err) {
      console.error('Error refreshing nullification data:', err)
    } finally {
      setIsLoading(false)
    }
  }, [fetchNullifiedMarkets, fetchNullifiedAddresses])

  /**
   * Clear local cache and force refresh
   */
  const forceRefresh = useCallback(async () => {
    clearNullificationCache()
    await refresh()
  }, [refresh])

  // ========== Statistics ==========

  const stats = useMemo(() => ({
    nullifiedMarketsCount: marketHashSet.size,
    nullifiedAddressesCount: addressHashSet.size,
    lastUpdate,
    cacheAge: lastUpdate ? Date.now() - lastUpdate : null,
    isStale: lastUpdate ? (Date.now() - lastUpdate) > cacheMaxAge : true,
    hasAccumulator: !!accumulator,
    isRegistryAvailable
  }), [marketHashSet.size, addressHashSet.size, lastUpdate, cacheMaxAge, accumulator, isRegistryAvailable])

  // ========== Return ==========

  return {
    // Loading state
    isLoading: isLoading || contractLoading,

    // Quick checks (client-side)
    checkMarketNullified,
    checkMarketHashNullified,
    checkAddressNullified,

    // On-chain verification
    verifyMarketNullifiedOnChain,
    verifyAddressNullifiedOnChain,

    // Filtering
    filterMarkets,
    getNullifiedFromList,
    partitionMarkets,

    // Refresh
    refresh,
    forceRefresh,

    // Statistics
    stats,

    // Raw data
    nullifiedMarketHashes: marketHashSet,
    nullifiedAddressHashes: addressHashSet,

    // Accumulator (for advanced use)
    accumulator
  }
}

export default useMarketNullification
