import { useState, useEffect, useCallback } from 'react'
import { ethers } from 'ethers'
import { useAccount } from 'wagmi'
import { useWeb3 } from './useWeb3'
import { getContractAddress } from '../config/contracts'

/**
 * Membership tier enum matching contract
 */
export const MembershipTier = {
  NONE: 0,
  BRONZE: 1,
  SILVER: 2,
  GOLD: 3,
  PLATINUM: 4
}

export const TIER_NAMES = {
  0: 'None',
  1: 'Bronze',
  2: 'Silver',
  3: 'Gold',
  4: 'Platinum'
}

export const TIER_COLORS = {
  0: '#666',
  1: '#CD7F32',
  2: '#C0C0C0',
  3: '#FFD700',
  4: '#E5E4E2'
}

/**
 * Role identifiers matching the contract
 */
export const ROLE_BYTES32 = {
  MARKET_MAKER: ethers.keccak256(ethers.toUtf8Bytes('MARKET_MAKER_ROLE')),
  FRIEND_MARKET: ethers.keccak256(ethers.toUtf8Bytes('FRIEND_MARKET_ROLE')),
  CLEARPATH_USER: ethers.keccak256(ethers.toUtf8Bytes('CLEARPATH_USER_ROLE')),
  TOKENMINT: ethers.keccak256(ethers.toUtf8Bytes('TOKENMINT_ROLE'))
}

/**
 * ABI for TieredRoleManager
 */
const TIERED_ROLE_MANAGER_ABI = [
  'function getUserTier(address user, bytes32 role) view returns (uint8)',
  'function membershipExpiration(address user, bytes32 role) view returns (uint256)',
  'function usageStats(address user, bytes32 role) view returns (uint256 dailyBetsCount, uint256 weeklyBetsCount, uint256 monthlyMarketsCreated, uint256 dailyWithdrawals, uint256 activeMarketsCount, uint256 lastDailyReset, uint256 lastWeeklyReset, uint256 lastMonthlyReset)',
  'function isMembershipActive(address user, bytes32 role) view returns (bool)',
  'function hasRole(bytes32 role, address account) view returns (bool)',
  'function MARKET_MAKER_ROLE() view returns (bytes32)',
  'function FRIEND_MARKET_ROLE() view returns (bytes32)'
]

/**
 * ABI for TierRegistry (for limits info)
 */
const TIER_REGISTRY_ABI = [
  'function getUserTier(address user, bytes32 role) view returns (uint8)',
  'function getTierLimits(bytes32 role, uint8 tier) view returns (uint256 dailyBetLimit, uint256 weeklyBetLimit, uint256 monthlyMarketCreation, uint256 maxPositionSize)',
  'function getTierPrice(bytes32 role, uint8 tier) view returns (uint256)'
]

/**
 * ABI for MembershipManager
 */
const MEMBERSHIP_MANAGER_ABI = [
  'function getMembershipExpiration(address user, bytes32 role) view returns (uint256)',
  'function getEffectiveTier(address user, bytes32 role) view returns (uint8)'
]

/**
 * Hook to get detailed role information for the connected user
 *
 * @returns {Object} Role details including tier, expiration, limits, and usage
 */
export function useRoleDetails() {
  const { address, isConnected } = useAccount()
  const { provider } = useWeb3()
  const [roleDetails, setRoleDetails] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  /**
   * Fetch detailed information for a specific role
   */
  const fetchRoleDetails = useCallback(async (roleName) => {
    if (!address || !provider) return null

    const roleBytes = ROLE_BYTES32[roleName]
    if (!roleBytes) return null

    try {
      // Get contract addresses
      const tieredRoleManagerAddress = getContractAddress('tieredRoleManager')
      const tierRegistryAddress = getContractAddress('tierRegistry')
      const membershipManagerAddress = getContractAddress('membershipManager')

      const details = {
        roleName,
        tier: 0,
        tierName: 'None',
        tierColor: TIER_COLORS[0],
        expiration: null,
        expirationDate: null,
        isActive: false,
        marketsCreated: 0,
        marketLimit: 0,
        canCreateMarket: false,
        daysRemaining: null,
        isExpired: false,
        hasRole: false
      }

      // Try TieredRoleManager first (this is what FriendGroupMarketFactory uses)
      if (tieredRoleManagerAddress) {
        try {
          const trm = new ethers.Contract(tieredRoleManagerAddress, TIERED_ROLE_MANAGER_ABI, provider)

          // Check if user has the role
          const hasRole = await trm.hasRole(roleBytes, address)
          details.hasRole = hasRole

          if (hasRole) {
            // Get tier
            const tier = await trm.getUserTier(address, roleBytes)
            details.tier = Number(tier)
            details.tierName = TIER_NAMES[details.tier] || 'Unknown'
            details.tierColor = TIER_COLORS[details.tier] || '#666'

            // Get expiration
            try {
              const expiration = await trm.membershipExpiration(address, roleBytes)
              if (expiration > 0) {
                details.expiration = Number(expiration)
                details.expirationDate = new Date(Number(expiration) * 1000)
                const now = Date.now() / 1000
                details.isExpired = Number(expiration) < now
                details.daysRemaining = Math.max(0, Math.ceil((Number(expiration) - now) / 86400))
              }
            } catch (e) {
              console.debug('Could not fetch expiration:', e.message)
            }

            // Get markets created from usageStats
            try {
              const stats = await trm.usageStats(address, roleBytes)
              details.marketsCreated = Number(stats.monthlyMarketsCreated)
            } catch (e) {
              console.debug('Could not fetch usageStats:', e.message)
            }

            // Check if membership is active
            try {
              const isActive = await trm.isMembershipActive(address, roleBytes)
              details.isActive = isActive
            } catch (e) {
              console.debug('Could not check membership active:', e.message)
              // Fallback: if we have a role and it's not expired, consider it active
              details.isActive = hasRole && !details.isExpired
            }
          }
        } catch (e) {
          console.debug('TieredRoleManager query failed:', e.message)
        }
      }

      // Try TierRegistry for tier limits
      if (tierRegistryAddress && details.tier > 0) {
        try {
          const registry = new ethers.Contract(tierRegistryAddress, TIER_REGISTRY_ABI, provider)
          const limits = await registry.getTierLimits(roleBytes, details.tier)
          details.marketLimit = Number(limits.monthlyMarketCreation)
          details.canCreateMarket = details.marketsCreated < details.marketLimit
        } catch (e) {
          console.debug('TierRegistry query failed:', e.message)
          // Fallback limits based on tier
          const fallbackLimits = {
            1: 5,   // Bronze
            2: 15,  // Silver
            3: 50,  // Gold
            4: 200  // Platinum
          }
          details.marketLimit = fallbackLimits[details.tier] || 5
          details.canCreateMarket = details.marketsCreated < details.marketLimit
        }
      }

      // If no TieredRoleManager, try MembershipManager
      if (!tieredRoleManagerAddress && membershipManagerAddress) {
        try {
          const mm = new ethers.Contract(membershipManagerAddress, MEMBERSHIP_MANAGER_ABI, provider)

          const expiration = await mm.getMembershipExpiration(address, roleBytes)
          if (expiration > 0) {
            details.expiration = Number(expiration)
            details.expirationDate = new Date(Number(expiration) * 1000)
            const now = Date.now() / 1000
            details.isExpired = Number(expiration) < now
            details.daysRemaining = Math.max(0, Math.ceil((Number(expiration) - now) / 86400))
            details.isActive = !details.isExpired
            details.hasRole = !details.isExpired
          }

          const tier = await mm.getEffectiveTier(address, roleBytes)
          details.tier = Number(tier)
          details.tierName = TIER_NAMES[details.tier] || 'Unknown'
          details.tierColor = TIER_COLORS[details.tier] || '#666'
        } catch (e) {
          console.debug('MembershipManager query failed:', e.message)
        }
      }

      return details
    } catch (err) {
      console.error(`Error fetching ${roleName} details:`, err)
      return null
    }
  }, [address, provider])

  /**
   * Fetch all role details
   */
  const fetchAllRoleDetails = useCallback(async () => {
    if (!address || !provider) {
      setRoleDetails({})
      return
    }

    setLoading(true)
    setError(null)

    try {
      const roles = ['MARKET_MAKER', 'FRIEND_MARKET', 'CLEARPATH_USER', 'TOKENMINT']
      const details = {}

      await Promise.all(
        roles.map(async (roleName) => {
          const roleDetail = await fetchRoleDetails(roleName)
          if (roleDetail) {
            details[roleName] = roleDetail
          }
        })
      )

      setRoleDetails(details)
    } catch (err) {
      console.error('Error fetching role details:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [address, provider, fetchRoleDetails])

  // Fetch role details when wallet connects or changes
  useEffect(() => {
    if (isConnected && address && provider) {
      fetchAllRoleDetails()
    } else {
      setRoleDetails({})
    }
  }, [isConnected, address, provider, fetchAllRoleDetails])

  /**
   * Get details for a specific role
   */
  const getRoleDetails = useCallback((roleName) => {
    return roleDetails[roleName] || null
  }, [roleDetails])

  /**
   * Get all active roles (roles with hasRole = true and not expired)
   */
  const getActiveRoles = useCallback(() => {
    return Object.values(roleDetails).filter(r => r.hasRole && r.isActive)
  }, [roleDetails])

  /**
   * Get roles that are expiring soon (within 7 days)
   */
  const getExpiringSoonRoles = useCallback(() => {
    return Object.values(roleDetails).filter(r =>
      r.hasRole && r.isActive && r.daysRemaining !== null && r.daysRemaining <= 7
    )
  }, [roleDetails])

  /**
   * Get roles at their market creation limit
   */
  const getRolesAtLimit = useCallback(() => {
    return Object.values(roleDetails).filter(r =>
      r.hasRole && r.isActive && r.marketLimit > 0 && !r.canCreateMarket
    )
  }, [roleDetails])

  return {
    roleDetails,
    loading,
    error,
    refresh: fetchAllRoleDetails,
    getRoleDetails,
    getActiveRoles,
    getExpiringSoonRoles,
    getRolesAtLimit
  }
}

export default useRoleDetails
