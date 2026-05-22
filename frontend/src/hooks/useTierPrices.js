import { useState, useEffect, useCallback, useMemo } from 'react'
import { ethers } from 'ethers'
import { getContractAddress, NETWORK_CONFIG } from '../config/contracts'
import { MEMBERSHIP_MANAGER_ABI } from '../abis/MembershipManager'

/**
 * Hook to fetch tier prices + limits from MembershipManager (v2).
 *
 * v2 collapses the old TierRegistry into MembershipManager. Each role/tier has
 * one priceUSDC (6-decimals) plus two limits: monthlyMarketCreation and
 * maxConcurrentMarkets. UI guardrails (daily/weekly/max-position) live entirely
 * in the frontend now and are exposed via FALLBACK_LIMITS below.
 */

const USDC_DECIMALS = 6

const ROLE_HASHES = {
  FRIEND_MARKET: ethers.keccak256(ethers.toUtf8Bytes('FRIEND_MARKET_ROLE')),
  MARKET_MAKER: ethers.keccak256(ethers.toUtf8Bytes('MARKET_MAKER_ROLE')),
  CLEARPATH_USER: ethers.keccak256(ethers.toUtf8Bytes('CLEARPATH_USER_ROLE')),
  TOKENMINT: ethers.keccak256(ethers.toUtf8Bytes('TOKENMINT_ROLE'))
}

const TIER_IDS = {
  BRONZE: 1,
  SILVER: 2,
  GOLD: 3,
  PLATINUM: 4
}

// Fallback prices in USDC when MembershipManager is not yet deployed.
// Friend Market is the only role users are expected to hit in v2; others
// preserved here only so the UI doesn't crash if a stale role is requested.
const FALLBACK_PRICES = {
  BRONZE:   { FRIEND_MARKET: 1,   MARKET_MAKER: 100, CLEARPATH_USER: 25,  TOKENMINT: 25  },
  SILVER:   { FRIEND_MARKET: 5,   MARKET_MAKER: 150, CLEARPATH_USER: 100, TOKENMINT: 100 },
  GOLD:     { FRIEND_MARKET: 25,  MARKET_MAKER: 250, CLEARPATH_USER: 250, TOKENMINT: 250 },
  PLATINUM: { FRIEND_MARKET: 100, MARKET_MAKER: 500, CLEARPATH_USER: 500, TOKENMINT: 500 },
}

export function useTierPrices() {
  const [tierPrices, setTierPrices] = useState(FALLBACK_PRICES)
  const [tierLimits, setTierLimits] = useState({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  const provider = useMemo(() => new ethers.JsonRpcProvider(NETWORK_CONFIG.rpcUrl), [])

  const contract = useMemo(() => {
    const addr = getContractAddress('membershipManager')
    if (!addr) return null
    return new ethers.Contract(addr, MEMBERSHIP_MANAGER_ABI, provider)
  }, [provider])

  const fetchPrices = useCallback(async () => {
    if (!contract) {
      setError('MembershipManager not deployed')
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const prices = { BRONZE: {}, SILVER: {}, GOLD: {}, PLATINUM: {} }
      const limits = { BRONZE: {}, SILVER: {}, GOLD: {}, PLATINUM: {} }
      for (const [roleKey, roleHash] of Object.entries(ROLE_HASHES)) {
        for (const [tierName, tierId] of Object.entries(TIER_IDS)) {
          try {
            const cfg = await contract.getTierConfig(roleHash, tierId)
            // cfg: { priceUSDC, durationDays, active, limits: { monthlyMarketCreation, maxConcurrentMarkets } }
            prices[tierName][roleKey] = parseFloat(ethers.formatUnits(cfg.priceUSDC, USDC_DECIMALS))
            limits[tierName][roleKey] = {
              monthlyMarketCreation: Number(cfg.limits.monthlyMarketCreation),
              maxConcurrentMarkets: Number(cfg.limits.maxConcurrentMarkets),
              durationDays: Number(cfg.durationDays),
              isActive: cfg.active,
            }
          } catch (e) {
            prices[tierName][roleKey] = FALLBACK_PRICES[tierName]?.[roleKey] ?? 0
          }
        }
      }
      setTierPrices(prices)
      setTierLimits(limits)
      setLastUpdated(new Date())
    } catch (err) {
      console.error('Error fetching tier prices:', err)
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [contract])

  useEffect(() => {
    fetchPrices()
    const interval = setInterval(fetchPrices, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [fetchPrices])

  const getPrice = useCallback((roleKey, tierName) => {
    return tierPrices[tierName]?.[roleKey] ?? FALLBACK_PRICES[tierName]?.[roleKey] ?? 0
  }, [tierPrices])

  const getTotalPrice = useCallback((roleKeys, tierName) => {
    return roleKeys.reduce((sum, roleKey) => sum + getPrice(roleKey, tierName), 0)
  }, [getPrice])

  const getLimits = useCallback((roleKey, tierName) => {
    return tierLimits[tierName]?.[roleKey] ?? null
  }, [tierLimits])

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
    TIER_IDS,
    FALLBACK_PRICES,
  }
}

export default useTierPrices
