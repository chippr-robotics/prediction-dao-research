import { useContext } from 'react'
import { RoleContext } from '../contexts/RoleContext'

/**
 * Hook to access role context
 * @returns {Object} Role context value
 */
export function useRoles() {
  const context = useContext(RoleContext)
  
  if (!context) {
    throw new Error('useRoles must be used within a RoleProvider')
  }
  
  return context
}
