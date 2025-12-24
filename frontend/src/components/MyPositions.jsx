import { useState, useEffect, useCallback } from 'react'
import { useEthers } from '../hooks/useWeb3'
import './MyPositions.css'

function MyPositions() {
  const { provider, signer, account } = useEthers()
  const [positions, setPositions] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // all, active, settled

  const loadPositions = useCallback(async () => {
    try {
      // Mock data for demonstration
      // In production, this would fetch from PrivacyCoordinator and ConditionalMarketFactory
      const mockPositions = [
        {
          id: 0,
          marketId: 0,
          proposalTitle: 'Fund Core Protocol Development',
          tokenType: 'PASS',
          amount: '100',
          entryPrice: '0.60',
          currentPrice: '0.62',
          unrealizedPnL: '+3.33',
          unrealizedPnLPercent: '+3.33',
          status: 'Active',
          entryTimestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          id: 1,
          marketId: 1,
          proposalTitle: 'Security Audit Funding',
          tokenType: 'FAIL',
          amount: '50',
          entryPrice: '0.50',
          currentPrice: '0.45',
          unrealizedPnL: '-10.00',
          unrealizedPnLPercent: '-10.00',
          status: 'Active',
          entryTimestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          id: 2,
          marketId: 2,
          proposalTitle: 'Marketing Campaign Initiative',
          tokenType: 'PASS',
          amount: '75',
          entryPrice: '0.55',
          currentPrice: '1.00',
          unrealizedPnL: '+61.36',
          unrealizedPnLPercent: '+81.82',
          status: 'Settled',
          entryTimestamp: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
          settlementTimestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
        }
      ]

      setPositions(mockPositions)
      setLoading(false)
    } catch (error) {
      console.error('Error loading positions:', error)
      setLoading(false)
    }
    // Note: provider, signer, account will be used in production
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    loadPositions()
  }, [loadPositions])

  const filteredPositions = positions.filter(position => {
    if (filter === 'all') return true
    if (filter === 'active') return position.status === 'Active'
    if (filter === 'settled') return position.status === 'Settled'
    return true
  })

  const calculateTotalValue = () => {
    return positions
      .filter(p => p.status === 'Active')
      .reduce((sum, p) => sum + parseFloat(p.amount) * parseFloat(p.currentPrice), 0)
      .toFixed(2)
  }

  const calculateTotalPnL = () => {
    const total = positions
      .filter(p => p.status === 'Active')
      .reduce((sum, p) => sum + parseFloat(p.unrealizedPnL), 0)
    return total >= 0 ? `+${total.toFixed(2)}` : total.toFixed(2)
  }

  const formatDate = (timestamp) => {
    const date = new Date(timestamp)
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    })
  }

  const handleExit = (position) => {
    alert(`Exit Position functionality requires deployed contracts.

Position Details:
- Market: ${position.proposalTitle}
- Type: ${position.tokenType}
- Amount: ${position.amount} tokens
- Current P&L: ${position.unrealizedPnL} ETC (${position.unrealizedPnLPercent}%)

This would:
1. Decrypt your position using your private key
2. Submit a sell order to the market
3. Return proceeds to your wallet
4. Update position status`)
  }

  if (loading) {
    return (
      <div className="loading" role="status" aria-live="polite">
        <span className="sr-only">Loading your positions...</span>
        Loading your positions...
      </div>
    )
  }

  if (positions.length === 0) {
    return (
      <div className="no-positions" role="status">
        <div className="placeholder-icon" aria-hidden="true">📊</div>
        <p>You don't have any positions yet. Start trading to see your positions here.</p>
      </div>
    )
  }

  return (
    <div className="my-positions">
      <div className="positions-header">
        <h2>My Positions</h2>
        <div className="portfolio-summary">
          <div className="summary-card">
            <div className="summary-label">Total Value</div>
            <div className="summary-value">{calculateTotalValue()} ETC</div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Total P&L</div>
            <div className={`summary-value ${parseFloat(calculateTotalPnL()) >= 0 ? 'profit' : 'loss'}`}>
              {calculateTotalPnL()} ETC
            </div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Active Positions</div>
            <div className="summary-value">{positions.filter(p => p.status === 'Active').length}</div>
          </div>
        </div>
      </div>

      <div className="filter-tabs" role="tablist" aria-label="Position filters">
        <button
          role="tab"
          aria-selected={filter === 'all'}
          aria-controls="positions-list"
          className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All ({positions.length})
        </button>
        <button
          role="tab"
          aria-selected={filter === 'active'}
          aria-controls="positions-list"
          className={`filter-tab ${filter === 'active' ? 'active' : ''}`}
          onClick={() => setFilter('active')}
        >
          Active ({positions.filter(p => p.status === 'Active').length})
        </button>
        <button
          role="tab"
          aria-selected={filter === 'settled'}
          aria-controls="positions-list"
          className={`filter-tab ${filter === 'settled' ? 'active' : ''}`}
          onClick={() => setFilter('settled')}
        >
          Settled ({positions.filter(p => p.status === 'Settled').length})
        </button>
      </div>

      <div className="positions-list" id="positions-list" role="tabpanel">
        {filteredPositions.map((position) => (
          <div key={position.id} className={`position-card ${position.status.toLowerCase()}`}>
            <div className="position-header">
              <div className="position-title">
                <h3>{position.proposalTitle}</h3>
                <span 
                  className={`token-badge ${position.tokenType.toLowerCase()}`}
                  role="img"
                  aria-label={`${position.tokenType} token`}
                >
                  <span aria-hidden="true">
                    {position.tokenType === 'PASS' ? '↑' : '↓'}
                  </span>
                  {position.tokenType}
                </span>
              </div>
              <div className="position-status">
                <span className={`status-badge ${position.status.toLowerCase()}`}>
                  <span className="sr-only">
                    {position.status === 'Active' ? 'Checkmark icon indicating' : 'Icon indicating'}
                  </span>
                  {position.status}
                </span>
              </div>
            </div>

            <div className="position-details">
              <div className="detail-row">
                <div className="detail-item">
                  <span className="detail-label">Amount</span>
                  <span className="detail-value">{position.amount} tokens</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Entry Price</span>
                  <span className="detail-value">{position.entryPrice} ETC</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Current Price</span>
                  <span className="detail-value">{position.currentPrice} ETC</span>
                </div>
              </div>

              <div className="detail-row">
                <div className="detail-item">
                  <span className="detail-label">Entry Date</span>
                  <span className="detail-value">{formatDate(position.entryTimestamp)}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Position Value</span>
                  <span className="detail-value">
                    {(parseFloat(position.amount) * parseFloat(position.currentPrice)).toFixed(2)} ETC
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">P&L</span>
                  <span className={`detail-value pnl ${parseFloat(position.unrealizedPnL) >= 0 ? 'profit' : 'loss'}`}>
                    <span aria-hidden="true">
                      {parseFloat(position.unrealizedPnL) >= 0 ? '▲' : '▼'}
                    </span>
                    {position.unrealizedPnL} ETC ({position.unrealizedPnLPercent}%)
                  </span>
                </div>
              </div>

              {position.settlementTimestamp && (
                <div className="settlement-info">
                  <span className="sr-only">Settlement information:</span>
                  Settled on {formatDate(position.settlementTimestamp)}
                </div>
              )}
            </div>

            {position.status === 'Active' && (
              <div className="position-actions">
                <button 
                  className="exit-button"
                  onClick={() => handleExit(position)}
                  aria-label={`Exit position for ${position.proposalTitle}`}
                >
                  Exit Position
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {filteredPositions.length === 0 && (
        <div className="empty-filter" role="status">
          <p>No {filter} positions found.</p>
        </div>
      )}
    </div>
  )
}

export default MyPositions
