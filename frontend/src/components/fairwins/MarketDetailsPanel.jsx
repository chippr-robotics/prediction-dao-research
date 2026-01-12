import { usePrice } from '../../contexts/PriceContext'
import { useCallback, useMemo } from 'react'
import './MarketDetailsPanel.css'

/**
 * MarketDetailsPanel - Displays detailed information about a prediction market
 * Shows market creation, maker, settlement time, decision criteria, etc.
 * Uses a compact table layout for better visibility
 */
function MarketDetailsPanel({ market, linkedMarkets = [] }) {
  const { formatPrice } = usePrice()

  if (!market) return null

  // Format date for display
  const formatDate = (timestamp) => {
    if (!timestamp) return 'Unknown'
    const date = new Date(timestamp)
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // Format address for display
  const formatAddress = (address) => {
    if (!address) return 'Unknown'
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  // Calculate time until settlement
  const getTimeUntilSettlement = useCallback((endTime) => {
    if (!endTime) return 'Unknown'
    const now = Date.now()
    const end = new Date(endTime).getTime()
    const diff = end - now

    if (diff <= 0) return 'Ended'

    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))

    if (days > 0) return `${days}d ${hours}h`
    if (hours > 0) return `${hours}h`
    return 'Less than 1h'
  }, [])

  // Get correlation group info
  const correlationGroup = market.correlationGroup

  // Get other markets in the same group (excluding current market)
  const relatedMarkets = useMemo(() => {
    if (!correlationGroup || !linkedMarkets?.length) return []
    return linkedMarkets.filter(m => m.id !== market.id)
  }, [correlationGroup, linkedMarkets, market.id])

  return (
    <div className="market-details-panel">
      <div className="details-header">
        <h3 className="details-title">Market Details</h3>
      </div>

      {/* Main Details Table */}
      <div className="details-table-container">
        <table className="details-table">
          <tbody>
            <tr>
              <td className="detail-label">Question</td>
              <td className="detail-value detail-question">{market.proposalTitle}</td>
            </tr>
            <tr>
              <td className="detail-label">Market Value</td>
              <td className="detail-value">{formatPrice(market.totalLiquidity, { compact: true })}</td>
            </tr>
            <tr>
              <td className="detail-label">Category</td>
              <td className="detail-value detail-category">
                <span className="category-badge">{market.category || 'Other'}</span>
              </td>
            </tr>
            <tr>
              <td className="detail-label">Created</td>
              <td className="detail-value">{formatDate(market.creationTime)}</td>
            </tr>
            <tr>
              <td className="detail-label">Market Maker</td>
              <td className="detail-value detail-address">{formatAddress(market.creator)}</td>
            </tr>
            <tr>
              <td className="detail-label">Trading Ends</td>
              <td className="detail-value">{formatDate(market.tradingEndTime)}</td>
            </tr>
            <tr>
              <td className="detail-label">Time Until Settlement</td>
              <td className="detail-value detail-highlight">
                {getTimeUntilSettlement(market.tradingEndTime)}
              </td>
            </tr>
            <tr>
              <td className="detail-label">Resolution Source</td>
              <td className="detail-value">{market.resolutionSource || 'Community Vote'}</td>
            </tr>
            <tr>
              <td className="detail-label">Market Type</td>
              <td className="detail-value">Binary Prediction Market</td>
            </tr>
            <tr>
              <td className="detail-label">Status</td>
              <td className="detail-value">
                <span className={`status-badge status-${market.status?.toLowerCase() || 'active'}`}>
                  {market.status || 'Active'}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Correlation Group Section */}
      {correlationGroup && (
        <div className="correlation-section">
          <div className="section-label">Correlation Group</div>
          <div className="correlation-info">
            <table className="details-table compact">
              <tbody>
                <tr>
                  <td className="detail-label">Group Name</td>
                  <td className="detail-value">{correlationGroup.groupName}</td>
                </tr>
                {correlationGroup.groupDescription && (
                  <tr>
                    <td className="detail-label">Description</td>
                    <td className="detail-value">{correlationGroup.groupDescription}</td>
                  </tr>
                )}
                <tr>
                  <td className="detail-label">Group Category</td>
                  <td className="detail-value">
                    <span className="category-badge">{correlationGroup.category || 'Other'}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Related Markets in Same Group */}
          {relatedMarkets.length > 0 && (
            <div className="related-markets">
              <div className="related-label">Linked Markets ({relatedMarkets.length})</div>
              <ul className="related-list">
                {relatedMarkets.map(m => (
                  <li key={m.id} className="related-item">
                    <span className="related-id">#{m.id}</span>
                    <span className="related-title">{m.proposalTitle}</span>
                    <span className="related-price">
                      {m.betTypeLabels?.passLabel || 'YES'}: ${parseFloat(m.passTokenPrice || 0).toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Decision Criteria */}
      {market.description && (
        <div className="criteria-section">
          <div className="section-label">Decision Criteria</div>
          <div className="criteria-content">{market.description}</div>
        </div>
      )}
    </div>
  )
}

export default MarketDetailsPanel
