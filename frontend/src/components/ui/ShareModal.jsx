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

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div 
      className="share-modal-backdrop" 
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
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
              <svg className="clover-icon" width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M24 24C24 19.5817 27.5817 16 32 16C36.4183 16 40 19.5817 40 24C40 28.4183 36.4183 32 32 32C27.5817 32 24 28.4183 24 24Z" fill="currentColor" opacity="0.9"/>
                <path d="M24 24C24 19.5817 20.4183 16 16 16C11.5817 16 8 19.5817 8 24C8 28.4183 11.5817 32 16 32C20.4183 32 24 28.4183 24 24Z" fill="currentColor" opacity="0.9"/>
                <path d="M24 24C24 28.4183 27.5817 32 32 32C36.4183 32 40 28.4183 40 24C40 19.5817 36.4183 16 32 16C27.5817 16 24 19.5817 24 24Z" fill="currentColor" opacity="0.9"/>
                <path d="M24 24C24 28.4183 20.4183 32 16 32C11.5817 32 8 28.4183 8 24C8 19.5817 11.5817 16 16 16C20.4183 16 24 19.5817 24 24Z" fill="currentColor" opacity="0.9"/>
                <circle cx="24" cy="24" r="3" fill="currentColor"/>
              </svg>
              <span className="brand-name">FAIRWINS</span>
            </div>
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
                  fgColor="#5eead4"
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

          {/* Progress dots */}
          <div className="progress-dots">
            <span className="dot active"></span>
            <span className="dot"></span>
            <span className="dot"></span>
            <span className="dot"></span>
            <span className="dot"></span>
          </div>

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
