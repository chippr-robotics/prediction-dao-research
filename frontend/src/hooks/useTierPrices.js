import { useState, useEffect, useCallback, useMemo } from 'react'
import { ethers } from 'ethers'
import { DEPLOYED_CONTRACTS, NETWORK_CONFIG } from '../config/contracts'

/**
 * Hook to fetch tier prices from TieredRoleManager contract
 *
 * Fetches prices for all roles and tiers from the blockchain,
 * eliminating the need for hardcoded prices in the frontend.
 */

const TIERED_ROLE_MANAGER_ADDRESS = DEPLOYED_CONTRACTS.tieredRoleManager

// Minimal ABI for reading tier metadata
const TIERED_ROLE_MANAGER_ABI = [
  'function tierMetadata(bytes32 role, uint8 tier) external view returns (string name, string description, uint256 price, tuple(uint256 dailyBetLimit, uint256 weeklyBetLimit, uint256 monthlyMarketCreation, uint256 maxPositionSize, uint256 maxConcurrentMarkets, uint256 withdrawalLimit, bool canCreatePrivateMarkets, bool canUseAdvancedFeatures, uint256 feeDiscount) limits, bool isActive)',
  'function FRIEND_MARKET_ROLE() external view returns (bytes32)',
  'function MARKET_MAKER_ROLE() external view returns (bytes32)',
  'function CLEARPATH_USER_ROLE() external view returns (bytes32)',
  'function TOKENMINT_ROLE() external view returns (bytes32)'
]

// Role key to contract function mapping
const ROLE_FUNCTIONS = {
  FRIEND_MARKET: 'FRIEND_MARKET_ROLE',
  MARKET_MAKER: 'MARKET_MAKER_ROLE',
  CLEARPATH_USER: 'CLEARPATH_USER_ROLE',
  TOKENMINT: 'TOKENMINT_ROLE'
}

// Tier IDs matching MembershipTier enum
const TIER_IDS = {
  BRONZE: 1,
  SILVER: 2,
  GOLD: 3,
  PLATINUM: 4
}

// Fallback prices in case contract fetch fails (ETC)
const FALLBACK_PRICES = {
  BRONZE: { FRIEND_MARKET: 0.05, MARKET_MAKER: 0.05, CLEARPATH_USER: 0.05, TOKENMINT: 0.05 },
  SILVER: { FRIEND_MARKET: 0.1, MARKET_MAKER: 0.1, CLEARPATH_USER: 0.1, TOKENMINT: 0.1 },
  GOLD: { FRIEND_MARKET: 0.25, MARKET_MAKER: 0.25, CLEARPATH_USER: 0.25, TOKENMINT: 0.25 },
  PLATINUM: { FRIEND_MARKET: 0.5, MARKET_MAKER: 0.5, CLEARPATH_USER: 0.5, TOKENMINT: 0.5 }
}

export function useTierPrices() {
  const [tierPrices, setTierPrices] = useState(FALLBACK_PRICES)
  const [tierLimits, setTierLimits] = useState({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  // Create provider
  const provider = useMemo(() => {
    return new ethers.JsonRpcProvider(NETWORK_CONFIG.rpcUrl)
  }, [])

  // Create contract instance
  const contract = useMemo(() => {
    if (!TIERED_ROLE_MANAGER_ADDRESS) return null
    return new ethers.Contract(TIERED_ROLE_MANAGER_ADDRESS, TIERED_ROLE_MANAGER_ABI, provider)
  }, [provider])

  // Fetch prices from contract
  const fetchPrices = useCallback(async () => {
    if (!contract) {
      setError('TieredRoleManager not deployed')
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // First, get role hashes
      const roleHashes = {}
      for (const [roleKey, functionName] of Object.entries(ROLE_FUNCTIONS)) {
        try {
          roleHashes[roleKey] = await contract[functionName]()
        } catch (e) {
          // Role might not exist, use computed hash
          roleHashes[roleKey] = ethers.keccak256(ethers.toUtf8Bytes(functionName))
        }
      }

      // Fetch tier metadata for each role and tier
      const prices = { BRONZE: {}, SILVER: {}, GOLD: {}, PLATINUM: {} }
      const limits = { BRONZE: {}, SILVER: {}, GOLD: {}, PLATINUM: {} }

      for (const [roleKey, roleHash] of Object.entries(roleHashes)) {
        for (const [tierName, tierId] of Object.entries(TIER_IDS)) {
          try {
            const metadata = await contract.tierMetadata(roleHash, tierId)

            // Price is in wei, convert to ETC
            prices[tierName][roleKey] = parseFloat(ethers.formatEther(metadata.price))

            // Store limits
            limits[tierName][roleKey] = {
              dailyBetLimit: ethers.formatEther(metadata.limits.dailyBetLimit),
              weeklyBetLimit: ethers.formatEther(metadata.limits.weeklyBetLimit),
              monthlyMarketCreation: Number(metadata.limits.monthlyMarketCreation),
              maxPositionSize: ethers.formatEther(metadata.limits.maxPositionSize),
              maxConcurrentMarkets: Number(metadata.limits.maxConcurrentMarkets),
              withdrawalLimit: ethers.formatEther(metadata.limits.withdrawalLimit),
              canCreatePrivateMarkets: metadata.limits.canCreatePrivateMarkets,
              canUseAdvancedFeatures: metadata.limits.canUseAdvancedFeatures,
              feeDiscount: Number(metadata.limits.feeDiscount),
              isActive: metadata.isActive
            }
          } catch (e) {
            // Use fallback if fetch fails for this tier
            console.warn(`Failed to fetch ${tierName} tier for ${roleKey}:`, e.message)
            prices[tierName][roleKey] = FALLBACK_PRICES[tierName][roleKey]
          }
        }
      }

      setTierPrices(prices)
      setTierLimits(limits)
      setLastUpdated(new Date())
    } catch (err) {
      console.error('Error fetching tier prices:', err)
      setError(err.message)
      // Keep using fallback prices
    } finally {
      setIsLoading(false)
    }
  }, [contract])

  // Fetch on mount and periodically refresh
  useEffect(() => {
    fetchPrices()

    // Refresh every 5 minutes
    const interval = setInterval(fetchPrices, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [fetchPrices])

  // Get price for a specific role and tier
  const getPrice = useCallback((roleKey, tierName) => {
    return tierPrices[tierName]?.[roleKey] ?? FALLBACK_PRICES[tierName]?.[roleKey] ?? 0
  }, [tierPrices])

  // Get total price for multiple roles
  const getTotalPrice = useCallback((roleKeys, tierName) => {
    return roleKeys.reduce((sum, roleKey) => sum + getPrice(roleKey, tierName), 0)
  }, [getPrice])

  // Get limits for a specific role and tier
  const getLimits = useCallback((roleKey, tierName) => {
    return tierLimits[tierName]?.[roleKey] ?? null
  }, [tierLimits])

  // Check if a tier is active for a role
  const isTierActive = useCallback((roleKey, tierName) => {
    return tierLimits[tierName]?.[roleKey]?.isActive ?? true
  }, [tierLimits])

  return {
    tierPrices,
    tierLimits,
    isLoading,
    error,
    lastUpdated,
    fetchPrices,
    getPrice,
    getTotalPrice,
    getLimits,
    isTierActive,
    // Export constants for convenience
    TIER_IDS,
    FALLBACK_PRICES
  }
}

export default useTierPrices
