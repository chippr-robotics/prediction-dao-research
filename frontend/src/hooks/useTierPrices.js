import { useState, useEffect, useCallback, useMemo } from 'react'
import { ethers } from 'ethers'
import { DEPLOYED_CONTRACTS, NETWORK_CONFIG } from '../config/contracts'

/**
 * Hook to fetch tier prices from TierRegistry contract.
 *
 * Fetches prices for all roles and tiers from the blockchain in the chain's
 * stablecoin (USDC on Polygon Amoy). The native token is only used for gas.
 */

const TIER_REGISTRY_ADDRESS = DEPLOYED_CONTRACTS.tierRegistry

// Minimal ABI for reading tier prices from TierRegistry
const TIER_REGISTRY_ABI = [
  'function getTierPrice(bytes32 role, uint8 tier) external view returns (uint256)',
  'function isTierActive(bytes32 role, uint8 tier) external view returns (bool)',
  'function getTierLimits(bytes32 role, uint8 tier) external view returns (tuple(uint256 dailyBetLimit, uint256 weeklyBetLimit, uint256 monthlyMarketCreation, uint256 maxPositionSize, uint256 maxConcurrentMarkets, uint256 withdrawalLimit, bool canCreatePrivateMarkets, bool canUseAdvancedFeatures, uint256 feeDiscount))'
]

// Stablecoin (USDC) has 6 decimals
const STABLE_DECIMALS = 6

// Role hashes (computed from role names)
const ROLE_HASHES = {
  FRIEND_MARKET: ethers.keccak256(ethers.toUtf8Bytes('FRIEND_MARKET_ROLE')),
  MARKET_MAKER: ethers.keccak256(ethers.toUtf8Bytes('MARKET_MAKER_ROLE'))
}

// Tier IDs matching MembershipTier enum
const TIER_IDS = {
  BRONZE: 1,
  SILVER: 2,
  GOLD: 3,
  PLATINUM: 4
}

// Fallback prices in stablecoin units (USDC, 6 decimals)
// These match the TierRegistry configuration on Polygon Amoy
const FALLBACK_PRICES = {
  BRONZE: { FRIEND_MARKET: 50, MARKET_MAKER: 100 },
  SILVER: { FRIEND_MARKET: 100, MARKET_MAKER: 100 },
  GOLD: { FRIEND_MARKET: 250, MARKET_MAKER: 250 },
  PLATINUM: { FRIEND_MARKET: 500, MARKET_MAKER: 500 }
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
    if (!TIER_REGISTRY_ADDRESS) return null
    return new ethers.Contract(TIER_REGISTRY_ADDRESS, TIER_REGISTRY_ABI, provider)
  }, [provider])

  // Fetch prices from contract
  const fetchPrices = useCallback(async () => {
    if (!contract) {
      setError('TierRegistry not deployed')
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // Fetch tier prices for each role and tier from TierRegistry
      const prices = { BRONZE: {}, SILVER: {}, GOLD: {}, PLATINUM: {} }
      const limits = { BRONZE: {}, SILVER: {}, GOLD: {}, PLATINUM: {} }

      for (const [roleKey, roleHash] of Object.entries(ROLE_HASHES)) {
        for (const [tierName, tierId] of Object.entries(TIER_IDS)) {
          try {
            // Get price from TierRegistry (in stablecoin with 6 decimals)
            const priceRaw = await contract.getTierPrice(roleHash, tierId)
            const isActive = await contract.isTierActive(roleHash, tierId)

            // Convert from 6 decimals to human-readable stablecoin amount
            prices[tierName][roleKey] = parseFloat(ethers.formatUnits(priceRaw, STABLE_DECIMALS))

            // Try to get limits (may not be available for all tiers)
            try {
              const tierLimits = await contract.getTierLimits(roleHash, tierId)
              limits[tierName][roleKey] = {
                dailyBetLimit: ethers.formatUnits(tierLimits.dailyBetLimit, STABLE_DECIMALS),
                weeklyBetLimit: ethers.formatUnits(tierLimits.weeklyBetLimit, STABLE_DECIMALS),
                monthlyMarketCreation: Number(tierLimits.monthlyMarketCreation),
                maxPositionSize: ethers.formatUnits(tierLimits.maxPositionSize, STABLE_DECIMALS),
                maxConcurrentMarkets: Number(tierLimits.maxConcurrentMarkets),
                withdrawalLimit: ethers.formatUnits(tierLimits.withdrawalLimit, STABLE_DECIMALS),
                canCreatePrivateMarkets: tierLimits.canCreatePrivateMarkets,
                canUseAdvancedFeatures: tierLimits.canUseAdvancedFeatures,
                feeDiscount: Number(tierLimits.feeDiscount),
                isActive
              }
            } catch {
              // Limits not available, just store isActive
              limits[tierName][roleKey] = { isActive }
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
