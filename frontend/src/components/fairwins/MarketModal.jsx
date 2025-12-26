import { useState, useEffect, useRef } from 'react'
import { usePrice } from '../../contexts/PriceContext'
import { QRCodeSVG } from 'qrcode.react'
import './MarketModal.css'

/**
 * MarketModal - Interactive modal for viewing and trading on prediction markets
 * Features:
 * - Front view: Market details with YES/NO trading options
 * - Back view: QR code sharing (using ShareModal)
 * - Flip animation between front and back
 * - Comprehensive market information display
 */
function MarketModal({ isOpen, onClose, market, onTrade }) {
  const [isFlipped, setIsFlipped] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const modalRef = useRef(null)
  const { formatPrice } = usePrice()

  // Reset flip state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setIsFlipped(false)
      setShowShareModal(false)
    }
  }, [isOpen])

  // Handle Escape key press
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (isFlipped) {
          setIsFlipped(false)
        } else {
          onClose()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, isFlipped, onClose])

  // Focus management
  useEffect(() => {
    if (isOpen && modalRef.current) {
      const focusableElements = modalRef.current.querySelectorAll(
        'button, [tabindex]:not([tabindex="-1"])'
      )
      if (focusableElements.length > 0) {
        focusableElements[0].focus()
      }
    }
  }, [isOpen])

  if (!isOpen || !market) return null

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  const handleFlip = () => {
    setIsFlipped(!isFlipped)
  }

  const handleTrade = (type) => {
    if (onTrade) {
      onTrade({ market, type, amount: '100' })
    }
  }

  const yesProb = (parseFloat(market.passTokenPrice) * 100).toFixed(1)
  const noProb = (parseFloat(market.failTokenPrice) * 100).toFixed(1)
  const totalVolume = formatPrice(market.totalLiquidity, { compact: true })

  const formatTimeRemaining = (endTime) => {
    const now = new Date()
    const end = new Date(endTime)
    const diff = end - now
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    
    if (days > 0) {
      return `${days}d ${hours}h`
    }
    return `${hours}h`
  }

  return (
    <div 
      className="market-modal-backdrop" 
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="market-modal-title"
    >
      <div 
        ref={modalRef}
        className={`market-modal-container ${isFlipped ? 'flipped' : ''}`}
      >
        {/* Front View - Market Details and Trading */}
        <div className="market-modal-front">
          <div className="market-modal">
            {/* Header with close and flip buttons */}
            <div className="market-modal-header">
              <button 
                className="modal-icon-btn flip-btn"
                onClick={handleFlip}
                aria-label="Flip to view share options"
                title="View QR Code"
              >
                🔄
              </button>
              <button 
                className="modal-icon-btn close-btn"
                onClick={onClose}
                aria-label="Close modal"
              >
                ×
              </button>
            </div>

            {/* Branding Section */}
            <div className="modal-brand-section">
              <div className="modal-brand-logo">
                <img 
                  src="/logo_fairwins.svg" 
                  alt="FairWins" 
                  className="modal-logo-image"
                />
              </div>
              <h2 className="modal-brand-name">FAIRWINS</h2>
              <p className="modal-brand-tagline">Prediction Markets for Friends.</p>
            </div>

            {/* Market Question */}
            <div className="modal-market-question">
              <h3 id="market-modal-title">{market.proposalTitle}</h3>
              {market.description && (
                <p className="market-description">{market.description}</p>
              )}
            </div>

            {/* Trading Options */}
            <div className="modal-trading-options">
              <button 
                className="trade-option-btn yes-btn"
                onClick={() => handleTrade('PASS')}
              >
                <div className="option-content">
                  <span className="option-label">YES</span>
                  <span className="option-arrow">↑</span>
                </div>
                <div className="option-stats">
                  <span className="option-percentage">{yesProb}%</span>
                  <span className="option-amount">{formatPrice(parseFloat(market.totalLiquidity) * parseFloat(market.passTokenPrice), { compact: true })}</span>
                </div>
              </button>

              <button 
                className="trade-option-btn no-btn"
                onClick={() => handleTrade('FAIL')}
              >
                <div className="option-content">
                  <span className="option-label">NO</span>
                  <span className="option-arrow">↓</span>
                </div>
                <div className="option-stats">
                  <span className="option-percentage">{noProb}%</span>
                  <span className="option-amount">{formatPrice(parseFloat(market.totalLiquidity) * parseFloat(market.failTokenPrice), { compact: true })}</span>
                </div>
              </button>
            </div>

            {/* Market Metrics */}
            <div className="modal-market-metrics">
              <div className="metric-item">
                <span className="metric-label">Total Volume:</span>
                <span className="metric-value">{totalVolume}</span>
              </div>
              <div className="metric-item">
                <span className="metric-label">Ends:</span>
                <span className="metric-value">{formatTimeRemaining(market.tradingEndTime)}</span>
              </div>
            </div>

            {/* Alert/Info Section */}
            <div className="modal-info-section">
              <div className="info-badge">
                <span className="info-icon">ℹ️</span>
                <span className="info-text">Trade to predict the outcome</span>
              </div>
            </div>
          </div>
        </div>

        {/* Back View - Share QR Code */}
        <div className="market-modal-back">
          <div className="market-modal back-card">
            {/* Header with flip back button */}
            <div className="market-modal-header">
              <button 
                className="modal-icon-btn flip-btn"
                onClick={handleFlip}
                aria-label="Flip back to market details"
                title="Back to Market"
              >
                🔄
              </button>
              <button 
                className="modal-icon-btn close-btn"
                onClick={onClose}
                aria-label="Close modal"
              >
                ×
              </button>
            </div>

            {/* Share QR Code Section */}
            <div className="embedded-share-content">
              {/* Branding Section */}
              <div className="modal-brand-section">
                <div className="modal-brand-logo">
                  <img 
                    src="/logo_fairwins.svg" 
                    alt="FairWins" 
                    className="modal-logo-image"
                  />
                </div>
                <h2 className="modal-brand-name">FAIRWINS</h2>
                <p className="modal-brand-tagline">Prediction Markets for Friends.</p>
              </div>

              {/* QR Code Display */}
              <div className="qr-code-display">
                <div className="qr-code-frame">
                  <QRCodeSVG 
                    value={`${window.location.origin}/market/${market.id}`}
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

              {/* Scan to Share Text */}
              <div className="scan-instruction">
                <span className="scan-chevron">»</span>
                <span className="scan-label">SCAN TO SHARE</span>
                <span className="scan-chevron">«</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default MarketModal
