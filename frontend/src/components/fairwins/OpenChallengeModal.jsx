import { useEffect } from 'react'
import CreateChallengePanel from './CreateChallengePanel'
import InfoTip from '../ui/InfoTip'
import './FriendMarketsModal.css'
import './OpenChallengeModal.css'

const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

/**
 * OpenChallengeModal (feature 024) — the modal shell for creating a code-gated open challenge.
 * The create form itself is the shared `CreateChallengePanel` (spec 053), which also renders inline
 * on the home screen. Oracle settlement (spec 041/052) is a resolution path within that panel.
 * Taking a challenge moved to the unified phrase lookup (spec 037).
 */
function OpenChallengeModal({ isOpen, onClose, initialResolutionType, initialMarket }) {
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null
  const handleBackdrop = (e) => { if (e.target === e.currentTarget) onClose() }

  return (
    <div
      className="friend-markets-modal-backdrop"
      onClick={handleBackdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="open-challenge-title"
    >
      <div className="friend-markets-modal" onClick={(e) => e.stopPropagation()}>
        <header className="fm-header">
          <div className="fm-header-content">
            <div className="fm-brand">
              <span className="fm-brand-icon">&#127915;</span>
              <h2 id="open-challenge-title">Open Challenge</h2>
              <InfoTip label="About open challenges">
                An open challenge has no named opponent — anyone you share the code with can take the other side.
                Equal stakes. Creating one requires a Silver membership or above.
              </InfoTip>
            </div>
          </div>
          <button className="fm-close-btn" onClick={onClose} aria-label="Close modal">
            <CloseIcon />
          </button>
        </header>

        <div className="fm-content">
          <div className="fm-panel">
            {/* Taking a challenge moved to the unified phrase lookup (spec 037). */}
            <CreateChallengePanel onClose={onClose} onDone={onClose} initialResolutionType={initialResolutionType} initialMarket={initialMarket} />
          </div>
        </div>
      </div>
    </div>
  )
}

export default OpenChallengeModal
