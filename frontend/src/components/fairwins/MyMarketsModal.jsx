import { useState, useEffect, useCallback, useMemo } from 'react'
import { useWallet, useWeb3, useDataFetcher } from '../../hooks'
import './MyMarketsModal.css'

/**
 * Market Status Constants
 */
const MarketStatus = {
  PENDING_ACCEPTANCE: 'pending_acceptance',
  ACTIVE: 'active',
  PENDING_RESOLUTION: 'pending_resolution',
  DISPUTED: 'disputed',
  RESOLVED: 'resolved',
  EXPIRED: 'expired'
}

/**
 * Dispute Status Constants
 */
const DisputeStatus = {
  NONE: 'none',
  OPENED: 'opened',
  ESCALATED: 'escalated',
  RESOLVED: 'resolved'
}

/**
 * MyMarketsModal Component
 *
 * A comprehensive modal for users to manage their prediction markets:
 * - Participating: View active markets where user has positions
 * - Created: Manage markets the user created (resolve, view disputes)
 * - History: View past/resolved markets and outcomes
 *
 * Features:
 * - Market resolution flow for market makers
 * - Dispute management for both participants and market makers
 * - Status tracking and filtering
 */
function MyMarketsModal({
  isOpen,
  onClose,
  predictionMarkets = [],
  friendMarkets = []
}) {
  const { isConnected, account } = useWallet()
  const { signer, isCorrectNetwork, switchNetwork } = useWeb3()
  const { getMarkets, getPositions } = useDataFetcher()

  // Tab state
  const [activeTab, setActiveTab] = useState('participating')

  // Markets data state
  const [markets, setMarkets] = useState([])
  const [userPositions, setUserPositions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Selected market for detail view
  const [selectedMarket, setSelectedMarket] = useState(null)

  // Resolution modal state
  const [showResolutionModal, setShowResolutionModal] = useState(false)
  const [resolutionMarket, setResolutionMarket] = useState(null)

  // Dispute modal state
  const [showDisputeModal, setShowDisputeModal] = useState(false)
  const [disputeMarket, setDisputeMarket] = useState(null)
  const [disputeMode, setDisputeMode] = useState(null) // 'open', 'respond', 'escalate'

  // Filter state
  const [marketTypeFilter, setMarketTypeFilter] = useState('all') // 'all', 'prediction', 'friend'
  const [statusFilter, setStatusFilter] = useState('all')

  // Fetch markets data
  const fetchMarketsData = useCallback(async () => {
    if (!account) return

    setLoading(true)
    setError(null)

    try {
      const [fetchedMarkets, positions] = await Promise.all([
        getMarkets(),
        getPositions(account)
      ])

      setMarkets(fetchedMarkets || [])
      setUserPositions(positions || [])
    } catch (err) {
      console.error('Error fetching markets data:', err)
      setError('Failed to load markets. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [account, getMarkets, getPositions])

  // Load data when modal opens
  useEffect(() => {
    if (isOpen && account) {
      fetchMarketsData()
    }
  }, [isOpen, account, fetchMarketsData])

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab('participating')
      setSelectedMarket(null)
      setShowResolutionModal(false)
      setShowDisputeModal(false)
      setMarketTypeFilter('all')
      setStatusFilter('all')
    }
  }, [isOpen])

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (showResolutionModal) {
          setShowResolutionModal(false)
        } else if (showDisputeModal) {
          setShowDisputeModal(false)
        } else if (selectedMarket) {
          setSelectedMarket(null)
        } else {
          onClose()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose, selectedMarket, showResolutionModal, showDisputeModal])

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && !showResolutionModal && !showDisputeModal) {
      onClose()
    }
  }

  // Combine and categorize markets
  const categorizedMarkets = useMemo(() => {
    const userAddr = account?.toLowerCase()
    if (!userAddr) return { participating: [], created: [], history: [] }

    // Combine prediction and friend markets
    const allMarkets = [
      ...markets.map(m => ({ ...m, marketType: 'prediction' })),
      ...friendMarkets.map(m => ({ ...m, marketType: 'friend' })),
      ...predictionMarkets.map(m => ({ ...m, marketType: 'prediction' }))
    ]

    // Remove duplicates by id
    const uniqueMarkets = allMarkets.reduce((acc, market) => {
      const key = `${market.marketType}-${market.id}`
      if (!acc[key]) acc[key] = market
      return acc
    }, {})

    const marketsList = Object.values(uniqueMarkets)

    // Determine market status helper
    const getMarketStatus = (market) => {
      const now = Date.now()
      const endTime = market.tradingEndTime
        ? (typeof market.tradingEndTime === 'bigint'
          ? Number(market.tradingEndTime) * 1000
          : new Date(market.tradingEndTime).getTime())
        : (market.endDate ? new Date(market.endDate).getTime() : 0)

      // Check for pending_acceptance status first (friend markets awaiting participant stakes)
      if (market.status === 'pending_acceptance' || market.status === 'pending') {
        return MarketStatus.PENDING_ACCEPTANCE
      }
      if (market.status === 'resolved') return MarketStatus.RESOLVED
      if (market.status === 'disputed' || market.disputeStatus === DisputeStatus.OPENED) {
        return MarketStatus.DISPUTED
      }
      if (endTime && now > endTime) return MarketStatus.PENDING_RESOLUTION
      return MarketStatus.ACTIVE
    }

    // Check if user has position in market
    const hasPosition = (marketId) => {
      return userPositions.some(p => String(p.marketId) === String(marketId))
    }

    // Check if user is creator
    const isCreator = (market) => {
      return market.creator?.toLowerCase() === userAddr
    }

    // Check if user is participant
    const isParticipant = (market) => {
      return market.participants?.some(p => p.toLowerCase() === userAddr) ||
        hasPosition(market.id)
    }

    // Categorize markets
    const participating = []
    const created = []
    const history = []

    marketsList.forEach(market => {
      const status = getMarketStatus(market)
      const marketWithStatus = { ...market, computedStatus: status }

      // Apply type filter
      if (marketTypeFilter !== 'all' && market.marketType !== marketTypeFilter) {
        return
      }

      // Apply status filter
      if (statusFilter !== 'all' && status !== statusFilter) {
        return
      }

      if (status === MarketStatus.RESOLVED) {
        if (isCreator(market) || isParticipant(market)) {
          history.push(marketWithStatus)
        }
      } else {
        if (isCreator(market)) {
          created.push(marketWithStatus)
        }
        if (isParticipant(market) && !isCreator(market)) {
          participating.push(marketWithStatus)
        }
      }
    })

    return { participating, created, history }
  }, [markets, friendMarkets, predictionMarkets, userPositions, account, marketTypeFilter, statusFilter])

  // Format helpers
  const formatDate = (dateValue) => {
    if (!dateValue) return 'N/A'
    let date
    if (typeof dateValue === 'bigint') {
      date = new Date(Number(dateValue) * 1000)
    } else if (typeof dateValue === 'number') {
      date = dateValue > 1e12 ? new Date(dateValue) : new Date(dateValue * 1000)
    } else {
      date = new Date(dateValue)
    }
    if (Number.isNaN(date.getTime())) return 'N/A'
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatAddress = (address) => {
    if (!address) return 'N/A'
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  const getStatusClass = (status) => {
    switch (status) {
      case MarketStatus.PENDING_ACCEPTANCE: return 'status-pending-acceptance'
      case MarketStatus.ACTIVE: return 'status-active'
      case MarketStatus.PENDING_RESOLUTION: return 'status-pending'
      case MarketStatus.DISPUTED: return 'status-disputed'
      case MarketStatus.RESOLVED: return 'status-resolved'
      default: return 'status-default'
    }
  }

  const getStatusLabel = (status) => {
    switch (status) {
      case MarketStatus.PENDING_ACCEPTANCE: return 'Pending Acceptance'
      case MarketStatus.ACTIVE: return 'Active'
      case MarketStatus.PENDING_RESOLUTION: return 'Pending Resolution'
      case MarketStatus.DISPUTED: return 'Disputed'
      case MarketStatus.RESOLVED: return 'Resolved'
      default: return status
    }
  }

  const getTimeRemaining = (endTime) => {
    if (!endTime) return null
    const now = Date.now()
    let end
    if (typeof endTime === 'bigint') {
      end = Number(endTime) * 1000
    } else if (typeof endTime === 'number') {
      end = endTime > 1e12 ? endTime : endTime * 1000
    } else {
      end = new Date(endTime).getTime()
    }

    const diff = end - now
    if (diff <= 0) return 'Ended'

    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))

    if (days > 0) return `${days}d ${hours}h`
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    if (hours > 0) return `${hours}h ${minutes}m`
    return `${minutes}m`
  }

  // Action handlers
  const handleOpenResolution = (market) => {
    setResolutionMarket(market)
    setShowResolutionModal(true)
  }

  const handleOpenDispute = (market, mode = 'open') => {
    setDisputeMarket(market)
    setDisputeMode(mode)
    setShowDisputeModal(true)
  }

  const handleMarketSelect = (market) => {
    setSelectedMarket(market)
  }

  const handleBackToList = () => {
    setSelectedMarket(null)
  }

  // Check if market can be resolved
  const canResolve = (market) => {
    if (!account) return false
    const isCreator = market.creator?.toLowerCase() === account.toLowerCase()
    const status = market.computedStatus || MarketStatus.ACTIVE
    return isCreator && status === MarketStatus.PENDING_RESOLUTION
  }

  // Check if user can open dispute
  const canOpenDispute = (market) => {
    if (!account) return false
    const status = market.computedStatus || MarketStatus.ACTIVE
    const hasPos = userPositions.some(p => String(p.marketId) === String(market.id))
    const isParticipant = market.participants?.some(p => p.toLowerCase() === account.toLowerCase()) || hasPos
    return isParticipant && (status === MarketStatus.PENDING_RESOLUTION || status === MarketStatus.RESOLVED)
  }

  // Check if user can respond to dispute (as market maker)
  const canRespondToDispute = (market) => {
    if (!account) return false
    const isCreator = market.creator?.toLowerCase() === account.toLowerCase()
    const status = market.computedStatus || MarketStatus.ACTIVE
    return isCreator && status === MarketStatus.DISPUTED
  }

  if (!isOpen) return null

  return (
    <div
      className="my-markets-modal-backdrop"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="my-markets-modal-title"
    >
      <div className="my-markets-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <header className="mm-header">
          <div className="mm-header-content">
            <div className="mm-brand">
              <span className="mm-brand-icon">&#128202;</span>
              <h2 id="my-markets-modal-title">My Markets</h2>
            </div>
            <p className="mm-subtitle">Manage your prediction markets and positions</p>
          </div>
          <button
            className="mm-close-btn"
            onClick={onClose}
            aria-label="Close modal"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </header>

        {/* Tab Navigation */}
        <nav className="mm-tabs" role="tablist">
          <button
            className={`mm-tab ${activeTab === 'participating' ? 'active' : ''}`}
            onClick={() => { setActiveTab('participating'); setSelectedMarket(null) }}
            role="tab"
            aria-selected={activeTab === 'participating'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
            </svg>
            <span>Participating</span>
            {categorizedMarkets.participating.length > 0 && (
              <span className="mm-tab-badge">{categorizedMarkets.participating.length}</span>
            )}
          </button>
          <button
            className={`mm-tab ${activeTab === 'created' ? 'active' : ''}`}
            onClick={() => { setActiveTab('created'); setSelectedMarket(null) }}
            role="tab"
            aria-selected={activeTab === 'created'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/>
              <path d="M2 17l10 5 10-5"/>
              <path d="M2 12l10 5 10-5"/>
            </svg>
            <span>Created</span>
            {categorizedMarkets.created.length > 0 && (
              <span className="mm-tab-badge">{categorizedMarkets.created.length}</span>
            )}
          </button>
          <button
            className={`mm-tab ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => { setActiveTab('history'); setSelectedMarket(null) }}
            role="tab"
            aria-selected={activeTab === 'history'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            <span>History</span>
            {categorizedMarkets.history.length > 0 && (
              <span className="mm-tab-badge">{categorizedMarkets.history.length}</span>
            )}
          </button>
        </nav>

        {/* Filter Bar */}
        <div className="mm-filter-bar">
          <div className="mm-filter-group">
            <label>Type:</label>
            <select
              value={marketTypeFilter}
              onChange={(e) => setMarketTypeFilter(e.target.value)}
              className="mm-filter-select"
            >
              <option value="all">All Markets</option>
              <option value="prediction">Prediction Markets</option>
              <option value="friend">Friend Markets</option>
            </select>
          </div>
          <div className="mm-filter-group">
            <label>Status:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="mm-filter-select"
            >
              <option value="all">All Status</option>
              <option value={MarketStatus.PENDING_ACCEPTANCE}>Pending Acceptance</option>
              <option value={MarketStatus.ACTIVE}>Active</option>
              <option value={MarketStatus.PENDING_RESOLUTION}>Pending Resolution</option>
              <option value={MarketStatus.DISPUTED}>Disputed</option>
              <option value={MarketStatus.RESOLVED}>Resolved</option>
            </select>
          </div>
          <button
            className="mm-refresh-btn"
            onClick={fetchMarketsData}
            disabled={loading}
            title="Refresh markets"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={loading ? 'spinning' : ''}>
              <path d="M23 4v6h-6"/>
              <path d="M1 20v-6h6"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
          </button>
        </div>

        {/* Content Area */}
        <div className="mm-content">
          {!isConnected ? (
            <div className="mm-empty-state">
              <div className="mm-empty-icon">&#128274;</div>
              <h3>Connect Your Wallet</h3>
              <p>Please connect your wallet to view your markets.</p>
            </div>
          ) : loading ? (
            <div className="mm-loading">
              <div className="mm-spinner"></div>
              <p>Loading your markets...</p>
            </div>
          ) : error ? (
            <div className="mm-error-state">
              <div className="mm-error-icon">&#9888;</div>
              <p>{error}</p>
              <button className="mm-btn-primary" onClick={fetchMarketsData}>
                Try Again
              </button>
            </div>
          ) : (
            <>
              {/* Participating Tab */}
              {activeTab === 'participating' && (
                <div role="tabpanel" className="mm-panel">
                  {selectedMarket ? (
                    <MarketDetailView
                      market={selectedMarket}
                      onBack={handleBackToList}
                      formatDate={formatDate}
                      formatAddress={formatAddress}
                      getStatusClass={getStatusClass}
                      getStatusLabel={getStatusLabel}
                      getTimeRemaining={getTimeRemaining}
                      account={account}
                      userPositions={userPositions}
                      canOpenDispute={canOpenDispute}
                      onOpenDispute={handleOpenDispute}
                    />
                  ) : categorizedMarkets.participating.length === 0 ? (
                    <div className="mm-empty-state">
                      <div className="mm-empty-icon">&#128200;</div>
                      <h3>No Active Positions</h3>
                      <p>You don&apos;t have any active positions in markets.</p>
                      <p className="mm-hint">Start trading on prediction markets to see them here.</p>
                    </div>
                  ) : (
                    <MarketsTable
                      markets={categorizedMarkets.participating}
                      onSelect={handleMarketSelect}
                      formatDate={formatDate}
                      getStatusClass={getStatusClass}
                      getStatusLabel={getStatusLabel}
                      getTimeRemaining={getTimeRemaining}
                      showActions={false}
                    />
                  )}
                </div>
              )}

              {/* Created Tab */}
              {activeTab === 'created' && (
                <div role="tabpanel" className="mm-panel">
                  {selectedMarket ? (
                    <MarketDetailView
                      market={selectedMarket}
                      onBack={handleBackToList}
                      formatDate={formatDate}
                      formatAddress={formatAddress}
                      getStatusClass={getStatusClass}
                      getStatusLabel={getStatusLabel}
                      getTimeRemaining={getTimeRemaining}
                      account={account}
                      userPositions={userPositions}
                      canResolve={canResolve}
                      canRespondToDispute={canRespondToDispute}
                      onOpenResolution={handleOpenResolution}
                      onRespondToDispute={(m) => handleOpenDispute(m, 'respond')}
                      isCreatorView
                    />
                  ) : categorizedMarkets.created.length === 0 ? (
                    <div className="mm-empty-state">
                      <div className="mm-empty-icon">&#128203;</div>
                      <h3>No Markets Created</h3>
                      <p>You haven&apos;t created any markets yet.</p>
                      <p className="mm-hint">Get Market Maker access to create prediction markets.</p>
                    </div>
                  ) : (
                    <MarketsTable
                      markets={categorizedMarkets.created}
                      onSelect={handleMarketSelect}
                      formatDate={formatDate}
                      getStatusClass={getStatusClass}
                      getStatusLabel={getStatusLabel}
                      getTimeRemaining={getTimeRemaining}
                      canResolve={canResolve}
                      canRespondToDispute={canRespondToDispute}
                      onResolve={handleOpenResolution}
                      onRespondToDispute={(m) => handleOpenDispute(m, 'respond')}
                      showActions
                    />
                  )}
                </div>
              )}

              {/* History Tab */}
              {activeTab === 'history' && (
                <div role="tabpanel" className="mm-panel">
                  {selectedMarket ? (
                    <MarketDetailView
                      market={selectedMarket}
                      onBack={handleBackToList}
                      formatDate={formatDate}
                      formatAddress={formatAddress}
                      getStatusClass={getStatusClass}
                      getStatusLabel={getStatusLabel}
                      getTimeRemaining={getTimeRemaining}
                      account={account}
                      userPositions={userPositions}
                      isHistoryView
                    />
                  ) : categorizedMarkets.history.length === 0 ? (
                    <div className="mm-empty-state">
                      <div className="mm-empty-icon">&#128214;</div>
                      <h3>No Market History</h3>
                      <p>Your resolved markets will appear here.</p>
                    </div>
                  ) : (
                    <MarketsTable
                      markets={categorizedMarkets.history}
                      onSelect={handleMarketSelect}
                      formatDate={formatDate}
                      getStatusClass={getStatusClass}
                      getStatusLabel={getStatusLabel}
                      getTimeRemaining={getTimeRemaining}
                      showOutcome
                    />
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Resolution Modal */}
      {showResolutionModal && resolutionMarket && (
        <ResolutionModal
          market={resolutionMarket}
          onClose={() => setShowResolutionModal(false)}
          onResolved={() => {
            setShowResolutionModal(false)
            fetchMarketsData()
          }}
          signer={signer}
          isCorrectNetwork={isCorrectNetwork}
          switchNetwork={switchNetwork}
        />
      )}

      {/* Dispute Modal */}
      {showDisputeModal && disputeMarket && (
        <DisputeModal
          market={disputeMarket}
          mode={disputeMode}
          onClose={() => setShowDisputeModal(false)}
          onSubmitted={() => {
            setShowDisputeModal(false)
            fetchMarketsData()
          }}
          signer={signer}
          isCorrectNetwork={isCorrectNetwork}
          switchNetwork={switchNetwork}
          account={account}
        />
      )}
    </div>
  )
}

/**
 * Markets Table Component
 */
function MarketsTable({
  markets,
  onSelect,
  getStatusClass,
  getStatusLabel,
  getTimeRemaining,
  showActions = false,
  showOutcome = false,
  canResolve,
  canRespondToDispute,
  onResolve,
  onRespondToDispute
}) {
  return (
    <div className="mm-table-container">
      <table className="mm-table" role="table">
        <thead>
          <tr>
            <th>Market</th>
            <th>Type</th>
            <th>{showOutcome ? 'Outcome' : 'Time Left'}</th>
            <th>Status</th>
            {showActions && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {markets.map((market) => {
            const endTime = market.tradingEndTime || market.endDate
            const timeLeft = getTimeRemaining(endTime)
            const showResolveBtn = showActions && canResolve?.(market)
            const showDisputeBtn = showActions && canRespondToDispute?.(market)

            return (
              <tr
                key={`${market.marketType}-${market.id}`}
                onClick={() => onSelect(market)}
                className="mm-table-row"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') onSelect(market) }}
              >
                <td className="mm-table-market">
                  <span className="mm-table-market-title">
                    {market.proposalTitle || market.description || `Market #${market.id}`}
                  </span>
                  {market.category && (
                    <span className="mm-table-category">{market.category}</span>
                  )}
                </td>
                <td>
                  <span className={`mm-type-badge mm-type-${market.marketType}`}>
                    {market.marketType === 'friend' ? 'Friend' : 'Prediction'}
                  </span>
                </td>
                <td className="mm-table-time">
                  {showOutcome ? (
                    <span className={`mm-outcome ${market.outcome === 'Pass' || market.outcome === 'Yes' ? 'positive' : 'negative'}`}>
                      {market.outcome || 'N/A'}
                    </span>
                  ) : (
                    timeLeft
                  )}
                </td>
                <td>
                  <span className={`mm-status-badge ${getStatusClass(market.computedStatus)}`}>
                    {getStatusLabel(market.computedStatus)}
                  </span>
                </td>
                {showActions && (
                  <td className="mm-table-actions" onClick={(e) => e.stopPropagation()}>
                    {showResolveBtn && (
                      <button
                        className="mm-action-btn mm-action-resolve"
                        onClick={(e) => { e.stopPropagation(); onResolve(market) }}
                        title="Resolve market"
                      >
                        Resolve
                      </button>
                    )}
                    {showDisputeBtn && (
                      <button
                        className="mm-action-btn mm-action-dispute"
                        onClick={(e) => { e.stopPropagation(); onRespondToDispute(market) }}
                        title="Respond to dispute"
                      >
                        Respond
                      </button>
                    )}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Market Detail View Component
 */
function MarketDetailView({
  market,
  onBack,
  formatDate,
  formatAddress,
  getStatusClass,
  getStatusLabel,
  getTimeRemaining,
  account,
  userPositions,
  canResolve,
  canOpenDispute,
  canRespondToDispute,
  onOpenResolution,
  onOpenDispute,
  onRespondToDispute,
  isCreatorView = false,
  isHistoryView = false
}) {
  const isCreator = market.creator?.toLowerCase() === account?.toLowerCase()
  const position = userPositions?.find(p => String(p.marketId) === String(market.id))
  const endTime = market.tradingEndTime || market.endDate

  return (
    <div className="mm-detail">
      <button type="button" className="mm-back-btn" onClick={onBack}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Back to list
      </button>

      <div className="mm-detail-header">
        <div className="mm-detail-title-row">
          <h3>{market.proposalTitle || market.description || `Market #${market.id}`}</h3>
          <span className={`mm-status-badge ${getStatusClass(market.computedStatus)}`}>
            {getStatusLabel(market.computedStatus)}
          </span>
        </div>
        <div className="mm-detail-meta">
          <span className={`mm-type-badge mm-type-${market.marketType}`}>
            {market.marketType === 'friend' ? 'Friend Market' : 'Prediction Market'}
          </span>
          {market.category && <span className="mm-category-tag">{market.category}</span>}
        </div>
      </div>

      {market.description && market.proposalTitle && (
        <div className="mm-detail-description">
          <p>{market.description}</p>
        </div>
      )}

      <div className="mm-detail-grid">
        <div className="mm-detail-item">
          <span className="mm-detail-label">Market ID</span>
          <span className="mm-detail-value">#{market.id}</span>
        </div>
        <div className="mm-detail-item">
          <span className="mm-detail-label">Creator</span>
          <span className="mm-detail-value">
            {formatAddress(market.creator)}
            {isCreator && <span className="mm-you-tag">You</span>}
          </span>
        </div>
        <div className="mm-detail-item">
          <span className="mm-detail-label">{isHistoryView ? 'Ended' : 'Ends'}</span>
          <span className="mm-detail-value">{formatDate(endTime)}</span>
        </div>
        {!isHistoryView && (
          <div className="mm-detail-item">
            <span className="mm-detail-label">Time Remaining</span>
            <span className="mm-detail-value mm-time-remaining">{getTimeRemaining(endTime)}</span>
          </div>
        )}
        {market.totalLiquidity && (
          <div className="mm-detail-item">
            <span className="mm-detail-label">Liquidity</span>
            <span className="mm-detail-value">${parseFloat(market.totalLiquidity).toLocaleString()}</span>
          </div>
        )}
        {market.volume24h && (
          <div className="mm-detail-item">
            <span className="mm-detail-label">24h Volume</span>
            <span className="mm-detail-value">${parseFloat(market.volume24h).toLocaleString()}</span>
          </div>
        )}
      </div>

      {/* User Position */}
      {position && (
        <div className="mm-position-section">
          <h4>Your Position</h4>
          <div className="mm-position-card">
            <div className="mm-position-item">
              <span className="mm-position-label">Side</span>
              <span className={`mm-position-value ${position.side === 'Pass' || position.side === 'Yes' ? 'positive' : 'negative'}`}>
                {position.side}
              </span>
            </div>
            <div className="mm-position-item">
              <span className="mm-position-label">Amount</span>
              <span className="mm-position-value">{position.amount}</span>
            </div>
            {position.pnl !== undefined && (
              <div className="mm-position-item">
                <span className="mm-position-label">P&L</span>
                <span className={`mm-position-value ${parseFloat(position.pnl) >= 0 ? 'positive' : 'negative'}`}>
                  {parseFloat(position.pnl) >= 0 ? '+' : ''}{position.pnl}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Outcome for resolved markets */}
      {isHistoryView && market.outcome && (
        <div className="mm-outcome-section">
          <h4>Market Outcome</h4>
          <div className={`mm-outcome-display ${market.outcome === 'Pass' || market.outcome === 'Yes' ? 'positive' : 'negative'}`}>
            {market.outcome}
          </div>
          {position && (
            <div className="mm-outcome-result">
              {position.side === market.outcome ? (
                <span className="mm-result-win">You won this market!</span>
              ) : (
                <span className="mm-result-loss">Better luck next time</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Dispute Info */}
      {market.computedStatus === 'disputed' && market.dispute && (
        <div className="mm-dispute-info">
          <h4>Active Dispute</h4>
          <div className="mm-dispute-card">
            <div className="mm-dispute-item">
              <span className="mm-dispute-label">Disputed By</span>
              <span className="mm-dispute-value">{formatAddress(market.dispute.disputedBy)}</span>
            </div>
            <div className="mm-dispute-item">
              <span className="mm-dispute-label">Reason</span>
              <span className="mm-dispute-value">{market.dispute.reason}</span>
            </div>
            <div className="mm-dispute-item">
              <span className="mm-dispute-label">Status</span>
              <span className="mm-dispute-value">{market.dispute.status}</span>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mm-detail-actions">
        {isCreatorView && canResolve?.(market) && (
          <button
            type="button"
            className="mm-btn-primary"
            onClick={() => onOpenResolution(market)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Resolve Market
          </button>
        )}
        {isCreatorView && canRespondToDispute?.(market) && (
          <button
            type="button"
            className="mm-btn-warning"
            onClick={() => onRespondToDispute(market)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
            </svg>
            Respond to Dispute
          </button>
        )}
        {!isCreatorView && canOpenDispute?.(market) && (
          <button
            type="button"
            className="mm-btn-secondary"
            onClick={() => onOpenDispute(market)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            Open Dispute
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Resolution Modal Component
 */
function ResolutionModal({
  market,
  onClose,
  onResolved,
  isCorrectNetwork,
  switchNetwork
}) {
  const [selectedOutcome, setSelectedOutcome] = useState(null)
  const [resolutionNotes, setResolutionNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('select') // 'select', 'confirm', 'success'

  const outcomes = market.marketType === 'friend'
    ? ['Pass', 'Fail']
    : ['Yes', 'No']

  const handleSubmit = async () => {
    if (!selectedOutcome) {
      setError('Please select an outcome')
      return
    }

    if (!isCorrectNetwork) {
      setError('Please switch to the correct network')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      // TODO: Implement actual contract call for resolution
      // For now, simulate the resolution
      console.log('Resolving market:', {
        marketId: market.id,
        outcome: selectedOutcome,
        notes: resolutionNotes
      })

      await new Promise(resolve => setTimeout(resolve, 1500))
      setStep('success')
    } catch (err) {
      console.error('Error resolving market:', err)
      setError(err.message || 'Failed to resolve market. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && !submitting) {
      onClose()
    }
  }

  return (
    <div className="mm-sub-modal-backdrop" onClick={handleBackdropClick}>
      <div className="mm-sub-modal" onClick={(e) => e.stopPropagation()}>
        <header className="mm-sub-modal-header">
          <h3>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Resolve Market
          </h3>
          <button
            className="mm-close-btn"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </header>

        <div className="mm-sub-modal-content">
          {step === 'select' && (
            <>
              <div className="mm-resolution-market-info">
                <h4>{market.proposalTitle || market.description}</h4>
                <p className="mm-resolution-hint">
                  Select the winning outcome for this market. This action will distribute
                  winnings to participants who predicted correctly.
                </p>
              </div>

              <div className="mm-resolution-outcomes">
                <label className="mm-outcome-label">Select Outcome</label>
                <div className="mm-outcome-options">
                  {outcomes.map(outcome => (
                    <button
                      key={outcome}
                      type="button"
                      className={`mm-outcome-btn ${selectedOutcome === outcome ? 'selected' : ''} ${outcome === outcomes[0] ? 'positive' : 'negative'}`}
                      onClick={() => setSelectedOutcome(outcome)}
                      disabled={submitting}
                    >
                      {outcome}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mm-resolution-notes">
                <label htmlFor="resolution-notes">Resolution Notes (Optional)</label>
                <textarea
                  id="resolution-notes"
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  placeholder="Add any notes about how the outcome was determined..."
                  rows={3}
                  disabled={submitting}
                />
              </div>

              {!isCorrectNetwork && (
                <div className="mm-warning-banner">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                  <div>
                    <strong>Wrong Network</strong>
                    <button type="button" onClick={switchNetwork}>Switch Network</button>
                  </div>
                </div>
              )}

              {error && <div className="mm-error-banner">{error}</div>}

              <div className="mm-sub-modal-actions">
                <button
                  type="button"
                  className="mm-btn-secondary"
                  onClick={onClose}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="mm-btn-primary"
                  onClick={() => setStep('confirm')}
                  disabled={!selectedOutcome || submitting || !isCorrectNetwork}
                >
                  Continue
                </button>
              </div>
            </>
          )}

          {step === 'confirm' && (
            <>
              <div className="mm-confirmation">
                <div className="mm-confirmation-icon">&#9888;</div>
                <h4>Confirm Resolution</h4>
                <p>
                  You are about to resolve this market with outcome: <strong>{selectedOutcome}</strong>
                </p>
                <p className="mm-confirmation-warning">
                  This action cannot be undone. Participants will have a window to dispute
                  the resolution if they disagree.
                </p>
              </div>

              {error && <div className="mm-error-banner">{error}</div>}

              <div className="mm-sub-modal-actions">
                <button
                  type="button"
                  className="mm-btn-secondary"
                  onClick={() => setStep('select')}
                  disabled={submitting}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="mm-btn-primary"
                  onClick={handleSubmit}
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <span className="mm-spinner-small"></span>
                      Resolving...
                    </>
                  ) : (
                    'Confirm Resolution'
                  )}
                </button>
              </div>
            </>
          )}

          {step === 'success' && (
            <div className="mm-success-state">
              <div className="mm-success-icon">&#9989;</div>
              <h4>Market Resolved!</h4>
              <p>
                The market has been resolved with outcome: <strong>{selectedOutcome}</strong>
              </p>
              <p className="mm-success-hint">
                Participants will be notified and can claim their winnings or open a dispute
                within the dispute window.
              </p>
              <button
                type="button"
                className="mm-btn-primary"
                onClick={onResolved}
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Dispute Modal Component
 */
function DisputeModal({
  market,
  mode, // 'open', 'respond', 'escalate'
  onClose,
  onSubmitted,
  isCorrectNetwork,
  switchNetwork
}) {
  const [disputeReason, setDisputeReason] = useState('')
  const [evidenceUrl, setEvidenceUrl] = useState('')
  const [responseText, setResponseText] = useState('')
  const [selectedResolution, setSelectedResolution] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('form') // 'form', 'confirm', 'success'

  const isOpenMode = mode === 'open'
  const isRespondMode = mode === 'respond'

  const outcomes = market.marketType === 'friend'
    ? ['Pass', 'Fail']
    : ['Yes', 'No']

  const handleSubmit = async () => {
    if (isOpenMode && !disputeReason.trim()) {
      setError('Please provide a reason for the dispute')
      return
    }

    if (isRespondMode && !responseText.trim()) {
      setError('Please provide a response')
      return
    }

    if (!isCorrectNetwork) {
      setError('Please switch to the correct network')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      // TODO: Implement actual contract call for dispute
      console.log('Dispute action:', {
        mode,
        marketId: market.id,
        reason: disputeReason,
        evidence: evidenceUrl,
        response: responseText,
        suggestedResolution: selectedResolution
      })

      await new Promise(resolve => setTimeout(resolve, 1500))
      setStep('success')
    } catch (err) {
      console.error('Error processing dispute:', err)
      setError(err.message || 'Failed to process dispute. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && !submitting) {
      onClose()
    }
  }

  const getTitle = () => {
    if (isOpenMode) return 'Open Dispute'
    if (isRespondMode) return 'Respond to Dispute'
    return 'Escalate Dispute'
  }

  const getIcon = () => {
    if (isRespondMode) return '&#128172;' // Speech bubble
    return '&#9888;' // Warning
  }

  return (
    <div className="mm-sub-modal-backdrop" onClick={handleBackdropClick}>
      <div className="mm-sub-modal mm-dispute-modal" onClick={(e) => e.stopPropagation()}>
        <header className="mm-sub-modal-header">
          <h3>
            <span dangerouslySetInnerHTML={{ __html: getIcon() }} />
            {getTitle()}
          </h3>
          <button
            className="mm-close-btn"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </header>

        <div className="mm-sub-modal-content">
          {step === 'form' && (
            <>
              <div className="mm-dispute-market-info">
                <h4>{market.proposalTitle || market.description}</h4>
                {market.outcome && (
                  <p className="mm-dispute-current-outcome">
                    Current resolution: <strong>{market.outcome}</strong>
                  </p>
                )}
              </div>

              {isOpenMode && (
                <>
                  <div className="mm-form-group">
                    <label htmlFor="dispute-reason">
                      Reason for Dispute <span className="mm-required">*</span>
                    </label>
                    <textarea
                      id="dispute-reason"
                      value={disputeReason}
                      onChange={(e) => setDisputeReason(e.target.value)}
                      placeholder="Explain why you believe the market resolution is incorrect..."
                      rows={4}
                      disabled={submitting}
                      className={error && !disputeReason.trim() ? 'error' : ''}
                    />
                  </div>

                  <div className="mm-form-group">
                    <label htmlFor="evidence-url">Evidence URL (Optional)</label>
                    <input
                      id="evidence-url"
                      type="url"
                      value={evidenceUrl}
                      onChange={(e) => setEvidenceUrl(e.target.value)}
                      placeholder="https://..."
                      disabled={submitting}
                    />
                    <span className="mm-hint">Link to evidence supporting your dispute</span>
                  </div>

                  <div className="mm-form-group">
                    <label>Correct Outcome (Your View)</label>
                    <div className="mm-outcome-options">
                      {outcomes.map(outcome => (
                        <button
                          key={outcome}
                          type="button"
                          className={`mm-outcome-btn ${selectedResolution === outcome ? 'selected' : ''} ${outcome === outcomes[0] ? 'positive' : 'negative'}`}
                          onClick={() => setSelectedResolution(outcome)}
                          disabled={submitting}
                        >
                          {outcome}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mm-dispute-info-box">
                    <h5>What happens next?</h5>
                    <ul>
                      <li>The market maker will be notified and can respond</li>
                      <li>A dispute bond may be required (refunded if you win)</li>
                      <li>If unresolved, the dispute can be escalated to arbitration</li>
                    </ul>
                  </div>
                </>
              )}

              {isRespondMode && (
                <>
                  {market.dispute && (
                    <div className="mm-dispute-details">
                      <h5>Dispute Details</h5>
                      <div className="mm-dispute-detail-item">
                        <span className="mm-label">Disputed by:</span>
                        <span>{market.dispute.disputedBy?.slice(0, 6)}...{market.dispute.disputedBy?.slice(-4)}</span>
                      </div>
                      <div className="mm-dispute-detail-item">
                        <span className="mm-label">Reason:</span>
                        <span>{market.dispute.reason}</span>
                      </div>
                      <div className="mm-dispute-detail-item">
                        <span className="mm-label">Suggested outcome:</span>
                        <span>{market.dispute.suggestedOutcome}</span>
                      </div>
                    </div>
                  )}

                  <div className="mm-form-group">
                    <label htmlFor="response-text">
                      Your Response <span className="mm-required">*</span>
                    </label>
                    <textarea
                      id="response-text"
                      value={responseText}
                      onChange={(e) => setResponseText(e.target.value)}
                      placeholder="Provide your response to this dispute..."
                      rows={4}
                      disabled={submitting}
                      className={error && !responseText.trim() ? 'error' : ''}
                    />
                  </div>

                  <div className="mm-form-group">
                    <label>Resolution Decision</label>
                    <div className="mm-resolution-options">
                      <button
                        type="button"
                        className={`mm-resolution-btn ${selectedResolution === 'accept' ? 'selected accept' : ''}`}
                        onClick={() => setSelectedResolution('accept')}
                        disabled={submitting}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        Accept Dispute
                      </button>
                      <button
                        type="button"
                        className={`mm-resolution-btn ${selectedResolution === 'reject' ? 'selected reject' : ''}`}
                        onClick={() => setSelectedResolution('reject')}
                        disabled={submitting}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                        Reject Dispute
                      </button>
                    </div>
                    <span className="mm-hint">
                      {selectedResolution === 'accept'
                        ? 'The market resolution will be changed to the disputant\'s suggested outcome'
                        : selectedResolution === 'reject'
                        ? 'The original resolution will be maintained. The disputant can escalate.'
                        : 'Select your decision'}
                    </span>
                  </div>
                </>
              )}

              {!isCorrectNetwork && (
                <div className="mm-warning-banner">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                  <div>
                    <strong>Wrong Network</strong>
                    <button type="button" onClick={switchNetwork}>Switch Network</button>
                  </div>
                </div>
              )}

              {error && <div className="mm-error-banner">{error}</div>}

              <div className="mm-sub-modal-actions">
                <button
                  type="button"
                  className="mm-btn-secondary"
                  onClick={onClose}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="mm-btn-primary"
                  onClick={() => setStep('confirm')}
                  disabled={submitting || !isCorrectNetwork || (isRespondMode && !selectedResolution)}
                >
                  Continue
                </button>
              </div>
            </>
          )}

          {step === 'confirm' && (
            <>
              <div className="mm-confirmation">
                <div className="mm-confirmation-icon">&#9888;</div>
                <h4>Confirm {isOpenMode ? 'Dispute' : 'Response'}</h4>
                {isOpenMode ? (
                  <p>
                    You are about to open a dispute for this market.
                    {selectedResolution && ` You believe the correct outcome should be: ${selectedResolution}`}
                  </p>
                ) : (
                  <p>
                    You are about to {selectedResolution === 'accept' ? 'accept' : 'reject'} this dispute.
                    {selectedResolution === 'accept'
                      ? ' The market resolution will be changed.'
                      : ' The original resolution will be maintained.'}
                  </p>
                )}
              </div>

              {error && <div className="mm-error-banner">{error}</div>}

              <div className="mm-sub-modal-actions">
                <button
                  type="button"
                  className="mm-btn-secondary"
                  onClick={() => setStep('form')}
                  disabled={submitting}
                >
                  Back
                </button>
                <button
                  type="button"
                  className={`mm-btn-primary ${isOpenMode ? 'warning' : ''}`}
                  onClick={handleSubmit}
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <span className="mm-spinner-small"></span>
                      Processing...
                    </>
                  ) : (
                    isOpenMode ? 'Submit Dispute' : 'Submit Response'
                  )}
                </button>
              </div>
            </>
          )}

          {step === 'success' && (
            <div className="mm-success-state">
              <div className="mm-success-icon">&#9989;</div>
              <h4>{isOpenMode ? 'Dispute Submitted!' : 'Response Submitted!'}</h4>
              <p>
                {isOpenMode
                  ? 'Your dispute has been recorded. The market maker will be notified and can respond.'
                  : selectedResolution === 'accept'
                  ? 'The dispute has been accepted. The market resolution will be updated.'
                  : 'The dispute has been rejected. The disputant can escalate if they disagree.'}
              </p>
              <button
                type="button"
                className="mm-btn-primary"
                onClick={onSubmitted}
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default MyMarketsModal
