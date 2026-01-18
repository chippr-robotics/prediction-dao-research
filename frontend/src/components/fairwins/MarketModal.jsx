import { useState, useEffect, useRef } from 'react'
import MarketDetailsPanel from './MarketDetailsPanel'
import ShareModal from '../ui/ShareModal'
import './MarketModal.css'

// Import category background images
import politicsImg from '../../assets/default/politics_0000.jpg'
import sportsImg from '../../assets/default/sports_0005.jpg'
import cryptoImg from '../../assets/default/crypto_0019.jpg'
import financeImg from '../../assets/default/finance_0014.jpg'
import techImg from '../../assets/default/tech_0030.jpg'
import popCultureImg from '../../assets/default/pop-culture_0010.jpg'
import weatherImg from '../../assets/default/weather_0024.jpg'

// Category background images mapping
const getCategoryThumbnail = (category) => {
  const thumbnails = {
    politics: politicsImg,
    sports: sportsImg,
    crypto: cryptoImg,
    finance: financeImg,
    tech: techImg,
    'pop-culture': popCultureImg,
    weather: weatherImg,
    other: financeImg
  }
  return thumbnails[category] || financeImg
}

// Format number for display (from ModernMarketCard)
const formatNumber = (num) => {
  const n = parseFloat(num)
  if (Number.isNaN(n)) return '0'
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return parseFloat(n.toFixed(0)).toString()
}

// Format time remaining
const formatTimeRemaining = (endTime) => {
  const now = new Date()
  const end = new Date(endTime)
  const diff = end - now
  
  if (diff <= 0) return 'Ended'
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  
  if (days > 30) {
    const months = Math.floor(days / 30)
    return `${months}mo`
  }
  if (days > 0) return `${days}d`
  return `${hours}h`
}

// Quick action button values for market orders
const QUICK_ACTION_AMOUNTS = [5, 25, 100, 500]

/**
 * MarketModal - Interactive modal for viewing and trading on prediction markets
 * Features:
 * - 3-panel carousel: Trading, Details, Share
 * - Swipe/tap navigation between panels
 * - Prediction gauge showing market value
 * - Binary outcome selection (YES/NO)
 * - Market and limit order types
 * - Dynamic price and reward calculations
 */
function MarketModal({ isOpen, onClose, market, onTrade, linkedMarkets = [] }) {
  const [selectedOutcome, setSelectedOutcome] = useState('YES')
  const [orderType, setOrderType] = useState('market') // 'market' or 'limit'
  const [amount, setAmount] = useState('1.00')
  const [shares, setShares] = useState('10')
  const [price, setPrice] = useState('')
  const [currentPanel, setCurrentPanel] = useState(0) // 0: Trading, 1: Details, 2: Share
  const [hasUserEditedAmount, setHasUserEditedAmount] = useState(false) // Track if user has edited the amount
  const modalRef = useRef(null)
  const touchStartX = useRef(0)
  const touchEndX = useRef(0)
  const isTouchOnButton = useRef(false)

  // Reset state when modal opens and set default values
  useEffect(() => {
    if (isOpen && market) {
      // Reset to defaults when modal opens
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedOutcome('YES')
      setOrderType('market')
      setAmount('1')
      setHasUserEditedAmount(false)
      setShares('10')
      setCurrentPanel(0) // Always start at trading panel
      // Set price to current spot price with validation
      const passPrice = parseFloat(market.passTokenPrice)
      const currentSpotPrice = !isNaN(passPrice) && passPrice > 0 ? passPrice : 0.5
      setPrice(currentSpotPrice.toFixed(2))
    }
  }, [isOpen, market])

  // Update limit price when outcome changes
  useEffect(() => {
    if (market && orderType === 'limit') {
      const passPrice = parseFloat(market.passTokenPrice)
      const failPrice = parseFloat(market.failTokenPrice)
      const currentSpotPrice = selectedOutcome === 'YES' 
        ? (!isNaN(passPrice) && passPrice > 0 ? passPrice : 0.5)
        : (!isNaN(failPrice) && failPrice > 0 ? failPrice : 0.5)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPrice(currentSpotPrice.toFixed(2))
    }
  }, [selectedOutcome, orderType, market])

  // Handle Escape key press and arrow navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'ArrowLeft') {
        setCurrentPanel((prev) => (prev - 1 + 3) % 3)
      } else if (e.key === 'ArrowRight') {
        setCurrentPanel((prev) => (prev + 1) % 3)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  // Focus management - only on initial open
  useEffect(() => {
    if (isOpen && modalRef.current && currentPanel === 0) {
      const focusableElements = modalRef.current.querySelectorAll(
        'button, [tabindex]:not([tabindex="-1"])'
      )
      if (focusableElements.length > 0) {
        focusableElements[0].focus()
      }
    }
  }, [isOpen])

  if (!isOpen || !market) return null

  // Carousel navigation
  const navigatePanel = (direction) => {
    if (direction === 'next') {
      setCurrentPanel((prev) => (prev + 1) % 3)
    } else if (direction === 'prev') {
      setCurrentPanel((prev) => (prev - 1 + 3) % 3)
    }
  }

  // Touch handlers for swipe
  const handleTouchStart = (e) => {
    // Check if touch started on a button or input element
    const target = e.target
    isTouchOnButton.current = target.tagName === 'BUTTON' || target.tagName === 'INPUT' || target.closest('button') !== null
    
    if (!isTouchOnButton.current) {
      touchStartX.current = e.touches[0].clientX
    }
  }

  const handleTouchMove = (e) => {
    if (!isTouchOnButton.current) {
      touchEndX.current = e.touches[0].clientX
    }
  }

  const handleTouchEnd = () => {
    if (isTouchOnButton.current) {
      isTouchOnButton.current = false
      return
    }
    
    const swipeThreshold = 50
    const diff = touchStartX.current - touchEndX.current

    if (Math.abs(diff) > swipeThreshold) {
      if (diff > 0) {
        // Swiped left - go to next panel
        navigatePanel('next')
      } else {
        // Swiped right - go to previous panel
        navigatePanel('prev')
      }
    }
  }

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  const yesProb = (parseFloat(market.passTokenPrice) * 100).toFixed(1)
  
  // Get user balance (TODO: Replace with actual balance from context/props)
  const userBalance = 1000.00 // USD

  // Calculate values for market order
  const currentPrice = selectedOutcome === 'YES' ? parseFloat(market.passTokenPrice) : parseFloat(market.failTokenPrice)
  const estimatedShares = amount && currentPrice > 0 ? parseFloat(amount) / currentPrice : 0
  const averagePrice = currentPrice
  const totalPayout = estimatedShares > 0 ? estimatedShares * 1.0 : 0 // Each winning share pays $1
  const reward = totalPayout - parseFloat(amount || 0)

  // Calculate values for limit order
  const SHARES_PAYOUT_VALUE = 1.0 // Each winning share pays out $1
  const totalAmount = shares && price ? parseFloat(shares) * parseFloat(price) : 0
  const limitTotalPayout = shares && price ? (parseFloat(shares) * SHARES_PAYOUT_VALUE) : 0
  const limitReward = limitTotalPayout - totalAmount

  // Validation
  const isMarketOrderValid = amount && parseFloat(amount) > 0 && parseFloat(amount) <= userBalance
  const isLimitOrderValid = totalAmount > 0 && totalAmount <= userBalance

  const handleSend = () => {
    if (orderType === 'market' && isMarketOrderValid) {
      onTrade?.({ 
        market, 
        type: selectedOutcome === 'YES' ? 'PASS' : 'FAIL', 
        orderType: 'market',
        amount: parseFloat(amount)
      })
    } else if (orderType === 'limit' && isLimitOrderValid) {
      onTrade?.({ 
        market, 
        type: selectedOutcome === 'YES' ? 'PASS' : 'FAIL', 
        orderType: 'limit',
        shares: parseFloat(shares),
        price: parseFloat(price)
      })
    }
  }

  // Format end date
  const formatEndDate = (endTime) => {
    const date = new Date(endTime)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hour = String(date.getHours()).padStart(2, '0')
    const minute = String(date.getMinutes()).padStart(2, '0')
    return `${year}.${month}.${day}.${hour}.${minute}`
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
        className="market-modal-container-new"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="market-modal-new">
          {/* Header with Navigation */}
          <div className="modal-header-new">
            <button
              className="nav-btn nav-btn-left"
              onClick={() => navigatePanel('prev')}
              aria-label="Previous panel"
            >
              ‹
            </button>
            <img 
              src="/assets/fairwins_no-text_logo.svg" 
              alt="FairWins" 
              className="modal-logo-new"
            />
            <h2 className="modal-title-new" id="market-modal-title">
              {market.proposalTitle}
            </h2>
            <button
              className="nav-btn nav-btn-right"
              onClick={() => navigatePanel('next')}
              aria-label="Next panel"
            >
              ›
            </button>
            <button 
              className="modal-close-btn-new"
              onClick={onClose}
              aria-label="Close modal"
            >
              ×
            </button>
          </div>

          {/* Carousel Wrapper */}
          <div className="carousel-wrapper">
          {/* Carousel Container */}
          <div 
            className="carousel-container"
            style={{ transform: `translateX(-${currentPanel * 100}%)` }}
          >
            {/* Panel 0: Trading */}
            <div className="carousel-panel">
          {/* Hero Image Section with Text Overlay */}
          <div 
            className="modal-hero-section"
            style={{ backgroundImage: `url(${getCategoryThumbnail(market.category)})` }}
          >
            <div className="modal-hero-overlay">
              {/* Header with category and time */}
              <div className="modal-hero-header">
                <span className={`modal-category-pill ${market.category}`}>
                  {market.category}
                </span>
                <span className="modal-resolution-date">
                  {formatTimeRemaining(market.tradingEndTime)}
                </span>
              </div>
              
              {/* Title */}
              <h3 className="modal-hero-title">{market.proposalTitle}</h3>
              
              {/* Probability display */}
              <div className="modal-probability-display">
                <span className="modal-prob-value">{yesProb}%</span>
                <span className="modal-prob-label">chance</span>
              </div>
            </div>
            
            {/* Stats Row - positioned at bottom */}
            <div className="modal-stats-row">
              <div className="modal-stat-item volume">
                <div className="modal-stat-label">Volume</div>
                <div className="modal-stat-value">
                  {market.volume24h != null ? `$${formatNumber(market.volume24h)}` : 'N/A'}
                </div>
              </div>
              <div className="modal-stat-item liquidity">
                <div className="modal-stat-label">Liquidity</div>
                <div className="modal-stat-value">${formatNumber(market.totalLiquidity)}</div>
              </div>
              <div className="modal-stat-item traders">
                <div className="modal-stat-label">Traders</div>
                <div className="modal-stat-value">
                  {market.uniqueTraders != null
                    ? formatNumber(market.uniqueTraders)
                    : market.tradesCount != null
                      ? formatNumber(market.tradesCount)
                      : 'N/A'}
                </div>
              </div>
            </div>
          </div>

          <div className="prediction-gauge-section">

            {/* Binary Outcome Selection */}
            <div className="outcome-selection">
              <button
                className={`outcome-btn ${selectedOutcome === 'YES' ? 'selected' : ''}`}
                onClick={() => setSelectedOutcome('YES')}
              >
                <span className="outcome-label">YES</span>
                <span className="outcome-prob">${parseFloat(market.passTokenPrice).toFixed(2)}</span>
              </button>
              <button
                className={`outcome-btn ${selectedOutcome === 'NO' ? 'selected' : ''}`}
                onClick={() => setSelectedOutcome('NO')}
              >
                <span className="outcome-label">NO</span>
                <span className="outcome-prob">${parseFloat(market.failTokenPrice).toFixed(2)}</span>
              </button>
            </div>
          </div>

          {/* Section 2: Orders */}
          <div className="orders-section">
            {/* Order Type Toggle */}
            <div className="order-type-toggle">
              <button
                className={`toggle-btn ${orderType === 'market' ? 'active' : ''}`}
                onClick={() => setOrderType('market')}
              >
                Market
              </button>
              <button
                className={`toggle-btn ${orderType === 'limit' ? 'active' : ''}`}
                onClick={() => setOrderType('limit')}
              >
                Limit
              </button>
            </div>

            {/* Market Order UI */}
            {orderType === 'market' && (
              <div className="order-form">
                <div className="form-group-with-buttons">
                  <div className="form-group">
                    <label htmlFor="amount-input">Risk (USD)</label>
                    <input
                      id="amount-input"
                      type="text"
                      className="form-input form-input-money"
                      placeholder="$0.00"
                      value={amount}
                      onChange={(e) => {
                        const raw = e.target.value
                        const sanitized = raw.replace(/[^0-9.]/g, '')
                        // Allow empty string so the user can clear the input
                        if (sanitized === '' || /^\d*\.?\d{0,2}$/.test(sanitized)) {
                          setAmount(sanitized)
                          setHasUserEditedAmount(true)
                        }
                      }}
                    />
                    <div className="input-hint">Balance: ${userBalance.toFixed(2)}</div>
                  </div>

                  {/* Quick action buttons */}
                  <div className="quick-actions">
                    {QUICK_ACTION_AMOUNTS.map(value => (
                      <button 
                        key={value}
                        className="quick-action-btn" 
                        onClick={() => {
                          // First press replaces the initial $1, subsequent presses add
                          if (!hasUserEditedAmount && amount === '1') {
                            setAmount(String(value))
                            setHasUserEditedAmount(true)
                          } else {
                            const currentVal = parseFloat(amount) || 0
                            const newVal = currentVal + value
                            // Ensure new value doesn't exceed balance
                            if (newVal <= userBalance) {
                              setAmount(String(newVal.toFixed(2)))
                            }
                          }
                        }}
                        type="button"
                      >
                        ${value}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="calc-display">
                  <div className="calc-row">
                    <span className="calc-label">Avg Price</span>
                    <span className="calc-value">${averagePrice.toFixed(2)}</span>
                  </div>
                  <div className="calc-row">
                    <span className="calc-label">Reward</span>
                    <span className="calc-value reward-value">${reward.toFixed(2)}</span>
                  </div>
                  <div className="calc-row">
                    <span className="calc-label">Total Payout</span>
                    <span className="calc-value total-value">${totalPayout.toFixed(2)}</span>
                  </div>
                  <div className="calc-disclaimer">
                    Amount does not include processing fees
                  </div>
                </div>
              </div>
            )}

            {/* Limit Order UI */}
            {orderType === 'limit' && (
              <div className="order-form">
                <div className="form-row form-row-top-align">
                  <div className="form-group">
                    <label htmlFor="shares-input">Shares</label>
                    <input
                      id="shares-input"
                      type="number"
                      className="form-input"
                      placeholder="##"
                      value={shares}
                      onChange={(e) => setShares(e.target.value)}
                      min="0"
                      step="1"
                    />
                  </div>
                  <span className="form-separator">@</span>
                  <div className="form-group">
                    <label htmlFor="price-input">Price</label>
                    <input
                      id="price-input"
                      type="text"
                      className="form-input"
                      placeholder="$0.00"
                      value={price}
                      onChange={(e) => {
                        // Remove anything that's not a digit or decimal point
                        const raw = e.target.value
                        const cleaned = raw.replace(/[^0-9.]/g, '')

                        // Enforce at most one decimal point by collapsing extras
                        const parts = cleaned.split('.')
                        let normalized = cleaned
                        if (parts.length > 2) {
                          const integerPart = parts.shift() || ''
                          const decimalPart = parts.join('')
                          normalized = integerPart + (decimalPart ? '.' + decimalPart : '')
                        }

                        // Allow empty string or lone "." as intermediate states while typing
                        if (normalized === '' || normalized === '.') {
                          setPrice(normalized)
                          return
                        }

                        // Ensure price is below $1
                        const numVal = parseFloat(normalized)
                        if (!isNaN(numVal) && numVal >= 1) {
                          setPrice('0.99')
                        } else if (!isNaN(numVal)) {
                          setPrice(normalized)
                        } else {
                          // If parsing fails, clear the value
                          setPrice('')
                        }
                      }}
                    />
                  </div>
                </div>

                <div className="calc-display">
                  <div className="calc-row">
                    <span className="calc-label">Total Price</span>
                    <span className="calc-value">${totalAmount.toFixed(2)}</span>
                  </div>
                  <div className="calc-row">
                    <span className="calc-label">Reward</span>
                    <span className="calc-value reward-value">${limitReward.toFixed(2)}</span>
                  </div>
                  <div className="calc-row">
                    <span className="calc-label">Total Payout</span>
                    <span className="calc-value total-value">${limitTotalPayout.toFixed(2)}</span>
                  </div>
                  <div className="calc-disclaimer">
                    Amount does not include processing fees
                  </div>
                </div>
              </div>
            )}

            {/* Send Button */}
            <button
              className="send-btn"
              onClick={handleSend}
              disabled={orderType === 'market' ? !isMarketOrderValid : !isLimitOrderValid}
            >
              Send
            </button>
          </div>

          {/* Footer */}
          <div className="modal-footer-new">
            <span className="footer-label">Ends:</span>
            <span className="footer-value">{formatEndDate(market.tradingEndTime)}</span>
          </div>
            </div>

            {/* Panel 1: Market Details */}
            <div className="carousel-panel">
              <MarketDetailsPanel market={market} linkedMarkets={linkedMarkets} />
            </div>

            {/* Panel 2: Share/QR */}
            <div className="carousel-panel">
              <div className="share-panel-wrapper">
                {currentPanel === 2 && market && (
                  <ShareModal 
                    isOpen={true}
                    onClose={() => setCurrentPanel(0)} 
                    market={market} 
                    marketUrl={`${window.location.origin}/market/${market.id}`}
                  />
                )}
              </div>
            </div>
          </div>
          
          {/* Panel Indicator */}
          <div className="panel-indicators">
            <button
              type="button"
              className={`indicator ${currentPanel === 0 ? 'active' : ''}`}
              onClick={() => setCurrentPanel(0)}
              aria-label="Go to Trading panel"
              aria-current={currentPanel === 0 ? 'true' : undefined}
            />
            <button
              type="button"
              className={`indicator ${currentPanel === 1 ? 'active' : ''}`}
              onClick={() => setCurrentPanel(1)}
              aria-label="Go to Details panel"
              aria-current={currentPanel === 1 ? 'true' : undefined}
            />
            <button
              type="button"
              className={`indicator ${currentPanel === 2 ? 'active' : ''}`}
              onClick={() => setCurrentPanel(2)}
              aria-label="Go to Share panel"
              aria-current={currentPanel === 2 ? 'true' : undefined}
            />
          </div>

          {/* Screen reader announcement for panel changes */}
          <div aria-live="polite" aria-atomic="true" className="sr-only">
            {currentPanel === 0 && 'Trading panel'}
            {currentPanel === 1 && 'Market Details panel'}
            {currentPanel === 2 && 'Share panel'}
          </div>

          </div>
        </div>
      </div>
    </div>
  )
}

export default MarketModal
