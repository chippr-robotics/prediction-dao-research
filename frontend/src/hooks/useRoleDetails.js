import { useState, useEffect, useCallback } from 'react'
import { ethers } from 'ethers'
import { useAccount } from 'wagmi'
import { useWeb3 } from './useWeb3'
import { getContractAddress } from '../config/contracts'
import { MEMBERSHIP_MANAGER_ABI } from '../abis/MembershipManager'

/**
 * Hook to read per-user role + tier details from MembershipManager (v2).
 *
 * Replaces the multi-contract v1 reads (TieredRoleManager + TierRegistry +
 * MembershipManager-old) with a single contract: MembershipManager.
 * Two RPC calls per role: getMembership(user, role) + getTierConfig(role, tier).
 */

export const MembershipTier = {
  NONE: 0,
  BRONZE: 1,
  SILVER: 2,
  GOLD: 3,
  PLATINUM: 4,
}

export const TIER_NAMES = {
  0: 'None',
  1: 'Bronze',
  2: 'Silver',
  3: 'Gold',
  4: 'Platinum',
}

export const TIER_COLORS = {
  0: '#666',
  1: '#CD7F32',
  2: '#C0C0C0',
  3: '#FFD700',
  4: '#E5E4E2',
}

export const ROLE_BYTES32 = {
  MARKET_MAKER: ethers.keccak256(ethers.toUtf8Bytes('MARKET_MAKER_ROLE')),
  FRIEND_MARKET: ethers.keccak256(ethers.toUtf8Bytes('FRIEND_MARKET_ROLE')),
  CLEARPATH_USER: ethers.keccak256(ethers.toUtf8Bytes('CLEARPATH_USER_ROLE')),
  TOKENMINT: ethers.keccak256(ethers.toUtf8Bytes('TOKENMINT_ROLE')),
}

function emptyDetails(roleName) {
  return {
    roleName,
    tier: 0,
    tierName: 'None',
    tierColor: TIER_COLORS[0],
    expiration: null,
    expirationDate: null,
    isActive: false,
    isExpired: false,
    daysRemaining: null,
    hasRole: false,
    marketsCreated: 0,
    marketLimit: 0,
    canCreateMarket: false,
    activeMarkets: 0,
    concurrentLimit: 0,
  }
}

export function useRoleDetails() {
  const { address, isConnected } = useAccount()
  const { provider } = useWeb3()
  const [roleDetails, setRoleDetails] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchRoleDetails = useCallback(async (roleName) => {
    if (!address || !provider) return null
    const roleBytes = ROLE_BYTES32[roleName]
    if (!roleBytes) return null

    const managerAddr = getContractAddress('membershipManager')
    if (!managerAddr) return emptyDetails(roleName)

    try {
      const mgr = new ethers.Contract(managerAddr, MEMBERSHIP_MANAGER_ABI, provider)
      const m = await mgr.getMembership(address, roleBytes)
      const details = emptyDetails(roleName)

      details.tier = Number(m.tier)
      details.tierName = TIER_NAMES[details.tier] || 'Unknown'
      details.tierColor = TIER_COLORS[details.tier] || '#666'
      details.marketsCreated = Number(m.monthCount)
      details.activeMarkets = Number(m.activeCount)

      const expiresAt = Number(m.expiresAt)
      if (expiresAt > 0) {
        const now = Math.floor(Date.now() / 1000)
        details.expiration = expiresAt
        details.expirationDate = new Date(expiresAt * 1000)
        details.isExpired = expiresAt <= now
        details.isActive = expiresAt > now && details.tier > 0
        details.daysRemaining = Math.max(0, Math.ceil((expiresAt - now) / 86400))
        details.hasRole = details.tier > 0
      }

      if (details.tier > 0) {
        try {
          const cfg = await mgr.getTierConfig(roleBytes, details.tier)
          details.marketLimit = Number(cfg.limits.monthlyMarketCreation)
          details.concurrentLimit = Number(cfg.limits.maxConcurrentMarkets)
          // 0 = unlimited
          const monthlyOk = details.marketLimit === 0 || details.marketsCreated < details.marketLimit
          const concurrentOk = details.concurrentLimit === 0 || details.activeMarkets < details.concurrentLimit
          details.canCreateMarket = details.isActive && monthlyOk && concurrentOk
        } catch (e) {
          console.debug(`getTierConfig failed for ${roleName}:`, e.message)
        }
      }

      return details
    } catch (err) {
      console.error(`Error fetching ${roleName} details:`, err)
      return emptyDetails(roleName)
    }
  }, [address, provider])

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
      await Promise.all(roles.map(async (roleName) => {
        const detail = await fetchRoleDetails(roleName)
        if (detail) details[roleName] = detail
      }))
      setRoleDetails(details)
    } catch (err) {
      console.error('Error fetching role details:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [address, provider, fetchRoleDetails])

  useEffect(() => {
    if (isConnected && address && provider) {
      fetchAllRoleDetails()
    } else {
      setRoleDetails({})
    }
  }, [isConnected, address, provider, fetchAllRoleDetails])

  const getRoleDetails = useCallback((roleName) => roleDetails[roleName] || null, [roleDetails])
  const getActiveRoles = useCallback(() =>
    Object.values(roleDetails).filter(r => r.hasRole && r.isActive),
    [roleDetails])
  const getExpiringSoonRoles = useCallback(() =>
    Object.values(roleDetails).filter(r =>
      r.hasRole && r.isActive && r.daysRemaining !== null && r.daysRemaining <= 7),
    [roleDetails])
  const getRolesAtLimit = useCallback(() =>
    Object.values(roleDetails).filter(r =>
      r.hasRole && r.isActive && r.marketLimit > 0 && !r.canCreateMarket),
    [roleDetails])

  return {
    roleDetails,
    loading,
    error,
    refresh: fetchAllRoleDetails,
    getRoleDetails,
    getActiveRoles,
    getExpiringSoonRoles,
    getRolesAtLimit,
  }
}

export default useRoleDetails
