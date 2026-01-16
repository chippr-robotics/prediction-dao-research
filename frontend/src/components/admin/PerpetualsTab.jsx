import { useState, useCallback, useEffect } from 'react'
import { useNotification } from '../../hooks/useUI'
import { usePerpetualsAdmin, MarketCategory } from '../../hooks/usePerpetualsAdmin'
import { isValidEthereumAddress } from '../../utils/validation'
import { ethers } from 'ethers'

/**
 * PerpetualsTab Component
 *
 * Admin panel tab for managing perpetual futures markets.
 * Provides interface for:
 * - Viewing factory statistics
 * - Listing all perpetual markets with metrics
 * - Creating new perpetual trading pairs
 * - Viewing detailed market information
 */
function PerpetualsTab({ provider, signer, account }) {
  const { showNotification } = useNotification()
  const {
    isLoading,
    error,
    markets,
    selectedMarket,
    marketCount,
    creationFee,
    isFactoryAvailable,
    isFactoryDeployed,
    fetchFactoryState,
    fetchAllMarkets,
    fetchMarketDetails,
    createMarket,
    setSelectedMarket,
    formatMarketCategory,
    getHealthIndicator,
    PERP_FACTORY_ADDRESS
  } = usePerpetualsAdmin({ provider, signer, account })

  // Local state
  const [pendingTx, setPendingTx] = useState(false)
  const [activeSection, setActiveSection] = useState('overview') // 'overview', 'create'
  const [showMarketDetails, setShowMarketDetails] = useState(false)
  const [marketsLoaded, setMarketsLoaded] = useState(false)

  // Market creation form state
  const [marketForm, setMarketForm] = useState({
    name: '',
    underlyingAsset: '',
    collateralToken: '',
    category: MarketCategory.Crypto,
    initialIndexPrice: '',
    initialMarkPrice: '',
    maxLeverage: 20,
    initialMarginRate: 5,
    maintenanceMarginRate: 2.5,
    liquidationFeeRate: 0.5,
    tradingFeeRate: 0.1,
    fundingInterval: 28800,
    maxFundingRate: 0.1,
    linkedConditionalMarketId: 0
  })

  // Category options for dropdown
  const categoryOptions = [
    { value: MarketCategory.Crypto, label: 'Crypto' },
    { value: MarketCategory.PredictionOutcome, label: 'Prediction Outcome' },
    { value: MarketCategory.Commodity, label: 'Commodity' },
    { value: MarketCategory.Index, label: 'Index' },
    { value: MarketCategory.Custom, label: 'Custom' }
  ]

  // Funding interval options
  const fundingIntervalOptions = [
    { value: 3600, label: '1 Hour' },
    { value: 14400, label: '4 Hours' },
    { value: 28800, label: '8 Hours' }
  ]

  // Load markets on mount
  useEffect(() => {
    if (isFactoryDeployed && !marketsLoaded) {
      fetchAllMarkets().then(() => setMarketsLoaded(true))
    }
  }, [isFactoryDeployed, marketsLoaded, fetchAllMarkets])

  // Handle form input changes
  const handleFormChange = useCallback((field, value) => {
    setMarketForm(prev => ({ ...prev, [field]: value }))
  }, [])

  // Validate form
  const validateForm = useCallback(() => {
    if (!marketForm.name || marketForm.name.trim().length < 3) {
      showNotification('Name must be at least 3 characters', 'error')
      return false
    }
    if (!marketForm.underlyingAsset || marketForm.underlyingAsset.trim().length < 1) {
      showNotification('Underlying asset is required', 'error')
      return false
    }
    if (!marketForm.collateralToken || !isValidEthereumAddress(marketForm.collateralToken)) {
      showNotification('Valid collateral token address is required', 'error')
      return false
    }
    if (!marketForm.initialIndexPrice || parseFloat(marketForm.initialIndexPrice) <= 0) {
      showNotification('Initial index price must be greater than 0', 'error')
      return false
    }
    if (marketForm.maxLeverage < 1 || marketForm.maxLeverage > 100) {
      showNotification('Max leverage must be between 1 and 100', 'error')
      return false
    }
    return true
  }, [marketForm, showNotification])

  // Handle market creation
  const handleCreateMarket = useCallback(async (e) => {
    e.preventDefault()

    if (!validateForm()) return

    setPendingTx(true)
    try {
      const result = await createMarket(marketForm)
      showNotification(`Market created successfully! ID: ${result.marketId}`, 'success')

      // Reset form
      setMarketForm({
        name: '',
        underlyingAsset: '',
        collateralToken: '',
        category: MarketCategory.Crypto,
        initialIndexPrice: '',
        initialMarkPrice: '',
        maxLeverage: 20,
        initialMarginRate: 5,
        maintenanceMarginRate: 2.5,
        liquidationFeeRate: 0.5,
        tradingFeeRate: 0.1,
        fundingInterval: 28800,
        maxFundingRate: 0.1,
        linkedConditionalMarketId: 0
      })

      // Switch to overview
      setActiveSection('overview')
    } catch (err) {
      showNotification(err.message || 'Failed to create market', 'error')
    } finally {
      setPendingTx(false)
    }
  }, [marketForm, validateForm, createMarket, showNotification])

  // Handle view market details
  const handleViewDetails = useCallback(async (market) => {
    await fetchMarketDetails(market.id)
    setShowMarketDetails(true)
  }, [fetchMarketDetails])

  // Close market details modal
  const closeMarketDetails = useCallback(() => {
    setShowMarketDetails(false)
    setSelectedMarket(null)
  }, [setSelectedMarket])

  // Format numbers for display
  const formatNumber = (num, decimals = 2) => {
    if (num == null) return '0'
    const n = parseFloat(num)
    if (isNaN(n)) return '0'
    if (n >= 1000000) return `${(n / 1000000).toFixed(decimals)}M`
    if (n >= 1000) return `${(n / 1000).toFixed(decimals)}K`
    return n.toFixed(decimals)
  }

  // Format funding rate
  const formatFundingRate = (rate) => {
    if (rate == null) return '0.00%'
    const pct = parseFloat(rate) * 100
    const sign = pct >= 0 ? '+' : ''
    return `${sign}${pct.toFixed(4)}%`
  }

  // Format interval
  const formatInterval = (seconds) => {
    if (!seconds) return 'N/A'
    const hours = seconds / 3600
    return `${hours}h`
  }

  // Shorten address
  const shortenAddress = (address) => {
    if (!address) return ''
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`
  }

  // Show not available if factory not deployed
  if (!isFactoryAvailable) {
    return (
      <div className="admin-tab-content" role="tabpanel">
        <div className="admin-card">
          <div className="admin-card-header">
            <h3>Perpetuals Factory Not Available</h3>
          </div>
          <p className="card-info">
            The Perpetual Futures Factory contract has not been deployed or configured.
            Please deploy the contract and update the configuration.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-tab-content" role="tabpanel">
      {/* Error Banner */}
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
        </div>
      )}

      {/* Factory Overview */}
      <div className="overview-grid">
        <div className="admin-card">
          <div className="admin-card-header">
            <h3>Perpetuals Factory</h3>
            <button
              onClick={() => {
                fetchFactoryState()
                fetchAllMarkets()
              }}
              className="refresh-btn"
              aria-label="Refresh factory state"
              disabled={isLoading}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 4v6h-6"/>
                <path d="M1 20v-6h6"/>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
              </svg>
            </button>
          </div>
          <div className="status-details">
            <div className="status-row">
              <span className="status-label">Total Markets</span>
              <span className="status-value">{marketCount}</span>
            </div>
            <div className="status-row">
              <span className="status-label">Creation Fee</span>
              <span className="status-value">{creationFee} ETC</span>
            </div>
            <div className="status-row">
              <span className="status-label">Factory Status</span>
              <span className="status-value active">
                {isFactoryDeployed ? 'Active' : 'Not Deployed'}
              </span>
            </div>
            <div className="status-row">
              <span className="status-label">Factory Address</span>
              <code className="contract-address">{shortenAddress(PERP_FACTORY_ADDRESS)}</code>
            </div>
          </div>
        </div>
      </div>

      {/* Section Navigation */}
      <div className="section-toggle">
        <button
          className={`section-btn ${activeSection === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveSection('overview')}
        >
          Markets Overview
        </button>
        <button
          className={`section-btn ${activeSection === 'create' ? 'active' : ''}`}
          onClick={() => setActiveSection('create')}
        >
          Create Market
        </button>
      </div>

      {/* Markets List Section */}
      {activeSection === 'overview' && (
        <div className="admin-card">
          <div className="admin-card-header">
            <h3>Active Markets ({markets.length})</h3>
          </div>

          {markets.length === 0 ? (
            <p className="card-info">
              No perpetual markets have been created yet. Use the "Create Market" section to add a new trading pair.
            </p>
          ) : (
            <div className="perp-markets-table">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Asset</th>
                    <th>Category</th>
                    <th>Status</th>
                    <th>Open Interest</th>
                    <th>Funding Rate</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {markets.map(market => {
                    const health = getHealthIndicator(market.metrics)
                    const fundingRate = market.metrics?.currentFundingRate
                    const fundingClass = parseFloat(fundingRate || 0) >= 0 ? 'funding-positive' : 'funding-negative'

                    return (
                      <tr key={market.id}>
                        <td>{market.id}</td>
                        <td>
                          <div className="market-name-cell">
                            <span className="market-name">{market.name}</span>
                            <div className={`health-indicator`}>
                              <span className={`health-dot ${health}`} />
                            </div>
                          </div>
                        </td>
                        <td>{market.underlyingAsset}</td>
                        <td>
                          <span className={`market-category ${formatMarketCategory(market.category).toLowerCase()}`}>
                            {formatMarketCategory(market.category)}
                          </span>
                        </td>
                        <td>
                          <span className={`market-status ${market.paused ? 'paused' : 'active'}`}>
                            {market.paused ? 'Paused' : 'Active'}
                          </span>
                        </td>
                        <td>
                          {market.metrics
                            ? formatNumber(ethers.formatEther(market.metrics.openInterest))
                            : '-'}
                        </td>
                        <td className={fundingClass}>
                          {market.metrics
                            ? formatFundingRate(parseFloat(market.metrics.currentFundingRate) / 1e18)
                            : '-'}
                        </td>
                        <td>
                          <button
                            className="action-btn"
                            onClick={() => handleViewDetails(market)}
                            disabled={isLoading}
                          >
                            View Details
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Create Market Section */}
      {activeSection === 'create' && (
        <div className="admin-card">
          <div className="admin-card-header">
            <h3>Create New Perpetual Market</h3>
          </div>
          <p className="card-info">
            Create a new perpetual futures trading pair. A creation fee of <strong>{creationFee} ETC</strong> will be charged.
          </p>

          <form className="perp-market-creation-form" onSubmit={handleCreateMarket}>
            {/* Basic Information */}
            <div className="form-section">
              <h4>Basic Information</h4>
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="name">Market Name *</label>
                  <input
                    id="name"
                    type="text"
                    value={marketForm.name}
                    onChange={(e) => handleFormChange('name', e.target.value)}
                    placeholder="e.g., BTC-USD Perpetual"
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="underlyingAsset">Underlying Asset *</label>
                  <input
                    id="underlyingAsset"
                    type="text"
                    value={marketForm.underlyingAsset}
                    onChange={(e) => handleFormChange('underlyingAsset', e.target.value)}
                    placeholder="e.g., BTC"
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="collateralToken">Collateral Token Address *</label>
                  <input
                    id="collateralToken"
                    type="text"
                    value={marketForm.collateralToken}
                    onChange={(e) => handleFormChange('collateralToken', e.target.value)}
                    placeholder="0x..."
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="category">Category</label>
                  <select
                    id="category"
                    value={marketForm.category}
                    onChange={(e) => handleFormChange('category', parseInt(e.target.value))}
                  >
                    {categoryOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Initial Prices */}
            <div className="form-section">
              <h4>Initial Prices</h4>
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="initialIndexPrice">Index Price (USD) *</label>
                  <input
                    id="initialIndexPrice"
                    type="number"
                    step="0.01"
                    min="0"
                    value={marketForm.initialIndexPrice}
                    onChange={(e) => handleFormChange('initialIndexPrice', e.target.value)}
                    placeholder="e.g., 50000"
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="initialMarkPrice">Mark Price (USD)</label>
                  <input
                    id="initialMarkPrice"
                    type="number"
                    step="0.01"
                    min="0"
                    value={marketForm.initialMarkPrice}
                    onChange={(e) => handleFormChange('initialMarkPrice', e.target.value)}
                    placeholder="Same as index if empty"
                  />
                </div>
              </div>
            </div>

            {/* Risk Configuration */}
            <div className="form-section">
              <h4>Risk Configuration</h4>
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="maxLeverage">Max Leverage</label>
                  <input
                    id="maxLeverage"
                    type="number"
                    min="1"
                    max="100"
                    value={marketForm.maxLeverage}
                    onChange={(e) => handleFormChange('maxLeverage', parseInt(e.target.value))}
                  />
                  <span className="form-hint">1-100x</span>
                </div>
                <div className="form-group">
                  <label htmlFor="initialMarginRate">Initial Margin Rate (%)</label>
                  <input
                    id="initialMarginRate"
                    type="number"
                    step="0.1"
                    min="1"
                    max="50"
                    value={marketForm.initialMarginRate}
                    onChange={(e) => handleFormChange('initialMarginRate', parseFloat(e.target.value))}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="maintenanceMarginRate">Maintenance Margin (%)</label>
                  <input
                    id="maintenanceMarginRate"
                    type="number"
                    step="0.1"
                    min="0.5"
                    max="25"
                    value={marketForm.maintenanceMarginRate}
                    onChange={(e) => handleFormChange('maintenanceMarginRate', parseFloat(e.target.value))}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="liquidationFeeRate">Liquidation Fee (%)</label>
                  <input
                    id="liquidationFeeRate"
                    type="number"
                    step="0.1"
                    min="0"
                    max="5"
                    value={marketForm.liquidationFeeRate}
                    onChange={(e) => handleFormChange('liquidationFeeRate', parseFloat(e.target.value))}
                  />
                </div>
              </div>
            </div>

            {/* Fee & Funding Configuration */}
            <div className="form-section">
              <h4>Fees & Funding</h4>
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="tradingFeeRate">Trading Fee (%)</label>
                  <input
                    id="tradingFeeRate"
                    type="number"
                    step="0.01"
                    min="0"
                    max="2"
                    value={marketForm.tradingFeeRate}
                    onChange={(e) => handleFormChange('tradingFeeRate', parseFloat(e.target.value))}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="fundingInterval">Funding Interval</label>
                  <select
                    id="fundingInterval"
                    value={marketForm.fundingInterval}
                    onChange={(e) => handleFormChange('fundingInterval', parseInt(e.target.value))}
                  >
                    {fundingIntervalOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="maxFundingRate">Max Funding Rate (%)</label>
                  <input
                    id="maxFundingRate"
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={marketForm.maxFundingRate}
                    onChange={(e) => handleFormChange('maxFundingRate', parseFloat(e.target.value))}
                  />
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="form-actions">
              <button
                type="submit"
                className="primary-btn"
                disabled={pendingTx || isLoading}
              >
                {pendingTx ? 'Creating Market...' : `Create Market (${creationFee} ETC)`}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Market Details Modal */}
      {showMarketDetails && selectedMarket && (
        <div className="modal-backdrop" onClick={closeMarketDetails}>
          <div className="perp-market-details-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{selectedMarket.name}</h3>
              <button className="close-btn" onClick={closeMarketDetails}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <div className="modal-content">
              {/* Basic Info */}
              <div className="detail-section">
                <h4>Market Information</h4>
                <div className="detail-grid">
                  <div className="detail-row">
                    <span className="detail-label">ID</span>
                    <span className="detail-value">{selectedMarket.id}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Underlying Asset</span>
                    <span className="detail-value">{selectedMarket.underlyingAsset}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Category</span>
                    <span className="detail-value">{formatMarketCategory(selectedMarket.category)}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Status</span>
                    <span className={`market-status ${selectedMarket.paused ? 'paused' : 'active'}`}>
                      {selectedMarket.paused ? 'Paused' : 'Active'}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Contract Address</span>
                    <code className="detail-value">{shortenAddress(selectedMarket.address)}</code>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Creator</span>
                    <code className="detail-value">{shortenAddress(selectedMarket.creator)}</code>
                  </div>
                </div>
              </div>

              {/* Prices */}
              <div className="detail-section">
                <h4>Prices</h4>
                <div className="detail-grid">
                  <div className="detail-row">
                    <span className="detail-label">Index Price</span>
                    <span className="detail-value">${formatNumber(selectedMarket.indexPrice, 2)}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Mark Price</span>
                    <span className="detail-value">${formatNumber(selectedMarket.markPrice, 2)}</span>
                  </div>
                </div>
              </div>

              {/* Metrics */}
              {selectedMarket.metrics && (
                <div className="detail-section">
                  <h4>Market Metrics</h4>
                  <div className="perp-metrics-grid">
                    <div className="metric-card">
                      <span className="metric-label">Long Positions</span>
                      <span className="metric-value">{selectedMarket.metrics.totalLongPositions}</span>
                    </div>
                    <div className="metric-card">
                      <span className="metric-label">Short Positions</span>
                      <span className="metric-value">{selectedMarket.metrics.totalShortPositions}</span>
                    </div>
                    <div className="metric-card">
                      <span className="metric-label">Open Interest</span>
                      <span className="metric-value">{formatNumber(selectedMarket.metrics.openInterest)}</span>
                    </div>
                    <div className="metric-card">
                      <span className="metric-label">Total Volume</span>
                      <span className="metric-value">{formatNumber(selectedMarket.metrics.totalVolume)}</span>
                    </div>
                    <div className="metric-card">
                      <span className="metric-label">Funding Rate</span>
                      <span className={`metric-value ${selectedMarket.metrics.currentFundingRate >= 0 ? 'funding-positive' : 'funding-negative'}`}>
                        {formatFundingRate(selectedMarket.metrics.currentFundingRate)}
                      </span>
                    </div>
                    <div className="metric-card">
                      <span className="metric-label">Insurance Fund</span>
                      <span className="metric-value">{formatNumber(selectedMarket.insuranceFund)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Configuration */}
              {selectedMarket.config && (
                <div className="detail-section">
                  <h4>Configuration</h4>
                  <div className="perp-config-grid">
                    <div className="config-row">
                      <span className="config-label">Max Leverage</span>
                      <span className="config-value">{selectedMarket.config.maxLeverage}x</span>
                    </div>
                    <div className="config-row">
                      <span className="config-label">Initial Margin</span>
                      <span className="config-value">{selectedMarket.config.initialMarginRate}%</span>
                    </div>
                    <div className="config-row">
                      <span className="config-label">Maintenance Margin</span>
                      <span className="config-value">{selectedMarket.config.maintenanceMarginRate}%</span>
                    </div>
                    <div className="config-row">
                      <span className="config-label">Liquidation Fee</span>
                      <span className="config-value">{selectedMarket.config.liquidationFeeRate}%</span>
                    </div>
                    <div className="config-row">
                      <span className="config-label">Trading Fee</span>
                      <span className="config-value">{selectedMarket.config.tradingFeeRate}%</span>
                    </div>
                    <div className="config-row">
                      <span className="config-label">Funding Interval</span>
                      <span className="config-value">{formatInterval(selectedMarket.config.fundingInterval)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default PerpetualsTab
