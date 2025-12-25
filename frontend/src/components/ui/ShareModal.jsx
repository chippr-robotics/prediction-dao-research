import { useState, useRef, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import './ShareModal.css'

function ShareModal({ isOpen, onClose, market, marketUrl }) {
  const [copied, setCopied] = useState(false)
  const [downloadSuccess, setDownloadSuccess] = useState(false)
  const qrRef = useRef(null)

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

  if (!isOpen || !market) return null

  const url = marketUrl || `${window.location.origin}/market/${market.id}`
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

  const handleDownloadQR = () => {
    try {
      const svg = qrRef.current.querySelector('svg')
      const svgData = new XMLSerializer().serializeToString(svg)
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      const img = new Image()
      
      img.onload = () => {
        canvas.width = img.width
        canvas.height = img.height
        ctx.fillStyle = 'white'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0)
        
        canvas.toBlob((blob) => {
          const url = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = url
          link.download = `market-${market.id}-qr.png`
          link.click()
          URL.revokeObjectURL(url)
          setDownloadSuccess(true)
          setTimeout(() => setDownloadSuccess(false), 2000)
        })
      }
      
      img.src = 'data:image/svg+xml;base64,' + btoa(decodeURIComponent(encodeURIComponent(svgData)))
    } catch (err) {
      console.error('Failed to download QR code:', err)
    }
  }

  const handleShareSMS = () => {
    const smsUrl = `sms:?body=${encodeURIComponent(`${shareText}\n${url}`)}`
    window.location.href = smsUrl
  }

  const handleShareEmail = () => {
    const subject = encodeURIComponent(market.proposalTitle)
    const body = encodeURIComponent(`${shareText}\n\n${url}`)
    const emailUrl = `mailto:?subject=${subject}&body=${body}`
    window.location.href = emailUrl
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
                src="/logo_fairwins.svg" 
                alt="FairWins" 
                className="logo-image"
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
                    src: '/logo_fairwins.svg',
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
            <span className="share-icon">📤</span>
            <span className="share-btn-text">Share</span>
          </button>

          {/* Hidden action buttons - accessible but minimal */}
          <div className="share-actions-minimal">
            <button 
              className="action-btn"
              onClick={handleDownloadQR}
              aria-label="Download QR code"
              title="Download QR Code"
            >
              {downloadSuccess ? '✓' : '⬇'}
            </button>
            <button 
              className="action-btn"
              onClick={handleCopyLink}
              aria-label="Copy link"
              title="Copy Link"
            >
              {copied ? '✓' : '🔗'}
            </button>
            <button 
              className="action-btn"
              onClick={handleShareSMS}
              aria-label="Share via SMS"
              title="Share via SMS"
            >
              💬
            </button>
            <button 
              className="action-btn"
              onClick={handleShareEmail}
              aria-label="Share via email"
              title="Share via Email"
            >
              ✉
            </button>
          </div>
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
