import './MarketTile.css'

function MarketTile({ market, onClick, isActive = false, compact = false }) {
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

  const formatLiquidity = (liquidity) => {
    const num = parseFloat(liquidity)
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`
    }
    return num.toFixed(0)
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

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'active':
        return '#22c55e'
      case 'pending':
        return '#f59e0b'
      case 'settled':
        return '#6b7280'
      default:
        return '#3b82f6'
    }
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
      className={`market-tile ${isActive ? 'active' : ''} ${compact ? 'compact' : ''}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex="0"
      aria-label={`View market: ${market.proposalTitle}`}
      aria-pressed={isActive}
    >
      <div className="tile-header">
        <span className="category-badge" aria-hidden="true">
          {getCategoryIcon(market.category)}
        </span>
        <span 
          className="status-badge" 
          style={{ backgroundColor: getStatusColor(market.status) }}
          aria-label={`Status: ${market.status || 'Active'}`}
        >
          {market.status || 'Active'}
        </span>
      </div>

      <h3 className="tile-title">{market.proposalTitle}</h3>

      {!compact && market.description && (
        <p className="tile-description">{market.description}</p>
      )}

      <div className="probability-section">
        <div className="probability-bar">
          <div 
            className="probability-fill" 
            style={{ width: `${calculateImpliedProbability(market.passTokenPrice)}%` }}
            aria-hidden="true"
          />
        </div>
        <div className="probability-labels">
          <span className="prob-yes">
            <span className="prob-label">Yes</span>
            <span className="prob-value">{calculateImpliedProbability(market.passTokenPrice)}%</span>
          </span>
          <span className="prob-no">
            <span className="prob-label">No</span>
            <span className="prob-value">{calculateImpliedProbability(market.failTokenPrice)}%</span>
          </span>
        </div>
      </div>

      <div className="tile-footer">
        <div className="footer-item">
          <span className="footer-label">Volume</span>
          <span className="footer-value">${formatLiquidity(market.totalLiquidity)}</span>
        </div>
        <div className="footer-item">
          <span className="footer-label">Closes</span>
          <span className="footer-value">{formatTimeRemaining(market.tradingEndTime)}</span>
        </div>
      </div>

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
