import { useState, useEffect, useCallback } from 'react'
import { useWeb3 } from '../hooks/useWeb3'
import { 
  getUserRoles, 
  hasRole as checkRole,
  addUserRole,
  removeUserRole
} from '../utils/roleStorage'
import { hasRoleOnChain } from '../utils/blockchainService'
import { RoleContext, ROLES, ROLE_INFO, ADMIN_ROLES, isAdminRole } from './RoleContext'

/**
 * RoleProvider manages user roles tied to wallet address
 * - Automatically loads roles when wallet connects
 * - Syncs with blockchain for on-chain roles
 * - Persists roles to local storage as fallback
 * - Provides utilities for checking and managing roles
 */
export function RoleProvider({ children }) {
  const { account, isConnected } = useWeb3()
  const [roles, setRoles] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [blockchainSynced, setBlockchainSynced] = useState(false)

  // Load roles when wallet connects
  useEffect(() => {
    if (isConnected && account) {
      loadRoles(account)
    } else {
      // Reset to empty when disconnected
      setRoles([])
      setBlockchainSynced(false)
    }
  }, [account, isConnected])

  /**
   * Load roles from both localStorage and blockchain
   * Blockchain is the source of truth - local storage is synced to match
   */
  const loadRoles = useCallback(async (walletAddress) => {
    setIsLoading(true)
    try {
      // First load from local storage (immediate response)
      const localRoles = getUserRoles(walletAddress)
      setRoles(localRoles)

      // Then sync with blockchain (authoritative source)
      const onChainRoles = await syncRolesWithBlockchain(walletAddress, localRoles)
      if (onChainRoles) {
        setRoles(onChainRoles)
        setBlockchainSynced(true)
      }
    } catch (error) {
      console.error('Error loading user roles:', error)
      // Keep local roles on error
    } finally {
      setIsLoading(false)
    }
  }, [])

  /**
   * Sync local roles with blockchain state
   * If a role exists on-chain but not locally, add it
   * If a role exists locally but not on-chain, keep it (may be pending)
   */
  const syncRolesWithBlockchain = useCallback(async (walletAddress, localRoles) => {
    try {
      // Premium roles synced from TierRegistry/TieredRoleManager
      const premiumRoles = ['MARKET_MAKER', 'CLEARPATH_USER', 'TOKENMINT', 'FRIEND_MARKET']
      // Admin roles synced from RoleManager/TieredRoleManager
      const adminRoles = ['ADMIN', 'OPERATIONS_ADMIN', 'EMERGENCY_GUARDIAN']
      const allRolesToSync = [...premiumRoles, ...adminRoles]

      const updatedRoles = [...localRoles]
      let hasChanges = false

      // Check each role on-chain
      for (const roleName of allRolesToSync) {
        const hasOnChain = await hasRoleOnChain(walletAddress, roleName)
        const hasLocally = localRoles.includes(roleName)

        if (hasOnChain && !hasLocally) {
          // Role exists on-chain but not locally - add it
          console.log(`Syncing role ${roleName} from blockchain to local storage`)
          updatedRoles.push(roleName)
          addUserRole(walletAddress, roleName)
          hasChanges = true
        }
        // Note: We don't remove local roles that aren't on-chain
        // because the role manager might not be deployed yet
      }

      return hasChanges ? updatedRoles : localRoles
    } catch (error) {
      console.error('Error syncing roles with blockchain:', error)
      return null
    }
  }, [])

  const hasRole = useCallback((role) => {
    if (!account) return false
    return checkRole(account, role)
  }, [account])

  const hasAnyRole = useCallback((rolesToCheck) => {
    if (!account || !Array.isArray(rolesToCheck)) return false
    return rolesToCheck.some(role => checkRole(account, role))
  }, [account])

  const hasAllRoles = useCallback((rolesToCheck) => {
    if (!account || !Array.isArray(rolesToCheck)) return false
    return rolesToCheck.every(role => checkRole(account, role))
  }, [account])

  const grantRole = useCallback((role) => {
    if (!account) {
      console.warn('Cannot grant role: no wallet connected')
      return false
    }

    try {
      addUserRole(account, role)
      const updatedRoles = getUserRoles(account)
      setRoles(updatedRoles)
      return true
    } catch (error) {
      console.error('Error granting role:', error)
      return false
    }
  }, [account])

  const revokeRole = useCallback((role) => {
    if (!account) {
      console.warn('Cannot revoke role: no wallet connected')
      return false
    }

    try {
      removeUserRole(account, role)
      const updatedRoles = getUserRoles(account)
      setRoles(updatedRoles)
      return true
    } catch (error) {
      console.error('Error revoking role:', error)
      return false
    }
  }, [account])

  const grantRoleToUser = useCallback((walletAddress, role) => {
    // Only admins can grant roles to others
    if (!hasRole(ROLES.ADMIN)) {
      console.warn('Insufficient permissions to grant roles')
      return false
    }

    try {
      addUserRole(walletAddress, role)
      return true
    } catch (error) {
      console.error('Error granting role to user:', error)
      return false
    }
  }, [hasRole])

  const revokeRoleFromUser = useCallback((walletAddress, role) => {
    // Only admins can revoke roles from others
    if (!hasRole(ROLES.ADMIN)) {
      console.warn('Insufficient permissions to revoke roles')
      return false
    }

    try {
      removeUserRole(walletAddress, role)
      return true
    } catch (error) {
      console.error('Error revoking role from user:', error)
      return false
    }
  }, [hasRole])

  const getRoleInfo = useCallback((role) => {
    return ROLE_INFO[role] || { name: role, description: 'Unknown role', premium: false }
  }, [])

  const value = {
    roles,
    isLoading,
    blockchainSynced,
    hasRole,
    hasAnyRole,
    hasAllRoles,
    grantRole,
    revokeRole,
    grantRoleToUser,
    revokeRoleFromUser,
    getRoleInfo,
    isAdminRole,
    loadRoles,
    ROLES,
    ROLE_INFO,
    ADMIN_ROLES
  }

  return (
    <RoleContext.Provider value={value}>
      {children}
    </RoleContext.Provider>
  )
}
