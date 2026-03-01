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

  // Get display title for market, handling encrypted/private markets
  const getDisplayTitle = () => {
    // First check decrypted metadata (from useDecryptedMarkets hook)
    if (market.metadata && market.canView !== false) {
      const title = market.metadata.name || market.metadata.description || market.metadata.question
      if (title && title !== 'Private Market' && title !== 'Private Wager' && title !== 'Encrypted Market' && title !== 'Encrypted Wager') {
        return title
      }
    }

    // For friend markets, use description field
    if (market.marketType === 'friend') {
      const desc = market.description
      // Skip placeholder values
      if (desc && desc !== 'Encrypted Market' && desc !== 'Encrypted Wager' && desc !== 'Private Market' && desc !== 'Private Wager') {
        return desc
      }
      // If encrypted/private, show stake info
      const stakeInfo = market.stakeAmount ? `${market.stakeAmount} ${market.stakeTokenSymbol || 'ETC'}` : ''
      return `Private Bet${stakeInfo ? ` - ${stakeInfo}` : ''}`
    }

    // For prediction markets, use proposalTitle or description
    return market.proposalTitle || market.description || `Market #${market.id}`
  }

  // Check if this is a private/encrypted market
  const isPrivateMarket = market.marketType === 'friend' || market.isPrivate ||
    (market.metadata && (market.metadata.encrypted || market.canView === false))



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

  const displayTitle = getDisplayTitle()

  return (
    <div
      className={`market-tile ${isActive ? 'active' : ''} ${compact ? 'compact' : ''} ${market.correlationGroupId ? 'grouped' : ''} ${isPrivateMarket ? 'private' : ''}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex="0"
      aria-label={`View market: ${displayTitle}`}
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

      <h3 className="tile-title">
        {isPrivateMarket && <span className="private-icon" title="Private Wager">🔒 </span>}
        {displayTitle}
      </h3>

      <div className="tile-footer">
        <p className="tile-secondary">
          {formatTimeRemaining(market.tradingEndTime)} remaining
        </p>
        {market.correlationGroupId && (
          <div className="correlation-badge" title={market.correlationGroupName}>
            <span className="correlation-text">{market.correlationGroupName}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default MarketTile
