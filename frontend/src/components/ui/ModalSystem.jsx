import { useEffect, useRef } from 'react'
import { useModal } from '../../hooks/useUI'
import './ModalSystem.css'

function ModalSystem() {
  const { modal, hideModal } = useModal()
  const modalRef = useRef(null)
  const previousFocusRef = useRef(null)

  useEffect(() => {
    if (modal) {
      // Store previously focused element
      previousFocusRef.current = document.activeElement
      
      // Focus modal
      if (modalRef.current) {
        modalRef.current.focus()
      }
      
      // Prevent body scroll
      document.body.style.overflow = 'hidden'
      
      return () => {
        // Restore body scroll
        document.body.style.overflow = ''
        
        // Restore focus
        if (previousFocusRef.current) {
          previousFocusRef.current.focus()
        }
      }
    }
  }, [modal])

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && modal) {
        hideModal()
      }
    }
    
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [modal, hideModal])

  if (!modal) {
    return null
  }

  const { content, options = {} } = modal
  const { title, closable = true, size = 'medium' } = options

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && closable) {
      hideModal()
    }
  }

  return (
    <div 
      className="modal-backdrop"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        ref={modalRef}
        className={`modal modal-${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
        aria-label={!title ? 'Dialog' : undefined}
        tabIndex={-1}
      >
        {title && (
          <div className="modal-header">
            <h2 id="modal-title" className="modal-title">{title}</h2>
            {closable && (
              <button
                className="modal-close"
                onClick={hideModal}
                aria-label="Close modal"
              >
                ×
              </button>
            )}
          </div>
        )}
        
        <div className="modal-content">
          {content}
        </div>
        
        {!title && closable && (
          <button
            className="modal-close modal-close-absolute"
            onClick={hideModal}
            aria-label="Close modal"
          >
            ×
          </button>
        )}
      </div>
    </div>
  )
}

export default ModalSystem
