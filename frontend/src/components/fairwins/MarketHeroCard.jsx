import { useState } from 'react'
import { usePrice } from '../../contexts/PriceContext'
import CurrencyToggle from '../ui/CurrencyToggle'
import ShareModal from '../ui/ShareModal'
import './MarketHeroCard.css'

function MarketHeroCard({ market, onTrade }) {
  const [tradeAmount, setTradeAmount] = useState('')
  const [tradeType, setTradeType] = useState('PASS')
  const [showShareModal, setShowShareModal] = useState(false)
  const { formatPrice } = usePrice()

  if (!market) {
    return null
  }

  const calculateImpliedProbability = (passPrice) => {
    return (parseFloat(passPrice) * 100).toFixed(1)
  }

  const formatTimeRemaining = (endTime) => {
    const now = new Date()
    const end = new Date(endTime)
    const diff = end - now
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    
    if (days > 0) {
      return `${days} days, ${hours} hours`
    }
    return `${hours} hours`
  }

  const getCategoryIcon = (category) => {
    const icons = {
      'politics': '🏛️',
      'sports': '⚽',
      'finance': '💰',
      'tech': '💻',
      'pop-culture': '🎬',
      'crypto': '₿',
      'new': '✨',
      'daos': '🏢',
      'other': '📊'
    }
    return icons[category] || '📊'
  }

  const handleTradeSubmit = (e) => {
    e.preventDefault()
    if (onTrade) {
      onTrade({
        market,
        amount: tradeAmount,
        type: tradeType
      })
    }
  }

  const yesProb = calculateImpliedProbability(market.passTokenPrice)
  const noProb = calculateImpliedProbability(market.failTokenPrice)

  return (
    <div className="market-hero-card">
      <div className="hero-header">
        <div className="hero-category">
          <span className="hero-category-icon" aria-hidden="true">
            {getCategoryIcon(market.category)}
          </span>
          <span className="hero-category-name">
            {market.category.replace('-', ' ').toUpperCase()}
          </span>
        </div>
        <div className="hero-actions">
          <CurrencyToggle />
          <button 
            className="hero-action-btn share" 
            aria-label="Share market"
            onClick={() => setShowShareModal(true)}
          >
            <span aria-hidden="true">🔗</span> Share
          </button>
        </div>
      </div>

      <h1 className="hero-title">{market.proposalTitle}</h1>

      {market.description && (
        <p className="hero-description">{market.description}</p>
      )}

      <div className="hero-stats-grid">
        <div className="stat-card primary">
          <span className="stat-label">Current Probability</span>
          <div className="stat-values">
            <div className="stat-value yes">
              <span className="value-label">YES</span>
              <span className="value-number">{yesProb}%</span>
            </div>
            <div className="stat-value no">
              <span className="value-label">NO</span>
              <span className="value-number">{noProb}%</span>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <span className="stat-label">Total Volume</span>
          <span className="stat-number">{formatPrice(market.totalLiquidity, { compact: true })}</span>
        </div>

        <div className="stat-card">
          <span className="stat-label">24h Change</span>
          <span className="stat-number change-positive">+2.3%</span>
        </div>

        <div className="stat-card">
          <span className="stat-label">Total Trades</span>
          <span className="stat-number">{Math.floor(Math.random() * 1000) + 100}</span>
        </div>
      </div>

      <div className="hero-info-row">
        <div className="info-item">
          <span className="info-label">Market closes in:</span>
          <span className="info-value">{formatTimeRemaining(market.tradingEndTime)}</span>
        </div>
        <div className="info-item">
          <span className="info-label">Status:</span>
          <span className="info-value status">{market.status || 'Active'}</span>
        </div>
      </div>

      <div className="hero-trade-panel">
        <h3>Trade on this market</h3>
        <form onSubmit={handleTradeSubmit}>
          <div className="trade-type-selector">
            <button
              type="button"
              className={`trade-type-btn buy ${tradeType === 'PASS' ? 'active' : ''}`}
              onClick={() => setTradeType('PASS')}
              aria-pressed={tradeType === 'PASS'}
            >
              <span className="btn-icon">↑</span>
              <div className="btn-content">
                <span className="btn-label">Buy</span>
                <span className="btn-price">${(parseFloat(market.passTokenPrice) * 1).toFixed(2)}</span>
              </div>
            </button>
            <button
              type="button"
              className={`trade-type-btn sell ${tradeType === 'FAIL' ? 'active' : ''}`}
              onClick={() => setTradeType('FAIL')}
              aria-pressed={tradeType === 'FAIL'}
            >
              <span className="btn-icon">↓</span>
              <div className="btn-content">
                <span className="btn-label">Sell</span>
                <span className="btn-price">${(parseFloat(market.failTokenPrice) * 1).toFixed(2)}</span>
              </div>
            </button>
          </div>

          <div className="trade-input-group">
            <label htmlFor="hero-trade-amount">Amount (USD)</label>
            <input
              type="number"
              id="hero-trade-amount"
              value={tradeAmount}
              onChange={(e) => setTradeAmount(e.target.value)}
              placeholder="Enter amount"
              step="0.01"
              min="0"
              required
            />
            {tradeAmount && (
              <div className="potential-win-display">
                <span className="win-label">Potential win:</span>
                <span className="win-amount">
                  ${(parseFloat(tradeAmount) * (1 / (tradeType === 'PASS' ? parseFloat(market.passTokenPrice) : parseFloat(market.failTokenPrice)))).toFixed(2)}
                </span>
              </div>
            )}
          </div>

          <button type="submit" className="trade-submit-btn">
            Execute Trade
          </button>

          <div className="transparency-notice">
            <span aria-hidden="true">👁️</span>
            <span>Transparent market - all trades are publicly visible on the blockchain</span>
          </div>
        </form>
      </div>

      <ShareModal 
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        market={market}
      />
    </div>
  )
}

export default MarketHeroCard
