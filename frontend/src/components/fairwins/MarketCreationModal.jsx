import { useState, useCallback, useMemo, useEffect } from 'react'
import { useWallet, useWeb3, useEnsResolution } from '../../hooks'
import { isValidCid } from '../../constants/ipfs'
import { TOKENS } from '../../constants/etcswap'
import {
  isCorrelationRegistryDeployed,
  fetchCorrelationGroups,
  fetchCorrelationGroupsByCategory
} from '../../utils/blockchainService'
import H3MapSelector from './H3MapSelector'
import './MarketCreationModal.css'

/**
 * MarketCreationModal Component
 *
 * Modern, minimalist market creation modal with wizard-style steps.
 * Separates on-chain data (essential contract parameters) from
 * off-chain data (IPFS metadata for rich content).
 *
 * On-chain data (stored in contract):
 * - Trading period
 * - Initial liquidity
 * - Bet type
 * - Collateral token
 *
 * Off-chain data (stored in IPFS):
 * - Title (short, descriptive name displayed on cards)
 * - Question (the specific prediction question)
 * - Description (context, background, and resolution criteria)
 * - Category, tags, image
 */

const BET_TYPES = [
  { id: 0, name: 'Yes / No', icon: '✓', description: 'Standard binary outcome' },
  { id: 1, name: 'Pass / Fail', icon: '◉', description: 'Governance proposal style' },
  { id: 2, name: 'Above / Below', icon: '↕', description: 'Threshold-based outcome' },
  { id: 3, name: 'Higher / Lower', icon: '⇅', description: 'Comparative outcome' },
  { id: 4, name: 'In / Out', icon: '◎', description: 'Range-based outcome' },
  { id: 5, name: 'Over / Under', icon: '±', description: 'Value-based outcome' },
  { id: 6, name: 'For / Against', icon: '⚖', description: 'Debate-style outcome' },
  { id: 7, name: 'True / False', icon: '◐', description: 'Statement verification' },
  { id: 8, name: 'Win / Lose', icon: '🏆', description: 'Competition outcome' },
  { id: 9, name: 'Up / Down', icon: '↑↓', description: 'Directional movement' }
]

const CATEGORIES = [
  'Crypto', 'Politics', 'Sports', 'Entertainment', 'Science',
  'Technology', 'Business', 'Finance', 'Culture', 'Weather', 'Other'
]

// Collateral token options derived from ETCswap tokens
const COLLATERAL_TOKEN_OPTIONS = [
  { id: 'USC', ...TOKENS.USC, isDefault: true },
  { id: 'WETC', ...TOKENS.WETC },
  { id: 'ETC', ...TOKENS.ETC },
  { id: 'CUSTOM', symbol: 'Custom', name: 'Custom Token Address', address: '', icon: '🔧' }
]

const STEPS = [
  { id: 'metadata', label: 'Content', icon: '📝' },
  { id: 'education', label: 'Education', icon: '💡' },
  { id: 'parameters', label: 'Parameters', icon: '⚙️' },
  { id: 'review', label: 'Review', icon: '✓' }
]

function MarketCreationModal({ isOpen, onClose, onCreate }) {
  const { isConnected, address } = useWallet()
  const { signer, isCorrectNetwork, switchNetwork } = useWeb3()

  // Step navigation
  const [currentStep, setCurrentStep] = useState(0)

  // Note: ENS resolution hook is placed after state declarations below

  // Metadata source toggle
  const [useCustomUri, setUseCustomUri] = useState(false)

  // Form data for metadata (off-chain IPFS)
  const [metadataForm, setMetadataForm] = useState({
    question: '',
    description: '',
    resolutionCriteria: '',
    category: '',
    tags: '',
    imageUri: '',
    sourceUrl: '',
    h3Index: null, // H3 hexagon index for weather markets
    h3Resolution: 5 // H3 resolution for weather markets
  })

  // Custom URI input
  const [customUri, setCustomUri] = useState('')

  // Helper to get default resolution date (14 days from now)
  const getDefaultResolutionDate = () => {
    const date = new Date()
    date.setDate(date.getDate() + 14)
    // Format as YYYY-MM-DDTHH:mm for datetime-local input
    return date.toISOString().slice(0, 16)
  }

  // Form data for on-chain parameters
  const [paramsForm, setParamsForm] = useState({
    resolutionDateTime: getDefaultResolutionDate(),
    initialLiquidity: '',
    betType: 1, // Default to Pass/Fail (more appropriate for governance-style predictions)
    collateralTokenId: 'USC', // Default to USC stablecoin
    customCollateralAddress: '' // Used when collateralTokenId is 'CUSTOM'
  })

  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  // Transaction progress tracking
  const [transactionProgress, setTransactionProgress] = useState(null)

  // Correlation group state
  const [correlationGroups, setCorrelationGroups] = useState([])
  const [correlationGroupsLoading, setCorrelationGroupsLoading] = useState(false)
  const [selectedCorrelationGroup, setSelectedCorrelationGroup] = useState(null)
  const [createNewGroup, setCreateNewGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupDescription, setNewGroupDescription] = useState('')
  const [correlationEnabled, setCorrelationEnabled] = useState(false)

  // ENS resolution for collateral token address - hook called for context subscription
  useEnsResolution(paramsForm.collateralToken || '')

  // Reset form when modal opens/closes
  const resetForm = useCallback(() => {
    setCurrentStep(0)
    setUseCustomUri(false)
    setMetadataForm({
      question: '',
      description: '',
      resolutionCriteria: '',
      category: '',
      tags: '',
      imageUri: '',
      sourceUrl: '',
      h3Index: null,
      h3Resolution: 5
    })
    setCustomUri('')
    setParamsForm({
      resolutionDateTime: getDefaultResolutionDate(),
      initialLiquidity: '',
      betType: 1,
      collateralTokenId: 'USC',
      customCollateralAddress: ''
    })
    setErrors({})
    setSubmitting(false)
    setTransactionProgress(null)
    // Reset correlation group state
    setSelectedCorrelationGroup(null)
    setCreateNewGroup(false)
    setNewGroupName('')
    setNewGroupDescription('')
    setCorrelationEnabled(false)
  }, [])

  // Reset form state when modal opens
  useEffect(() => {
    if (isOpen) {
      resetForm()
    }
  }, [isOpen, resetForm])

  // Fetch correlation groups when modal opens or category changes
  useEffect(() => {
    const loadCorrelationGroups = async () => {
      if (!isOpen) return
      if (!isCorrelationRegistryDeployed()) {
        setCorrelationGroups([])
        return
      }

      setCorrelationGroupsLoading(true)
      try {
        let groups
        if (metadataForm.category) {
          // Fetch groups for the selected category
          groups = await fetchCorrelationGroupsByCategory(metadataForm.category)
        } else {
          // Fetch all groups if no category selected
          groups = await fetchCorrelationGroups()
        }
        setCorrelationGroups(groups)
      } catch (error) {
        console.error('Error loading correlation groups:', error)
        setCorrelationGroups([])
      } finally {
        setCorrelationGroupsLoading(false)
      }
    }

    loadCorrelationGroups()
  }, [isOpen, metadataForm.category])

  // Handle form changes
  const handleMetadataChange = useCallback((field, value) => {
    setMetadataForm(prev => ({ ...prev, [field]: value }))
    setErrors(prev => {
      const newErrors = { ...prev }
      delete newErrors[field]
      return newErrors
    })
  }, [])

  const handleParamsChange = useCallback((field, value) => {
    setParamsForm(prev => ({ ...prev, [field]: value }))
    setErrors(prev => {
      const newErrors = { ...prev }
      delete newErrors[field]
      return newErrors
    })
  }, [])

  // Validate current step
  const validateStep = useCallback((step) => {
    const newErrors = {}

    if (step === 0) {
      // Metadata validation
      if (useCustomUri) {
        if (!customUri.trim()) {
          newErrors.customUri = 'IPFS CID or URI is required'
        } else if (!isValidUri(customUri.trim())) {
          newErrors.customUri = 'Enter a valid IPFS CID, ipfs:// URI, or https:// URL'
        }
      } else {
        if (!metadataForm.question.trim()) {
          newErrors.question = 'Market title is required'
        } else if (metadataForm.question.length < 10) {
          newErrors.question = 'Title must be at least 10 characters'
        } else if (metadataForm.question.length > 200) {
          newErrors.question = 'Title must be under 200 characters'
        }

        if (!metadataForm.description.trim()) {
          newErrors.description = 'Market question is required'
        } else if (metadataForm.description.length < 30) {
          newErrors.description = 'Question must be at least 30 characters'
        }

        if (!metadataForm.resolutionCriteria.trim()) {
          newErrors.resolutionCriteria = 'Market description is required'
        } else if (metadataForm.resolutionCriteria.length < 20) {
          newErrors.resolutionCriteria = 'Description must be at least 20 characters'
        }

        if (!metadataForm.category) {
          newErrors.category = 'Please select a category'
        }

        // Validate H3 location for Weather category
        if (metadataForm.category === 'Weather' && !metadataForm.h3Index) {
          newErrors.h3Index = 'Please select a location on the map for weather markets'
        }

        // Validate optional URI fields if provided
        if (metadataForm.imageUri && metadataForm.imageUri.trim()) {
          const uri = metadataForm.imageUri.trim()
          if (!uri.startsWith('ipfs://') && !uri.startsWith('https://')) {
            newErrors.imageUri = 'Image URI must start with ipfs:// or https://'
          } else if (!isValidUri(uri)) {
            newErrors.imageUri = 'Invalid image URI format'
          }
        }

        if (metadataForm.sourceUrl && metadataForm.sourceUrl.trim()) {
          const uri = metadataForm.sourceUrl.trim()
          if (!uri.startsWith('https://')) {
            newErrors.sourceUrl = 'Source URL must start with https://'
          } else {
            try {
              new URL(uri)
            } catch {
              newErrors.sourceUrl = 'Invalid source URL format'
            }
          }
        }
      }
    }

    // Step 1 is educational, no validation needed

    if (step === 2) {
      // Parameters validation - resolution date/time
      const resolutionDate = new Date(paramsForm.resolutionDateTime)
      const now = new Date()
      const minDate = new Date(now.getTime() + 24 * 60 * 60 * 1000) // At least 1 day from now
      const maxDate = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000) // Max 1 year from now

      if (!paramsForm.resolutionDateTime || isNaN(resolutionDate.getTime())) {
        newErrors.resolutionDateTime = 'Please select a valid resolution date and time'
      } else if (resolutionDate < minDate) {
        newErrors.resolutionDateTime = 'Resolution must be at least 1 day from now'
      } else if (resolutionDate > maxDate) {
        newErrors.resolutionDateTime = 'Resolution must be within 1 year'
      }

      const liquidity = parseFloat(paramsForm.initialLiquidity)
      if (!paramsForm.initialLiquidity || isNaN(liquidity) || liquidity < 100) {
        newErrors.initialLiquidity = 'Minimum liquidity is 100 ETC'
      } else if (liquidity > 1000000) {
        newErrors.initialLiquidity = 'Maximum liquidity is 1,000,000 ETC'
      }

      // Validate custom collateral address if custom token is selected
      if (paramsForm.collateralTokenId === 'CUSTOM') {
        if (!paramsForm.customCollateralAddress) {
          newErrors.customCollateralAddress = 'Custom token address is required'
        } else if (!/^0x[a-fA-F0-9]{40}$/.test(paramsForm.customCollateralAddress)) {
          newErrors.customCollateralAddress = 'Invalid token address format (should be checksummed)'
        }
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [useCustomUri, customUri, metadataForm, paramsForm, address])

  // Navigation handlers
  const handleNext = useCallback(() => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, STEPS.length - 1))
    }
  }, [currentStep, validateStep])

  const handleBack = useCallback(() => {
    setCurrentStep(prev => Math.max(prev - 1, 0))
  }, [])

  const handleStepClick = useCallback((stepIndex) => {
    // Only allow going back, or forward if current step is valid
    if (stepIndex < currentStep) {
      setCurrentStep(stepIndex)
    } else if (stepIndex === currentStep + 1 && validateStep(currentStep)) {
      setCurrentStep(stepIndex)
    }
  }, [currentStep, validateStep])

  // Build metadata JSON for IPFS
  const buildMetadataJson = useCallback(() => {
    const betType = BET_TYPES.find(b => b.id === paramsForm.betType)
    const tags = metadataForm.tags
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0)

    // Build description, avoiding duplicate resolution criteria if user already included it
    let description = (metadataForm.description || '').trim()
    const resolutionCriteria = (metadataForm.resolutionCriteria || '').trim()

    if (resolutionCriteria) {
      const descLower = description.toLowerCase()
      const marker = '**description:**'
      const hasDescriptionSection = descLower.includes(marker)

      if (!hasDescriptionSection) {
        description = description
          ? `${description}\n\n**Description:**\n${resolutionCriteria}`
          : `**Description:**\n${resolutionCriteria}`
      }
    }

    // Validate and parse initial liquidity value
    const liquidityStr = (paramsForm.initialLiquidity || '').trim()
    const liquidityNum = Number(liquidityStr)
    const isValidLiquidity = liquidityStr !== '' && !isNaN(liquidityNum) && liquidityStr === String(liquidityNum)

    return {
      name: metadataForm.question,
      description,
      image: metadataForm.imageUri || 'ipfs://QmDefaultMarketImage',
      external_url: metadataForm.sourceUrl || undefined,
      attributes: [
        { trait_type: 'Category', value: metadataForm.category },
        { trait_type: 'Bet Type', value: betType?.name || 'Pass / Fail' },
        { trait_type: 'Resolution Date', value: paramsForm.resolutionDateTime, display_type: 'date' },
        { trait_type: 'Initial Liquidity', value: isValidLiquidity ? liquidityNum : 0, display_type: 'number' }
      ],
      properties: {
        creator: address,
        created_at: new Date().toISOString(),
        tags: tags.length > 0 ? tags : undefined,
        resolution_criteria: metadataForm.resolutionCriteria,
        // H3 location data for weather markets
        ...(metadataForm.category === 'Weather' && metadataForm.h3Index ? {
          h3_index: metadataForm.h3Index,
          h3_resolution: metadataForm.h3Resolution
        } : {})
      }
    }
  }, [metadataForm, paramsForm, address])

  // Get the final URI (either custom or will be uploaded)
  const getFinalUri = useCallback(() => {
    if (useCustomUri) {
      return normalizeUri(customUri.trim())
    }
    // When not using custom URI, metadata will be uploaded to IPFS
    // and CID will be returned by the onCreate handler
    return null
  }, [useCustomUri, customUri])

  // Submit handler
  const handleSubmit = async () => {
    if (!validateStep(0) || !validateStep(2)) {
      return
    }

    if (!isConnected) {
      setErrors({ submit: 'Please connect your wallet to continue' })
      return
    }

    if (!isCorrectNetwork) {
      setErrors({ submit: 'Please switch to the correct network' })
      return
    }

    setSubmitting(true)

    try {
      // Get the actual collateral token address based on selection
      const getCollateralTokenAddress = () => {
        if (paramsForm.collateralTokenId === 'CUSTOM') {
          return paramsForm.customCollateralAddress || null
        }
        const token = COLLATERAL_TOKEN_OPTIONS.find(t => t.id === paramsForm.collateralTokenId)
        if (!token || token.address === 'native') {
          return null // Native ETC
        }
        return token.address
      }

      // Calculate trading period in seconds from resolution date
      const resolutionDate = new Date(paramsForm.resolutionDateTime)
      const now = new Date()
      const tradingPeriodSeconds = Math.floor((resolutionDate.getTime() - now.getTime()) / 1000)

      const submitData = {
        // On-chain parameters
        // Trading period calculated from the difference between resolution date and now
        tradingPeriod: tradingPeriodSeconds,
        initialLiquidity: paramsForm.initialLiquidity,
        betType: paramsForm.betType,
        collateralToken: getCollateralTokenAddress(),
        // Correlation group data
        correlationGroup: correlationEnabled ? {
          existingGroupId: createNewGroup ? null : selectedCorrelationGroup?.id,
          createNew: createNewGroup,
          newGroupName: createNewGroup ? newGroupName : null,
          newGroupDescription: createNewGroup ? newGroupDescription : null,
          category: metadataForm.category
        } : null,
        // Metadata
        metadataUri: getFinalUri(),
        metadata: useCustomUri ? null : buildMetadataJson()
      }

      // Progress callback to update UI
      const handleProgress = (progress) => {
        setTransactionProgress(progress)
      }

      await onCreate(submitData, signer, handleProgress)
      setTransactionProgress({ step: 0, total: 0, description: 'Complete!', status: 'completed' })
      // Brief delay to show completion before closing
      await new Promise(resolve => setTimeout(resolve, 1000))
      resetForm()
      onClose()
    } catch (error) {
      console.error('Error creating market:', error)
      setTransactionProgress(null)
      setErrors({ submit: error.message || 'Failed to create market. Please try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = useCallback(() => {
    if (!submitting) {
      resetForm()
      onClose()
    }
  }, [submitting, resetForm, onClose])

  // Computed values for review
  const selectedBetType = useMemo(() =>
    BET_TYPES.find(b => b.id === paramsForm.betType),
    [paramsForm.betType]
  )

  // Get selected collateral token info
  const selectedCollateralToken = useMemo(() => {
    const token = COLLATERAL_TOKEN_OPTIONS.find(t => t.id === paramsForm.collateralTokenId)
    if (paramsForm.collateralTokenId === 'CUSTOM' && paramsForm.customCollateralAddress) {
      return {
        ...token,
        displayAddress: paramsForm.customCollateralAddress
      }
    }
    return token
  }, [paramsForm.collateralTokenId, paramsForm.customCollateralAddress])

  // Check if current step is valid WITHOUT triggering re-render (no setErrors)
  // This is used in render for disabled state calculations
  const isCurrentStepValid = useMemo(() => {
    if (currentStep === 0) {
      if (useCustomUri) {
        return customUri.trim() && isValidUri(customUri.trim())
      }
      return (
        metadataForm.question.trim().length >= 10 &&
        metadataForm.question.length <= 200 &&
        metadataForm.description.trim().length >= 30 &&
        metadataForm.resolutionCriteria.trim().length >= 20 &&
        metadataForm.category
      )
    }
    if (currentStep === 1) {
      return true // Education step, always valid
    }
    if (currentStep === 2) {
      const resolutionDate = new Date(paramsForm.resolutionDateTime)
      const now = new Date()
      const minDate = new Date(now.getTime() + 24 * 60 * 60 * 1000) // At least 1 day
      const maxDate = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000) // Max 1 year
      const liquidity = parseFloat(paramsForm.initialLiquidity)
      const isValidResolutionDate = paramsForm.resolutionDateTime &&
        !isNaN(resolutionDate.getTime()) &&
        resolutionDate >= minDate &&
        resolutionDate <= maxDate
      return (
        isValidResolutionDate &&
        paramsForm.initialLiquidity && !isNaN(liquidity) && liquidity >= 100 && liquidity <= 1000000
      )
    }
    return false
  }, [currentStep, useCustomUri, customUri, metadataForm, paramsForm])

  if (!isOpen) return null

  return (
    <div
      className="mcm-overlay"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="mcm-title"
    >
      <div className="mcm-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <header className="mcm-header">
          <h2 id="mcm-title">Create Market</h2>
          <button
            className="mcm-close-btn"
            onClick={handleClose}
            disabled={submitting}
            aria-label="Close modal"
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        {/* Step Indicator */}
        <nav className="mcm-steps" aria-label="Creation steps">
          {STEPS.map((step, index) => (
            <button
              key={step.id}
              className={`mcm-step ${index === currentStep ? 'active' : ''} ${index < currentStep ? 'completed' : ''}`}
              onClick={() => handleStepClick(index)}
              disabled={submitting || (index > currentStep && (index !== currentStep + 1 || !isCurrentStepValid))}
              aria-current={index === currentStep ? 'step' : undefined}
            >
              <span className="mcm-step-icon" aria-hidden="true">
                {index < currentStep ? '✓' : step.icon}
              </span>
              <span className="mcm-step-label">{step.label}</span>
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="mcm-content">
          {/* Step 1: Metadata */}
          {currentStep === 0 && (
            <div className="mcm-panel" role="tabpanel" aria-labelledby="step-metadata">
              {/* URI Source Toggle */}
              <section className="mcm-section">
                <div className="mcm-toggle-row">
                  <div className="mcm-toggle-info">
                    <strong>Metadata Source</strong>
                    <p>Provide your own IPFS CID or enter details below</p>
                  </div>
                  <button
                    type="button"
                    className="mcm-toggle-btn"
                    onClick={() => setUseCustomUri(!useCustomUri)}
                    aria-pressed={useCustomUri}
                    disabled={submitting}
                  >
                    <span className="mcm-toggle-track">
                      <span className={`mcm-toggle-thumb ${useCustomUri ? 'active' : ''}`} />
                    </span>
                    <span className="mcm-toggle-label">{useCustomUri ? 'Custom URI' : 'Form Input'}</span>
                  </button>
                </div>
              </section>

              {useCustomUri ? (
                /* Custom URI Input */
                <section className="mcm-section">
                  <h3 className="mcm-section-title">
                    <span aria-hidden="true">🔗</span> IPFS Content
                  </h3>
                  <div className="mcm-field">
                    <label htmlFor="customUri">
                      CID or URI <span className="mcm-required">*</span>
                    </label>
                    <input
                      id="customUri"
                      type="text"
                      value={customUri}
                      onChange={e => setCustomUri(e.target.value)}
                      placeholder="QmYourCID... or ipfs://... or https://..."
                      disabled={submitting}
                      className={errors.customUri ? 'error' : ''}
                    />
                    <div className="mcm-hint">
                      Enter a valid IPFS CID (v0 or v1), ipfs:// URI, or https:// URL
                    </div>
                    {errors.customUri && <div className="mcm-error">{errors.customUri}</div>}
                  </div>

                  <div className="mcm-info-card">
                    <span className="mcm-info-icon" aria-hidden="true">💡</span>
                    <div>
                      <strong>Metadata Format</strong>
                      <p>Your metadata should follow the OpenSea standard with name, description, image, and attributes.</p>
                    </div>
                  </div>
                </section>
              ) : (
                /* Form Input */
                <>
                  <section className="mcm-section">
                    <h3 className="mcm-section-title">
                      <span aria-hidden="true">❓</span> Market Details
                    </h3>
                    <div className="mcm-field">
                      <label htmlFor="question">
                        Title <span className="mcm-required">*</span>
                      </label>
                      <input
                        id="question"
                        type="text"
                        value={metadataForm.question}
                        onChange={e => handleMetadataChange('question', e.target.value)}
                        placeholder="Short, descriptive title for the market"
                        disabled={submitting}
                        maxLength={200}
                        className={errors.question ? 'error' : ''}
                      />
                      <div className="mcm-char-count">
                        {metadataForm.question.length}/200
                      </div>
                      {errors.question && <div className="mcm-error">{errors.question}</div>}
                    </div>

                    <div className="mcm-field">
                      <label htmlFor="description">
                        Question <span className="mcm-required">*</span>
                      </label>
                      <textarea
                        id="description"
                        value={metadataForm.description}
                        onChange={e => handleMetadataChange('description', e.target.value)}
                        placeholder="The specific question this market is asking (e.g., Will Bitcoin reach $100,000 by end of 2025?)"
                        disabled={submitting}
                        rows={3}
                        className={errors.description ? 'error' : ''}
                      />
                      {errors.description && <div className="mcm-error">{errors.description}</div>}
                    </div>

                    <div className="mcm-field">
                      <label htmlFor="resolutionCriteria">
                        Description <span className="mcm-required">*</span>
                      </label>
                      <textarea
                        id="resolutionCriteria"
                        value={metadataForm.resolutionCriteria}
                        onChange={e => handleMetadataChange('resolutionCriteria', e.target.value)}
                        placeholder="Provide context, background, and resolution criteria for this market..."
                        disabled={submitting}
                        rows={3}
                        className={errors.resolutionCriteria ? 'error' : ''}
                      />
                      <div className="mcm-hint">Include data sources, timing, edge cases, and how resolution will be determined</div>
                      {errors.resolutionCriteria && <div className="mcm-error">{errors.resolutionCriteria}</div>}
                    </div>
                  </section>

                  <section className="mcm-section">
                    <h3 className="mcm-section-title">
                      <span aria-hidden="true">🏷️</span> Classification
                    </h3>
                    <div className="mcm-field">
                      <label htmlFor="category">
                        Category <span className="mcm-required">*</span>
                      </label>
                      <div className="mcm-category-grid">
                        {CATEGORIES.map(cat => (
                          <button
                            key={cat}
                            type="button"
                            className={`mcm-category-btn ${metadataForm.category === cat ? 'active' : ''}`}
                            onClick={() => handleMetadataChange('category', cat)}
                            disabled={submitting}
                            aria-label={`Select ${cat} category`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                      {errors.category && <div className="mcm-error">{errors.category}</div>}
                    </div>

                    {/* H3 Location Selector for Weather Markets */}
                    {metadataForm.category === 'Weather' && (
                      <div className="mcm-field">
                        <label>
                          Location <span className="mcm-required">*</span>
                        </label>
                        <div className="mcm-hint" style={{ marginBottom: '0.5rem' }}>
                          Select the geographic area for this weather prediction market
                        </div>
                        <H3MapSelector
                          selectedH3={metadataForm.h3Index}
                          onH3Select={(h3Index) => handleMetadataChange('h3Index', h3Index)}
                          resolution={metadataForm.h3Resolution}
                          onResolutionChange={(resolution) => handleMetadataChange('h3Resolution', resolution)}
                          disabled={submitting}
                          height="350px"
                        />
                        {errors.h3Index && <div className="mcm-error">{errors.h3Index}</div>}
                      </div>
                    )}

                    <div className="mcm-field">
                      <label htmlFor="tags">Tags</label>
                      <input
                        id="tags"
                        type="text"
                        value={metadataForm.tags}
                        onChange={e => handleMetadataChange('tags', e.target.value)}
                        placeholder="bitcoin, price, 2025 (comma-separated)"
                        disabled={submitting}
                      />
                      <div className="mcm-hint">Optional tags for discovery</div>
                    </div>
                  </section>

                  <section className="mcm-section">
                    <h3 className="mcm-section-title">
                      <span aria-hidden="true">🖼️</span> Media (Optional)
                    </h3>
                    <div className="mcm-field">
                      <label htmlFor="imageUri">Image URI</label>
                      <input
                        id="imageUri"
                        type="text"
                        value={metadataForm.imageUri}
                        onChange={e => handleMetadataChange('imageUri', e.target.value)}
                        placeholder="ipfs://QmImageCID or https://..."
                        disabled={submitting}
                        className={errors.imageUri ? 'error' : ''}
                      />
                      {errors.imageUri && <div className="mcm-error">{errors.imageUri}</div>}
                    </div>

                    <div className="mcm-field">
                      <label htmlFor="sourceUrl">Source URL</label>
                      <input
                        id="sourceUrl"
                        type="text"
                        value={metadataForm.sourceUrl}
                        onChange={e => handleMetadataChange('sourceUrl', e.target.value)}
                        placeholder="https://example.com/article"
                        disabled={submitting}
                        className={errors.sourceUrl ? 'error' : ''}
                      />
                      <div className="mcm-hint">Link to supporting information</div>
                      {errors.sourceUrl && <div className="mcm-error">{errors.sourceUrl}</div>}
                    </div>
                  </section>
                </>
              )}
            </div>
          )}

          {/* Step 1: Education on Market Design */}
          {currentStep === 1 && (
            <div className="mcm-panel" role="tabpanel" aria-labelledby="step-education">
              <section className="mcm-section">
                <div className="mcm-education-header">
                  <h3 className="mcm-section-title">
                    <span aria-hidden="true">🎯</span> Designing Markets for Information Discovery
                  </h3>
                  <p className="mcm-education-intro">
                    FairWins is not a place to bet on outcomes. It's a system designed to <strong>discover, discipline, and distill information</strong>—even when participants are automated, strategic, and adversarial.
                  </p>
                </div>

                <div className="mcm-education-card mcm-education-primary">
                  <div className="mcm-education-icon" aria-hidden="true">💡</div>
                  <div className="mcm-education-content">
                    <h4>Key Principle</h4>
                    <p>Markets are evaluated by the <strong>quality of information they discover</strong>, not by the apparent confidence or stability of prices.</p>
                  </div>
                </div>

                <div className="mcm-education-divider">
                  <span>Market Dimensions</span>
                </div>

                <div className="mcm-dimensions-grid">
                  <div className="mcm-dimension-card">
                    <div className="mcm-dimension-header">
                      <span className="mcm-dimension-icon" aria-hidden="true">🔍</span>
                      <h4>Resolution Ontology</h4>
                    </div>
                    <p className="mcm-dimension-desc">What does it mean for the market to resolve?</p>
                    <ul className="mcm-dimension-list">
                      <li><strong>Revelatory:</strong> Reveals a pre-existing fact</li>
                      <li><strong>Eventual:</strong> Occurs via exogenous unfolding</li>
                      <li><strong>Performative:</strong> Caused by the mechanism itself</li>
                    </ul>
                    <div className="mcm-dimension-note">
                      <span aria-hidden="true">✓</span> Information discovery works best with <strong>Revelatory</strong> or <strong>Eventual</strong> modes
                    </div>
                  </div>

                  <div className="mcm-dimension-card">
                    <div className="mcm-dimension-header">
                      <span className="mcm-dimension-icon" aria-hidden="true">🔗</span>
                      <h4>Ontological Coupling</h4>
                    </div>
                    <p className="mcm-dimension-desc">To what extent do beliefs influence outcomes?</p>
                    <ul className="mcm-dimension-list">
                      <li><strong>Decoupled:</strong> Beliefs cannot influence outcome</li>
                      <li><strong>Weakly coupled:</strong> Beliefs influence indirectly</li>
                      <li><strong>Strongly coupled:</strong> Beliefs materially alter probability</li>
                    </ul>
                    <div className="mcm-dimension-note">
                      <span aria-hidden="true">✓</span> Best for discovery: <strong>Decoupled</strong> or <strong>Weakly coupled</strong>
                    </div>
                  </div>

                  <div className="mcm-dimension-card">
                    <div className="mcm-dimension-header">
                      <span className="mcm-dimension-icon" aria-hidden="true">🎮</span>
                      <h4>Agency Influence</h4>
                    </div>
                    <p className="mcm-dimension-desc">Can participants act on the outcome domain?</p>
                    <ul className="mcm-dimension-list">
                      <li><strong>None:</strong> Participants are observers only</li>
                      <li><strong>External:</strong> May influence outcomes outside the market</li>
                      <li><strong>Internal:</strong> Participation itself alters the outcome</li>
                    </ul>
                    <div className="mcm-dimension-note">
                      <span aria-hidden="true">✓</span> Discovery degrades as agency increases: prefer <strong>None</strong> or <strong>External</strong>
                    </div>
                  </div>

                  <div className="mcm-dimension-card">
                    <div className="mcm-dimension-header">
                      <span className="mcm-dimension-icon" aria-hidden="true">📊</span>
                      <h4>Epistemic Structure</h4>
                    </div>
                    <p className="mcm-dimension-desc">What kind of information is being aggregated?</p>
                    <ul className="mcm-dimension-list">
                      <li><strong>State signals:</strong> Facts about the world</li>
                      <li><strong>Model judgments:</strong> Forecasts, interpretations</li>
                      <li><strong>Strategic beliefs:</strong> Beliefs about others' actions</li>
                    </ul>
                    <div className="mcm-dimension-note">
                      <span aria-hidden="true">✓</span> Use <strong>State signals</strong> or <strong>Model judgments</strong> for discovery
                    </div>
                  </div>

                  <div className="mcm-dimension-card">
                    <div className="mcm-dimension-header">
                      <span className="mcm-dimension-icon" aria-hidden="true">🔐</span>
                      <h4>Axiological Commitments</h4>
                    </div>
                    <p className="mcm-dimension-desc">What constrains participation?</p>
                    <ul className="mcm-dimension-list">
                      <li><strong>Economic:</strong> Capital at risk</li>
                      <li><strong>Reputational:</strong> Identity-bound signaling</li>
                      <li><strong>Structural:</strong> Permissioned participation</li>
                    </ul>
                    <div className="mcm-dimension-note">
                      <span aria-hidden="true">✓</span> Discovery requires <strong>Economic</strong> and/or <strong>Reputational</strong> commitment
                    </div>
                  </div>

                  <div className="mcm-dimension-card">
                    <div className="mcm-dimension-header">
                      <span className="mcm-dimension-icon" aria-hidden="true">⏱️</span>
                      <h4>Temporal Granularity</h4>
                    </div>
                    <p className="mcm-dimension-desc">How do beliefs update over time?</p>
                    <ul className="mcm-dimension-list">
                      <li><strong>Static:</strong> One-shot participation</li>
                      <li><strong>Discrete:</strong> Periodic updates</li>
                      <li><strong>Continuous:</strong> Real-time belief aggregation</li>
                      <li><strong>Batched/Delayed:</strong> Controlled information release</li>
                    </ul>
                    <div className="mcm-dimension-note">
                      <span aria-hidden="true">✓</span> Agent-dominant systems often need <strong>Discrete</strong> or <strong>Batched</strong>
                    </div>
                  </div>

                  <div className="mcm-dimension-card">
                    <div className="mcm-dimension-header">
                      <span className="mcm-dimension-icon" aria-hidden="true">🤖</span>
                      <h4>Participant Substrate</h4>
                    </div>
                    <p className="mcm-dimension-desc">Who is expected to participate?</p>
                    <ul className="mcm-dimension-list">
                      <li><strong>Human-bounded:</strong> Primarily human participants</li>
                      <li><strong>Hybrid:</strong> Mixed human and AI agents</li>
                      <li><strong>Agent-dominant:</strong> AI agents as default</li>
                    </ul>
                    <div className="mcm-dimension-note">
                      <span aria-hidden="true">✓</span> FairWins assumes <strong>Agent-dominant</strong> by design
                    </div>
                  </div>

                  <div className="mcm-dimension-card">
                    <div className="mcm-dimension-header">
                      <span className="mcm-dimension-icon" aria-hidden="true">🎯</span>
                      <h4>Mechanism Intent</h4>
                    </div>
                    <p className="mcm-dimension-desc">What is the system optimizing for?</p>
                    <ul className="mcm-dimension-list">
                      <li><strong>Accuracy:</strong> Correct at resolution</li>
                      <li><strong>Calibration:</strong> Probabilistic reliability</li>
                      <li><strong>Early signal:</strong> Lead time detection</li>
                    </ul>
                    <div className="mcm-dimension-note">
                      <span aria-hidden="true">✓</span> Focus on <strong>Accuracy</strong>, <strong>Calibration</strong>, or <strong>Early signal</strong>
                    </div>
                  </div>
                </div>

                <div className="mcm-education-card mcm-education-highlight">
                  <div className="mcm-education-icon" aria-hidden="true">🛡️</div>
                  <div className="mcm-education-content">
                    <h4>Discovery-Safe Region</h4>
                    <p>Markets optimized for information discovery should generally satisfy:</p>
                    <ul className="mcm-discovery-checklist">
                      <li><span aria-hidden="true">✓</span> <strong>Resolution:</strong> Revelatory or Eventual</li>
                      <li><span aria-hidden="true">✓</span> <strong>Coupling:</strong> Decoupled or Weakly coupled</li>
                      <li><span aria-hidden="true">✓</span> <strong>Agency:</strong> None or External</li>
                      <li><span aria-hidden="true">✓</span> <strong>Epistemic:</strong> State signals or Model judgments</li>
                      <li><span aria-hidden="true">✓</span> <strong>Commitment:</strong> Economic and/or Reputational</li>
                      <li><span aria-hidden="true">✓</span> <strong>Temporal:</strong> Discrete or Batched</li>
                      <li><span aria-hidden="true">✓</span> <strong>Substrate:</strong> Agent-dominant assumed</li>
                      <li><span aria-hidden="true">✓</span> <strong>Intent:</strong> Accuracy, Calibration, or Early signal</li>
                    </ul>
                  </div>
                </div>

                <div className="mcm-education-footer">
                  <p>Consider these dimensions as you design your market. Markets outside the discovery-safe region may still be valuable but require additional guardrails.</p>
                </div>
              </section>
            </div>
          )}

          {/* Step 2: Parameters */}
          {currentStep === 2 && (
            <div className="mcm-panel" role="tabpanel" aria-labelledby="step-parameters">
              <section className="mcm-section">
                <h3 className="mcm-section-title">
                  <span aria-hidden="true">⚖️</span> Outcome Type
                </h3>
                <div className="mcm-bettype-grid">
                  {BET_TYPES.map(bt => (
                    <button
                      key={bt.id}
                      type="button"
                      className={`mcm-bettype-btn ${paramsForm.betType === bt.id ? 'active' : ''}`}
                      onClick={() => handleParamsChange('betType', bt.id)}
                      disabled={submitting}
                      aria-label={`Select ${bt.name} bet type: ${bt.description}`}
                    >
                      <span className="mcm-bettype-icon" aria-hidden="true">{bt.icon}</span>
                      <span className="mcm-bettype-name">{bt.name}</span>
                      <span className="mcm-bettype-desc">{bt.description}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="mcm-section">
                <h3 className="mcm-section-title">
                  <span aria-hidden="true">📅</span> Resolution Date & Time
                </h3>
                <div className="mcm-field">
                  <label htmlFor="resolutionDateTime">
                    When will this market resolve? <span className="mcm-required">*</span>
                  </label>
                  <input
                    id="resolutionDateTime"
                    type="datetime-local"
                    value={paramsForm.resolutionDateTime}
                    onChange={e => handleParamsChange('resolutionDateTime', e.target.value)}
                    disabled={submitting}
                    className={`mcm-datetime-input ${errors.resolutionDateTime ? 'error' : ''}`}
                    min={new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16)}
                    max={new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16)}
                  />
                  <div className="mcm-hint">
                    Select the exact date and time when trading ends and the market resolves (min: 1 day, max: 1 year from now)
                  </div>
                  {errors.resolutionDateTime && <div className="mcm-error">{errors.resolutionDateTime}</div>}
                </div>
              </section>

              <section className="mcm-section">
                <h3 className="mcm-section-title">
                  <span aria-hidden="true">💰</span> Liquidity
                </h3>
                <div className="mcm-field">
                  <label htmlFor="initialLiquidity">
                    Initial Liquidity (ETC) <span className="mcm-required">*</span>
                  </label>
                  <input
                    id="initialLiquidity"
                    type="number"
                    value={paramsForm.initialLiquidity}
                    onChange={e => handleParamsChange('initialLiquidity', e.target.value)}
                    placeholder="1000"
                    min="100"
                    max="1000000"
                    step="0.01"
                    disabled={submitting}
                    className={errors.initialLiquidity ? 'error' : ''}
                  />
                  <div className="mcm-hint">Min: 100 ETC, Max: 1,000,000 ETC</div>
                  {errors.initialLiquidity && <div className="mcm-error">{errors.initialLiquidity}</div>}
                </div>

                <div className="mcm-field">
                  <label htmlFor="collateralToken">
                    Collateral Token
                  </label>
                  <select
                    id="collateralToken"
                    value={paramsForm.collateralTokenId}
                    onChange={e => handleParamsChange('collateralTokenId', e.target.value)}
                    disabled={submitting}
                    className="mcm-token-select"
                  >
                    {COLLATERAL_TOKEN_OPTIONS.map(token => (
                      <option key={token.id} value={token.id}>
                        {token.icon} {token.symbol} - {token.name}
                      </option>
                    ))}
                  </select>
                  <div className="mcm-hint">
                    {paramsForm.collateralTokenId === 'ETC'
                      ? 'Native ETC will be used as collateral'
                      : paramsForm.collateralTokenId === 'CUSTOM'
                      ? 'Enter a custom ERC-20 token address below'
                      : `${selectedCollateralToken?.name} from ETCswap`}
                  </div>
                </div>

                {/* Custom token address input - only shown when CUSTOM is selected */}
                {paramsForm.collateralTokenId === 'CUSTOM' && (
                  <div className="mcm-field">
                    <label htmlFor="customCollateralAddress">
                      Custom Token Address <span className="mcm-required">*</span>
                    </label>
                    <input
                      id="customCollateralAddress"
                      type="text"
                      value={paramsForm.customCollateralAddress}
                      onChange={e => handleParamsChange('customCollateralAddress', e.target.value)}
                      placeholder="0x..."
                      disabled={submitting}
                      className={errors.customCollateralAddress ? 'error' : ''}
                    />
                    <div className="mcm-hint">Enter a valid ERC-20 token address</div>
                    {errors.customCollateralAddress && <div className="mcm-error">{errors.customCollateralAddress}</div>}
                  </div>
                )}
              </section>

              {/* Correlation Group Section */}
              <section className="mcm-section">
                <h3 className="mcm-section-title">
                  <span aria-hidden="true">🔗</span> Market Correlation
                </h3>

                {/* Enable/disable correlation toggle */}
                <div className="mcm-toggle-row">
                  <div className="mcm-toggle-info">
                    <strong>Link to Correlation Group</strong>
                    <p>Group related markets together (e.g., election candidates, tournament brackets)</p>
                  </div>
                  <button
                    type="button"
                    className="mcm-toggle-btn"
                    onClick={() => setCorrelationEnabled(!correlationEnabled)}
                    aria-pressed={correlationEnabled}
                    disabled={submitting || !isCorrelationRegistryDeployed()}
                  >
                    <span className="mcm-toggle-track">
                      <span className={`mcm-toggle-thumb ${correlationEnabled ? 'active' : ''}`} />
                    </span>
                    <span className="mcm-toggle-label">{correlationEnabled ? 'Enabled' : 'Disabled'}</span>
                  </button>
                </div>

                {!isCorrelationRegistryDeployed() && (
                  <div className="mcm-info-card" style={{ marginTop: '1rem' }}>
                    <span className="mcm-info-icon" aria-hidden="true">💡</span>
                    <div>
                      <strong>Coming Soon</strong>
                      <p>Correlation groups will be available after the MarketCorrelationRegistry contract is deployed.</p>
                    </div>
                  </div>
                )}

                {/* Correlation group options - only shown when enabled */}
                {correlationEnabled && isCorrelationRegistryDeployed() && (
                  <>
                    {/* Choose between existing group or create new */}
                    <div className="mcm-field" style={{ marginTop: '1rem' }}>
                      <div className="mcm-radio-group">
                        <label className="mcm-radio-label">
                          <input
                            type="radio"
                            name="correlationMode"
                            checked={!createNewGroup}
                            onChange={() => setCreateNewGroup(false)}
                            disabled={submitting}
                          />
                          <span>Join Existing Group</span>
                        </label>
                        <label className="mcm-radio-label">
                          <input
                            type="radio"
                            name="correlationMode"
                            checked={createNewGroup}
                            onChange={() => setCreateNewGroup(true)}
                            disabled={submitting}
                          />
                          <span>Create New Group</span>
                        </label>
                      </div>
                    </div>

                    {/* Existing group selection */}
                    {!createNewGroup && (
                      <div className="mcm-field">
                        <label htmlFor="correlationGroup">Select Correlation Group</label>
                        {correlationGroupsLoading ? (
                          <div className="mcm-hint">Loading groups...</div>
                        ) : correlationGroups.length === 0 ? (
                          <div className="mcm-info-card">
                            <span className="mcm-info-icon" aria-hidden="true">💡</span>
                            <div>
                              <strong>No Groups Available</strong>
                              <p>
                                {metadataForm.category
                                  ? `No correlation groups found for "${metadataForm.category}". Create a new one!`
                                  : 'Select a category first to see available groups, or create a new one.'}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <select
                            id="correlationGroup"
                            value={selectedCorrelationGroup?.id ?? ''}
                            onChange={(e) => {
                              const groupId = e.target.value
                              const group = correlationGroups.find(g => g.id === parseInt(groupId))
                              setSelectedCorrelationGroup(group || null)
                            }}
                            disabled={submitting}
                            className="mcm-token-select"
                          >
                            <option value="">-- Select a group --</option>
                            {correlationGroups.map(group => (
                              <option key={group.id} value={group.id}>
                                {group.name} ({group.marketCount} markets)
                              </option>
                            ))}
                          </select>
                        )}
                        {selectedCorrelationGroup && (
                          <div className="mcm-hint">
                            {selectedCorrelationGroup.description || 'No description available'}
                          </div>
                        )}
                        {errors.correlationGroup && <div className="mcm-error">{errors.correlationGroup}</div>}
                      </div>
                    )}

                    {/* New group creation */}
                    {createNewGroup && (
                      <>
                        <div className="mcm-field">
                          <label htmlFor="newGroupName">
                            Group Name <span className="mcm-required">*</span>
                          </label>
                          <input
                            id="newGroupName"
                            type="text"
                            value={newGroupName}
                            onChange={e => setNewGroupName(e.target.value)}
                            placeholder="e.g., 2025 Presidential Election"
                            disabled={submitting}
                            maxLength={100}
                            className={errors.newGroupName ? 'error' : ''}
                          />
                          {errors.newGroupName && <div className="mcm-error">{errors.newGroupName}</div>}
                        </div>

                        <div className="mcm-field">
                          <label htmlFor="newGroupDescription">Group Description</label>
                          <textarea
                            id="newGroupDescription"
                            value={newGroupDescription}
                            onChange={e => setNewGroupDescription(e.target.value)}
                            placeholder="Describe what markets in this group have in common..."
                            disabled={submitting}
                            rows={2}
                          />
                          <div className="mcm-hint">
                            Category: {metadataForm.category || 'Select category in Content step'}
                          </div>
                        </div>
                      </>
                    )}
                  </>
                )}
              </section>
            </div>
          )}

          {/* Step 3: Review */}
          {currentStep === 3 && (
            <div className="mcm-panel" role="tabpanel" aria-labelledby="step-review">
              <section className="mcm-section">
                <h3 className="mcm-section-title">
                  <span aria-hidden="true">📋</span> Review Your Market
                </h3>

                <div className="mcm-review-card">
                  <div className="mcm-review-header">
                    {useCustomUri ? (
                      <>
                        <span className="mcm-review-badge">Custom Metadata</span>
                        <code className="mcm-review-uri">{customUri}</code>
                      </>
                    ) : (
                      <>
                        <h4 className="mcm-review-title">{metadataForm.question}</h4>
                        <span className="mcm-review-badge">{metadataForm.category}</span>
                      </>
                    )}
                  </div>

                  {!useCustomUri && (
                    <div className="mcm-review-body">
                      <div className="mcm-review-section">
                        <strong>Question:</strong>
                        <p>{metadataForm.description}</p>
                      </div>
                      <div className="mcm-review-section">
                        <strong>Description:</strong>
                        <p>{metadataForm.resolutionCriteria}</p>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              <section className="mcm-section">
                <h3 className="mcm-section-title">
                  <span aria-hidden="true">⚙️</span> Market Parameters
                </h3>

                <div className="mcm-review-grid">
                  <div className="mcm-review-item">
                    <span className="mcm-review-label">Outcome Type</span>
                    <span className="mcm-review-value">
                      <span aria-hidden="true">{selectedBetType?.icon}</span> {selectedBetType?.name}
                    </span>
                  </div>
                  <div className="mcm-review-item">
                    <span className="mcm-review-label">Resolution Date</span>
                    <span className="mcm-review-value">
                      {paramsForm.resolutionDateTime
                        ? new Date(paramsForm.resolutionDateTime).toLocaleString()
                        : 'Not set'}
                    </span>
                  </div>
                  <div className="mcm-review-item">
                    <span className="mcm-review-label">Initial Liquidity</span>
                    <span className="mcm-review-value">{paramsForm.initialLiquidity} ETC</span>
                  </div>
                  <div className="mcm-review-item">
                    <span className="mcm-review-label">Collateral</span>
                    <span className="mcm-review-value">
                      {selectedCollateralToken && (
                        <>
                          <span aria-hidden="true">{selectedCollateralToken.icon}</span>{' '}
                          {paramsForm.collateralTokenId === 'CUSTOM' && paramsForm.customCollateralAddress
                            ? `Custom (${paramsForm.customCollateralAddress.slice(0, 6)}...${paramsForm.customCollateralAddress.slice(-4)})`
                            : selectedCollateralToken.symbol}
                        </>
                      )}
                    </span>
                  </div>
                  {correlationEnabled && (
                    <div className="mcm-review-item">
                      <span className="mcm-review-label">Correlation Group</span>
                      <span className="mcm-review-value">
                        <span aria-hidden="true">🔗</span>{' '}
                        {createNewGroup
                          ? `New: ${newGroupName || '(unnamed)'}`
                          : selectedCorrelationGroup
                            ? selectedCorrelationGroup.name
                            : '(none selected)'}
                      </span>
                    </div>
                  )}
                </div>
              </section>

              {/* Network Warning */}
              {isConnected && !isCorrectNetwork && (
                <div className="mcm-warning">
                  <span aria-hidden="true">⚠️</span>
                  <div>
                    <strong>Wrong Network</strong>
                    <p>Please switch to the correct network to continue.</p>
                    <button
                      type="button"
                      className="mcm-switch-network-btn"
                      onClick={switchNetwork}
                    >
                      Switch Network
                    </button>
                  </div>
                </div>
              )}

              {/* Submit Error */}
              {errors.submit && (
                <div className="mcm-error-card">
                  {errors.submit}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <footer className="mcm-footer">
          <div className="mcm-footer-left">
            {currentStep > 0 && (
              <button
                type="button"
                className="mcm-btn-secondary"
                onClick={handleBack}
                disabled={submitting}
              >
                Back
              </button>
            )}
          </div>
          <div className="mcm-footer-right">
            <button
              type="button"
              className="mcm-btn-secondary"
              onClick={handleClose}
              disabled={submitting}
            >
              Cancel
            </button>
            {currentStep < STEPS.length - 1 ? (
              <button
                type="button"
                className="mcm-btn-primary"
                onClick={handleNext}
                disabled={submitting}
              >
                Continue
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="mcm-btn-primary mcm-btn-create"
                  onClick={handleSubmit}
                  disabled={submitting || !isConnected || !isCorrectNetwork}
                >
                  {submitting && <span className="mcm-spinner" aria-hidden="true" />}
                  {submitting ? 'Creating...' : 'Create Market'}
                </button>
                {/* Transaction Progress Indicator */}
                {submitting && transactionProgress && (
                  <div className="mcm-tx-progress" role="status" aria-live="polite">
                    <div className="mcm-tx-progress-header">
                      <span className="mcm-tx-step">
                        Step {transactionProgress.step} of {transactionProgress.total}
                      </span>
                      <span className={`mcm-tx-status mcm-tx-status-${transactionProgress.status}`}>
                        {transactionProgress.status === 'signing' && '🔐 Awaiting signature...'}
                        {transactionProgress.status === 'confirming' && '⏳ Confirming...'}
                        {transactionProgress.status === 'completed' && '✓'}
                        {transactionProgress.status === 'failed' && '⚠️'}
                        {transactionProgress.status === 'pending' && '...'}
                      </span>
                    </div>
                    <div className="mcm-tx-description">{transactionProgress.description}</div>
                    <div className="mcm-tx-progress-bar">
                      <div
                        className="mcm-tx-progress-fill"
                        style={{ width: `${(transactionProgress.step / transactionProgress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </footer>
      </div>
    </div>
  )
}

// Helper functions

/**
 * Validate URI format (IPFS CID, ipfs://, or https://)
 */
function isValidUri(uri) {
  if (!uri) return false

  // Check if it's a valid IPFS CID
  if (isValidCid(uri)) return true

  // Check if it's an ipfs:// URI
  if (uri.startsWith('ipfs://')) {
    const cid = uri.replace('ipfs://', '').split('/')[0]
    return isValidCid(cid)
  }

  // Check if it's an https:// URL
  if (uri.startsWith('https://')) {
    try {
      new URL(uri)
      return true
    } catch {
      return false
    }
  }

  return false
}

/**
 * Normalize URI to a consistent format
 */
function normalizeUri(uri) {
  if (!uri) return ''

  // If it's a raw CID, prefix with ipfs://
  if (isValidCid(uri)) {
    return `ipfs://${uri}`
  }

  return uri
}

export default MarketCreationModal
