import { usePrice } from '../../contexts/PriceContext'
import './MarketTile.css'

function MarketTile({ market, onClick, isActive = false, compact = false }) {
  const { formatPrice } = usePrice()

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
      return `${days}d ${hours}h`
    }
    return `${hours}h`
  }



  const handleClick = () => {
    if (onClick) {
      onClick(market)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleClick()
    }
  }

  return (
    <div 
      className={`market-tile ${isActive ? 'active' : ''} ${compact ? 'compact' : ''} ${market.correlationGroupId ? 'grouped' : ''}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex="0"
      aria-label={`View market: ${market.proposalTitle}`}
      aria-pressed={isActive}
    >
      <div className="tile-header">
        <div className="header-left">
          <div className="market-value">
            <span className="market-value-label">Market Value</span>
            <span className="market-value-amount">{formatPrice(market.totalLiquidity, { compact: true })}</span>
          </div>
        </div>
        <div className="header-right">
          <span className="moneyline-label">Moneyline</span>
          <div className="probability-bar">
            <div 
              className="probability-fill" 
              style={{ width: `${calculateImpliedProbability(market.passTokenPrice)}%` }}
              aria-hidden="true"
            />
          </div>
        </div>
      </div>

      {market.correlationGroupId && (
        <div className="correlation-badge" title={market.correlationGroupName}>
          <span className="correlation-icon" aria-hidden="true">🔗</span>
          <span className="correlation-text">{market.correlationGroupName}</span>
        </div>
      )}

      <h3 className="tile-title">{market.proposalTitle}</h3>

      <p className="tile-secondary">
        {formatTimeRemaining(market.tradingEndTime)} remaining
      </p>

      {!compact && (
        <button 
          className="tile-action-btn"
          onClick={(e) => {
            e.stopPropagation()
            handleClick()
          }}
          aria-label={`Trade on ${market.proposalTitle}`}
        >
          View Market
        </button>
      )}
    </div>
  )
}

export default MarketTile
