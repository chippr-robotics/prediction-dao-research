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
      
      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)))
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
        <div className="share-modal-header">
          <h2 id="share-modal-title">Share Market</h2>
          <button 
            className="share-modal-close"
            onClick={onClose}
            aria-label="Close share modal"
          >
            ×
          </button>
        </div>

        <div className="share-modal-content">
          <div className="market-preview">
            <h3>{market.proposalTitle}</h3>
            <p className="market-category">
              {market.category?.replace('-', ' ').toUpperCase()}
            </p>
          </div>

          <div className="qr-section" ref={qrRef}>
            <h3>Scan to Share</h3>
            <div className="qr-code-container">
              <QRCodeSVG 
                value={url}
                size={200}
                level="M"
                includeMargin={true}
                aria-label="QR code for market link"
              />
            </div>
            <p className="qr-hint">
              📱 Scan with your phone's camera to instantly open this market
            </p>
            <button 
              className="download-qr-btn"
              onClick={handleDownloadQR}
              aria-label="Download QR code as image"
            >
              {downloadSuccess ? '✓ Downloaded!' : '📥 Download QR Code'}
            </button>
          </div>

          <div className="share-actions">
            <h3>Share via</h3>
            <div className="share-buttons">
              <button 
                className="share-btn copy-link"
                onClick={handleCopyLink}
                aria-label="Copy market link to clipboard"
              >
                <span className="btn-icon">🔗</span>
                <span className="btn-label">{copied ? 'Copied!' : 'Copy Link'}</span>
              </button>
              
              <button 
                className="share-btn sms"
                onClick={handleShareSMS}
                aria-label="Share market via SMS"
              >
                <span className="btn-icon">💬</span>
                <span className="btn-label">SMS</span>
              </button>
              
              <button 
                className="share-btn email"
                onClick={handleShareEmail}
                aria-label="Share market via email"
              >
                <span className="btn-icon">✉️</span>
                <span className="btn-label">Email</span>
              </button>
            </div>
          </div>

          <div className="share-url">
            <label htmlFor="share-url-input">Market URL</label>
            <div className="url-input-group">
              <input 
                id="share-url-input"
                type="text" 
                value={url}
                readOnly
                aria-label="Market URL for sharing"
              />
              <button 
                onClick={handleCopyLink}
                className="copy-url-btn"
                aria-label="Copy URL"
              >
                {copied ? '✓' : '📋'}
              </button>
            </div>
          </div>

          <div className="bump-to-share-hint">
            <span className="hint-icon">✨</span>
            <p>
              <strong>Bump to Share:</strong> In person? Simply show your QR code 
              or have others scan it to instantly share this market at events!
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ShareModal
