import { useParams, useNavigate } from 'react-router-dom'
import { useEffect, useState, useCallback } from 'react'
import { getMockMarkets } from '../utils/mockDataLoader'
import MarketDetailsPanel from '../components/fairwins/MarketDetailsPanel'
import ShareModal from '../components/ui/ShareModal'
import { usePrice } from '../contexts/PriceContext'
import './MarketPage.css'

// Quick action button values for market orders
const QUICK_ACTION_AMOUNTS = [5, 25, 100, 500]

/**
 * MarketPage - Full page view for viewing and trading on prediction markets
 */
function MarketPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [market, setMarket] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedOutcome, setSelectedOutcome] = useState('YES')
  const [orderType, setOrderType] = useState('market')
  const [amount, setAmount] = useState('1.00')
  const [shares, setShares] = useState('10')
  const [price, setPrice] = useState('')
  const [currentPanel, setCurrentPanel] = useState(0)
  const [hasUserEditedAmount, setHasUserEditedAmount] = useState(false)
  const { formatPrice } = usePrice()

  // Load market data
  useEffect(() => {
    const loadMarket = async () => {
      try {
        setLoading(true)
        const markets = getMockMarkets()
        const foundMarket = markets.find(m => m.id === parseInt(id))
        
        if (!foundMarket) {
          navigate('/app')
          return
        }
        
        setMarket(foundMarket)
        setSelectedOutcome('YES')
        setOrderType('market')
        setAmount('1')
        setHasUserEditedAmount(false)
        setShares('10')
        setCurrentPanel(0)
        
        const passPrice = parseFloat(foundMarket.passTokenPrice)
        const currentSpotPrice = !isNaN(passPrice) && passPrice > 0 ? passPrice : 0.5
        setPrice(currentSpotPrice.toFixed(2))
        
        setLoading(false)
      } catch (error) {
        console.error('Error loading market:', error)
        setLoading(false)
        navigate('/app')
      }
    }
    
    loadMarket()
  }, [id, navigate])

  // Update limit price when outcome changes
  useEffect(() => {
    if (market && orderType === 'limit') {
      const passPrice = parseFloat(market.passTokenPrice)
      const failPrice = parseFloat(market.failTokenPrice)
      const currentSpotPrice = selectedOutcome === 'YES' 
        ? (!isNaN(passPrice) && passPrice > 0 ? passPrice : 0.5)
        : (!isNaN(failPrice) && failPrice > 0 ? failPrice : 0.5)
      setPrice(currentSpotPrice.toFixed(2))
    }
  }, [selectedOutcome, orderType, market])

  const handleTrade = useCallback((tradeData) => {
    alert(`Trading functionality requires deployed contracts.

Trade Details:
- Market: ${tradeData.market.proposalTitle}
- Type: ${tradeData.type}
- Amount: ${tradeData.amount || tradeData.shares + ' shares @ $' + tradeData.price} ETC

This is a transparent market - all trades are publicly visible on the blockchain.`)
  }, [])

  const handleClose = useCallback(() => {
    navigate(-1)
  }, [navigate])

  if (loading) {
    return (
      <div className="market-modal-backdrop">
        <div className="market-modal-container-new">
          <div className="loading-spinner"></div>
          <p>Loading market...</p>
        </div>
      </div>
    )
  }

  if (!market) {
    return null
  }

  const yesProb = (parseFloat(market.passTokenPrice) * 100).toFixed(1)
  const userBalance = 1000.00
  const currentPrice = selectedOutcome === 'YES' ? parseFloat(market.passTokenPrice) : parseFloat(market.failTokenPrice)
  const estimatedShares = amount && currentPrice > 0 ? parseFloat(amount) / currentPrice : 0
  const averagePrice = currentPrice
  const totalPayout = estimatedShares > 0 ? estimatedShares * 1.0 : 0
  const reward = totalPayout - parseFloat(amount || 0)
  const SHARES_PAYOUT_VALUE = 1.0
  const totalAmount = shares && price ? parseFloat(shares) * parseFloat(price) : 0
  const limitTotalPayout = shares && price ? (parseFloat(shares) * SHARES_PAYOUT_VALUE) : 0
  const limitReward = limitTotalPayout - totalAmount
  const isMarketOrderValid = amount && parseFloat(amount) > 0 && parseFloat(amount) <= userBalance
  const isLimitOrderValid = totalAmount > 0 && totalAmount <= userBalance

  const handleSend = () => {
    if (orderType === 'market' && isMarketOrderValid) {
      handleTrade({ 
        market, 
        type: selectedOutcome === 'YES' ? 'PASS' : 'FAIL', 
        orderType: 'market',
        amount: parseFloat(amount)
      })
    } else if (orderType === 'limit' && isLimitOrderValid) {
      handleTrade({ 
        market, 
        type: selectedOutcome === 'YES' ? 'PASS' : 'FAIL', 
        orderType: 'limit',
        shares: parseFloat(shares),
        price: parseFloat(price)
      })
    }
  }

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
    <div className="market-page-backdrop">
      <div className="market-page-container-new">
        <div className="market-page-new">
          <div className="page-header-new">
            <button
              className="nav-btn nav-btn-left"
              onClick={() => setCurrentPanel((prev) => (prev - 1 + 3) % 3)}
              aria-label="Previous panel"
            >
              ‹
            </button>
            <img 
              src="/assets/fairwins_no-text_logo.svg" 
              alt="FairWins" 
              className="page-logo-new"
            />
            <h2 className="page-title-new">{market.proposalTitle}</h2>
            <button
              className="nav-btn nav-btn-right"
              onClick={() => setCurrentPanel((prev) => (prev + 1) % 3)}
              aria-label="Next panel"
            >
              ›
            </button>
            <button 
              className="page-close-btn-new"
              onClick={handleClose}
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <div className="panel-indicators">
            <button
              type="button"
              className={`indicator ${currentPanel === 0 ? 'active' : ''}`}
              onClick={() => setCurrentPanel(0)}
              aria-label="Go to Trading panel"
            />
            <button
              type="button"
              className={`indicator ${currentPanel === 1 ? 'active' : ''}`}
              onClick={() => setCurrentPanel(1)}
              aria-label="Go to Details panel"
            />
            <button
              type="button"
              className={`indicator ${currentPanel === 2 ? 'active' : ''}`}
              onClick={() => setCurrentPanel(2)}
              aria-label="Go to Share panel"
            />
          </div>

          <div className="carousel-wrapper">
            <div 
              className="carousel-container"
              style={{ transform: `translateX(-${currentPanel * 100}%)` }}
            >
              <div className="carousel-panel">
                <div className="prediction-gauge-section">
                  <div className="gauge-container">
                    <svg className="gauge-svg" viewBox="0 0 200 120">
                      <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#2d3e50" strokeWidth="20" />
                      <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#36B37E" strokeWidth="20" strokeDasharray={`${yesProb * 2.51} ${100 * 2.51}`} />
                      <circle cx="100" cy="100" r="4" fill="#fff" />
                      <text x="100" y="90" textAnchor="middle" fill="#fff" fontSize="24" fontWeight="bold">{yesProb}%</text>
                    </svg>
                  </div>
                  <div className="market-info-display">
                    <div className="info-item">
                      <span className="info-label">Market Value</span>
                      <span className="info-value">{formatPrice(market.totalLiquidity, { compact: true })}</span>
                    </div>
                  </div>
                  <div className="outcome-selection">
                    <button className={`outcome-btn ${selectedOutcome === 'YES' ? 'selected' : ''}`} onClick={() => setSelectedOutcome('YES')}>
                      <span className="outcome-label">YES</span>
                      <span className="outcome-prob">${parseFloat(market.passTokenPrice).toFixed(2)}</span>
                    </button>
                    <button className={`outcome-btn ${selectedOutcome === 'NO' ? 'selected' : ''}`} onClick={() => setSelectedOutcome('NO')}>
                      <span className="outcome-label">NO</span>
                      <span className="outcome-prob">${parseFloat(market.failTokenPrice).toFixed(2)}</span>
                    </button>
                  </div>
                </div>

                <div className="orders-section">
                  <div className="order-type-toggle">
                    <button className={`toggle-btn ${orderType === 'market' ? 'active' : ''}`} onClick={() => setOrderType('market')}>Market</button>
                    <button className={`toggle-btn ${orderType === 'limit' ? 'active' : ''}`} onClick={() => setOrderType('limit')}>Limit</button>
                  </div>

                  {orderType === 'market' && (
                    <div className="order-form">
                      <div className="form-group-with-buttons">
                        <div className="form-group">
                          <label htmlFor="amount-input">Risk (USD)</label>
                          <input id="amount-input" type="text" className="form-input form-input-money" placeholder="$0.00" value={amount}
                            onChange={(e) => {
                              const raw = e.target.value
                              const sanitized = raw.replace(/[^0-9.]/g, '')
                              if (sanitized === '' || /^\d*\.?\d{0,2}$/.test(sanitized)) {
                                setAmount(sanitized)
                                setHasUserEditedAmount(true)
                              }
                            }} />
                          <div className="input-hint">Balance: ${userBalance.toFixed(2)}</div>
                        </div>
                        <div className="quick-actions">
                          {QUICK_ACTION_AMOUNTS.map(value => (
                            <button key={value} className="quick-action-btn" 
                              onClick={() => {
                                if (!hasUserEditedAmount && amount === '1') {
                                  setAmount(String(value))
                                  setHasUserEditedAmount(true)
                                } else {
                                  const currentVal = parseFloat(amount) || 0
                                  const newVal = currentVal + value
                                  if (newVal <= userBalance) {
                                    setAmount(String(newVal.toFixed(2)))
                                  }
                                }
                              }} type="button">${value}</button>
                          ))}
                        </div>
                      </div>
                      <div className="calc-display">
                        <div className="calc-row"><span className="calc-label">Avg Price</span><span className="calc-value">${averagePrice.toFixed(2)}</span></div>
                        <div className="calc-row"><span className="calc-label">Reward</span><span className="calc-value reward-value">${reward.toFixed(2)}</span></div>
                        <div className="calc-row"><span className="calc-label">Total Payout</span><span className="calc-value total-value">${totalPayout.toFixed(2)}</span></div>
                        <div className="calc-disclaimer">Amount does not include processing fees</div>
                      </div>
                    </div>
                  )}

                  {orderType === 'limit' && (
                    <div className="order-form">
                      <div className="form-row form-row-top-align">
                        <div className="form-group">
                          <label htmlFor="shares-input">Shares</label>
                          <input id="shares-input" type="number" className="form-input" placeholder="##" value={shares} onChange={(e) => setShares(e.target.value)} min="0" step="1" />
                        </div>
                        <span className="form-separator">@</span>
                        <div className="form-group">
                          <label htmlFor="price-input">Price</label>
                          <input id="price-input" type="text" className="form-input" placeholder="$0.00" value={price}
                            onChange={(e) => {
                              const raw = e.target.value
                              const cleaned = raw.replace(/[^0-9.]/g, '')
                              const parts = cleaned.split('.')
                              let normalized = cleaned
                              if (parts.length > 2) {
                                const integerPart = parts.shift() || ''
                                const decimalPart = parts.join('')
                                normalized = integerPart + (decimalPart ? '.' + decimalPart : '')
                              }
                              if (normalized === '' || normalized === '.') {
                                setPrice(normalized)
                                return
                              }
                              const numVal = parseFloat(normalized)
                              if (!isNaN(numVal) && numVal >= 1) {
                                setPrice('0.99')
                              } else if (!isNaN(numVal)) {
                                setPrice(normalized)
                              } else {
                                setPrice('')
                              }
                            }} />
                        </div>
                      </div>
                      <div className="calc-display">
                        <div className="calc-row"><span className="calc-label">Total Price</span><span className="calc-value">${totalAmount.toFixed(2)}</span></div>
                        <div className="calc-row"><span className="calc-label">Reward</span><span className="calc-value reward-value">${limitReward.toFixed(2)}</span></div>
                        <div className="calc-row"><span className="calc-label">Total Payout</span><span className="calc-value total-value">${limitTotalPayout.toFixed(2)}</span></div>
                        <div className="calc-disclaimer">Amount does not include processing fees</div>
                      </div>
                    </div>
                  )}

                  <button className="send-btn" onClick={handleSend} disabled={orderType === 'market' ? !isMarketOrderValid : !isLimitOrderValid}>Send</button>
                </div>

                <div className="page-footer-new">
                  <span className="footer-label">Ends:</span>
                  <span className="footer-value">{formatEndDate(market.tradingEndTime)}</span>
                </div>
              </div>

              <div className="carousel-panel">
                <MarketDetailsPanel market={market} />
              </div>

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

export default MarketPage
