import { useState, useMemo } from 'react'
import { usePrice } from '../../contexts/PriceContext'
import './CompactMarketView.css'

function CompactMarketView({ markets = [], onMarketClick, loading = false }) {
  const { formatPrice } = usePrice()
  const [sortField, setSortField] = useState('tradingEndTime')
  const [sortDirection, setSortDirection] = useState('asc')

  const calculateTimeRemaining = (endTime) => {
    const now = new Date()
    const end = new Date(endTime)
    const diff = end - now
    
    if (diff <= 0) return 'Ended'
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    
    if (days > 0) {
      return `${days}d ${hours}h`
    }
    if (hours > 0) {
      return `${hours}h ${minutes}m`
    }
    return `${minutes}m`
  }

  const getCategoryIcon = (category) => {
    const icons = {
      sports: '⚽',
      politics: '🏛️',
      finance: '💰',
      tech: '💻',
      crypto: '₿',
      'pop-culture': '🎬'
    }
    return icons[category] || '📊'
  }

  const sortedMarkets = useMemo(() => {
    const sorted = [...markets]
    sorted.sort((a, b) => {
      let aVal, bVal

      switch (sortField) {
        case 'proposalTitle':
          aVal = a.proposalTitle || ''
          bVal = b.proposalTitle || ''
          return sortDirection === 'asc' 
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal)
        
        case 'category':
          aVal = a.category || ''
          bVal = b.category || ''
          return sortDirection === 'asc'
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal)
        
        case 'correlationGroupName':
          aVal = a.correlationGroupName || ''
          bVal = b.correlationGroupName || ''
          return sortDirection === 'asc'
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal)
        
        case 'totalLiquidity':
          aVal = parseFloat(a.totalLiquidity || 0)
          bVal = parseFloat(b.totalLiquidity || 0)
          return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
        
        case 'passTokenPrice':
          aVal = parseFloat(a.passTokenPrice || 0)
          bVal = parseFloat(b.passTokenPrice || 0)
          return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
        
        case 'tradingEndTime':
          aVal = new Date(a.tradingEndTime).getTime()
          if (Number.isNaN(aVal)) aVal = 0
          bVal = new Date(b.tradingEndTime).getTime()
          if (Number.isNaN(bVal)) bVal = 0
          return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
        
        default:
          return 0
      }
    })

    return sorted
  }, [markets, sortField, sortDirection])

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  if (loading) {
    return (
      <div className="compact-view-loading" role="status" aria-live="polite">
        <div className="loading-skeleton-row" aria-hidden="true"></div>
        <div className="loading-skeleton-row" aria-hidden="true"></div>
        <div className="loading-skeleton-row" aria-hidden="true"></div>
        <div className="loading-skeleton-row" aria-hidden="true"></div>
        <span className="sr-only">Loading markets...</span>
      </div>
    )
  }

  if (markets.length === 0) {
    return (
      <div className="compact-view-empty" role="status">
        <div className="empty-icon" aria-hidden="true">📊</div>
        <h3>No Markets Found</h3>
        <p>There are no markets in this category yet. Check back soon!</p>
      </div>
    )
  }

  return (
    <div className="compact-market-view">
      <table className="compact-table" role="table">
        <thead>
          <tr>
            <th 
              onClick={() => handleSort('correlationGroupName')}
              className={`sortable ${sortField === 'correlationGroupName' ? 'sorted' : ''}`}
              role="columnheader"
              aria-sort={sortField === 'correlationGroupName' ? sortDirection : 'none'}
            >
              Correlation
              {sortField === 'correlationGroupName' && (
                <span className="sort-indicator" aria-hidden="true">
                  {sortDirection === 'asc' ? '↑' : '↓'}
                </span>
              )}
            </th>
            <th 
              onClick={() => handleSort('proposalTitle')}
              className={`sortable ${sortField === 'proposalTitle' ? 'sorted' : ''}`}
              role="columnheader"
              aria-sort={sortField === 'proposalTitle' ? sortDirection : 'none'}
            >
              Market
              {sortField === 'proposalTitle' && (
                <span className="sort-indicator" aria-hidden="true">
                  {sortDirection === 'asc' ? '↑' : '↓'}
                </span>
              )}
            </th>
            <th 
              onClick={() => handleSort('tradingEndTime')}
              className={`sortable ${sortField === 'tradingEndTime' ? 'sorted' : ''}`}
              role="columnheader"
              aria-sort={sortField === 'tradingEndTime' ? sortDirection : 'none'}
            >
              Time Remaining
              {sortField === 'tradingEndTime' && (
                <span className="sort-indicator" aria-hidden="true">
                  {sortDirection === 'asc' ? '↑' : '↓'}
                </span>
              )}
            </th>
            <th 
              onClick={() => handleSort('passTokenPrice')}
              className={`sortable ${sortField === 'passTokenPrice' ? 'sorted' : ''}`}
              role="columnheader"
              aria-sort={sortField === 'passTokenPrice' ? sortDirection : 'none'}
            >
              Pass / Fail
              {sortField === 'passTokenPrice' && (
                <span className="sort-indicator" aria-hidden="true">
                  {sortDirection === 'asc' ? '↑' : '↓'}
                </span>
              )}
            </th>
            <th 
              onClick={() => handleSort('totalLiquidity')}
              className={`sortable ${sortField === 'totalLiquidity' ? 'sorted' : ''}`}
              role="columnheader"
              aria-sort={sortField === 'totalLiquidity' ? sortDirection : 'none'}
            >
              Liquidity
              {sortField === 'totalLiquidity' && (
                <span className="sort-indicator" aria-hidden="true">
                  {sortDirection === 'asc' ? '↑' : '↓'}
                </span>
              )}
            </th>
            <th 
              onClick={() => handleSort('category')}
              className={`sortable ${sortField === 'category' ? 'sorted' : ''}`}
              role="columnheader"
              aria-sort={sortField === 'category' ? sortDirection : 'none'}
            >
              Category
              {sortField === 'category' && (
                <span className="sort-indicator" aria-hidden="true">
                  {sortDirection === 'asc' ? '↑' : '↓'}
                </span>
              )}
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedMarkets.map((market) => (
            <tr 
              key={market.id} 
              className="market-row"
              onClick={() => onMarketClick(market)}
              role="button"
              tabIndex="0"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onMarketClick(market)
                }
              }}
              aria-label={`View market: ${market.proposalTitle}`}
            >
              <td className="correlation-cell">
                {market.correlationGroupId ? (
                  <span className="correlation-tag" title={market.correlationGroupName}>
                    {market.correlationGroupName}
                  </span>
                ) : (
                  <span className="no-correlation">—</span>
                )}
              </td>
              <td className="market-cell">
                <div className="market-title">{market.proposalTitle}</div>
              </td>
              <td className="time-cell">
                <div className="countdown-timer">
                  {calculateTimeRemaining(market.tradingEndTime)}
                </div>
              </td>
              <td className="price-cell">
                <div className="price-pair">
                  <span className="pass-price" title="Pass Token Price">
                    {formatPrice(market.passTokenPrice)}
                  </span>
                  <span className="price-separator">/</span>
                  <span className="fail-price" title="Fail Token Price">
                    {formatPrice(market.failTokenPrice)}
                  </span>
                </div>
              </td>
              <td className="liquidity-cell">
                {formatPrice(market.totalLiquidity, { compact: true })}
              </td>
              <td className="category-cell">
                <span className="category-badge">
                  <span className="category-icon" aria-hidden="true">{getCategoryIcon(market.category)}</span>
                  <span className="category-name">{market.category}</span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default CompactMarketView
