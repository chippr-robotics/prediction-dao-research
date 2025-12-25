import { useContext } from 'react'
import { UserPreferencesContext } from '../contexts/UserPreferencesContext'

/**
 * Hook to access user preferences context
 * @returns {Object} User preferences context value
 * @throws {Error} If used outside UserPreferencesProvider
 */
export function useUserPreferences() {
  const context = useContext(UserPreferencesContext)
  if (!context) {
    throw new Error('useUserPreferences must be used within a UserPreferencesProvider')
  }
  return context
}
