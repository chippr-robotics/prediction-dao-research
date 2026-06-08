import { useState, useEffect, useCallback } from 'react'
import { ethers } from 'ethers'
import { useAccount } from 'wagmi'
import { useWeb3 } from './useWeb3'
import { getContractAddressForChain } from '../config/contracts'
import { MEMBERSHIP_MANAGER_ABI } from '../abis/MembershipManager'

/**
 * Hook to read per-user role + tier details from MembershipManager.
 *
 * The protocol has a single user-purchasable role (`WAGER_PARTICIPANT_ROLE`).
 * For each fetch we read `getMembership(user, role)` + `getTierConfig(role, tier)`
 * and project both into the shape consumed by RoleDetailsCard / Dashboard.
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
  WAGER_PARTICIPANT: ethers.keccak256(ethers.toUtf8Bytes('WAGER_PARTICIPANT_ROLE')),
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
    wagersCreated: 0,
    wagerLimit: 0,
    canCreateWager: false,
    activeWagers: 0,
    concurrentLimit: 0,
  }
}

export function useRoleDetails() {
  const { address, isConnected } = useAccount()
  const { provider, chainId } = useWeb3()
  const [roleDetails, setRoleDetails] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchRoleDetails = useCallback(async (roleName) => {
    if (!address || !provider) return null
    const roleBytes = ROLE_BYTES32[roleName]
    if (!roleBytes) return null

    // Resolve the MembershipManager for the wallet's connected chain so a
    // membership held on one network is not read on another (the address used to
    // be build-bound while the provider was the wallet's — a chain mismatch).
    const managerAddr = getContractAddressForChain('membershipManager', chainId)
    if (!managerAddr) return emptyDetails(roleName)

    try {
      const mgr = new ethers.Contract(managerAddr, MEMBERSHIP_MANAGER_ABI, provider)
      const m = await mgr.getMembership(address, roleBytes)
      const details = emptyDetails(roleName)

      details.tier = Number(m.tier)
      details.tierName = TIER_NAMES[details.tier] || 'Unknown'
      details.tierColor = TIER_COLORS[details.tier] || '#666'
      details.activeWagers = Number(m.activeCount)

      const now = Math.floor(Date.now() / 1000)
      const ROLLING_WINDOW = 30 * 24 * 3600
      const monthAnchor = Number(m.monthAnchor)
      details.wagersCreated = (now >= monthAnchor + ROLLING_WINDOW) ? 0 : Number(m.monthCount)

      const expiresAt = Number(m.expiresAt)
      if (expiresAt > 0) {
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
          details.wagerLimit = Number(cfg.limits.monthlyMarketCreation)
          details.concurrentLimit = Number(cfg.limits.maxConcurrentMarkets)
          const monthlyOk = details.wagerLimit === 0 || details.wagersCreated < details.wagerLimit
          const concurrentOk = details.concurrentLimit === 0 || details.activeWagers < details.concurrentLimit
          details.canCreateWager = details.isActive && monthlyOk && concurrentOk
        } catch (e) {
          console.debug(`getTierConfig failed for ${roleName}:`, e.message)
        }
      }

      return details
    } catch (err) {
      console.error(`Error fetching ${roleName} details:`, err)
      return emptyDetails(roleName)
    }
  }, [address, provider, chainId])

  const fetchAllRoleDetails = useCallback(async () => {
    if (!address || !provider) {
      setRoleDetails({})
      return
    }
    setLoading(true)
    setError(null)
    try {
      const roles = ['WAGER_PARTICIPANT']
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
      r.hasRole && r.isActive && r.wagerLimit > 0 && !r.canCreateWager),
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
