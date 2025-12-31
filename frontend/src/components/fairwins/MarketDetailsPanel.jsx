import { usePrice } from '../../contexts/PriceContext'
import { useCallback } from 'react'
import './MarketDetailsPanel.css'

/**
 * MarketDetailsPanel - Displays detailed information about a prediction market
 * Shows market creation, maker, settlement time, decision criteria, etc.
 */
function MarketDetailsPanel({ market }) {
  const { formatPrice } = usePrice()

  if (!market) return null

  // Format date for display
  const formatDate = (timestamp) => {
    const date = new Date(timestamp)
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // Calculate time until settlement
  const getTimeUntilSettlement = useCallback((endTime) => {
    const now = Date.now()
    const end = new Date(endTime).getTime()
    const diff = end - now
    
    if (diff <= 0) return 'Ended'
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    
    if (days > 0) return `${days}d ${hours}h`
    if (hours > 0) return `${hours}h`
    return 'Less than 1h'
  }

  return (
    <div className="market-details-panel">
      <div className="details-header">
        <h3 className="details-title">Market Details</h3>
      </div>

      <div className="details-content">
        {/* Market Question */}
        <div className="detail-section">
          <div className="detail-label">Question</div>
          <div className="detail-value detail-question">{market.proposalTitle}</div>
        </div>

        {/* Market Value */}
        <div className="detail-section">
          <div className="detail-label">Market Value</div>
          <div className="detail-value">{formatPrice(market.totalLiquidity, { compact: true })}</div>
        </div>

        {/* Created Date */}
        <div className="detail-section">
          <div className="detail-label">Created</div>
          <div className="detail-value">
            {market.creationTime ? formatDate(market.creationTime) : 'Unknown'}
          </div>
        </div>

        {/* Market Maker */}
        <div className="detail-section">
          <div className="detail-label">Market Maker</div>
          <div className="detail-value detail-address">
            {market.creator ? `${market.creator.slice(0, 6)}...${market.creator.slice(-4)}` : 'Unknown'}
          </div>
        </div>

        {/* Trading End Time */}
        <div className="detail-section">
          <div className="detail-label">Trading Ends</div>
          <div className="detail-value">
            {market.tradingEndTime ? formatDate(market.tradingEndTime) : 'Unknown'}
          </div>
        </div>

        {/* Time Until Settlement */}
        <div className="detail-section">
          <div className="detail-label">Time Until Settlement</div>
          <div className="detail-value detail-highlight">
            {market.tradingEndTime ? getTimeUntilSettlement(market.tradingEndTime) : 'Unknown'}
          </div>
        </div>

        {/* Resolution Source */}
        <div className="detail-section">
          <div className="detail-label">Resolution Source</div>
          <div className="detail-value">{market.resolutionSource || 'Community Vote'}</div>
        </div>

        {/* Market Type */}
        <div className="detail-section">
          <div className="detail-label">Market Type</div>
          <div className="detail-value">Binary Prediction Market</div>
        </div>

        {/* Current Prices */}
        <div className="detail-section detail-prices">
          <div className="detail-label">Current Prices</div>
          <div className="price-grid">
            <div className="price-item">
              <span className="price-label">YES</span>
              <span className="price-value">
                ${market.passTokenPrice ? parseFloat(market.passTokenPrice).toFixed(2) : '0.00'}
              </span>
            </div>
            <div className="price-item">
              <span className="price-label">NO</span>
              <span className="price-value">
                ${market.failTokenPrice ? parseFloat(market.failTokenPrice).toFixed(2) : '0.00'}
              </span>
            </div>
          </div>
        </div>

        {/* Decision Criteria */}
        {market.description && (
          <div className="detail-section">
            <div className="detail-label">Decision Criteria</div>
            <div className="detail-value detail-description">{market.description}</div>
          </div>
        )}
      </div>
    </div>
  )
}

export default MarketDetailsPanel
