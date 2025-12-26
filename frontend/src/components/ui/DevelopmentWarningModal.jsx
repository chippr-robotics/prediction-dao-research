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
            <div className="dev-warning-modal-header">
              <img 
                src="/logo_fairwins.svg" 
                alt="FairWins" 
                className="dev-warning-modal-logo"
                width="64"
                height="64"
                onError={(e) => { e.target.style.display = 'none' }}
              />
              <h2 className="dev-warning-modal-title">
                Welcome to FairWins
              </h2>
              <p className="dev-warning-modal-subtitle">
                Prediction Markets for Friends
              </p>
            </div>
            
            <div className="dev-warning-modal-body">
              <p className="dev-warning-modal-message">
                <strong>FairWins</strong> is the core platform for creating and trading on prediction markets 
                about any topic. Open to everyone, with transparent market-driven outcomes.
              </p>
              
              <div className="platform-addons">
                <h3 className="addons-title">Platform Add-ons:</h3>
                <ul className="addons-list">
                  <li>
                    <img 
                      src="/logo_clearpath.svg" 
                      alt="ClearPath" 
                      className="addon-logo"
                      onError={(e) => { e.target.style.display = 'none' }}
                    />
                    <div className="addon-content">
                      <strong>ClearPath</strong> - DAO governance platform with futarchy-based decision-making (RBAC managed)
                    </div>
                  </li>
                  <li>
                    <img 
                      src="/logo_fairwins.svg" 
                      alt="TokenMint" 
                      className="addon-logo"
                      onError={(e) => { e.target.style.display = 'none' }}
                    />
                    <div className="addon-content">
                      <strong>TokenMint</strong> - Token creation and management tools (RBAC managed)
                    </div>
                  </li>
                  <li>
                    <img 
                      src="/logo_fairwins.svg" 
                      alt="SpindleTop" 
                      className="addon-logo"
                      onError={(e) => { e.target.style.display = 'none' }}
                    />
                    <div className="addon-content">
                      <strong>SpindleTop</strong> - Liquidity and poll management system where users can manage their payouts and mining related activities (RBAC managed)
                    </div>
                  </li>
                </ul>
              </div>
              
              <div className="dev-warning-notice">
                <p className="dev-warning-modal-message">
                  ⚠️ <strong>Development Notice:</strong> This site is under active development. 
                  Features and functionality may change.
                </p>
              </div>
            </div>
            
            <div className="dev-warning-modal-footer">
              <a 
                href="https://docs.fairwins.app" 
                target="_blank" 
                rel="noopener noreferrer"
                className="dev-warning-modal-link"
              >
                📚 Visit docs.fairwins.app for more information
              </a>
              <button 
                className="dev-warning-modal-button"
                onClick={() => {
                  sessionStorage.setItem(DEV_WARNING_SEEN_KEY, 'true')
                  hideModal()
                }}
              >
                Continue to FairWins
              </button>
            </div>
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
