import { useState, useEffect, useCallback } from 'react'
import { useWeb3 } from '../hooks/useWeb3'
import { 
  getUserRoles, 
  hasRole as checkRole,
  addUserRole,
  removeUserRole
} from '../utils/roleStorage'
import { RoleContext, ROLES, ROLE_INFO, ADMIN_ROLES, isAdminRole } from './RoleContext'

/**
 * RoleProvider manages user roles tied to wallet address
 * - Automatically loads roles when wallet connects
 * - Persists roles to local storage
 * - Provides utilities for checking and managing roles
 */
export function RoleProvider({ children }) {
  const { account, isConnected } = useWeb3()
  const [roles, setRoles] = useState([])
  const [isLoading, setIsLoading] = useState(false)

  // Load roles when wallet connects
  useEffect(() => {
    if (isConnected && account) {
      loadRoles(account)
    } else {
      // Reset to empty when disconnected
      setRoles([])
    }
  }, [account, isConnected])

  const loadRoles = useCallback((walletAddress) => {
    setIsLoading(true)
    try {
      const userRoles = getUserRoles(walletAddress)
      setRoles(userRoles)
    } catch (error) {
      console.error('Error loading user roles:', error)
      setRoles([])
    } finally {
      setIsLoading(false)
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
    hasRole,
    hasAnyRole,
    hasAllRoles,
    grantRole,
    revokeRole,
    grantRoleToUser,
    revokeRoleFromUser,
    getRoleInfo,
    isAdminRole,
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
