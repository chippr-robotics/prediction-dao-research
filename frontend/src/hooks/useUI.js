import { useContext } from 'react'
import { UIContext } from '../contexts/UIContext'

/**
 * Hook to access UI context
 * @returns {Object} UI context value
 * @throws {Error} If used outside UIProvider
 */
export function useUI() {
  const context = useContext(UIContext)
  if (!context) {
    throw new Error('useUI must be used within a UIProvider')
  }
  return context
}

/**
 * Hook to access notification system
 * @returns {Object} Notification state and functions
 */
export function useNotification() {
  const { notification, showNotification, hideNotification } = useUI()
  return { notification, showNotification, hideNotification }
}

/**
 * Hook to access announcement system (for accessibility)
 * @returns {Object} Announcement state and announce function
 */
export function useAnnouncement() {
  const { announcement, announce } = useUI()
  return { announcement, announce }
}

/**
 * Hook to access modal system
 * @returns {Object} Modal state and functions
 */
export function useModal() {
  const { modal, showModal, hideModal } = useUI()
  return { modal, showModal, hideModal }
}

/**
 * Hook to access error handling system
 * @returns {Object} Error state and functions
 */
export function useError() {
  const { error, showError, clearError } = useUI()
  return { error, showError, clearError }
}
