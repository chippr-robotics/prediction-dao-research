import { useContext } from 'react'
import { WalletContext } from '../contexts/WalletContext'
import { ROLES, ROLE_INFO, ADMIN_ROLES, isAdminRole } from '../contexts/RoleContext'

/**
 * Hook to access role context
 *
 * This hook provides backwards compatibility for components that used the old RoleContext.
 * Roles are now managed in the unified WalletProvider.
 *
 * @returns {Object} Role context value
 */
export function useRoles() {
  const context = useContext(WalletContext)

  if (!context) {
    throw new Error('useRoles must be used within a WalletProvider')
  }

  // Extract role-related properties from WalletContext
  const {
    roles,
    rolesLoading: isLoading,
    blockchainSynced,
    refreshRoles,
    hasRole,
    hasAnyRole,
    hasAllRoles,
    grantRole,
    revokeRole
  } = context

  // Provide a consistent interface for role operations
  return {
    roles,
    isLoading,
    blockchainSynced,
    hasRole,
    hasAnyRole,
    hasAllRoles,
    grantRole,
    revokeRole,
    loadRoles: refreshRoles,
    // Include role constants for convenience
    ROLES,
    ROLE_INFO,
    ADMIN_ROLES,
    isAdminRole
  }
}
