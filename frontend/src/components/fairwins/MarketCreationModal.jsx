import { useState, useRef } from 'react'
import { useWallet, useWeb3 } from '../../hooks'
import './MarketCreationModal.css'

/**
 * MarketCreationModal Component
 *
 * A comprehensive modal for creating:
 * - Prediction Markets (public markets)
 * - Friend Markets (1v1, Small Group, Event Tracking)
 * - ERC Tokens (ERC-20 and ERC-721)
 *
 * Integrates with Web3 for blockchain transactions
 */
function MarketCreationModal({ isOpen, onClose, onCreate }) {
  const { isConnected, account } = useWallet()
  const { signer, isCorrectNetwork, switchNetwork } = useWeb3()

  // Tab state
  const [activeTab, setActiveTab] = useState('prediction') // 'prediction', 'friend', 'token'

  // Friend market sub-type
  const [friendMarketType, setFriendMarketType] = useState('oneVsOne') // 'oneVsOne', 'smallGroup', 'eventTracking'

  // Token type
  const [tokenType, setTokenType] = useState('ERC20') // 'ERC20', 'ERC721'

  // Form data for prediction market
  const [predictionData, setPredictionData] = useState({
    question: '',
    description: '',
    tradingEndTime: '',
    resolutionDate: '',
    initialLiquidity: '',
    resolutionCriteria: ''
  })

  // Form data for friend market
  const [friendData, setFriendData] = useState({
    description: '',
    opponent: '', // For 1v1
    members: '', // Comma-separated addresses for small group
    memberLimit: '5',
    tradingPeriod: '7', // Days
    arbitrator: '',
    peggedMarketId: ''
  })

  // Form data for token
  const [tokenData, setTokenData] = useState({
    name: '',
    symbol: '',
    initialSupply: '1000000',
    metadataURI: '',
    isBurnable: false,
    isPausable: false,
    listOnETCSwap: false
  })

  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  const questionRef = useRef(null)

  if (!isOpen) return null

  // Handle form changes
  const handlePredictionChange = (field, value) => {
    setPredictionData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[field]
        return newErrors
      })
    }
  }

  const handleFriendChange = (field, value) => {
    setFriendData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[field]
        return newErrors
      })
    }
  }

  const handleTokenChange = (field, value) => {
    setTokenData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[field]
        return newErrors
      })
    }
  }

  // Validation functions
  const validatePredictionForm = () => {
    const newErrors = {}

    if (!predictionData.question.trim()) {
      newErrors.question = 'Market question is required'
    } else if (predictionData.question.length < 10) {
      newErrors.question = 'Question must be at least 10 characters'
    } else if (predictionData.question.length > 200) {
      newErrors.question = 'Question must be less than 200 characters'
    }

    if (!predictionData.description.trim()) {
      newErrors.description = 'Market description is required'
    } else if (predictionData.description.length < 50) {
      newErrors.description = 'Description must be at least 50 characters'
    }

    if (!predictionData.tradingEndTime) {
      newErrors.tradingEndTime = 'Trading end time is required'
    } else {
      const tradingEnd = new Date(predictionData.tradingEndTime)
      const now = new Date()
      if (tradingEnd <= now) {
        newErrors.tradingEndTime = 'Trading end time must be in the future'
      }
    }

    if (!predictionData.resolutionDate) {
      newErrors.resolutionDate = 'Resolution date is required'
    } else {
      const resolutionDate = new Date(predictionData.resolutionDate)
      const tradingEnd = new Date(predictionData.tradingEndTime)
      if (resolutionDate <= tradingEnd) {
        newErrors.resolutionDate = 'Resolution date must be after trading ends'
      }
    }

    if (!predictionData.initialLiquidity) {
      newErrors.initialLiquidity = 'Initial liquidity is required'
    } else if (parseFloat(predictionData.initialLiquidity) < 100) {
      newErrors.initialLiquidity = 'Minimum liquidity is 100 ETC'
    } else if (parseFloat(predictionData.initialLiquidity) > 1000000) {
      newErrors.initialLiquidity = 'Maximum liquidity is 1,000,000 ETC'
    }

    if (!predictionData.resolutionCriteria.trim()) {
      newErrors.resolutionCriteria = 'Resolution criteria is required'
    } else if (predictionData.resolutionCriteria.length < 20) {
      newErrors.resolutionCriteria = 'Resolution criteria must be at least 20 characters'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const validateFriendForm = () => {
    const newErrors = {}

    if (!friendData.description.trim()) {
      newErrors.description = 'Description is required'
    } else if (friendData.description.length < 10) {
      newErrors.description = 'Description must be at least 10 characters'
    }

    if (friendMarketType === 'oneVsOne') {
      if (!friendData.opponent.trim()) {
        newErrors.opponent = 'Opponent address is required'
      } else if (!/^0x[a-fA-F0-9]{40}$/.test(friendData.opponent.trim())) {
        newErrors.opponent = 'Invalid Ethereum address'
      } else if (friendData.opponent.toLowerCase() === account?.toLowerCase()) {
        newErrors.opponent = 'Cannot bet against yourself'
      }
    }

    if (friendMarketType === 'smallGroup' || friendMarketType === 'eventTracking') {
      if (!friendData.members.trim()) {
        newErrors.members = 'Member addresses are required'
      } else {
        const addresses = friendData.members.split(',').map(a => a.trim()).filter(a => a)
        const minMembers = friendMarketType === 'eventTracking' ? 3 : 2
        const maxMembers = 10

        if (addresses.length < minMembers) {
          newErrors.members = `At least ${minMembers} members required`
        } else if (addresses.length > maxMembers) {
          newErrors.members = `Maximum ${maxMembers} members allowed`
        } else {
          for (const addr of addresses) {
            if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
              newErrors.members = `Invalid address: ${addr}`
              break
            }
          }
        }
      }
    }

    if (!friendData.tradingPeriod || parseInt(friendData.tradingPeriod) < 1) {
      newErrors.tradingPeriod = 'Trading period must be at least 1 day'
    }

    if (friendData.arbitrator && !/^0x[a-fA-F0-9]{40}$/.test(friendData.arbitrator.trim())) {
      newErrors.arbitrator = 'Invalid arbitrator address'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const validateTokenForm = () => {
    const newErrors = {}

    if (!tokenData.name.trim()) {
      newErrors.name = 'Token name is required'
    }

    if (!tokenData.symbol.trim()) {
      newErrors.symbol = 'Token symbol is required'
    } else if (tokenData.symbol.length > 11) {
      newErrors.symbol = 'Symbol must be 11 characters or less'
    }

    if (tokenType === 'ERC20') {
      const supply = parseFloat(tokenData.initialSupply)
      if (isNaN(supply) || supply <= 0) {
        newErrors.initialSupply = 'Initial supply must be greater than 0'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // Submit handlers
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

    let isValid = false
    let submitData = {}

    switch (activeTab) {
      case 'prediction':
        isValid = validatePredictionForm()
        submitData = { type: 'prediction', data: predictionData }
        break
      case 'friend':
        isValid = validateFriendForm()
        submitData = {
          type: 'friend',
          marketType: friendMarketType,
          data: friendData
        }
        break
      case 'token':
        isValid = validateTokenForm()
        submitData = {
          type: 'token',
          tokenType,
          data: tokenData
        }
        break
    }

    if (!isValid) return

    setSubmitting(true)
    try {
      await onCreate(submitData, signer)
      handleClose()
    } catch (error) {
      console.error('Error creating:', error)
      setErrors({ submit: error.message || 'Failed to create. Please try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    if (!submitting) {
      setErrors({})
      setPredictionData({
        question: '',
        description: '',
        tradingEndTime: '',
        resolutionDate: '',
        initialLiquidity: '',
        resolutionCriteria: ''
      })
      setFriendData({
        description: '',
        opponent: '',
        members: '',
        memberLimit: '5',
        tradingPeriod: '7',
        arbitrator: '',
        peggedMarketId: ''
      })
      setTokenData({
        name: '',
        symbol: '',
        initialSupply: '1000000',
        metadataURI: '',
        isBurnable: false,
        isPausable: false,
        listOnETCSwap: false
      })
      onClose()
    }
  }

  const getTabIcon = (tab) => {
    switch (tab) {
      case 'prediction': return '📊'
      case 'friend': return '👥'
      case 'token': return '🪙'
      default: return ''
    }
  }

  const getSubmitButtonText = () => {
    if (submitting) return 'Processing...'
    switch (activeTab) {
      case 'prediction': return 'Create Prediction Market'
      case 'friend': return `Create ${friendMarketType === 'oneVsOne' ? '1v1' : friendMarketType === 'smallGroup' ? 'Group' : 'Event'} Market`
      case 'token': return `Create ${tokenType} Token`
      default: return 'Create'
    }
  }

  return (
    <div
      className="market-creation-modal-overlay"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="market-creation-modal-title"
    >
      <div
        className="market-creation-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="market-creation-modal-title">Create New</h2>
          <button
            className="close-btn"
            onClick={handleClose}
            disabled={submitting}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="modal-tabs">
          <button
            className={`modal-tab ${activeTab === 'prediction' ? 'active' : ''}`}
            onClick={() => { setActiveTab('prediction'); setErrors({}) }}
            disabled={submitting}
          >
            <span className="tab-icon">📊</span>
            <span className="tab-label">Prediction Market</span>
          </button>
          <button
            className={`modal-tab ${activeTab === 'friend' ? 'active' : ''}`}
            onClick={() => { setActiveTab('friend'); setErrors({}) }}
            disabled={submitting}
          >
            <span className="tab-icon">👥</span>
            <span className="tab-label">Friend Market</span>
          </button>
          <button
            className={`modal-tab ${activeTab === 'token' ? 'active' : ''}`}
            onClick={() => { setActiveTab('token'); setErrors({}) }}
            disabled={submitting}
          >
            <span className="tab-icon">🪙</span>
            <span className="tab-label">ERC Token</span>
          </button>
        </div>

        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            {/* Prediction Market Form */}
            {activeTab === 'prediction' && (
              <div className="form-content">
                <div className="form-section">
                  <h3>Market Question</h3>

                  <div className="form-group">
                    <label htmlFor="prediction-question">
                      Question <span className="required">*</span>
                    </label>
                    <input
                      ref={questionRef}
                      id="prediction-question"
                      type="text"
                      value={predictionData.question}
                      onChange={(e) => handlePredictionChange('question', e.target.value)}
                      placeholder="e.g., Will Bitcoin reach $100,000 by end of 2025?"
                      disabled={submitting}
                      className={errors.question ? 'error' : ''}
                      maxLength={200}
                    />
                    <div className="field-hint">Be specific and clear (10-200 characters)</div>
                    {errors.question && <div className="error-message">{errors.question}</div>}
                  </div>

                  <div className="form-group">
                    <label htmlFor="prediction-description">
                      Description <span className="required">*</span>
                    </label>
                    <textarea
                      id="prediction-description"
                      value={predictionData.description}
                      onChange={(e) => handlePredictionChange('description', e.target.value)}
                      placeholder="Provide detailed context about the prediction..."
                      rows="4"
                      disabled={submitting}
                      className={errors.description ? 'error' : ''}
                    />
                    <div className="field-hint">Minimum 50 characters</div>
                    {errors.description && <div className="error-message">{errors.description}</div>}
                  </div>
                </div>

                <div className="form-section">
                  <h3>Market Timing</h3>

                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="trading-end-time">
                        Trading Ends <span className="required">*</span>
                      </label>
                      <input
                        id="trading-end-time"
                        type="datetime-local"
                        value={predictionData.tradingEndTime}
                        onChange={(e) => handlePredictionChange('tradingEndTime', e.target.value)}
                        disabled={submitting}
                        className={errors.tradingEndTime ? 'error' : ''}
                      />
                      {errors.tradingEndTime && <div className="error-message">{errors.tradingEndTime}</div>}
                    </div>

                    <div className="form-group">
                      <label htmlFor="resolution-date">
                        Resolution Date <span className="required">*</span>
                      </label>
                      <input
                        id="resolution-date"
                        type="datetime-local"
                        value={predictionData.resolutionDate}
                        onChange={(e) => handlePredictionChange('resolutionDate', e.target.value)}
                        disabled={submitting}
                        className={errors.resolutionDate ? 'error' : ''}
                      />
                      {errors.resolutionDate && <div className="error-message">{errors.resolutionDate}</div>}
                    </div>
                  </div>
                </div>

                <div className="form-section">
                  <h3>Market Parameters</h3>

                  <div className="form-group">
                    <label htmlFor="initial-liquidity">
                      Initial Liquidity (ETC) <span className="required">*</span>
                    </label>
                    <input
                      id="initial-liquidity"
                      type="number"
                      value={predictionData.initialLiquidity}
                      onChange={(e) => handlePredictionChange('initialLiquidity', e.target.value)}
                      placeholder="1000"
                      min="100"
                      max="1000000"
                      step="0.01"
                      disabled={submitting}
                      className={errors.initialLiquidity ? 'error' : ''}
                    />
                    <div className="field-hint">Min: 100 ETC, Max: 1,000,000 ETC</div>
                    {errors.initialLiquidity && <div className="error-message">{errors.initialLiquidity}</div>}
                  </div>

                  <div className="form-group">
                    <label htmlFor="resolution-criteria">
                      Resolution Criteria <span className="required">*</span>
                    </label>
                    <textarea
                      id="resolution-criteria"
                      value={predictionData.resolutionCriteria}
                      onChange={(e) => handlePredictionChange('resolutionCriteria', e.target.value)}
                      placeholder="Specify exactly how the market will be resolved..."
                      rows="3"
                      disabled={submitting}
                      className={errors.resolutionCriteria ? 'error' : ''}
                    />
                    <div className="field-hint">Minimum 20 characters</div>
                    {errors.resolutionCriteria && <div className="error-message">{errors.resolutionCriteria}</div>}
                  </div>
                </div>
              </div>
            )}

            {/* Friend Market Form */}
            {activeTab === 'friend' && (
              <div className="form-content">
                <div className="form-section">
                  <label className="section-label">Market Type</label>
                  <div className="market-type-selector">
                    <button
                      type="button"
                      className={`type-option ${friendMarketType === 'oneVsOne' ? 'active' : ''}`}
                      onClick={() => setFriendMarketType('oneVsOne')}
                      disabled={submitting}
                    >
                      <div className="type-icon">🎯</div>
                      <div className="type-name">1 vs 1</div>
                      <div className="type-desc">Direct bet with a friend</div>
                    </button>
                    <button
                      type="button"
                      className={`type-option ${friendMarketType === 'smallGroup' ? 'active' : ''}`}
                      onClick={() => setFriendMarketType('smallGroup')}
                      disabled={submitting}
                    >
                      <div className="type-icon">👨‍👩‍👧‍👦</div>
                      <div className="type-name">Small Group</div>
                      <div className="type-desc">3-10 participants</div>
                    </button>
                    <button
                      type="button"
                      className={`type-option ${friendMarketType === 'eventTracking' ? 'active' : ''}`}
                      onClick={() => setFriendMarketType('eventTracking')}
                      disabled={submitting}
                    >
                      <div className="type-icon">🏆</div>
                      <div className="type-name">Event Tracking</div>
                      <div className="type-desc">Competitive events/games</div>
                    </button>
                  </div>
                </div>

                <div className="form-section">
                  <h3>Market Details</h3>

                  <div className="form-group">
                    <label htmlFor="friend-description">
                      Description <span className="required">*</span>
                    </label>
                    <textarea
                      id="friend-description"
                      value={friendData.description}
                      onChange={(e) => handleFriendChange('description', e.target.value)}
                      placeholder="Describe your bet or prediction..."
                      rows="3"
                      disabled={submitting}
                      className={errors.description ? 'error' : ''}
                    />
                    {errors.description && <div className="error-message">{errors.description}</div>}
                  </div>

                  {friendMarketType === 'oneVsOne' && (
                    <div className="form-group">
                      <label htmlFor="opponent-address">
                        Opponent Address <span className="required">*</span>
                      </label>
                      <input
                        id="opponent-address"
                        type="text"
                        value={friendData.opponent}
                        onChange={(e) => handleFriendChange('opponent', e.target.value)}
                        placeholder="0x..."
                        disabled={submitting}
                        className={errors.opponent ? 'error' : ''}
                      />
                      <div className="field-hint">Ethereum address of your opponent</div>
                      {errors.opponent && <div className="error-message">{errors.opponent}</div>}
                    </div>
                  )}

                  {(friendMarketType === 'smallGroup' || friendMarketType === 'eventTracking') && (
                    <>
                      <div className="form-group">
                        <label htmlFor="member-addresses">
                          Member Addresses <span className="required">*</span>
                        </label>
                        <textarea
                          id="member-addresses"
                          value={friendData.members}
                          onChange={(e) => handleFriendChange('members', e.target.value)}
                          placeholder="0x123..., 0x456..., 0x789..."
                          rows="3"
                          disabled={submitting}
                          className={errors.members ? 'error' : ''}
                        />
                        <div className="field-hint">
                          Comma-separated addresses ({friendMarketType === 'eventTracking' ? '3-10' : '2-10'} members)
                        </div>
                        {errors.members && <div className="error-message">{errors.members}</div>}
                      </div>

                      {friendMarketType === 'smallGroup' && (
                        <div className="form-group">
                          <label htmlFor="member-limit">
                            Member Limit
                          </label>
                          <input
                            id="member-limit"
                            type="number"
                            value={friendData.memberLimit}
                            onChange={(e) => handleFriendChange('memberLimit', e.target.value)}
                            min="3"
                            max="10"
                            disabled={submitting}
                          />
                          <div className="field-hint">Maximum concurrent members (3-10)</div>
                        </div>
                      )}
                    </>
                  )}

                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="trading-period">
                        Trading Period (Days) <span className="required">*</span>
                      </label>
                      <input
                        id="trading-period"
                        type="number"
                        value={friendData.tradingPeriod}
                        onChange={(e) => handleFriendChange('tradingPeriod', e.target.value)}
                        min="1"
                        max="365"
                        disabled={submitting}
                        className={errors.tradingPeriod ? 'error' : ''}
                      />
                      {errors.tradingPeriod && <div className="error-message">{errors.tradingPeriod}</div>}
                    </div>

                    <div className="form-group">
                      <label htmlFor="arbitrator-address">
                        Arbitrator (Optional)
                      </label>
                      <input
                        id="arbitrator-address"
                        type="text"
                        value={friendData.arbitrator}
                        onChange={(e) => handleFriendChange('arbitrator', e.target.value)}
                        placeholder="0x..."
                        disabled={submitting}
                        className={errors.arbitrator ? 'error' : ''}
                      />
                      <div className="field-hint">Third-party to resolve disputes</div>
                      {errors.arbitrator && <div className="error-message">{errors.arbitrator}</div>}
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="pegged-market">
                      Peg to Public Market (Optional)
                    </label>
                    <input
                      id="pegged-market"
                      type="text"
                      value={friendData.peggedMarketId}
                      onChange={(e) => handleFriendChange('peggedMarketId', e.target.value)}
                      placeholder="Market ID"
                      disabled={submitting}
                    />
                    <div className="field-hint">Auto-resolve based on public market outcome</div>
                  </div>
                </div>
              </div>
            )}

            {/* Token Form */}
            {activeTab === 'token' && (
              <div className="form-content">
                <div className="form-section">
                  <label className="section-label">Token Type</label>
                  <div className="token-type-selector">
                    <button
                      type="button"
                      className={`type-option ${tokenType === 'ERC20' ? 'active' : ''}`}
                      onClick={() => setTokenType('ERC20')}
                      disabled={submitting}
                    >
                      <div className="type-icon">💰</div>
                      <div className="type-name">ERC-20</div>
                      <div className="type-desc">Fungible Token</div>
                    </button>
                    <button
                      type="button"
                      className={`type-option ${tokenType === 'ERC721' ? 'active' : ''}`}
                      onClick={() => setTokenType('ERC721')}
                      disabled={submitting}
                    >
                      <div className="type-icon">🎨</div>
                      <div className="type-name">ERC-721</div>
                      <div className="type-desc">NFT Collection</div>
                    </button>
                  </div>
                </div>

                <div className="form-section">
                  <h3>Basic Information</h3>

                  <div className="form-group">
                    <label htmlFor="token-name">
                      Token Name <span className="required">*</span>
                    </label>
                    <input
                      id="token-name"
                      type="text"
                      value={tokenData.name}
                      onChange={(e) => handleTokenChange('name', e.target.value)}
                      placeholder="e.g., My Awesome Token"
                      disabled={submitting}
                      className={errors.name ? 'error' : ''}
                    />
                    {errors.name && <div className="error-message">{errors.name}</div>}
                  </div>

                  <div className="form-group">
                    <label htmlFor="token-symbol">
                      Symbol <span className="required">*</span>
                    </label>
                    <input
                      id="token-symbol"
                      type="text"
                      value={tokenData.symbol}
                      onChange={(e) => handleTokenChange('symbol', e.target.value.toUpperCase())}
                      placeholder="e.g., MAT"
                      maxLength={11}
                      disabled={submitting}
                      className={errors.symbol ? 'error' : ''}
                    />
                    {errors.symbol && <div className="error-message">{errors.symbol}</div>}
                  </div>

                  {tokenType === 'ERC20' && (
                    <div className="form-group">
                      <label htmlFor="token-supply">
                        Initial Supply <span className="required">*</span>
                      </label>
                      <input
                        id="token-supply"
                        type="number"
                        value={tokenData.initialSupply}
                        onChange={(e) => handleTokenChange('initialSupply', e.target.value)}
                        placeholder="1000000"
                        min="1"
                        disabled={submitting}
                        className={errors.initialSupply ? 'error' : ''}
                      />
                      <div className="field-hint">Total number of tokens to create</div>
                      {errors.initialSupply && <div className="error-message">{errors.initialSupply}</div>}
                    </div>
                  )}
                </div>

                <div className="form-section">
                  <h3>Metadata (OpenSea Standard)</h3>

                  <div className="form-group">
                    <label htmlFor="metadata-uri">
                      {tokenType === 'ERC20' ? 'Metadata URI' : 'Base URI'}
                    </label>
                    <input
                      id="metadata-uri"
                      type="text"
                      value={tokenData.metadataURI}
                      onChange={(e) => handleTokenChange('metadataURI', e.target.value)}
                      placeholder="ipfs://QmYourCID or https://..."
                      disabled={submitting}
                    />
                    <div className="field-hint">
                      {tokenType === 'ERC20'
                        ? 'IPFS CID or URL pointing to token metadata (optional)'
                        : 'Base URI for NFT metadata'}
                    </div>
                  </div>
                </div>

                <div className="form-section">
                  <h3>Features</h3>

                  <div className="checkbox-group">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={tokenData.isBurnable}
                        onChange={(e) => handleTokenChange('isBurnable', e.target.checked)}
                        disabled={submitting}
                      />
                      <span className="checkbox-text">
                        <span className="checkbox-icon">🔥</span>
                        <div>
                          <div className="checkbox-title">Burnable</div>
                          <div className="checkbox-desc">
                            Token holders can burn (destroy) their tokens
                          </div>
                        </div>
                      </span>
                    </label>

                    {tokenType === 'ERC20' && (
                      <>
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={tokenData.isPausable}
                            onChange={(e) => handleTokenChange('isPausable', e.target.checked)}
                            disabled={submitting}
                          />
                          <span className="checkbox-text">
                            <span className="checkbox-icon">⏸️</span>
                            <div>
                              <div className="checkbox-title">Pausable</div>
                              <div className="checkbox-desc">
                                Owner can pause all token transfers
                              </div>
                            </div>
                          </span>
                        </label>

                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={tokenData.listOnETCSwap}
                            onChange={(e) => handleTokenChange('listOnETCSwap', e.target.checked)}
                            disabled={submitting}
                          />
                          <span className="checkbox-text">
                            <span className="checkbox-icon">🔄</span>
                            <div>
                              <div className="checkbox-title">List on ETCSwap</div>
                              <div className="checkbox-desc">
                                Automatically list token on ETCSwap DEX
                              </div>
                            </div>
                          </span>
                        </label>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Network Warning */}
            {isConnected && !isCorrectNetwork && (
              <div className="network-warning">
                <span>⚠️</span>
                <div>
                  <strong>Wrong Network</strong>
                  <p>Please switch to the correct network to continue.</p>
                  <button
                    type="button"
                    className="switch-network-btn"
                    onClick={switchNetwork}
                  >
                    Switch Network
                  </button>
                </div>
              </div>
            )}

            {/* Submit Error */}
            {errors.submit && (
              <div className="submit-error">
                {errors.submit}
              </div>
            )}

            {/* Actions */}
            <div className="modal-actions">
              <button
                type="button"
                className="cancel-btn"
                onClick={handleClose}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="create-btn"
                disabled={submitting || !isConnected || !isCorrectNetwork}
              >
                {submitting && <span className="spinner-small"></span>}
                {getSubmitButtonText()}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default MarketCreationModal
