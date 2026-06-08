import { useState } from 'react'
import WagerQRCode from '../ui/WagerQRCode'
import './ShareWagerModal.css'

function ShareWagerModal({
  isOpen,
  onClose,
  url,
  description,
  stakeAmount,
  stakeTokenSymbol
}) {
  const [copied, setCopied] = useState(false)

  if (!isOpen) return null

  const handleCopyLink = async () => {
    if (!navigator.clipboard?.writeText) {
      window.alert('Copy to clipboard is not supported in this browser. Please copy the link manually.')
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy link:', error)
      window.alert('Failed to copy the link. Please copy it manually.')
    }
  }

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div className="share-wager-modal-backdrop" onClick={handleBackdropClick}>
      <div className="share-wager-modal" onClick={(e) => e.stopPropagation()}>
        <button className="share-wager-close" onClick={onClose} aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>

        <div className="share-wager-header">
          <h3>Share Wager</h3>
          <p className="share-wager-desc">{description}</p>
        </div>

        <div className="share-wager-qr-section">
          <div className="share-wager-qr-container">
            <WagerQRCode
              value={url}
              size={200}
              ariaLabel="QR code to share this wager"
            />
          </div>
          <p className="share-wager-qr-hint">
            Scan to accept this wager
          </p>
        </div>

        <div className="share-wager-url-section">
          <label htmlFor="share-wager-url">Share link</label>
          <div className="share-wager-url-row">
            <input
              id="share-wager-url"
              type="text"
              value={url}
              readOnly
              onFocus={(e) => e.target.select()}
            />
            <button
              type="button"
              className="share-wager-copy-btn"
              onClick={handleCopyLink}
            >
              {copied ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                  </svg>
                  Copy
                </>
              )}
            </button>
          </div>
        </div>

        {stakeAmount && (
          <div className="share-wager-stake-info">
            <span>Stake required:</span>
            <strong>{stakeAmount} {stakeTokenSymbol}</strong>
          </div>
        )}
      </div>
    </div>
  )
}

export default ShareWagerModal
