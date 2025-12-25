import { useEffect, useRef } from 'react'
import { useModal } from '../../hooks/useUI'
import './DevelopmentWarningModal.css'

const DEV_WARNING_SEEN_KEY = 'dev_warning_modal_seen'

/**
 * Modal that displays on first visit to warn users
 * that the site is under active development
 */
function DevelopmentWarningModal() {
  const { showModal, hideModal } = useModal()
  const hasShownRef = useRef(false)

  useEffect(() => {
    // Check if user has already seen the modal in this session
    const hasSeenModal = sessionStorage.getItem(DEV_WARNING_SEEN_KEY)
    
    if (!hasSeenModal && !hasShownRef.current) {
      hasShownRef.current = true
      
      // Small delay to ensure the page has loaded
      const timer = setTimeout(() => {
        showModal(
          <div className="dev-warning-modal-content">
            <div className="dev-warning-modal-icon" aria-hidden="true">
              ⚠️
            </div>
            <h2 className="dev-warning-modal-title">
              Pardon Our Dust
            </h2>
            <p className="dev-warning-modal-message">
              This site is under active development. We're working hard to bring you 
              exciting new features and improvements.
            </p>
            <p className="dev-warning-modal-message">
              Please check back soon for updates!
            </p>
            <a 
              href="https://chipprhots.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="dev-warning-modal-link"
            >
              Visit chipprhots.com for more information
            </a>
            <button 
              className="dev-warning-modal-button"
              onClick={() => {
                sessionStorage.setItem(DEV_WARNING_SEEN_KEY, 'true')
                hideModal()
              }}
            >
              Continue to Site
            </button>
          </div>,
          {
            title: null,
            closable: true,
            size: 'medium'
          }
        )
      }, 500)

      return () => clearTimeout(timer)
    }
  }, [showModal, hideModal])

  return null
}

export default DevelopmentWarningModal
