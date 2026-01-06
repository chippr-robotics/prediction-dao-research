import { useState, useEffect, useCallback, useMemo } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { useWallet, useWeb3 } from '../../hooks'
import './FriendMarketsModal.css'

/**
 * FriendMarketsModal Component
 *
 * A dedicated modal for managing friend markets:
 * - Create: Create new friend markets (1v1, Small Group, Event Tracking)
 * - Active: View and manage active friend markets
 * - Past: View completed/resolved friend markets
 *
 * Features QR code generation for sharing after creation
 */
function FriendMarketsModal({
  isOpen,
  onClose,
  onCreate,
  activeMarkets = [],
  pastMarkets = [],
  onMarketClick
}) {
  const { isConnected, account } = useWallet()
  const { signer, isCorrectNetwork, switchNetwork } = useWeb3()

  // Tab state
  const [activeTab, setActiveTab] = useState('create') // 'create', 'active', 'past'

  // Creation flow state
  const [creationStep, setCreationStep] = useState('type') // 'type', 'form', 'success'
  const [friendMarketType, setFriendMarketType] = useState(null)
  const [createdMarket, setCreatedMarket] = useState(null)

  // Form data
  const [formData, setFormData] = useState({
    description: '',
    opponent: '',
    members: '',
    memberLimit: '5',
    tradingPeriod: '7',
    stakeAmount: '10',
    arbitrator: '',
    peggedMarketId: ''
  })

  // Selected market for detail view
  const [selectedMarket, setSelectedMarket] = useState(null)

  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  // Reset modal state when opened
  useEffect(() => {
    if (isOpen) {
      setActiveTab('create')
      setCreationStep('type')
      setFriendMarketType(null)
      setCreatedMarket(null)
      setSelectedMarket(null)
      setErrors({})
      resetForm()
    }
  }, [isOpen])

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  const resetForm = () => {
    setFormData({
      description: '',
      opponent: '',
      members: '',
      memberLimit: '5',
      tradingPeriod: '7',
      stakeAmount: '10',
      arbitrator: '',
      peggedMarketId: ''
    })
    setErrors({})
  }

  const handleClose = () => {
    if (!submitting) {
      onClose()
    }
  }

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      handleClose()
    }
  }

  const handleFormChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[field]
        return newErrors
      })
    }
  }

  const validateForm = useCallback(() => {
    const newErrors = {}

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required'
    } else if (formData.description.length < 10) {
      newErrors.description = 'Description must be at least 10 characters'
    }

    if (friendMarketType === 'oneVsOne') {
      if (!formData.opponent.trim()) {
        newErrors.opponent = 'Opponent address is required'
      } else if (!/^0x[a-fA-F0-9]{40}$/.test(formData.opponent.trim())) {
        newErrors.opponent = 'Invalid Ethereum address'
      } else if (formData.opponent.toLowerCase() === account?.toLowerCase()) {
        newErrors.opponent = 'Cannot bet against yourself'
      }
    }

    if (friendMarketType === 'smallGroup' || friendMarketType === 'eventTracking') {
      if (!formData.members.trim()) {
        newErrors.members = 'Member addresses are required'
      } else {
        const addresses = formData.members.split(',').map(a => a.trim()).filter(a => a)
        const minMembers = friendMarketType === 'eventTracking' ? 3 : 2
        const maxMembers = 10

        if (addresses.length < minMembers) {
          newErrors.members = `At least ${minMembers} members required`
        } else if (addresses.length > maxMembers) {
          newErrors.members = `Maximum ${maxMembers} members allowed`
        } else {
          for (const addr of addresses) {
            if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
              newErrors.members = `Invalid address: ${addr.slice(0, 10)}...`
              break
            }
          }
        }
      }
    }

    const stake = parseFloat(formData.stakeAmount)
    if (!formData.stakeAmount || stake <= 0) {
      newErrors.stakeAmount = 'Valid stake amount is required'
    } else if (stake < 0.1) {
      newErrors.stakeAmount = 'Minimum stake is 0.1 ETC'
    }

    if (!formData.tradingPeriod || parseInt(formData.tradingPeriod) < 1) {
      newErrors.tradingPeriod = 'Trading period must be at least 1 day'
    } else if (parseInt(formData.tradingPeriod) > 365) {
      newErrors.tradingPeriod = 'Maximum trading period is 365 days'
    }

    if (formData.arbitrator && !/^0x[a-fA-F0-9]{40}$/.test(formData.arbitrator.trim())) {
      newErrors.arbitrator = 'Invalid arbitrator address'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [formData, friendMarketType, account])

  const handleSelectType = (type) => {
    setFriendMarketType(type)
    setCreationStep('form')
    resetForm()
  }

  const handleBackToType = () => {
    setCreationStep('type')
    setFriendMarketType(null)
    resetForm()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!isConnected) {
      setErrors({ submit: 'Please connect your wallet to continue' })
      return
    }

    if (!isCorrectNetwork) {
      setErrors({ submit: 'Please switch to the correct network' })
      return
    }

    if (!validateForm()) return

    setSubmitting(true)
    try {
      const submitData = {
        type: 'friend',
        marketType: friendMarketType,
        data: formData
      }

      const result = await onCreate(submitData, signer)

      // Simulate created market for demo
      const newMarket = {
        id: result?.id || `friend-${Date.now()}`,
        type: friendMarketType,
        description: formData.description,
        stakeAmount: formData.stakeAmount,
        tradingPeriod: formData.tradingPeriod,
        participants: friendMarketType === 'oneVsOne'
          ? [account, formData.opponent]
          : formData.members.split(',').map(a => a.trim()),
        createdAt: new Date().toISOString(),
        status: 'pending'
      }

      setCreatedMarket(newMarket)
      setCreationStep('success')
    } catch (error) {
      console.error('Error creating friend market:', error)
      setErrors({ submit: error.message || 'Failed to create market. Please try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  const handleCreateAnother = () => {
    setCreationStep('type')
    setFriendMarketType(null)
    setCreatedMarket(null)
    resetForm()
  }

  const handleMarketSelect = (market) => {
    setSelectedMarket(market)
  }

  const handleBackToList = () => {
    setSelectedMarket(null)
  }

  // Generate market URL for QR code
  const getMarketUrl = (market) => {
    return `${window.location.origin}/friend-market/${market?.id || 'preview'}`
  }

  // Format date for display
  const formatDate = (dateString) => {
    const date = new Date(dateString)
    if (Number.isNaN(date.getTime())) return 'N/A'
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  // Format address for display
  const formatAddress = (address) => {
    if (!address) return 'N/A'
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  // Get type label
  const getTypeLabel = (type) => {
    switch (type) {
      case 'oneVsOne': return '1v1'
      case 'smallGroup': return 'Group'
      case 'eventTracking': return 'Event'
      default: return type
    }
  }

  // Get status badge class
  const getStatusClass = (status) => {
    switch (status?.toLowerCase()) {
      case 'active': return 'status-active'
      case 'pending': return 'status-pending'
      case 'resolved': return 'status-resolved'
      case 'won': return 'status-won'
      case 'lost': return 'status-lost'
      default: return 'status-default'
    }
  }

  // Filter markets where user is participating
  const userActiveMarkets = useMemo(() => {
    return activeMarkets.filter(m =>
      m.participants?.some(p => p.toLowerCase() === account?.toLowerCase()) ||
      m.creator?.toLowerCase() === account?.toLowerCase()
    )
  }, [activeMarkets, account])

  const userPastMarkets = useMemo(() => {
    return pastMarkets.filter(m =>
      m.participants?.some(p => p.toLowerCase() === account?.toLowerCase()) ||
      m.creator?.toLowerCase() === account?.toLowerCase()
    )
  }, [pastMarkets, account])

  if (!isOpen) return null

  return (
    <div
      className="friend-markets-modal-backdrop"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="friend-markets-modal-title"
    >
      <div className="friend-markets-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <header className="fm-header">
          <div className="fm-header-content">
            <div className="fm-brand">
              <span className="fm-brand-icon">&#127808;</span>
              <h2 id="friend-markets-modal-title">Friend Markets</h2>
            </div>
            <p className="fm-subtitle">Private prediction markets with friends</p>
          </div>
          <button
            className="fm-close-btn"
            onClick={handleClose}
            disabled={submitting}
            aria-label="Close modal"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </header>

        {/* Tab Navigation */}
        <nav className="fm-tabs" role="tablist">
          <button
            className={`fm-tab ${activeTab === 'create' ? 'active' : ''}`}
            onClick={() => { setActiveTab('create'); setSelectedMarket(null) }}
            role="tab"
            aria-selected={activeTab === 'create'}
            aria-controls="panel-create"
            disabled={submitting}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 8v8M8 12h8"/>
            </svg>
            <span>Create</span>
          </button>
          <button
            className={`fm-tab ${activeTab === 'active' ? 'active' : ''}`}
            onClick={() => { setActiveTab('active'); setSelectedMarket(null) }}
            role="tab"
            aria-selected={activeTab === 'active'}
            aria-controls="panel-active"
            disabled={submitting}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
            </svg>
            <span>Active</span>
            {userActiveMarkets.length > 0 && (
              <span className="fm-tab-badge">{userActiveMarkets.length}</span>
            )}
          </button>
          <button
            className={`fm-tab ${activeTab === 'past' ? 'active' : ''}`}
            onClick={() => { setActiveTab('past'); setSelectedMarket(null) }}
            role="tab"
            aria-selected={activeTab === 'past'}
            aria-controls="panel-past"
            disabled={submitting}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            <span>Past</span>
          </button>
        </nav>

        {/* Content Area */}
        <div className="fm-content">
          {/* Create Tab */}
          {activeTab === 'create' && (
            <div id="panel-create" role="tabpanel" className="fm-panel">
              {/* Type Selection Step */}
              {creationStep === 'type' && (
                <div className="fm-type-selection">
                  <h3 className="fm-section-title">Choose Market Type</h3>
                  <div className="fm-type-grid">
                    <button
                      className="fm-type-card"
                      onClick={() => handleSelectType('oneVsOne')}
                      type="button"
                    >
                      <div className="fm-type-icon">&#127919;</div>
                      <div className="fm-type-info">
                        <h4>1 vs 1</h4>
                        <p>Head-to-head bet with a friend</p>
                      </div>
                      <svg className="fm-type-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                    </button>
                    <button
                      className="fm-type-card"
                      onClick={() => handleSelectType('smallGroup')}
                      type="button"
                    >
                      <div className="fm-type-icon">&#128106;</div>
                      <div className="fm-type-info">
                        <h4>Small Group</h4>
                        <p>Pool predictions with 2-10 friends</p>
                      </div>
                      <svg className="fm-type-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                    </button>
                    <button
                      className="fm-type-card"
                      onClick={() => handleSelectType('eventTracking')}
                      type="button"
                    >
                      <div className="fm-type-icon">&#127942;</div>
                      <div className="fm-type-info">
                        <h4>Event Tracking</h4>
                        <p>Competitive predictions for events</p>
                      </div>
                      <svg className="fm-type-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                    </button>
                  </div>
                </div>
              )}

              {/* Form Step */}
              {creationStep === 'form' && (
                <form className="fm-form" onSubmit={handleSubmit}>
                  <div className="fm-form-header">
                    <button
                      type="button"
                      className="fm-back-btn"
                      onClick={handleBackToType}
                      disabled={submitting}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="15 18 9 12 15 6"/>
                      </svg>
                      Back
                    </button>
                    <div className="fm-form-type-badge">
                      {friendMarketType === 'oneVsOne' && '&#127919; 1v1'}
                      {friendMarketType === 'smallGroup' && '&#128106; Group'}
                      {friendMarketType === 'eventTracking' && '&#127942; Event'}
                    </div>
                  </div>

                  <div className="fm-form-grid">
                    <div className="fm-form-group fm-form-full">
                      <label htmlFor="fm-description">
                        What&apos;s the bet? <span className="fm-required">*</span>
                      </label>
                      <input
                        id="fm-description"
                        type="text"
                        value={formData.description}
                        onChange={(e) => handleFormChange('description', e.target.value)}
                        placeholder="e.g., Patriots win the Super Bowl"
                        disabled={submitting}
                        className={errors.description ? 'error' : ''}
                        maxLength={200}
                      />
                      {errors.description && <span className="fm-error">{errors.description}</span>}
                    </div>

                    {friendMarketType === 'oneVsOne' && (
                      <div className="fm-form-group fm-form-full">
                        <label htmlFor="fm-opponent">
                          Opponent Address <span className="fm-required">*</span>
                        </label>
                        <input
                          id="fm-opponent"
                          type="text"
                          value={formData.opponent}
                          onChange={(e) => handleFormChange('opponent', e.target.value)}
                          placeholder="0x..."
                          disabled={submitting}
                          className={errors.opponent ? 'error' : ''}
                        />
                        {errors.opponent && <span className="fm-error">{errors.opponent}</span>}
                      </div>
                    )}

                    {(friendMarketType === 'smallGroup' || friendMarketType === 'eventTracking') && (
                      <div className="fm-form-group fm-form-full">
                        <label htmlFor="fm-members">
                          Member Addresses <span className="fm-required">*</span>
                        </label>
                        <input
                          id="fm-members"
                          type="text"
                          value={formData.members}
                          onChange={(e) => handleFormChange('members', e.target.value)}
                          placeholder="0x123..., 0x456..., 0x789..."
                          disabled={submitting}
                          className={errors.members ? 'error' : ''}
                        />
                        <span className="fm-hint">
                          Comma-separated ({friendMarketType === 'eventTracking' ? '3-10' : '2-10'} members)
                        </span>
                        {errors.members && <span className="fm-error">{errors.members}</span>}
                      </div>
                    )}

                    <div className="fm-form-group">
                      <label htmlFor="fm-stake">
                        Stake (ETC) <span className="fm-required">*</span>
                      </label>
                      <input
                        id="fm-stake"
                        type="number"
                        value={formData.stakeAmount}
                        onChange={(e) => handleFormChange('stakeAmount', e.target.value)}
                        placeholder="10"
                        min="0.1"
                        step="0.1"
                        disabled={submitting}
                        className={errors.stakeAmount ? 'error' : ''}
                      />
                      {errors.stakeAmount && <span className="fm-error">{errors.stakeAmount}</span>}
                    </div>

                    <div className="fm-form-group">
                      <label htmlFor="fm-period">
                        Duration (Days) <span className="fm-required">*</span>
                      </label>
                      <input
                        id="fm-period"
                        type="number"
                        value={formData.tradingPeriod}
                        onChange={(e) => handleFormChange('tradingPeriod', e.target.value)}
                        placeholder="7"
                        min="1"
                        max="365"
                        disabled={submitting}
                        className={errors.tradingPeriod ? 'error' : ''}
                      />
                      {errors.tradingPeriod && <span className="fm-error">{errors.tradingPeriod}</span>}
                    </div>

                    <div className="fm-form-group fm-form-full">
                      <label htmlFor="fm-arbitrator">
                        Arbitrator (Optional)
                      </label>
                      <input
                        id="fm-arbitrator"
                        type="text"
                        value={formData.arbitrator}
                        onChange={(e) => handleFormChange('arbitrator', e.target.value)}
                        placeholder="0x... (trusted third party)"
                        disabled={submitting}
                        className={errors.arbitrator ? 'error' : ''}
                      />
                      {errors.arbitrator && <span className="fm-error">{errors.arbitrator}</span>}
                    </div>
                  </div>

                  {/* Network Warning */}
                  {isConnected && !isCorrectNetwork && (
                    <div className="fm-warning">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                      </svg>
                      <div>
                        <strong>Wrong Network</strong>
                        <button type="button" onClick={switchNetwork}>Switch Network</button>
                      </div>
                    </div>
                  )}

                  {/* Submit Error */}
                  {errors.submit && (
                    <div className="fm-error-banner">{errors.submit}</div>
                  )}

                  {/* Actions */}
                  <div className="fm-form-actions">
                    <button
                      type="button"
                      className="fm-btn-secondary"
                      onClick={handleBackToType}
                      disabled={submitting}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="fm-btn-primary"
                      disabled={submitting || !isConnected || !isCorrectNetwork}
                    >
                      {submitting ? (
                        <>
                          <span className="fm-spinner"></span>
                          Creating...
                        </>
                      ) : (
                        'Create Market'
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* Success Step with QR Code */}
              {creationStep === 'success' && createdMarket && (
                <div className="fm-success">
                  <div className="fm-success-icon">&#9989;</div>
                  <h3>Market Created!</h3>
                  <p className="fm-success-desc">{createdMarket.description}</p>

                  <div className="fm-qr-section">
                    <div className="fm-qr-container">
                      <QRCodeSVG
                        value={getMarketUrl(createdMarket)}
                        size={180}
                        level="H"
                        includeMargin={false}
                        fgColor="#36B37E"
                        bgColor="transparent"
                        aria-label="QR code to share market"
                        imageSettings={{
                          src: '/logo_fairwins.svg',
                          height: 32,
                          width: 32,
                          excavate: true,
                        }}
                      />
                    </div>
                    <p className="fm-qr-hint">Scan to join market</p>
                  </div>

                  <div className="fm-success-details">
                    <div className="fm-detail-row">
                      <span>Type</span>
                      <span>{getTypeLabel(createdMarket.type)}</span>
                    </div>
                    <div className="fm-detail-row">
                      <span>Stake</span>
                      <span>{createdMarket.stakeAmount} ETC</span>
                    </div>
                    <div className="fm-detail-row">
                      <span>Duration</span>
                      <span>{createdMarket.tradingPeriod} days</span>
                    </div>
                  </div>

                  <div className="fm-success-actions">
                    <button
                      type="button"
                      className="fm-btn-secondary"
                      onClick={handleCreateAnother}
                    >
                      Create Another
                    </button>
                    <button
                      type="button"
                      className="fm-btn-primary"
                      onClick={() => {
                        navigator.clipboard.writeText(getMarketUrl(createdMarket))
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                      </svg>
                      Copy Link
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Active Markets Tab */}
          {activeTab === 'active' && (
            <div id="panel-active" role="tabpanel" className="fm-panel">
              {selectedMarket ? (
                <MarketDetailView
                  market={selectedMarket}
                  onBack={handleBackToList}
                  formatDate={formatDate}
                  formatAddress={formatAddress}
                  getTypeLabel={getTypeLabel}
                  getStatusClass={getStatusClass}
                  account={account}
                />
              ) : (
                <>
                  {userActiveMarkets.length === 0 ? (
                    <div className="fm-empty-state">
                      <div className="fm-empty-icon">&#128200;</div>
                      <h3>No Active Markets</h3>
                      <p>You don&apos;t have any active friend markets yet.</p>
                      <button
                        type="button"
                        className="fm-btn-primary"
                        onClick={() => setActiveTab('create')}
                      >
                        Create Your First Market
                      </button>
                    </div>
                  ) : (
                    <div className="fm-markets-list">
                      <MarketsCompactTable
                        markets={userActiveMarkets}
                        onSelect={handleMarketSelect}
                        formatDate={formatDate}
                        formatAddress={formatAddress}
                        getTypeLabel={getTypeLabel}
                        getStatusClass={getStatusClass}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Past Markets Tab */}
          {activeTab === 'past' && (
            <div id="panel-past" role="tabpanel" className="fm-panel">
              {selectedMarket ? (
                <MarketDetailView
                  market={selectedMarket}
                  onBack={handleBackToList}
                  formatDate={formatDate}
                  formatAddress={formatAddress}
                  getTypeLabel={getTypeLabel}
                  getStatusClass={getStatusClass}
                  account={account}
                />
              ) : (
                <>
                  {userPastMarkets.length === 0 ? (
                    <div className="fm-empty-state">
                      <div className="fm-empty-icon">&#128203;</div>
                      <h3>No Past Markets</h3>
                      <p>Completed markets will appear here.</p>
                    </div>
                  ) : (
                    <div className="fm-markets-list">
                      <MarketsCompactTable
                        markets={userPastMarkets}
                        onSelect={handleMarketSelect}
                        formatDate={formatDate}
                        formatAddress={formatAddress}
                        getTypeLabel={getTypeLabel}
                        getStatusClass={getStatusClass}
                        isPast
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Compact table component for displaying markets
 */
function MarketsCompactTable({
  markets,
  onSelect,
  formatDate,
  formatAddress,
  getTypeLabel,
  getStatusClass,
  isPast = false
}) {
  return (
    <table className="fm-table" role="table">
      <thead>
        <tr>
          <th>Description</th>
          <th>Type</th>
          <th>Stake</th>
          <th>{isPast ? 'Result' : 'Ends'}</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {markets.map((market) => (
          <tr
            key={market.id}
            onClick={() => onSelect(market)}
            className="fm-table-row"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') onSelect(market) }}
          >
            <td className="fm-table-desc">
              <span className="fm-table-desc-text">{market.description}</span>
            </td>
            <td>
              <span className="fm-type-badge">{getTypeLabel(market.type)}</span>
            </td>
            <td className="fm-table-stake">{market.stakeAmount} ETC</td>
            <td className="fm-table-date">
              {isPast
                ? (market.outcome || 'Resolved')
                : formatDate(market.endDate)
              }
            </td>
            <td>
              <span className={`fm-status-badge ${getStatusClass(market.status)}`}>
                {market.status}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/**
 * Market detail view component
 */
function MarketDetailView({
  market,
  onBack,
  formatDate,
  formatAddress,
  getTypeLabel,
  getStatusClass,
  account
}) {
  const isCreator = market.creator?.toLowerCase() === account?.toLowerCase()
  const marketUrl = `${window.location.origin}/friend-market/${market.id}`

  return (
    <div className="fm-detail">
      <button type="button" className="fm-back-btn" onClick={onBack}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Back to list
      </button>

      <div className="fm-detail-header">
        <h3>{market.description}</h3>
        <span className={`fm-status-badge ${getStatusClass(market.status)}`}>
          {market.status}
        </span>
      </div>

      <div className="fm-detail-grid">
        <div className="fm-detail-item">
          <span className="fm-detail-label">Type</span>
          <span className="fm-detail-value">{getTypeLabel(market.type)}</span>
        </div>
        <div className="fm-detail-item">
          <span className="fm-detail-label">Stake</span>
          <span className="fm-detail-value">{market.stakeAmount} ETC</span>
        </div>
        <div className="fm-detail-item">
          <span className="fm-detail-label">Total Pool</span>
          <span className="fm-detail-value">
            {(parseFloat(market.stakeAmount || 0) * (market.participants?.length || 2)).toFixed(2)} ETC
          </span>
        </div>
        <div className="fm-detail-item">
          <span className="fm-detail-label">Created</span>
          <span className="fm-detail-value">{formatDate(market.createdAt)}</span>
        </div>
        <div className="fm-detail-item">
          <span className="fm-detail-label">Ends</span>
          <span className="fm-detail-value">{formatDate(market.endDate)}</span>
        </div>
        <div className="fm-detail-item">
          <span className="fm-detail-label">Participants</span>
          <span className="fm-detail-value">{market.participants?.length || 0}</span>
        </div>
      </div>

      {market.participants && market.participants.length > 0 && (
        <div className="fm-detail-participants">
          <span className="fm-detail-label">Participants</span>
          <div className="fm-participants-list">
            {market.participants.map((participant, idx) => (
              <div key={idx} className="fm-participant">
                <span className="fm-participant-addr">{formatAddress(participant)}</span>
                {participant.toLowerCase() === market.creator?.toLowerCase() && (
                  <span className="fm-participant-tag">Creator</span>
                )}
                {participant.toLowerCase() === account?.toLowerCase() && (
                  <span className="fm-participant-tag fm-you">You</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {market.arbitrator && (
        <div className="fm-detail-arbitrator">
          <span className="fm-detail-label">Arbitrator</span>
          <span className="fm-detail-value">{formatAddress(market.arbitrator)}</span>
        </div>
      )}

      <div className="fm-detail-qr">
        <QRCodeSVG
          value={marketUrl}
          size={120}
          level="M"
          fgColor="#36B37E"
          bgColor="transparent"
        />
        <p>Share this market</p>
      </div>

      <div className="fm-detail-actions">
        <button
          type="button"
          className="fm-btn-secondary"
          onClick={() => navigator.clipboard.writeText(marketUrl)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
          </svg>
          Copy Link
        </button>
        {isCreator && market.status === 'active' && (
          <button type="button" className="fm-btn-primary">
            Resolve Market
          </button>
        )}
      </div>
    </div>
  )
}

export default FriendMarketsModal
