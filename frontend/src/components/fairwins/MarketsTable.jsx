import { useState, useMemo } from 'react'
import { useRoles } from '../../hooks/useRoles'
import { ROLES } from '../../contexts/RoleContext'
import './MarketsTable.css'

function MarketsTable({ markets = [], onMarketClick }) {
  const { hasRole } = useRoles()
  const [searchTerm, setSearchTerm] = useState('')
  const [sortField, setSortField] = useState('tradingEndTime')
  const [sortDirection, setSortDirection] = useState('asc')
  const [filterCategory, setFilterCategory] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')

  // Check if user has permission to view table
  const hasTableAccess = hasRole(ROLES.MARKET_MAKER) || hasRole(ROLES.ADMIN)

  // Filter and sort markets
  const filteredAndSortedMarkets = useMemo(() => {
    let filtered = [...markets]

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(m => 
        m.proposalTitle?.toLowerCase().includes(term) ||
        m.description?.toLowerCase().includes(term) ||
        m.category?.toLowerCase().includes(term)
      )
    }

    // Category filter
    if (filterCategory !== 'all') {
      filtered = filtered.filter(m => m.category === filterCategory)
    }

    // Status filter
    if (filterStatus !== 'all') {
      filtered = filtered.filter(m => m.status === filterStatus)
    }

    // Sort
    filtered.sort((a, b) => {
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
          bVal = new Date(b.tradingEndTime).getTime()
          return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
        
        case 'status':
          aVal = a.status || ''
          bVal = b.status || ''
          return sortDirection === 'asc'
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal)
        
        default:
          return 0
      }
    })

    return filtered
  }, [markets, searchTerm, sortField, sortDirection, filterCategory, filterStatus])

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatNumber = (num) => {
    const n = parseFloat(num)
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
    return n.toFixed(2)
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

  const categories = Array.from(new Set(markets.map(m => m.category))).sort()

  if (!hasTableAccess) {
    return (
      <div className="markets-table-access-denied">
        <div className="access-denied-icon">🔒</div>
        <h3>Access Restricted</h3>
        <p>This is a power user feature. You need Market Maker or Admin role to access the markets table view.</p>
        <p>Please contact an administrator to request access.</p>
      </div>
    )
  }

  return (
    <div className="markets-table-container">
      <div className="table-header">
        <h2>All Markets - Table View</h2>
        <p className="table-subtitle">Comprehensive view of all markets with advanced filtering and sorting</p>
      </div>

      {/* Filters and Search */}
      <div className="table-controls">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search markets..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
            aria-label="Search markets"
          />
          <span className="search-icon">🔍</span>
        </div>

        <div className="filter-controls">
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="filter-select"
            aria-label="Filter by category"
          >
            <option value="all">All Categories</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>
                {getCategoryIcon(cat)} {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="filter-select"
            aria-label="Filter by status"
          >
            <option value="all">All Status</option>
            <option value="Active">Active</option>
            <option value="Resolved">Resolved</option>
            <option value="Pending">Pending</option>
          </select>
        </div>

        <div className="results-count">
          {filteredAndSortedMarkets.length} of {markets.length} markets
        </div>
      </div>

      {/* Table */}
      <div className="table-wrapper">
        <table className="markets-table" role="table">
          <thead>
            <tr>
              <th 
                onClick={() => handleSort('proposalTitle')}
                className={`sortable ${sortField === 'proposalTitle' ? 'sorted' : ''}`}
                role="columnheader"
                aria-sort={sortField === 'proposalTitle' ? sortDirection : 'none'}
              >
                Market
                {sortField === 'proposalTitle' && (
                  <span className="sort-indicator">
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
                  <span className="sort-indicator">
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
                  <span className="sort-indicator">
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
                Pass/Fail
                {sortField === 'passTokenPrice' && (
                  <span className="sort-indicator">
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
                End Time
                {sortField === 'tradingEndTime' && (
                  <span className="sort-indicator">
                    {sortDirection === 'asc' ? '↑' : '↓'}
                  </span>
                )}
              </th>
              <th 
                onClick={() => handleSort('status')}
                className={`sortable ${sortField === 'status' ? 'sorted' : ''}`}
                role="columnheader"
                aria-sort={sortField === 'status' ? sortDirection : 'none'}
              >
                Status
                {sortField === 'status' && (
                  <span className="sort-indicator">
                    {sortDirection === 'asc' ? '↑' : '↓'}
                  </span>
                )}
              </th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedMarkets.length === 0 ? (
              <tr>
                <td colSpan="7" className="no-results">
                  No markets found matching your criteria
                </td>
              </tr>
            ) : (
              filteredAndSortedMarkets.map((market) => (
                <tr key={market.id} className="market-row">
                  <td className="market-title-cell">
                    <div className="market-title">{market.proposalTitle}</div>
                    <div className="market-description">{market.description}</div>
                  </td>
                  <td className="category-cell">
                    <span className="category-badge">
                      {getCategoryIcon(market.category)} {market.category}
                    </span>
                  </td>
                  <td className="liquidity-cell">
                    {formatNumber(market.totalLiquidity)} ETC
                  </td>
                  <td className="price-cell">
                    <div className="price-display">
                      <span className="pass-price">{parseFloat(market.passTokenPrice).toFixed(2)}</span>
                      <span className="price-separator">/</span>
                      <span className="fail-price">{parseFloat(market.failTokenPrice).toFixed(2)}</span>
                    </div>
                  </td>
                  <td className="time-cell">
                    {formatDate(market.tradingEndTime)}
                  </td>
                  <td className="status-cell">
                    <span className={`status-badge status-${market.status?.toLowerCase()}`}>
                      {market.status}
                    </span>
                  </td>
                  <td className="actions-cell">
                    <button
                      onClick={() => onMarketClick(market)}
                      className="view-button"
                      aria-label={`View market: ${market.proposalTitle}`}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default MarketsTable
