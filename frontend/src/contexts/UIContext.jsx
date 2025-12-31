import { useState, useCallback } from 'react'
import { UIContext } from './UIContext'

export function UIProvider({ children }) {
  const [notification, setNotification] = useState(null)
  const [announcement, setAnnouncement] = useState('')
  const [modal, setModal] = useState(null)
  const [error, setError] = useState(null)

  // Notification system (for user feedback messages)
  const showNotification = useCallback((message, type = 'info', duration = 5000) => {
    const id = Date.now()
    setNotification({ id, message, type })
    
    if (duration > 0) {
      setTimeout(() => {
        setNotification(prev => prev?.id === id ? null : prev)
      }, duration)
    }
  }, [])

  const hideNotification = useCallback(() => {
    setNotification(null)
  }, [])

  // Announcement system (for screen reader announcements)
  const announce = useCallback((message) => {
    setAnnouncement(message)
    // Clear announcement after a short delay so it can be re-announced if needed
    setTimeout(() => setAnnouncement(''), 1000)
  }, [])

  // Modal system
  const showModal = useCallback((content, options = {}) => {
    setModal({ content, options })
  }, [])

  const hideModal = useCallback(() => {
    setModal(null)
  }, [])

  // Error handling system
  const showError = useCallback((errorMessage, details = null) => {
    setError({ message: errorMessage, details, timestamp: Date.now() })
  }, [])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  const value = {
    // Notification state and actions
    notification,
    showNotification,
    hideNotification,
    
    // Announcement state and actions
    announcement,
    announce,
    
    // Modal state and actions
    modal,
    showModal,
    hideModal,
    
    // Error state and actions
    error,
    showError,
    clearError,
  }

  return (
    <UIContext.Provider value={value}>
      {children}
    </UIContext.Provider>
  )
}
