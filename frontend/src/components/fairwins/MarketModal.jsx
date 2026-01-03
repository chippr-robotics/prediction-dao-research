import { useState, useEffect, useRef } from 'react'
import { usePrice } from '../../contexts/PriceContext'
import MarketDetailsPanel from './MarketDetailsPanel'
import ShareModal from '../ui/ShareModal'
import './MarketModal.css'

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
function MarketModal({ isOpen, onClose, market, onTrade }) {
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
  const { formatPrice } = usePrice()

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

          {/* Carousel Wrapper */}
          <div className="carousel-wrapper">
          {/* Carousel Container */}
          <div 
            className="carousel-container"
            style={{ transform: `translateX(-${currentPanel * 100}%)` }}
          >
            {/* Panel 0: Trading */}
            <div className="carousel-panel">
          <div className="prediction-gauge-section">
            {/* Gauge visualization */}
            <div className="gauge-container">
              <svg className="gauge-svg" viewBox="0 0 200 120">
                {/* Glow filter */}
                <defs>
                  <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                    <feMerge>
                      <feMergeNode in="coloredBlur"/>
                      <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                  </filter>
                </defs>
                {/* Background arc */}
                <path
                  d="M 20 100 A 80 80 0 0 1 180 100"
                  fill="none"
                  stroke="#2d3e50"
                  strokeWidth="20"
                />
                {/* YES (green) arc with glow */}
                <path
                  d="M 20 100 A 80 80 0 0 1 180 100"
                  fill="none"
                  stroke="#36B37E"
                  strokeWidth="20"
                  strokeDasharray={`${yesProb * 2.51} ${100 * 2.51}`}
                  filter="url(#glow)"
                />
                {/* Indicator */}
                <circle cx="100" cy="100" r="4" fill="#fff" />
                <text x="100" y="90" textAnchor="middle" fill="#fff" fontSize="24" fontWeight="bold">
                  {yesProb}%
                </text>
              </svg>
            </div>

            {/* Voting Timeline Mini Chart */}
            <div className="voting-timeline-chart">
              <svg className="voting-timeline-svg" viewBox="0 0 200 40" preserveAspectRatio="none">
                {/* Grid lines */}
                {[0, 25, 50, 75, 100].map((x) => (
                  <line key={x} x1={x * 2} y1="0" x2={x * 2} y2="40" className="timeline-grid-line" />
                ))}
                {/* YES trend area */}
                <path
                  className="timeline-yes-area"
                  d={`M 0 ${40 - yesProb * 0.35} 
                      Q 50 ${40 - (yesProb - 5) * 0.35}, 100 ${40 - (yesProb + 3) * 0.35}
                      T 200 ${40 - yesProb * 0.35}
                      L 200 40 L 0 40 Z`}
                />
                {/* YES trend line */}
                <path
                  className="timeline-yes-line"
                  d={`M 0 ${40 - yesProb * 0.35} 
                      Q 50 ${40 - (yesProb - 5) * 0.35}, 100 ${40 - (yesProb + 3) * 0.35}
                      T 200 ${40 - yesProb * 0.35}`}
                />
              </svg>
            </div>

            {/* Price and Market Value Display */}
            <div className="market-info-display">
              <div className="info-item">
                <span className="info-label">Market Value</span>
                <span className="info-value">{formatPrice(market.totalLiquidity, { compact: true })}</span>
              </div>
            </div>

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
              <MarketDetailsPanel market={market} />
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
          </div>
        </div>
      </div>
    </div>
  )
}

export default MarketModal
