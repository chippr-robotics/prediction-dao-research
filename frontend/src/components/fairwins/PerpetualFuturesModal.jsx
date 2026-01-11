import { useState, useEffect, useCallback, useMemo } from 'react'
import { useWallet, useWeb3 } from '../../hooks'
import { usePerpetualsContract, PositionSide, MarketCategory } from '../../hooks/usePerpetualsContract'
import './PerpetualFuturesModal.css'

// Default factory address (to be configured via environment variable)
const DEFAULT_FACTORY_ADDRESS = process.env.REACT_APP_PERPETUAL_FACTORY_ADDRESS ?? '' // Set after deployment

// Leverage presets
const LEVERAGE_PRESETS = [1, 2, 5, 10, 15, 20]

// Position size presets (in collateral units)
const SIZE_PRESETS = [10, 25, 50, 100, 250]

/**
 * PerpetualFuturesModal Component
 *
 * A comprehensive trading interface for perpetual futures:
 * - Market selection and overview
 * - Long/Short position opening with leverage
 * - Position management (add/remove margin, close)
 * - Real-time PnL tracking
 * - Funding rate display
 */
function PerpetualFuturesModal({
  isOpen,
  onClose,
  factoryAddress = DEFAULT_FACTORY_ADDRESS
}) {
  const { isConnected } = useWallet()
  const { isCorrectNetwork, switchNetwork } = useWeb3()

  // Perpetuals hook
  const {
    markets,
    selectedMarket,
    positions,
    loading,
    error,
    setSelectedMarket,
    fetchMarkets,
    fetchPositions,
    openPosition,
    closePosition,
    addPositionCollateral,
    removePositionCollateral,
    getTokenBalance
  } = usePerpetualsContract(factoryAddress)

  // Tab state
  const [activeTab, setActiveTab] = useState('trade') // 'trade', 'positions', 'markets'

  // Trading form state
  const [tradeSide, setTradeSide] = useState(PositionSide.Long)
  const [tradeCollateral, setTradeCollateral] = useState('')
  const [tradeLeverage, setTradeLeverage] = useState(1)
  const [collateralBalance, setCollateralBalance] = useState('0')

  // Position management state
  const [selectedPosition, setSelectedPosition] = useState(null)
  const [showPositionModal, setShowPositionModal] = useState(false)
  const [positionAction, setPositionAction] = useState(null) // 'close', 'addMargin', 'removeMargin'
  const [marginAmount, setMarginAmount] = useState('')

  // UI state
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState({})
  const [successMessage, setSuccessMessage] = useState('')

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab('trade')
      setTradeSide(PositionSide.Long)
      setTradeCollateral('')
      setTradeLeverage(1)
      setErrors({})
      setSuccessMessage('')
      fetchMarkets()
    }
  }, [isOpen, fetchMarkets])

  // Fetch collateral balance when market changes
  useEffect(() => {
    async function fetchBalance() {
      if (selectedMarket && selectedMarket.collateralToken) {
        const balance = await getTokenBalance(selectedMarket.collateralToken)
        setCollateralBalance(balance)
      }
    }
    fetchBalance()
  }, [selectedMarket, getTokenBalance])

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (showPositionModal) {
          setShowPositionModal(false)
        } else {
          onClose()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, showPositionModal, onClose])

  const handleClose = useCallback(() => {
    if (!submitting) {
      onClose()
    }
  }, [submitting, onClose])

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      handleClose()
    }
  }

  // Calculate estimated values
  const estimatedValues = useMemo(() => {
    if (!selectedMarket || !tradeCollateral || !tradeLeverage) {
      return { notional: 0, size: 0, liquidationPrice: 0, fee: 0 }
    }

    const collateral = parseFloat(tradeCollateral) || 0
    const leverage = tradeLeverage
    const price = parseFloat(selectedMarket.markPrice) || 1

    const notional = collateral * leverage
    const size = notional / price
    const maintenanceMargin = collateral * (selectedMarket.config?.maintenanceMarginRate || 2.5) / 100
    const buffer = (collateral - maintenanceMargin) / size

    let liquidationPrice
    if (tradeSide === PositionSide.Long) {
      liquidationPrice = price - buffer
    } else {
      liquidationPrice = price + buffer
    }

    const fee = notional * (selectedMarket.config?.tradingFeeRate || 0.1) / 100

    return {
      notional: notional.toFixed(2),
      size: size.toFixed(6),
      liquidationPrice: Math.max(0, liquidationPrice).toFixed(2),
      fee: fee.toFixed(4)
    }
  }, [selectedMarket, tradeCollateral, tradeLeverage, tradeSide])

  // Validate trade form
  const validateTradeForm = useCallback(() => {
    const newErrors = {}

    if (!selectedMarket) {
      newErrors.market = 'Please select a market'
    }

    const collateral = parseFloat(tradeCollateral)
    if (!tradeCollateral || collateral <= 0) {
      newErrors.collateral = 'Enter a valid collateral amount'
    } else if (collateral > parseFloat(collateralBalance)) {
      newErrors.collateral = 'Insufficient balance'
    }

    if (tradeLeverage < 1 || tradeLeverage > (selectedMarket?.config?.maxLeverage || 20)) {
      newErrors.leverage = `Leverage must be between 1x and ${selectedMarket?.config?.maxLeverage || 20}x`
    }

    // Check minimum margin requirement
    if (selectedMarket && collateral) {
      const notional = collateral * tradeLeverage
      const minMargin = notional * (selectedMarket.config?.initialMarginRate || 5) / 100
      if (collateral < minMargin) {
        newErrors.collateral = `Minimum margin: ${minMargin.toFixed(2)}`
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [selectedMarket, tradeCollateral, tradeLeverage, collateralBalance])

  // Handle trade submission
  const handleTrade = async (e) => {
    e.preventDefault()

    if (!isConnected) {
      setErrors({ submit: 'Please connect your wallet' })
      return
    }

    if (!isCorrectNetwork) {
      setErrors({ submit: 'Please switch to the correct network' })
      return
    }

    if (!validateTradeForm()) return

    setSubmitting(true)
    setErrors({})
    setSuccessMessage('')

    try {
      const size = parseFloat(estimatedValues.size)
      const collateral = parseFloat(tradeCollateral)

      const positionId = await openPosition(
        selectedMarket.address,
        selectedMarket.collateralToken,
        tradeSide,
        size,
        collateral,
        tradeLeverage
      )

      setSuccessMessage(`Position opened successfully! ID: ${positionId}`)
      setTradeCollateral('')
      setTradeLeverage(1)

      // Refresh positions
      await fetchPositions(selectedMarket.address)
    } catch (err) {
      console.error('Trade error:', err)
      setErrors({ submit: err.message || 'Failed to open position' })
    } finally {
      setSubmitting(false)
    }
  }

  // Handle position close
  const handleClosePosition = async () => {
    if (!selectedPosition) return

    setSubmitting(true)
    try {
      await closePosition(selectedMarket.address, selectedPosition.id)
      setSuccessMessage('Position closed successfully!')
      setShowPositionModal(false)
      setSelectedPosition(null)
      await fetchPositions(selectedMarket.address)
    } catch (err) {
      console.error('Close position error:', err)
      setErrors({ position: err.message || 'Failed to close position' })
    } finally {
      setSubmitting(false)
    }
  }

  // Handle add margin
  const handleAddMargin = async () => {
    if (!selectedPosition || !marginAmount) return

    setSubmitting(true)
    try {
      await addPositionCollateral(
        selectedMarket.address,
        selectedMarket.collateralToken,
        selectedPosition.id,
        parseFloat(marginAmount)
      )
      setSuccessMessage('Margin added successfully!')
      setShowPositionModal(false)
      setMarginAmount('')
      await fetchPositions(selectedMarket.address)
    } catch (err) {
      console.error('Add margin error:', err)
      setErrors({ position: err.message || 'Failed to add margin' })
    } finally {
      setSubmitting(false)
    }
  }

  // Handle remove margin
  const handleRemoveMargin = async () => {
    if (!selectedPosition || !marginAmount) return

    setSubmitting(true)
    try {
      await removePositionCollateral(
        selectedMarket.address,
        selectedPosition.id,
        parseFloat(marginAmount)
      )
      setSuccessMessage('Margin removed successfully!')
      setShowPositionModal(false)
      setMarginAmount('')
      await fetchPositions(selectedMarket.address)
    } catch (err) {
      console.error('Remove margin error:', err)
      setErrors({ position: err.message || 'Failed to remove margin' })
    } finally {
      setSubmitting(false)
    }
  }

  // Format price for display
  const formatPrice = (price) => {
    const num = parseFloat(price)
    if (num >= 1000) return num.toLocaleString('en-US', { maximumFractionDigits: 2 })
    if (num >= 1) return num.toFixed(2)
    return num.toFixed(6)
  }

  // Format funding rate
  const formatFundingRate = (rate) => {
    const percentage = rate * 100
    const sign = percentage >= 0 ? '+' : ''
    return `${sign}${percentage.toFixed(4)}%`
  }

  // Get category label
  const getCategoryLabel = (category) => {
    switch (category) {
      case MarketCategory.Crypto: return 'Crypto'
      case MarketCategory.PredictionOutcome: return 'Prediction'
      case MarketCategory.Commodity: return 'Commodity'
      case MarketCategory.Index: return 'Index'
      case MarketCategory.Custom: return 'Custom'
      default: return 'Unknown'
    }
  }

  // Get PnL color class
  const getPnLClass = (pnl) => {
    const num = parseFloat(pnl)
    if (num > 0) return 'pnl-positive'
    if (num < 0) return 'pnl-negative'
    return 'pnl-neutral'
  }

  if (!isOpen) return null

  return (
    <div
      className="perp-modal-backdrop"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="perp-modal-title"
    >
      <div className="perp-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <header className="perp-header">
          <div className="perp-header-content">
            <div className="perp-brand">
              <span className="perp-brand-icon">&#128200;</span>
              <h2 id="perp-modal-title">Perpetual Futures</h2>
            </div>
            <p className="perp-subtitle">Leveraged trading on prediction outcomes</p>
          </div>
          <button
            className="perp-close-btn"
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
        <nav className="perp-tabs" role="tablist">
          <button
            className={`perp-tab ${activeTab === 'trade' ? 'active' : ''}`}
            onClick={() => setActiveTab('trade')}
            role="tab"
            aria-selected={activeTab === 'trade'}
            disabled={submitting}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2v20M2 12h20"/>
            </svg>
            <span>Trade</span>
          </button>
          <button
            className={`perp-tab ${activeTab === 'positions' ? 'active' : ''}`}
            onClick={() => setActiveTab('positions')}
            role="tab"
            aria-selected={activeTab === 'positions'}
            disabled={submitting}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <path d="M3 9h18M9 21V9"/>
            </svg>
            <span>Positions</span>
            {positions.length > 0 && (
              <span className="perp-tab-badge">{positions.length}</span>
            )}
          </button>
          <button
            className={`perp-tab ${activeTab === 'markets' ? 'active' : ''}`}
            onClick={() => setActiveTab('markets')}
            role="tab"
            aria-selected={activeTab === 'markets'}
            disabled={submitting}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 3v18h18"/>
              <path d="M18 17V9"/>
              <path d="M13 17V5"/>
              <path d="M8 17v-3"/>
            </svg>
            <span>Markets</span>
          </button>
        </nav>

        {/* Content */}
        <div className="perp-content">
          {/* Loading State */}
          {loading && (
            <div className="perp-loading">
              <span className="perp-spinner"></span>
              <p>Loading markets...</p>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="perp-error-banner">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 8v4M12 16h.01"/>
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* Success Message */}
          {successMessage && (
            <div className="perp-success-banner">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              <span>{successMessage}</span>
              <button onClick={() => setSuccessMessage('')}>&#x2715;</button>
            </div>
          )}

          {/* Trade Tab */}
          {activeTab === 'trade' && !loading && (
            <div className="perp-trade-panel">
              {/* Market Selector */}
              <div className="perp-market-selector">
                <label>Select Market</label>
                <select
                  value={selectedMarket?.id || ''}
                  onChange={(e) => {
                    const market = markets.find(m => m.id === parseInt(e.target.value))
                    setSelectedMarket(market)
                  }}
                  disabled={submitting}
                >
                  <option value="">Choose a market...</option>
                  {markets.map(market => (
                    <option key={market.id} value={market.id}>
                      {market.underlyingAsset}-PERP | ${formatPrice(market.markPrice)}
                    </option>
                  ))}
                </select>
              </div>

              {selectedMarket && (
                <>
                  {/* Market Info */}
                  <div className="perp-market-info">
                    <div className="perp-market-header">
                      <h3>{selectedMarket.underlyingAsset}-PERP</h3>
                      <span className={`perp-category-badge category-${selectedMarket.category}`}>
                        {getCategoryLabel(selectedMarket.category)}
                      </span>
                    </div>
                    <div className="perp-market-stats">
                      <div className="perp-stat">
                        <span className="perp-stat-label">Mark Price</span>
                        <span className="perp-stat-value">${formatPrice(selectedMarket.markPrice)}</span>
                      </div>
                      <div className="perp-stat">
                        <span className="perp-stat-label">Index Price</span>
                        <span className="perp-stat-value">${formatPrice(selectedMarket.indexPrice)}</span>
                      </div>
                      <div className="perp-stat">
                        <span className="perp-stat-label">Funding Rate</span>
                        <span className={`perp-stat-value ${selectedMarket.metrics.currentFundingRate >= 0 ? 'funding-positive' : 'funding-negative'}`}>
                          {formatFundingRate(selectedMarket.metrics.currentFundingRate)}
                        </span>
                      </div>
                      <div className="perp-stat">
                        <span className="perp-stat-label">Open Interest</span>
                        <span className="perp-stat-value">${formatPrice(selectedMarket.metrics.openInterest)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Trade Form */}
                  <form className="perp-trade-form" onSubmit={handleTrade}>
                    {/* Side Selection */}
                    <div className="perp-side-selector">
                      <button
                        type="button"
                        className={`perp-side-btn long ${tradeSide === PositionSide.Long ? 'active' : ''}`}
                        onClick={() => setTradeSide(PositionSide.Long)}
                        disabled={submitting}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="18 15 12 9 6 15"/>
                        </svg>
                        Long
                      </button>
                      <button
                        type="button"
                        className={`perp-side-btn short ${tradeSide === PositionSide.Short ? 'active' : ''}`}
                        onClick={() => setTradeSide(PositionSide.Short)}
                        disabled={submitting}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="6 9 12 15 18 9"/>
                        </svg>
                        Short
                      </button>
                    </div>

                    {/* Collateral Input */}
                    <div className="perp-form-group">
                      <div className="perp-input-header">
                        <label>Collateral (USC)</label>
                        <span className="perp-balance">
                          Balance: {parseFloat(collateralBalance).toFixed(2)} USC
                        </span>
                      </div>
                      <input
                        type="number"
                        value={tradeCollateral}
                        onChange={(e) => setTradeCollateral(e.target.value)}
                        placeholder="0.00"
                        min="0"
                        step="0.01"
                        disabled={submitting}
                        className={errors.collateral ? 'error' : ''}
                      />
                      <div className="perp-quick-amounts">
                        {SIZE_PRESETS.map(amount => (
                          <button
                            key={amount}
                            type="button"
                            onClick={() => setTradeCollateral(amount.toString())}
                            disabled={submitting}
                          >
                            {amount}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => setTradeCollateral(collateralBalance)}
                          disabled={submitting}
                        >
                          Max
                        </button>
                      </div>
                      {errors.collateral && <span className="perp-error">{errors.collateral}</span>}
                    </div>

                    {/* Leverage Slider */}
                    <div className="perp-form-group">
                      <div className="perp-input-header">
                        <label>Leverage</label>
                        <span className="perp-leverage-value">{tradeLeverage}x</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max={selectedMarket.config?.maxLeverage || 20}
                        value={tradeLeverage}
                        onChange={(e) => setTradeLeverage(parseInt(e.target.value))}
                        disabled={submitting}
                        className="perp-leverage-slider"
                      />
                      <div className="perp-leverage-presets">
                        {LEVERAGE_PRESETS.filter(l => l <= (selectedMarket.config?.maxLeverage || 20)).map(lev => (
                          <button
                            key={lev}
                            type="button"
                            className={tradeLeverage === lev ? 'active' : ''}
                            onClick={() => setTradeLeverage(lev)}
                            disabled={submitting}
                          >
                            {lev}x
                          </button>
                        ))}
                      </div>
                      {errors.leverage && <span className="perp-error">{errors.leverage}</span>}
                    </div>

                    {/* Trade Summary */}
                    <div className="perp-trade-summary">
                      <div className="perp-summary-row">
                        <span>Position Size</span>
                        <span>{estimatedValues.size} {selectedMarket.underlyingAsset}</span>
                      </div>
                      <div className="perp-summary-row">
                        <span>Notional Value</span>
                        <span>${estimatedValues.notional}</span>
                      </div>
                      <div className="perp-summary-row">
                        <span>Liquidation Price</span>
                        <span className="liquidation-price">${estimatedValues.liquidationPrice}</span>
                      </div>
                      <div className="perp-summary-row">
                        <span>Trading Fee</span>
                        <span>{estimatedValues.fee} USC</span>
                      </div>
                    </div>

                    {/* Network Warning */}
                    {isConnected && !isCorrectNetwork && (
                      <div className="perp-warning">
                        <span>Wrong network</span>
                        <button type="button" onClick={switchNetwork}>Switch</button>
                      </div>
                    )}

                    {/* Submit Error */}
                    {errors.submit && (
                      <div className="perp-error-message">{errors.submit}</div>
                    )}

                    {/* Submit Button */}
                    <button
                      type="submit"
                      className={`perp-submit-btn ${tradeSide === PositionSide.Long ? 'long' : 'short'}`}
                      disabled={submitting || !isConnected || !isCorrectNetwork || !selectedMarket}
                    >
                      {submitting ? (
                        <>
                          <span className="perp-spinner-small"></span>
                          Opening Position...
                        </>
                      ) : !isConnected ? (
                        'Connect Wallet'
                      ) : (
                        `Open ${tradeSide === PositionSide.Long ? 'Long' : 'Short'} Position`
                      )}
                    </button>
                  </form>
                </>
              )}

              {!selectedMarket && !loading && markets.length > 0 && (
                <div className="perp-select-market-prompt">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M3 3v18h18"/>
                    <path d="M18 17V9"/>
                    <path d="M13 17V5"/>
                    <path d="M8 17v-3"/>
                  </svg>
                  <p>Select a market to start trading</p>
                </div>
              )}

              {!loading && markets.length === 0 && (
                <div className="perp-no-markets">
                  <p>No perpetual markets available yet.</p>
                </div>
              )}
            </div>
          )}

          {/* Positions Tab */}
          {activeTab === 'positions' && !loading && (
            <div className="perp-positions-panel">
              {!selectedMarket ? (
                <div className="perp-select-market-prompt">
                  <p>Select a market from the Trade tab to view positions</p>
                </div>
              ) : positions.length === 0 ? (
                <div className="perp-no-positions">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <path d="M3 9h18"/>
                  </svg>
                  <p>No open positions in {selectedMarket.underlyingAsset}-PERP</p>
                  <button onClick={() => setActiveTab('trade')}>Open a Position</button>
                </div>
              ) : (
                <div className="perp-positions-list">
                  <h3>Open Positions - {selectedMarket.underlyingAsset}-PERP</h3>
                  {positions.map(position => (
                    <div key={position.id} className="perp-position-card">
                      <div className="perp-position-header">
                        <span className={`perp-position-side ${position.side === PositionSide.Long ? 'long' : 'short'}`}>
                          {position.side === PositionSide.Long ? 'LONG' : 'SHORT'} {position.leverage}x
                        </span>
                        <span className={`perp-position-pnl ${getPnLClass(position.unrealizedPnL)}`}>
                          {parseFloat(position.unrealizedPnL) >= 0 ? '+' : ''}{parseFloat(position.unrealizedPnL).toFixed(2)} USC
                        </span>
                      </div>
                      <div className="perp-position-details">
                        <div className="perp-position-row">
                          <span>Size</span>
                          <span>{parseFloat(position.size).toFixed(4)} {selectedMarket.underlyingAsset}</span>
                        </div>
                        <div className="perp-position-row">
                          <span>Entry Price</span>
                          <span>${formatPrice(position.entryPrice)}</span>
                        </div>
                        <div className="perp-position-row">
                          <span>Mark Price</span>
                          <span>${formatPrice(selectedMarket.markPrice)}</span>
                        </div>
                        <div className="perp-position-row">
                          <span>Collateral</span>
                          <span>{parseFloat(position.collateral).toFixed(2)} USC</span>
                        </div>
                        <div className="perp-position-row">
                          <span>Liq. Price</span>
                          <span className="liquidation-price">${formatPrice(position.liquidationPrice)}</span>
                        </div>
                        {position.isLiquidatable && (
                          <div className="perp-liquidation-warning">
                            &#9888; Position at risk of liquidation!
                          </div>
                        )}
                      </div>
                      <div className="perp-position-actions">
                        <button
                          onClick={() => {
                            setSelectedPosition(position)
                            setPositionAction('addMargin')
                            setShowPositionModal(true)
                          }}
                          disabled={submitting}
                        >
                          Add Margin
                        </button>
                        <button
                          onClick={() => {
                            setSelectedPosition(position)
                            setPositionAction('removeMargin')
                            setShowPositionModal(true)
                          }}
                          disabled={submitting}
                        >
                          Remove Margin
                        </button>
                        <button
                          className="close-btn"
                          onClick={() => {
                            setSelectedPosition(position)
                            setPositionAction('close')
                            setShowPositionModal(true)
                          }}
                          disabled={submitting}
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Markets Tab */}
          {activeTab === 'markets' && !loading && (
            <div className="perp-markets-panel">
              <h3>Available Markets</h3>
              {markets.length === 0 ? (
                <div className="perp-no-markets">
                  <p>No markets available</p>
                </div>
              ) : (
                <div className="perp-markets-grid">
                  {markets.map(market => (
                    <div
                      key={market.id}
                      className={`perp-market-card ${selectedMarket?.id === market.id ? 'selected' : ''}`}
                      onClick={() => {
                        setSelectedMarket(market)
                        setActiveTab('trade')
                      }}
                    >
                      <div className="perp-market-card-header">
                        <h4>{market.underlyingAsset}-PERP</h4>
                        <span className={`perp-category-badge category-${market.category}`}>
                          {getCategoryLabel(market.category)}
                        </span>
                      </div>
                      <div className="perp-market-card-price">
                        <span className="price">${formatPrice(market.markPrice)}</span>
                      </div>
                      <div className="perp-market-card-stats">
                        <div>
                          <span className="label">24h Volume</span>
                          <span className="value">$-</span>
                        </div>
                        <div>
                          <span className="label">Open Interest</span>
                          <span className="value">${formatPrice(market.metrics.openInterest)}</span>
                        </div>
                        <div>
                          <span className="label">Funding</span>
                          <span className={`value ${market.metrics.currentFundingRate >= 0 ? 'funding-positive' : 'funding-negative'}`}>
                            {formatFundingRate(market.metrics.currentFundingRate)}
                          </span>
                        </div>
                        <div>
                          <span className="label">Max Leverage</span>
                          <span className="value">{market.config.maxLeverage}x</span>
                        </div>
                      </div>
                      <button className="perp-trade-btn">
                        Trade
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Position Action Modal */}
      {showPositionModal && selectedPosition && (
        <div className="perp-position-modal-backdrop" onClick={() => setShowPositionModal(false)}>
          <div className="perp-position-modal" onClick={(e) => e.stopPropagation()}>
            <h3>
              {positionAction === 'close' && 'Close Position'}
              {positionAction === 'addMargin' && 'Add Margin'}
              {positionAction === 'removeMargin' && 'Remove Margin'}
            </h3>

            {positionAction === 'close' && (
              <div className="perp-close-confirm">
                <p>Are you sure you want to close this position?</p>
                <div className="perp-position-summary">
                  <div>Side: <strong>{selectedPosition.side === PositionSide.Long ? 'Long' : 'Short'}</strong></div>
                  <div>Size: <strong>{parseFloat(selectedPosition.size).toFixed(4)}</strong></div>
                  <div>PnL: <strong className={getPnLClass(selectedPosition.unrealizedPnL)}>
                    {parseFloat(selectedPosition.unrealizedPnL) >= 0 ? '+' : ''}{parseFloat(selectedPosition.unrealizedPnL).toFixed(2)} USC
                  </strong></div>
                </div>
                <div className="perp-modal-actions">
                  <button onClick={() => setShowPositionModal(false)} disabled={submitting}>
                    Cancel
                  </button>
                  <button className="confirm" onClick={handleClosePosition} disabled={submitting}>
                    {submitting ? 'Closing...' : 'Confirm Close'}
                  </button>
                </div>
              </div>
            )}

            {(positionAction === 'addMargin' || positionAction === 'removeMargin') && (
              <div className="perp-margin-form">
                <div className="perp-form-group">
                  <label>Amount (USC)</label>
                  <input
                    type="number"
                    value={marginAmount}
                    onChange={(e) => setMarginAmount(e.target.value)}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    disabled={submitting}
                  />
                </div>
                <div className="perp-current-margin">
                  Current Margin: {parseFloat(selectedPosition.collateral).toFixed(2)} USC
                </div>
                {errors.position && <div className="perp-error-message">{errors.position}</div>}
                <div className="perp-modal-actions">
                  <button onClick={() => setShowPositionModal(false)} disabled={submitting}>
                    Cancel
                  </button>
                  <button
                    className="confirm"
                    onClick={positionAction === 'addMargin' ? handleAddMargin : handleRemoveMargin}
                    disabled={submitting || !marginAmount}
                  >
                    {submitting ? 'Processing...' : (positionAction === 'addMargin' ? 'Add Margin' : 'Remove Margin')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default PerpetualFuturesModal
