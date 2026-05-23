import { useEffect, useRef } from 'react'
import { useModal } from '../../hooks/useUI'
import './DevelopmentWarningModal.css'

const DEV_WARNING_SEEN_KEY = 'dev_warning_modal_seen_v2'

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
                src="/assets/fairwins_no-text_logo.svg"
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
                Peer-to-Peer Wagers Between Friends
              </p>
            </div>

            <div className="dev-warning-modal-body">
              <p className="dev-warning-modal-message">
                <strong>FairWins</strong> lets you create private, peer-to-peer wagers with friends on any topic.
                Stakes are locked in smart contract escrow and payouts are handled automatically
                through built-in resolution methods with challenge periods — no trust required.
              </p>

              <div className="dev-warning-modal-highlights">
                <p className="dev-warning-modal-message">
                  <strong>How it works:</strong> Create a wager, share it via QR code or link,
                  and let the smart contract handle the rest. Choose who resolves the outcome — either
                  party, the initiator, the receiver, or a trusted third party.
                </p>
              </div>

              <div className="dev-warning-notice">
                <p className="dev-warning-modal-message">
                  <strong>Development Notice:</strong> This site is under active development.
                  Features and functionality may change. For information contact: Howdy@FairWins.App
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
                Visit docs.fairwins.app for more information
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
