import { useState, useRef, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import './ShareModal.css'

function ShareModal({ isOpen, onClose, market, marketUrl }) {
  const [, setCopied] = useState(false)
  const qrRef = useRef(null)

  // Only compute url when we have data
  const url = (isOpen && market) ? (marketUrl || `${window.location.origin}/market/${market.id}`) : ''

  // Focus management
  useEffect(() => {
    if (isOpen) {
      // Trap focus in modal
      const focusableElements = document.querySelectorAll(
        '.share-modal button, .share-modal a, .share-modal [tabindex]:not([tabindex="-1"])'
      )
      if (focusableElements.length > 0) {
        focusableElements[0].focus()
      }
    }
  }, [isOpen])

  // Handle Escape key press
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  // Don't render anything if modal is closed or no market data
  if (!isOpen || !market) return null

  const shareText = `Check out this market: ${market.proposalTitle}`

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleNativeShare = async () => {
    // Check if Web Share API is supported
    if (navigator.share) {
      try {
        await navigator.share({
          title: market.proposalTitle,
          text: shareText,
          url: url,
        })
      } catch (err) {
        // User cancelled or error occurred
        if (err.name !== 'AbortError') {
          console.error('Error sharing:', err)
        }
      }
    } else {
      // Fallback to copy link
      handleCopyLink()
    }
  }

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div 
      className="share-modal-backdrop" 
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-modal-title"
    >
      <div className="share-modal">
        <button 
          className="share-modal-close"
          onClick={onClose}
          aria-label="Close share modal"
        >
          ×
        </button>

        <div className="share-modal-content">
          {/* Branding Section */}
          <div className="brand-section">
            <div className="brand-logo">
              <img
                src="/assets/logo_fairwins.svg"
                alt="FairWins"
                className="logo-image"
                width="48"
                height="48"
              />
            </div>
            <h2 className="brand-name">FairWins</h2>
            <p className="brand-tagline">Prediction Markets for Friends.</p>
          </div>

          {/* QR Code Section */}
          <div className="qr-section" ref={qrRef}>
            <div className="qr-code-container">
              <div className="qr-code-frame">
                <QRCodeSVG 
                  value={url}
                  size={240}
                  level="H"
                  includeMargin={false}
                  fgColor="#36B37E"
                  bgColor="transparent"
                  aria-label="QR code for market link"
                  imageSettings={{
                    src: '/assets/fairwins_no-text_logo.svg',
                    height: 48,
                    width: 48,
                    excavate: true,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Scan to Share Text */}
          <div className="scan-to-share">
            <span className="chevron-left">»</span>
            <span className="scan-text">SCAN TO SHARE</span>
            <span className="chevron-right">«</span>
          </div>

          {/* Web Share API Button */}
          <button 
            className="share-btn-primary"
            onClick={handleNativeShare}
            aria-label="Share market"
          >
            <span className="share-icon">🍀</span>
            <span className="share-btn-text">Share</span>
          </button>
        </div>

        {/* Decorative elements */}
        <div className="hex-corner hex-tl"></div>
        <div className="hex-corner hex-tr"></div>
        <div className="hex-corner hex-bl"></div>
        <div className="hex-corner hex-br"></div>
        
        <h2 id="share-modal-title" className="visually-hidden">Share Market: {market.proposalTitle}</h2>
      </div>
    </div>
  )
}

export default ShareModal
