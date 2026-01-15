/**
 * useNullifierContracts Hook
 *
 * Provides React hook for interacting with the NullifierRegistry smart contract.
 * Handles:
 * - Contract state fetching
 * - Market/address nullification operations
 * - Accumulator management
 * - Role verification
 *
 * @module useNullifierContracts
 */

import { useState, useCallback, useEffect, useMemo } from 'react'
import { ethers } from 'ethers'
import { NULLIFIER_REGISTRY_ABI } from '../abis/NullifierRegistry'
import { getMarketNullificationData, getAddressNullificationData } from '../utils/primeMapping'
import { getContractAddress } from '../config/contracts'

// Contract address - from contracts.js config (with env override)
const NULLIFIER_REGISTRY_ADDRESS = getContractAddress('nullifierRegistry') || null

// Role hash for NULLIFIER_ADMIN_ROLE
const NULLIFIER_ADMIN_ROLE = ethers.keccak256(ethers.toUtf8Bytes('NULLIFIER_ADMIN_ROLE'))

// Polling interval for state refresh (30 seconds)
const REFRESH_INTERVAL = 30000

/**
 * Hook for interacting with NullifierRegistry contract
 * @param {Object} options
 * @param {Object} options.signer - ethers signer for write operations
 * @param {Object} options.provider - ethers provider for read operations
 * @param {string} options.account - Connected account address
 * @returns {Object} Contract state and functions
 */
export function useNullifierContracts({ signer, provider, account } = {}) {
  // State
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [nullifierState, setNullifierState] = useState({
    nullifiedMarketCount: 0,
    nullifiedAddressCount: 0,
    totalNullifications: 0,
    totalReinstatements: 0,
    lastAccumulatorUpdate: 0,
    paramsInitialized: false,
    paused: false,
    accumulator: null,
    rsaParams: { n: null, g: null }
  })
  const [nullifiedMarkets, setNullifiedMarkets] = useState([])
  const [nullifiedAddresses, setNullifiedAddresses] = useState([])
  const [hasNullifierRole, setHasNullifierRole] = useState(false)

  // Check if registry is available
  const isRegistryAvailable = !!NULLIFIER_REGISTRY_ADDRESS

  // Get contract instance
  const getContract = useCallback((useSigner = false) => {
    if (!NULLIFIER_REGISTRY_ADDRESS) return null

    const signerOrProvider = useSigner && signer ? signer : provider
    if (!signerOrProvider) return null

    return new ethers.Contract(
      NULLIFIER_REGISTRY_ADDRESS,
      NULLIFIER_REGISTRY_ABI,
      signerOrProvider
    )
  }, [signer, provider])

  // Read-only contract instance
  const readContract = useMemo(() => getContract(false), [getContract])

  // Write contract instance
  const writeContract = useMemo(() => getContract(true), [getContract])

  // ========== Fetch Functions ==========

  /**
   * Fetch current nullifier state from contract
   */
  const fetchNullifierState = useCallback(async () => {
    if (!readContract) return

    setIsLoading(true)
    setError(null)

    try {
      const [stats, paramsInitialized, paused, accumulator] = await Promise.all([
        readContract.getStats(),
        readContract.paramsInitialized(),
        readContract.paused(),
        readContract.getAccumulator()
      ])

      let rsaParams = { n: null, g: null }
      if (paramsInitialized) {
        const [n, g] = await readContract.getRSAParams()
        rsaParams = { n, g }
      }

      setNullifierState({
        nullifiedMarketCount: Number(stats.markets),
        nullifiedAddressCount: Number(stats.addresses),
        totalNullifications: Number(stats.nullifications),
        totalReinstatements: Number(stats.reinstatements),
        lastAccumulatorUpdate: Number(stats.lastUpdate),
        paramsInitialized,
        paused,
        accumulator,
        rsaParams
      })
    } catch (err) {
      console.error('Error fetching nullifier state:', err)
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [readContract])

  /**
   * Fetch all nullified markets
   */
  const fetchNullifiedMarkets = useCallback(async () => {
    if (!readContract) return []

    try {
      const markets = []
      let offset = 0
      const limit = 50
      let hasMore = true

      while (hasMore) {
        const [hashes, more] = await readContract.getNullifiedMarkets(offset, limit)
        markets.push(...hashes)
        hasMore = more
        offset += limit
      }

      setNullifiedMarkets(markets)
      return markets
    } catch (err) {
      console.error('Error fetching nullified markets:', err)
      setError(err.message)
      return []
    }
  }, [readContract])

  /**
   * Fetch all nullified addresses
   */
  const fetchNullifiedAddresses = useCallback(async () => {
    if (!readContract) return []

    try {
      const addresses = []
      let offset = 0
      const limit = 50
      let hasMore = true

      while (hasMore) {
        const [addrs, more] = await readContract.getNullifiedAddresses(offset, limit)
        addresses.push(...addrs)
        hasMore = more
        offset += limit
      }

      setNullifiedAddresses(addresses)
      return addresses
    } catch (err) {
      console.error('Error fetching nullified addresses:', err)
      setError(err.message)
      return []
    }
  }, [readContract])

  /**
   * Check if current account has NULLIFIER_ADMIN_ROLE
   */
  const checkNullifierRole = useCallback(async () => {
    if (!readContract || !account) {
      setHasNullifierRole(false)
      return false
    }

    try {
      const hasRole = await readContract.hasRole(NULLIFIER_ADMIN_ROLE, account)
      setHasNullifierRole(hasRole)
      return hasRole
    } catch (err) {
      console.error('Error checking nullifier role:', err)
      setHasNullifierRole(false)
      return false
    }
  }, [readContract, account])

  // ========== Query Functions ==========

  /**
   * Check if a market is nullified
   * @param {string} marketHash - Market hash (bytes32)
   * @returns {Promise<boolean>}
   */
  const isMarketNullified = useCallback(async (marketHash) => {
    if (!readContract) return false
    try {
      return await readContract.isMarketNullified(marketHash)
    } catch (err) {
      console.error('Error checking market nullification:', err)
      return false
    }
  }, [readContract])

  /**
   * Check if an address is nullified
   * @param {string} address - Ethereum address
   * @returns {Promise<boolean>}
   */
  const isAddressNullified = useCallback(async (address) => {
    if (!readContract) return false
    try {
      return await readContract.isAddressNullified(address)
    } catch (err) {
      console.error('Error checking address nullification:', err)
      return false
    }
  }, [readContract])

  /**
   * Get market nullification details
   * @param {string} marketHash
   * @returns {Promise<Object>}
   */
  const getMarketDetails = useCallback(async (marketHash) => {
    if (!readContract) return null
    try {
      const [nullified, timestamp, admin] = await readContract.getMarketNullificationDetails(marketHash)
      return { nullified, timestamp: Number(timestamp), admin }
    } catch (err) {
      console.error('Error getting market details:', err)
      return null
    }
  }, [readContract])

  /**
   * Get address nullification details
   * @param {string} address
   * @returns {Promise<Object>}
   */
  const getAddressDetails = useCallback(async (address) => {
    if (!readContract) return null
    try {
      const [nullified, timestamp, admin] = await readContract.getAddressNullificationDetails(address)
      return { nullified, timestamp: Number(timestamp), admin }
    } catch (err) {
      console.error('Error getting address details:', err)
      return null
    }
  }, [readContract])

  // ========== Write Functions ==========

  /**
   * Nullify a market
   * @param {Object} market - Market object with data for hash computation
   * @param {number} marketId - Market ID for logging
   * @param {string} reason - Reason for nullification
   * @returns {Promise<Object>} Transaction result
   */
  const nullifyMarket = useCallback(async (market, marketId, reason = 'Admin action') => {
    if (!writeContract) throw new Error('Wallet not connected')
    if (!hasNullifierRole) throw new Error('Requires NULLIFIER_ADMIN_ROLE')

    setIsLoading(true)
    setError(null)

    try {
      const { hash } = getMarketNullificationData(market)

      const tx = await writeContract.nullifyMarket(hash, marketId, reason)
      const receipt = await tx.wait()

      await fetchNullifierState()
      await fetchNullifiedMarkets()

      return { success: true, hash: tx.hash, receipt }
    } catch (err) {
      console.error('Error nullifying market:', err)
      setError(err.message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [writeContract, hasNullifierRole, fetchNullifierState, fetchNullifiedMarkets])

  /**
   * Nullify a market by hash directly
   * @param {string} marketHash - Market hash (bytes32)
   * @param {number} marketId - Market ID for logging
   * @param {string} reason - Reason for nullification
   * @returns {Promise<Object>} Transaction result
   */
  const nullifyMarketByHash = useCallback(async (marketHash, marketId, reason = 'Admin action') => {
    if (!writeContract) throw new Error('Wallet not connected')
    if (!hasNullifierRole) throw new Error('Requires NULLIFIER_ADMIN_ROLE')

    setIsLoading(true)
    setError(null)

    try {
      const tx = await writeContract.nullifyMarket(marketHash, marketId, reason)
      const receipt = await tx.wait()

      await fetchNullifierState()
      await fetchNullifiedMarkets()

      return { success: true, hash: tx.hash, receipt }
    } catch (err) {
      console.error('Error nullifying market:', err)
      setError(err.message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [writeContract, hasNullifierRole, fetchNullifierState, fetchNullifiedMarkets])

  /**
   * Reinstate a nullified market
   * @param {string} marketHash - Market hash (bytes32)
   * @param {number} marketId - Market ID for logging
   * @param {string} reason - Reason for reinstatement
   * @returns {Promise<Object>} Transaction result
   */
  const reinstateMarket = useCallback(async (marketHash, marketId, reason = 'Admin action') => {
    if (!writeContract) throw new Error('Wallet not connected')
    if (!hasNullifierRole) throw new Error('Requires NULLIFIER_ADMIN_ROLE')

    setIsLoading(true)
    setError(null)

    try {
      const tx = await writeContract.reinstateMarket(marketHash, marketId, reason)
      const receipt = await tx.wait()

      await fetchNullifierState()
      await fetchNullifiedMarkets()

      return { success: true, hash: tx.hash, receipt }
    } catch (err) {
      console.error('Error reinstating market:', err)
      setError(err.message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [writeContract, hasNullifierRole, fetchNullifierState, fetchNullifiedMarkets])

  /**
   * Nullify an address
   * @param {string} address - Address to nullify
   * @param {string} reason - Reason for nullification
   * @returns {Promise<Object>} Transaction result
   */
  const nullifyAddress = useCallback(async (address, reason = 'Admin action') => {
    if (!writeContract) throw new Error('Wallet not connected')
    if (!hasNullifierRole) throw new Error('Requires NULLIFIER_ADMIN_ROLE')

    setIsLoading(true)
    setError(null)

    try {
      const tx = await writeContract.nullifyAddress(address, reason)
      const receipt = await tx.wait()

      await fetchNullifierState()
      await fetchNullifiedAddresses()

      return { success: true, hash: tx.hash, receipt }
    } catch (err) {
      console.error('Error nullifying address:', err)
      setError(err.message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [writeContract, hasNullifierRole, fetchNullifierState, fetchNullifiedAddresses])

  /**
   * Reinstate a nullified address
   * @param {string} address - Address to reinstate
   * @param {string} reason - Reason for reinstatement
   * @returns {Promise<Object>} Transaction result
   */
  const reinstateAddress = useCallback(async (address, reason = 'Admin action') => {
    if (!writeContract) throw new Error('Wallet not connected')
    if (!hasNullifierRole) throw new Error('Requires NULLIFIER_ADMIN_ROLE')

    setIsLoading(true)
    setError(null)

    try {
      const tx = await writeContract.reinstateAddress(address, reason)
      const receipt = await tx.wait()

      await fetchNullifierState()
      await fetchNullifiedAddresses()

      return { success: true, hash: tx.hash, receipt }
    } catch (err) {
      console.error('Error reinstating address:', err)
      setError(err.message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [writeContract, hasNullifierRole, fetchNullifierState, fetchNullifiedAddresses])

  /**
   * Batch nullify markets
   * @param {string[]} marketHashes - Array of market hashes
   * @param {number[]} marketIds - Array of market IDs
   * @param {string} reason - Reason for nullification
   * @returns {Promise<Object>} Transaction result
   */
  const batchNullifyMarkets = useCallback(async (marketHashes, marketIds, reason = 'Batch admin action') => {
    if (!writeContract) throw new Error('Wallet not connected')
    if (!hasNullifierRole) throw new Error('Requires NULLIFIER_ADMIN_ROLE')

    setIsLoading(true)
    setError(null)

    try {
      const tx = await writeContract.batchNullifyMarkets(marketHashes, marketIds, reason)
      const receipt = await tx.wait()

      await fetchNullifierState()
      await fetchNullifiedMarkets()

      return { success: true, hash: tx.hash, receipt }
    } catch (err) {
      console.error('Error batch nullifying markets:', err)
      setError(err.message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [writeContract, hasNullifierRole, fetchNullifierState, fetchNullifiedMarkets])

  /**
   * Batch nullify addresses
   * @param {string[]} addresses - Array of addresses
   * @param {string} reason - Reason for nullification
   * @returns {Promise<Object>} Transaction result
   */
  const batchNullifyAddresses = useCallback(async (addresses, reason = 'Batch admin action') => {
    if (!writeContract) throw new Error('Wallet not connected')
    if (!hasNullifierRole) throw new Error('Requires NULLIFIER_ADMIN_ROLE')

    setIsLoading(true)
    setError(null)

    try {
      const tx = await writeContract.batchNullifyAddresses(addresses, reason)
      const receipt = await tx.wait()

      await fetchNullifierState()
      await fetchNullifiedAddresses()

      return { success: true, hash: tx.hash, receipt }
    } catch (err) {
      console.error('Error batch nullifying addresses:', err)
      setError(err.message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [writeContract, hasNullifierRole, fetchNullifierState, fetchNullifiedAddresses])

  // ========== Effects ==========

  // Initial fetch on mount
  useEffect(() => {
    if (readContract) {
      fetchNullifierState()
      fetchNullifiedMarkets()
      fetchNullifiedAddresses()
    }
  }, [readContract, fetchNullifierState, fetchNullifiedMarkets, fetchNullifiedAddresses])

  // Check role when account changes
  useEffect(() => {
    checkNullifierRole()
  }, [checkNullifierRole])

  // Periodic refresh
  useEffect(() => {
    if (!readContract) return

    const interval = setInterval(() => {
      fetchNullifierState()
    }, REFRESH_INTERVAL)

    return () => clearInterval(interval)
  }, [readContract, fetchNullifierState])

  // ========== Return ==========

  return {
    // State
    isLoading,
    error,
    nullifierState,
    nullifiedMarkets,
    nullifiedAddresses,
    hasNullifierRole,
    isRegistryAvailable,

    // Fetch functions
    fetchNullifierState,
    fetchNullifiedMarkets,
    fetchNullifiedAddresses,
    checkNullifierRole,

    // Query functions
    isMarketNullified,
    isAddressNullified,
    getMarketDetails,
    getAddressDetails,

    // Write functions
    nullifyMarket,
    nullifyMarketByHash,
    reinstateMarket,
    nullifyAddress,
    reinstateAddress,
    batchNullifyMarkets,
    batchNullifyAddresses,

    // Utilities
    NULLIFIER_ADMIN_ROLE,
    contractAddress: NULLIFIER_REGISTRY_ADDRESS
  }
}

export default useNullifierContracts
