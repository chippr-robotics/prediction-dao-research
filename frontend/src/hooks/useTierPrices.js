import { useState, useEffect, useCallback, useMemo } from 'react'
import { ethers } from 'ethers'
import { getContractAddressForChain } from '../config/contracts'
import { getProvider } from '../utils/blockchainService'
import { useWeb3 } from './useWeb3'
import { MEMBERSHIP_MANAGER_ABI } from '../abis/MembershipManager'

/**
 * Hook to fetch tier prices + limits from MembershipManager.
 *
 * The protocol has a single paid role (`WAGER_PARTICIPANT_ROLE`) with four
 * tiers (Bronze/Silver/Gold/Platinum) priced at $2/$8/$25/$100 USDC.
 * The on-chain `Limits` struct enforces only `monthlyMarketCreation` and
 * `maxConcurrentMarkets`; everything else is UI-side presentation.
 */

const USDC_DECIMALS = 6

const ROLE_HASHES = {
  WAGER_PARTICIPANT: ethers.keccak256(ethers.toUtf8Bytes('WAGER_PARTICIPANT_ROLE')),
}

const TIER_IDS = {
  BRONZE: 1,
  SILVER: 2,
  GOLD: 3,
  PLATINUM: 4
}

// Fallback prices in USDC when MembershipManager is not yet deployed or a
// network call fails. Anchored at $2 Bronze per the v3 ladder.
const FALLBACK_PRICES = {
  BRONZE:   { WAGER_PARTICIPANT: 2   },
  SILVER:   { WAGER_PARTICIPANT: 8   },
  GOLD:     { WAGER_PARTICIPANT: 25  },
  PLATINUM: { WAGER_PARTICIPANT: 100 },
}

export function useTierPrices() {
  const [tierPrices, setTierPrices] = useState(FALLBACK_PRICES)
  const [tierLimits, setTierLimits] = useState({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  // True whenever the displayed prices include the hardcoded FALLBACK_PRICES
  // (no MembershipManager on this chain, or a per-tier read failed) rather than
  // being fully sourced on-chain. Starts true (initial state IS the fallback)
  // and is flipped to false only after a clean on-chain fetch. Lets the UI warn
  // that prices for a real-money product may be estimates / out of sync.
  const [usingFallbackPrices, setUsingFallbackPrices] = useState(true)

  // Resolve the MembershipManager + provider for the wallet's connected chain so
  // tier prices/limits reflect the network the user is actually on, not the
  // build-time default. Falls back to the primary chain when disconnected
  // (getProvider/getContractAddressForChain handle a null chainId).
  const { chainId } = useWeb3()
  const provider = useMemo(() => getProvider(chainId), [chainId])

  const contract = useMemo(() => {
    const addr = getContractAddressForChain('membershipManager', chainId)
    if (!addr) return null
    return new ethers.Contract(addr, MEMBERSHIP_MANAGER_ABI, provider)
  }, [provider, chainId])

  const fetchPrices = useCallback(async () => {
    if (!contract) {
      // No MembershipManager on the connected chain — show fallback prices, not
      // whatever was fetched for a previously-connected network.
      setTierPrices(FALLBACK_PRICES)
      setTierLimits({})
      setUsingFallbackPrices(true)
      setError('MembershipManager not deployed')
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const prices = { BRONZE: {}, SILVER: {}, GOLD: {}, PLATINUM: {} }
      const limits = { BRONZE: {}, SILVER: {}, GOLD: {}, PLATINUM: {} }
      let usedFallback = false
      for (const [roleKey, roleHash] of Object.entries(ROLE_HASHES)) {
        for (const [tierName, tierId] of Object.entries(TIER_IDS)) {
          try {
            const cfg = await contract.getTierConfig(roleHash, tierId)
            prices[tierName][roleKey] = parseFloat(ethers.formatUnits(cfg.priceUSDC, USDC_DECIMALS))
            limits[tierName][roleKey] = {
              monthlyMarketCreation: Number(cfg.limits.monthlyMarketCreation),
              maxConcurrentMarkets: Number(cfg.limits.maxConcurrentMarkets),
              durationDays: Number(cfg.durationDays),
              isActive: cfg.active,
            }
          } catch {
            prices[tierName][roleKey] = FALLBACK_PRICES[tierName]?.[roleKey] ?? 0
            usedFallback = true
          }
        }
      }
      setTierPrices(prices)
      setTierLimits(limits)
      setUsingFallbackPrices(usedFallback)
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
    usingFallbackPrices,
    fetchPrices,
    getPrice,
    getTotalPrice,
    getLimits,
    isTierActive,
    TIER_IDS,
    ROLE_HASHES,
    FALLBACK_PRICES,
  }
}

export default useTierPrices
