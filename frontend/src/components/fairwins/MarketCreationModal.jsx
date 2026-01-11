import { useState, useCallback, useMemo, useEffect } from 'react'
import { useWallet, useWeb3, useEnsResolution } from '../../hooks'
import { isValidCid } from '../../constants/ipfs'
import { isValidEthereumAddress } from '../../utils/validation'
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
 * - Market question/title
 * - Description
 * - Resolution criteria
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
  'Technology', 'Business', 'Finance', 'Culture', 'Other'
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
    sourceUrl: ''
  })

  // Custom URI input
  const [customUri, setCustomUri] = useState('')

  // Form data for on-chain parameters
  const [paramsForm, setParamsForm] = useState({
    tradingPeriodDays: '14',
    initialLiquidity: '',
    betType: 1, // Default to Pass/Fail (more appropriate for governance-style predictions)
    collateralToken: '' // Empty means use native token
  })

  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  // ENS resolution for collateral token address
  const {
    resolvedAddress: resolvedCollateralAddress,
    isLoading: isResolvingCollateral,
    error: collateralResolutionError,
    isEns: isCollateralEns
  } = useEnsResolution(paramsForm.collateralToken || '')

  // Helper to shorten address for display
  const shortenAddressForHint = (addr) => {
    if (!addr || addr.length < 10) return addr
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

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
      sourceUrl: ''
    })
    setCustomUri('')
    setParamsForm({
      tradingPeriodDays: '14',
      initialLiquidity: '',
      betType: 1,
      collateralToken: ''
    })
    setErrors({})
    setSubmitting(false)
  }, [])

  // Reset form state when modal opens
  useEffect(() => {
    if (isOpen) {
      resetForm()
    }
  }, [isOpen, resetForm])

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
          newErrors.question = 'Market question is required'
        } else if (metadataForm.question.length < 10) {
          newErrors.question = 'Question must be at least 10 characters'
        } else if (metadataForm.question.length > 200) {
          newErrors.question = 'Question must be under 200 characters'
        }

        if (!metadataForm.description.trim()) {
          newErrors.description = 'Description is required'
        } else if (metadataForm.description.length < 30) {
          newErrors.description = 'Description must be at least 30 characters'
        }

        if (!metadataForm.resolutionCriteria.trim()) {
          newErrors.resolutionCriteria = 'Resolution criteria is required'
        } else if (metadataForm.resolutionCriteria.length < 20) {
          newErrors.resolutionCriteria = 'Resolution criteria must be at least 20 characters'
        }

        if (!metadataForm.category) {
          newErrors.category = 'Please select a category'
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
      // Parameters validation
      const days = parseInt(paramsForm.tradingPeriodDays)
      if (isNaN(days) || days < 7 || days > 21) {
        newErrors.tradingPeriodDays = 'Trading period must be 7-21 days'
      }

      const liquidity = parseFloat(paramsForm.initialLiquidity)
      if (!paramsForm.initialLiquidity || isNaN(liquidity) || liquidity < 100) {
        newErrors.initialLiquidity = 'Minimum liquidity is 100 ETC'
      } else if (liquidity > 1000000) {
        newErrors.initialLiquidity = 'Maximum liquidity is 1,000,000 ETC'
      }

      // Validate collateral token if provided (supports ENS names)
      if (paramsForm.collateralToken) {
        if (isResolvingCollateral) {
          newErrors.collateralToken = 'Please wait for ENS name to resolve'
        } else if (collateralResolutionError) {
          newErrors.collateralToken = collateralResolutionError
        } else if (!resolvedCollateralAddress || !isValidEthereumAddress(resolvedCollateralAddress)) {
          newErrors.collateralToken = 'Invalid token address or ENS name'
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
      const marker = 'resolution criteria'
      const hasResolutionSection = descLower.includes(marker)

      if (!hasResolutionSection) {
        description = description
          ? `${description}\n\n**Resolution Criteria:**\n${resolutionCriteria}`
          : `**Resolution Criteria:**\n${resolutionCriteria}`
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
        { trait_type: 'Trading Period', value: `${paramsForm.tradingPeriodDays} days`, display_type: 'string' },
        { trait_type: 'Initial Liquidity', value: isValidLiquidity ? liquidityNum : 0, display_type: 'number' }
      ],
      properties: {
        creator: address,
        created_at: new Date().toISOString(),
        tags: tags.length > 0 ? tags : undefined,
        resolution_criteria: metadataForm.resolutionCriteria
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
      const submitData = {
        // On-chain parameters
        // Trading period converted to seconds (7-21 days * 86400 seconds/day)
        // Contract accepts values in this range as validated above
        tradingPeriod: parseInt(paramsForm.tradingPeriodDays) * 24 * 60 * 60,
        initialLiquidity: paramsForm.initialLiquidity,
        betType: paramsForm.betType,
        // Use resolved address from ENS if available
        collateralToken: paramsForm.collateralToken ? (resolvedCollateralAddress || null) : null,
        // Metadata
        metadataUri: getFinalUri(),
        metadata: useCustomUri ? null : buildMetadataJson()
      }

      await onCreate(submitData, signer)
      resetForm()
      onClose()
    } catch (error) {
      console.error('Error creating market:', error)
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
      const days = parseInt(paramsForm.tradingPeriodDays)
      const liquidity = parseFloat(paramsForm.initialLiquidity)
      return (
        !isNaN(days) && days >= 7 && days <= 21 &&
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
                      <span aria-hidden="true">❓</span> Market Question
                    </h3>
                    <div className="mcm-field">
                      <label htmlFor="question">
                        Question <span className="mcm-required">*</span>
                      </label>
                      <input
                        id="question"
                        type="text"
                        value={metadataForm.question}
                        onChange={e => handleMetadataChange('question', e.target.value)}
                        placeholder="Will Bitcoin reach $100,000 by end of 2025?"
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
                        Description <span className="mcm-required">*</span>
                      </label>
                      <textarea
                        id="description"
                        value={metadataForm.description}
                        onChange={e => handleMetadataChange('description', e.target.value)}
                        placeholder="Provide context and background for this prediction..."
                        disabled={submitting}
                        rows={3}
                        className={errors.description ? 'error' : ''}
                      />
                      {errors.description && <div className="mcm-error">{errors.description}</div>}
                    </div>

                    <div className="mcm-field">
                      <label htmlFor="resolutionCriteria">
                        Resolution Criteria <span className="mcm-required">*</span>
                      </label>
                      <textarea
                        id="resolutionCriteria"
                        value={metadataForm.resolutionCriteria}
                        onChange={e => handleMetadataChange('resolutionCriteria', e.target.value)}
                        placeholder="Define exactly how this market will be resolved..."
                        disabled={submitting}
                        rows={3}
                        className={errors.resolutionCriteria ? 'error' : ''}
                      />
                      <div className="mcm-hint">Be specific about data sources, timing, and edge cases</div>
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
                  <span aria-hidden="true">⏱️</span> Trading Period
                </h3>
                <div className="mcm-field">
                  <label htmlFor="tradingPeriod">
                    Duration (Days) <span className="mcm-required">*</span>
                  </label>
                  <div className="mcm-range-input">
                    <input
                      id="tradingPeriod"
                      type="range"
                      min="7"
                      max="21"
                      value={paramsForm.tradingPeriodDays}
                      onChange={e => handleParamsChange('tradingPeriodDays', e.target.value)}
                      disabled={submitting}
                      className="mcm-slider"
                      aria-valuemin="7"
                      aria-valuemax="21"
                      aria-valuenow={paramsForm.tradingPeriodDays}
                      aria-valuetext={`${paramsForm.tradingPeriodDays} days`}
                    />
                    <span className="mcm-range-value">{paramsForm.tradingPeriodDays} days</span>
                  </div>
                  <div className="mcm-hint">Trading period: 7-21 days</div>
                  {errors.tradingPeriodDays && <div className="mcm-error">{errors.tradingPeriodDays}</div>}
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
                    Collateral Token (Optional)
                  </label>
                  <div className="mcm-address-input-wrapper">
                    <input
                      id="collateralToken"
                      type="text"
                      value={paramsForm.collateralToken}
                      onChange={e => handleParamsChange('collateralToken', e.target.value)}
                      placeholder="0x... or vitalik.eth (leave empty for native ETC)"
                      disabled={submitting}
                      className={`${errors.collateralToken ? 'error' : ''} ${collateralResolutionError ? 'input-error' : resolvedCollateralAddress ? 'input-success' : ''}`}
                    />
                    {isResolvingCollateral && (
                      <span className="mcm-address-status resolving">
                        <span className="mcm-spinner-small"></span>
                      </span>
                    )}
                    {resolvedCollateralAddress && !isResolvingCollateral && !collateralResolutionError && (
                      <span className="mcm-address-status success">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </span>
                    )}
                  </div>
                  {isCollateralEns && resolvedCollateralAddress && !isResolvingCollateral && (
                    <div className="mcm-resolved-hint">Resolves to: <code>{shortenAddressForHint(resolvedCollateralAddress)}</code></div>
                  )}
                  <div className="mcm-hint">ERC-20 token address, ENS name, or leave empty for native ETC</div>
                  {errors.collateralToken && <div className="mcm-error">{errors.collateralToken}</div>}
                </div>
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
                      <p className="mcm-review-desc">{metadataForm.description}</p>
                      <div className="mcm-review-section">
                        <strong>Resolution Criteria:</strong>
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
                    <span className="mcm-review-label">Trading Period</span>
                    <span className="mcm-review-value">{paramsForm.tradingPeriodDays} days</span>
                  </div>
                  <div className="mcm-review-item">
                    <span className="mcm-review-label">Initial Liquidity</span>
                    <span className="mcm-review-value">{paramsForm.initialLiquidity} ETC</span>
                  </div>
                  <div className="mcm-review-item">
                    <span className="mcm-review-label">Collateral</span>
                    <span className="mcm-review-value">
                      {paramsForm.collateralToken ? (
                        isCollateralEns && resolvedCollateralAddress ? (
                          <span title={resolvedCollateralAddress}>
                            {paramsForm.collateralToken} ({shortenAddressForHint(resolvedCollateralAddress)})
                          </span>
                        ) : (
                          `${paramsForm.collateralToken.slice(0, 6)}...${paramsForm.collateralToken.slice(-4)}`
                        )
                      ) : 'Native ETC'}
                    </span>
                  </div>
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
              <button
                type="button"
                className="mcm-btn-primary mcm-btn-create"
                onClick={handleSubmit}
                disabled={submitting || !isConnected || !isCorrectNetwork}
              >
                {submitting && <span className="mcm-spinner" aria-hidden="true" />}
                {submitting ? 'Creating...' : 'Create Market'}
              </button>
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
