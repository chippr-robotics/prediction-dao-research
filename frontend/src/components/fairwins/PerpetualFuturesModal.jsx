import { useState, useEffect, useCallback, useMemo } from 'react'
import { useWallet, useWeb3 } from '../../hooks'
import { usePerpetualsContract, PositionSide, MarketCategory } from '../../hooks/usePerpetualsContract'
import { getContractAddress } from '../../config/contracts'
import { getUserPreference, saveUserPreference, removeUserPreference, saveGlobalPreference, getGlobalPreference } from '../../utils/userStorage'
import { VIEW_MODES } from '../../utils/viewPreference'
import PerpEducationModal from './PerpEducationModal'
import ViewToggle from './ViewToggle'
import './PerpetualFuturesModal.css'

// Order flow steps
const ORDER_FLOW_STEPS = [
  { id: 'market', label: 'Select Market' },
  { id: 'configure', label: 'Configure' },
  { id: 'review', label: 'Review' },
  { id: 'executing', label: 'Executing' }
]

// Order flow storage key
const ORDER_FLOW_KEY = 'perp_order_flow_state'
const ORDER_FLOW_EXPIRY_MS = 30 * 60 * 1000 // 30 minutes

// Factory address from centralized config (same pattern as usePerpetualsAdmin)
const DEFAULT_FACTORY_ADDRESS = getContractAddress('perpFactory') || null

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
  const { isConnected, address } = useWallet()
  const { isCorrectNetwork, switchNetwork } = useWeb3()

  // Perpetuals hook
  const {
    markets,
    selectedMarket,
    positions,
    allPositions,
    loading,
    error,
    setSelectedMarket,
    fetchMarkets,
    fetchPositions,
    fetchAllPositions,
    openPosition,
    closePosition,
    addPositionCollateral,
    removePositionCollateral,
    getTokenBalance
  } = usePerpetualsContract(factoryAddress)

  // Tab state - Markets is now the default tab
  const [activeTab, setActiveTab] = useState('markets') // 'markets', 'trade', 'positions'

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

  // Education modal state (show once per wallet)
  const [showEducationModal, setShowEducationModal] = useState(false)

  // Markets view mode (grid/card or compact/table)
  const [marketsViewMode, setMarketsViewMode] = useState(() =>
    getGlobalPreference('perpMarketsView', VIEW_MODES.GRID)
  )

  // Order flow state for breadcrumbs
  const [orderFlowStep, setOrderFlowStep] = useState(0) // 0: market, 1: configure, 2: review, 3: executing
  const [showResumePrompt, setShowResumePrompt] = useState(false)
  const [savedOrderState, setSavedOrderState] = useState(null)

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab('markets')
      setTradeSide(PositionSide.Long)
      setTradeCollateral('')
      setTradeLeverage(1)
      setErrors({})
      setSuccessMessage('')
      fetchMarkets()
    }
  }, [isOpen, fetchMarkets])

  // Check if user has seen the education modal
  // Uses per-wallet preference if connected, otherwise uses global preference
  useEffect(() => {
    if (isOpen) {
      let hasSeenEducation = false
      if (address) {
        // Check per-wallet preference
        hasSeenEducation = getUserPreference(address, 'perp_education_seen', false, true)
      } else {
        // Check global preference for non-connected users
        hasSeenEducation = getGlobalPreference('perp_education_seen_global', false)
      }
      if (!hasSeenEducation) {
        setShowEducationModal(true)
      }
    }
  }, [isOpen, address])

  // Check for saved order state to resume (per wallet)
  useEffect(() => {
    if (isOpen && address) {
      const savedState = getUserPreference(address, ORDER_FLOW_KEY, null, true)
      if (savedState && savedState.startedAt) {
        const isRecent = Date.now() - savedState.startedAt < ORDER_FLOW_EXPIRY_MS
        if (isRecent && savedState.step > 0) {
          setSavedOrderState(savedState)
          setShowResumePrompt(true)
        } else {
          // Expired, clear it
          removeUserPreference(address, ORDER_FLOW_KEY, true)
        }
      }
    }
  }, [isOpen, address])

  // Save order flow state when it changes (for resumption)
  useEffect(() => {
    if (address && orderFlowStep > 0 && orderFlowStep < 3) {
      const stateToSave = {
        step: orderFlowStep,
        startedAt: Date.now(),
        formData: {
          marketId: selectedMarket?.id || null,
          side: tradeSide,
          collateral: tradeCollateral,
          leverage: tradeLeverage
        }
      }
      saveUserPreference(address, ORDER_FLOW_KEY, stateToSave, true)
    }
  }, [address, orderFlowStep, selectedMarket?.id, tradeSide, tradeCollateral, tradeLeverage])

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

  // Trade tab is only visible when user is actively setting up a position
  const showTradeTab = useMemo(() => {
    return selectedMarket !== null || tradeCollateral !== '' || orderFlowStep > 0
  }, [selectedMarket, tradeCollateral, orderFlowStep])

  // Update order flow step based on current state
  useEffect(() => {
    if (selectedMarket && orderFlowStep === 0) {
      setOrderFlowStep(1) // Move to configure step when market is selected
    }
  }, [selectedMarket, orderFlowStep])

  // Fetch all positions when Positions tab is activated
  useEffect(() => {
    if (activeTab === 'positions' && markets.length > 0) {
      fetchAllPositions()
    }
  }, [activeTab, markets.length, fetchAllPositions])

  // Group positions by market for display
  const positionsByMarket = useMemo(() => {
    const grouped = {}
    allPositions.forEach(pos => {
      if (!grouped[pos.marketAddress]) {
        grouped[pos.marketAddress] = {
          marketName: pos.marketName,
          marketId: pos.marketId,
          positions: []
        }
      }
      grouped[pos.marketAddress].positions.push(pos)
    })
    return grouped
  }, [allPositions])

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

    // Move to executing step
    setOrderFlowStep(3)
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

      // Clear order flow state on success
      clearOrderFlow()

      // Refresh positions
      await fetchPositions(selectedMarket.address)
    } catch (err) {
      console.error('Trade error:', err)
      // Parse common error messages for better UX
      let errorMessage = err.message || 'Failed to open position'
      if (errorMessage.includes('transfer amount exceeds balance')) {
        errorMessage = 'Insufficient USC balance. You need USC tokens to open positions.'
      } else if (errorMessage.includes('allowance')) {
        errorMessage = 'Please approve USC spending first.'
      }
      setErrors({ submit: errorMessage })
      // Go back to review step on error
      setOrderFlowStep(2)
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
        selectedMarket.collateralToken,
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

  // Handle education modal dismiss
  const handleEducationDismiss = (dontShowAgain) => {
    if (dontShowAgain) {
      if (address) {
        // Save per-wallet preference
        saveUserPreference(address, 'perp_education_seen', true, true)
      } else {
        // Save global preference for non-connected users
        saveGlobalPreference('perp_education_seen_global', true)
      }
    }
    setShowEducationModal(false)
  }

  // Handle markets view mode change
  const handleMarketsViewChange = (mode) => {
    setMarketsViewMode(mode)
    saveGlobalPreference('perpMarketsView', mode)
  }

  // Handle resuming saved order flow
  const handleResumeOrder = () => {
    if (savedOrderState) {
      // Find and select the saved market
      const savedMarket = markets.find(m => m.id === savedOrderState.formData.marketId)
      if (savedMarket) {
        setSelectedMarket(savedMarket)
      }
      setTradeSide(savedOrderState.formData.side)
      setTradeCollateral(savedOrderState.formData.collateral)
      setTradeLeverage(savedOrderState.formData.leverage)
      setOrderFlowStep(savedOrderState.step)
      setActiveTab('trade')
    }
    setShowResumePrompt(false)
    setSavedOrderState(null)
  }

  // Handle discarding saved order flow
  const handleDiscardOrder = () => {
    if (address) {
      removeUserPreference(address, ORDER_FLOW_KEY, true)
    }
    setShowResumePrompt(false)
    setSavedOrderState(null)
  }

  // Clear order flow state on completion
  const clearOrderFlow = useCallback(() => {
    setOrderFlowStep(0)
    if (address) {
      removeUserPreference(address, ORDER_FLOW_KEY, true)
    }
  }, [address])

  // Go back to previous step
  const handlePrevStep = () => {
    setOrderFlowStep(prev => Math.max(prev - 1, 0))
  }

  // Handle step click (can go back to completed steps)
  const handleStepClick = (stepIndex) => {
    if (stepIndex < orderFlowStep) {
      setOrderFlowStep(stepIndex)
    }
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

        {/* Tab Navigation - Markets first, Trade conditional, Positions last */}
        <nav className="perp-tabs" role="tablist">
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
          {showTradeTab && (
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
          )}
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
              {/* Order Flow Step Indicator */}
              <nav className="perp-order-steps" aria-label="Order progress">
                {ORDER_FLOW_STEPS.map((step, index) => {
                  const isCompleted = index < orderFlowStep
                  const isActive = index === orderFlowStep
                  const isClickable = isCompleted && orderFlowStep < 3

                  return (
                    <button
                      key={step.id}
                      className={`perp-order-step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
                      onClick={() => isClickable && handleStepClick(index)}
                      disabled={!isClickable}
                      aria-current={isActive ? 'step' : undefined}
                      type="button"
                    >
                      <span className="perp-step-number">
                        {isCompleted ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ) : (
                          index + 1
                        )}
                      </span>
                      <span className="perp-step-label">{step.label}</span>
                      {index < ORDER_FLOW_STEPS.length - 1 && <span className="perp-step-connector" aria-hidden="true" />}
                    </button>
                  )
                })}
              </nav>

              {/* Step 0: Market Selection */}
              {orderFlowStep === 0 && (
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
              )}

              {/* Steps 1-3: Market selected - show market info */}
              {orderFlowStep > 0 && selectedMarket && (
                <div className="perp-market-selector compact">
                  <span className="perp-selected-market">
                    <strong>{selectedMarket.underlyingAsset}-PERP</strong>
                    <span className="perp-selected-price">${formatPrice(selectedMarket.markPrice)}</span>
                  </span>
                  <button
                    type="button"
                    className="perp-change-market-btn"
                    onClick={() => setOrderFlowStep(0)}
                    disabled={submitting}
                  >
                    Change
                  </button>
                </div>
              )}

              {/* Step 1: Configure Position */}
              {orderFlowStep === 1 && selectedMarket && (
                <>
                  {/* Market Info */}
                  <div className="perp-market-info">
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
                  <div className="perp-trade-form">
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

                    {/* Step Navigation */}
                    <div className="perp-step-actions">
                      <button
                        type="button"
                        className="perp-step-btn secondary"
                        onClick={handlePrevStep}
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        className="perp-step-btn primary"
                        onClick={() => {
                          if (validateTradeForm()) {
                            setOrderFlowStep(2)
                          }
                        }}
                        disabled={!tradeCollateral || parseFloat(tradeCollateral) <= 0}
                      >
                        Continue to Review
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* Step 2: Review */}
              {orderFlowStep === 2 && selectedMarket && (
                <form className="perp-trade-form" onSubmit={handleTrade}>
                  <div className="perp-review-header">
                    <h3>Review Your Order</h3>
                    <p>Please confirm the details below before submitting.</p>
                  </div>

                  {/* Order Summary */}
                  <div className="perp-review-summary">
                    <div className="perp-review-row highlight">
                      <span>Position</span>
                      <span className={tradeSide === PositionSide.Long ? 'long' : 'short'}>
                        {tradeSide === PositionSide.Long ? 'LONG' : 'SHORT'} {tradeLeverage}x
                      </span>
                    </div>
                    <div className="perp-review-row">
                      <span>Market</span>
                      <span>{selectedMarket.underlyingAsset}-PERP</span>
                    </div>
                    <div className="perp-review-row">
                      <span>Collateral</span>
                      <span>{tradeCollateral} USC</span>
                    </div>
                    <div className="perp-review-row">
                      <span>Position Size</span>
                      <span>{estimatedValues.size} {selectedMarket.underlyingAsset}</span>
                    </div>
                    <div className="perp-review-row">
                      <span>Notional Value</span>
                      <span>${estimatedValues.notional}</span>
                    </div>
                    <div className="perp-review-row">
                      <span>Entry Price</span>
                      <span>${formatPrice(selectedMarket.markPrice)}</span>
                    </div>
                    <div className="perp-review-row warning">
                      <span>Liquidation Price</span>
                      <span>${estimatedValues.liquidationPrice}</span>
                    </div>
                    <div className="perp-review-row">
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

                  {/* Step Navigation */}
                  <div className="perp-step-actions">
                    <button
                      type="button"
                      className="perp-step-btn secondary"
                      onClick={handlePrevStep}
                      disabled={submitting}
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      className={`perp-step-btn primary ${tradeSide === PositionSide.Long ? 'long' : 'short'}`}
                      disabled={submitting || !isConnected || !isCorrectNetwork}
                    >
                      {!isConnected ? 'Connect Wallet' : `Confirm ${tradeSide === PositionSide.Long ? 'Long' : 'Short'}`}
                    </button>
                  </div>
                </form>
              )}

              {/* Step 3: Executing */}
              {orderFlowStep === 3 && (
                <div className="perp-executing">
                  <div className="perp-executing-content">
                    <span className="perp-spinner-large"></span>
                    <h3>Opening Position</h3>
                    <p>Please confirm the transaction in your wallet...</p>
                  </div>
                </div>
              )}

              {orderFlowStep === 0 && !selectedMarket && !loading && markets.length > 0 && (
                <div className="perp-select-market-prompt">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M3 3v18h18"/>
                    <path d="M18 17V9"/>
                    <path d="M13 17V5"/>
                    <path d="M8 17v-3"/>
                  </svg>
                  <p>Select a market above to start trading</p>
                </div>
              )}

              {!loading && markets.length === 0 && (
                <div className="perp-no-markets">
                  <p>No perpetual markets available yet.</p>
                  <p className="perp-role-hint">
                    Market creation requires the <strong>Market Maker</strong> role and is managed via the Admin Panel.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Positions Tab - Aggregated across all markets */}
          {activeTab === 'positions' && !loading && (
            <div className="perp-positions-panel">
              <div className="perp-positions-header">
                <h3>All Open Positions</h3>
                <span className="perp-positions-count">{allPositions.length} position{allPositions.length !== 1 ? 's' : ''}</span>
              </div>
              {allPositions.length === 0 ? (
                <div className="perp-no-positions">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <path d="M3 9h18"/>
                  </svg>
                  <p>No open positions across any markets</p>
                  <button onClick={() => setActiveTab('markets')}>Browse Markets</button>
                </div>
              ) : (
                <div className="perp-positions-grouped">
                  {Object.entries(positionsByMarket).map(([marketAddress, marketData]) => (
                    <div key={marketAddress} className="perp-market-group">
                      <div className="perp-market-group-header">
                        <h4>{marketData.marketName}-PERP</h4>
                        <span className="perp-market-group-count">
                          {marketData.positions.length} position{marketData.positions.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="perp-market-group-content">
                        {marketData.positions.map(position => (
                          <div key={`${marketAddress}-${position.id}`} className="perp-position-card">
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
                                <span>{parseFloat(position.size).toFixed(4)} {position.marketName}</span>
                              </div>
                              <div className="perp-position-row">
                                <span>Entry Price</span>
                                <span>${formatPrice(position.entryPrice)}</span>
                              </div>
                              <div className="perp-position-row">
                                <span>Mark Price</span>
                                <span>${formatPrice(position.markPrice)}</span>
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
                                  // Find the market for this position
                                  const market = markets.find(m => m.address === marketAddress)
                                  if (market) setSelectedMarket(market)
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
                                  const market = markets.find(m => m.address === marketAddress)
                                  if (market) setSelectedMarket(market)
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
                                  const market = markets.find(m => m.address === marketAddress)
                                  if (market) setSelectedMarket(market)
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
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Markets Tab */}
          {activeTab === 'markets' && !loading && (
            <div className="perp-markets-panel">
              <div className="perp-markets-header">
                <h3>Available Markets</h3>
                <ViewToggle
                  currentView={marketsViewMode}
                  onViewChange={handleMarketsViewChange}
                />
              </div>
              {markets.length === 0 ? (
                <div className="perp-no-markets">
                  <p>No markets available</p>
                </div>
              ) : marketsViewMode === VIEW_MODES.GRID ? (
                /* Card/Grid View */
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
              ) : (
                /* Table View */
                <div className="perp-markets-table-wrapper">
                  <table className="perp-markets-table">
                    <thead>
                      <tr>
                        <th>Market</th>
                        <th>Category</th>
                        <th>Mark Price</th>
                        <th>Open Interest</th>
                        <th>Funding Rate</th>
                        <th>Max Leverage</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {markets.map(market => (
                        <tr
                          key={market.id}
                          className={`perp-market-row ${selectedMarket?.id === market.id ? 'selected' : ''}`}
                          onClick={() => {
                            setSelectedMarket(market)
                            setActiveTab('trade')
                          }}
                        >
                          <td className="market-name">
                            <strong>{market.underlyingAsset}-PERP</strong>
                          </td>
                          <td>
                            <span className={`perp-category-badge category-${market.category}`}>
                              {getCategoryLabel(market.category)}
                            </span>
                          </td>
                          <td className="market-price">${formatPrice(market.markPrice)}</td>
                          <td>${formatPrice(market.metrics.openInterest)}</td>
                          <td className={market.metrics.currentFundingRate >= 0 ? 'funding-positive' : 'funding-negative'}>
                            {formatFundingRate(market.metrics.currentFundingRate)}
                          </td>
                          <td>{market.config.maxLeverage}x</td>
                          <td>
                            <button className="perp-trade-btn-small">Trade</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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

      {/* Resume Order Prompt */}
      {showResumePrompt && savedOrderState && (
        <div className="perp-resume-backdrop">
          <div className="perp-resume-modal">
            <h3>Resume Previous Order?</h3>
            <p>You have an unfinished order. Would you like to continue where you left off?</p>
            <div className="perp-resume-details">
              <span>Step: {ORDER_FLOW_STEPS[savedOrderState.step]?.label}</span>
              {savedOrderState.formData.marketId && (
                <span>Collateral: {savedOrderState.formData.collateral} USC</span>
              )}
            </div>
            <div className="perp-resume-actions">
              <button onClick={handleDiscardOrder}>Start Fresh</button>
              <button className="primary" onClick={handleResumeOrder}>Resume Order</button>
            </div>
          </div>
        </div>
      )}

      {/* Education Modal - shown once per wallet */}
      <PerpEducationModal
        isOpen={showEducationModal}
        onDismiss={handleEducationDismiss}
      />
    </div>
  )
}

export default PerpetualFuturesModal
