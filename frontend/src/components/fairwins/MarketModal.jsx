import { useState, useEffect, useRef } from 'react'
import { usePrice } from '../../contexts/PriceContext'
import { useTheme } from '../../hooks/useTheme'
import './MarketModal.css'

// Quick action button values for market orders
const QUICK_ACTION_AMOUNTS = [5, 25, 100, 500]

/**
 * MarketModal - Interactive modal for viewing and trading on prediction markets
 * Features:
 * - Prediction gauge showing market value
 * - Binary outcome selection (YES/NO)
 * - Market and limit order types
 * - Dynamic price and reward calculations
 * - All elements visible without scrolling
 */
function MarketModal({ isOpen, onClose, market, onTrade }) {
  const [selectedOutcome, setSelectedOutcome] = useState('YES')
  const [orderType, setOrderType] = useState('market') // 'market' or 'limit'
  const [amount, setAmount] = useState('1.00')
  const [shares, setShares] = useState('10')
  const [price, setPrice] = useState('')
  const modalRef = useRef(null)
  const { formatPrice } = usePrice()
  const { isDark } = useTheme()

  // Reset state when modal opens and set default values
  useEffect(() => {
    if (isOpen && market) {
      // Reset to defaults when modal opens
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedOutcome('YES')
      setOrderType('market')
      setAmount('1.00')
      setShares('10')
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
      >
        <div className="market-modal-new">
          {/* Header */}
          <div className="modal-header-new">
            <img 
              src="/assets/fairwins_no-text_logo.svg" 
              alt="FairWins" 
              className="modal-logo-new"
            />
            <h2 className="modal-title-new" id="market-modal-title">
              {market.proposalTitle}
            </h2>
            <button 
              className="modal-close-btn-new"
              onClick={onClose}
              aria-label="Close modal"
            >
              ×
            </button>
          </div>

          {/* Section 1: Prediction Gauge */}
          <div className="prediction-gauge-section">
            {/* Gauge visualization */}
            <div className="gauge-container">
              <svg className="gauge-svg" viewBox="0 0 200 120">
                {/* Background arc */}
                <path
                  d="M 20 100 A 80 80 0 0 1 180 100"
                  fill="none"
                  stroke="#2d3e50"
                  strokeWidth="20"
                />
                {/* YES (green) arc */}
                <path
                  d="M 20 100 A 80 80 0 0 1 180 100"
                  fill="none"
                  stroke="#36B37E"
                  strokeWidth="20"
                  strokeDasharray={`${yesProb * 2.51} ${100 * 2.51}`}
                />
                {/* Indicator */}
                <circle cx="100" cy="100" r="4" fill="#fff" />
                <text x="100" y="90" textAnchor="middle" fill="#fff" fontSize="24" fontWeight="bold">
                  {yesProb}%
                </text>
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
                        const val = e.target.value.replace(/[^0-9.]/g, '')
                        setAmount(val)
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
                          const currentVal = parseFloat(amount) || 0
                          setAmount(String((currentVal + value).toFixed(2)))
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
                        const val = e.target.value.replace(/[^0-9.]/g, '')
                        // Ensure price is below $1
                        const numVal = parseFloat(val)
                        if (!isNaN(numVal) && numVal >= 1) {
                          setPrice('0.99')
                        } else {
                          setPrice(val)
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
      </div>
    </div>
  )
}

export default MarketModal
