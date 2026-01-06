import { useState, useCallback, useMemo } from 'react'
import { useRoles } from '../../hooks/useRoles'
import { useWeb3 } from '../../hooks/useWeb3'
import { useWalletTransactions } from '../../hooks/useWalletManagement'
import { useNotification } from '../../hooks/useUI'
import { recordRolePurchase } from '../../utils/roleStorage'
import { purchaseRoleWithUSC } from '../../utils/blockchainService'
import './PremiumPurchaseModal.css'

/**
 * PremiumPurchaseModal Component
 *
 * Modern, minimalist modal for purchasing premium access roles.
 * Features:
 * - Multi-product selection with checkboxes
 * - Option to purchase for self or gift to another address
 * - Clear blockchain transaction warnings
 * - Detailed role information with features and fund destination
 * - Step-based wizard flow
 */

const STEPS = [
  { id: 'select', label: 'Select', icon: '1' },
  { id: 'recipient', label: 'Recipient', icon: '2' },
  { id: 'review', label: 'Review', icon: '3' },
  { id: 'complete', label: 'Complete', icon: '4' }
]

// Extended role information with features, duration, and fund destination
const ROLE_DETAILS = {
  MARKET_MAKER: {
    icon: '📊',
    tagline: 'Create prediction markets',
    duration: 'Lifetime access',
    features: [
      'Create unlimited prediction markets',
      'Set custom market parameters and liquidity',
      'Earn fees from market trading activity',
      'Access to market analytics dashboard'
    ],
    fundsDestination: 'DAO Treasury',
    fundsUsage: 'Funds support protocol development and liquidity incentives'
  },
  CLEARPATH_USER: {
    icon: '🔐',
    tagline: 'DAO governance access',
    duration: 'Lifetime access',
    features: [
      'Full DAO governance participation',
      'Vote on proposals with prediction market insights',
      'Access ZK-protected governance features',
      'View organizational analytics and reports'
    ],
    fundsDestination: 'DAO Treasury',
    fundsUsage: 'Funds support governance infrastructure and security audits'
  },
  TOKENMINT: {
    icon: '🪙',
    tagline: 'Token creation tools',
    duration: 'Lifetime access',
    features: [
      'Mint custom ERC20 tokens',
      'Create and manage NFT collections',
      'Integrate with ETC swap contracts',
      'Access token analytics and management'
    ],
    fundsDestination: 'DAO Treasury',
    fundsUsage: 'Funds support smart contract maintenance and upgrades'
  },
  FRIEND_MARKET: {
    icon: '👥',
    tagline: 'Private markets with friends',
    duration: 'Lifetime access',
    features: [
      'Create private 1v1 prediction markets',
      'Organize small group competitions',
      'Share markets via QR codes',
      'Set custom arbitrators and rules'
    ],
    fundsDestination: 'DAO Treasury',
    fundsUsage: 'Funds support social features and infrastructure'
  }
}

// Role prices in USC stablecoin
const ROLE_PRICES = {
  MARKET_MAKER: 100,
  CLEARPATH_USER: 250,
  TOKENMINT: 150,
  FRIEND_MARKET: 50
}

// Bundle discount tiers
const BUNDLE_DISCOUNTS = {
  2: 0.15, // 15% off for 2 roles
  3: 0.20, // 20% off for 3 roles
  4: 0.25  // 25% off for all 4 roles
}

function PremiumPurchaseModal({ isOpen, onClose }) {
  const { ROLES, ROLE_INFO, grantRole, hasRole } = useRoles()
  const { account, isConnected, isCorrectNetwork, switchNetwork } = useWeb3()
  const { signer } = useWalletTransactions()
  const { showNotification } = useNotification()

  // Step navigation
  const [currentStep, setCurrentStep] = useState(0)

  // Selected roles (multi-select)
  const [selectedRoles, setSelectedRoles] = useState([])

  // Recipient options
  const [recipientType, setRecipientType] = useState('self') // 'self' or 'other'
  const [recipientAddress, setRecipientAddress] = useState('')

  // ZK key for ClearPath
  const [zkPublicKey, setZkPublicKey] = useState('')

  // UI state
  const [isPurchasing, setIsPurchasing] = useState(false)
  const [purchaseResults, setPurchaseResults] = useState([])
  const [errors, setErrors] = useState({})

  // Get available roles (not already owned by the recipient)
  const availableRoles = useMemo(() => {
    const targetAddress = recipientType === 'self' ? account : recipientAddress
    return Object.keys(ROLE_PRICES).filter(roleKey => {
      // Only filter out if purchasing for self
      if (recipientType === 'self' && hasRole) {
        return !hasRole(roleKey)
      }
      return true
    })
  }, [account, recipientType, recipientAddress, hasRole])

  // Calculate pricing
  const pricing = useMemo(() => {
    const subtotal = selectedRoles.reduce((sum, role) => sum + ROLE_PRICES[role], 0)
    const roleCount = selectedRoles.length
    const discountPercent = BUNDLE_DISCOUNTS[roleCount] || 0
    const discount = subtotal * discountPercent
    const total = subtotal - discount

    return {
      subtotal,
      roleCount,
      discountPercent: discountPercent * 100,
      discount,
      total
    }
  }, [selectedRoles])

  // Reset form
  const resetForm = useCallback(() => {
    setCurrentStep(0)
    setSelectedRoles([])
    setRecipientType('self')
    setRecipientAddress('')
    setZkPublicKey('')
    setPurchaseResults([])
    setErrors({})
    setIsPurchasing(false)
  }, [])

  // Handle role toggle
  const handleRoleToggle = useCallback((roleKey) => {
    setSelectedRoles(prev => {
      if (prev.includes(roleKey)) {
        return prev.filter(r => r !== roleKey)
      }
      return [...prev, roleKey]
    })
    // Clear related errors
    setErrors(prev => {
      const newErrors = { ...prev }
      delete newErrors.roles
      return newErrors
    })
  }, [])

  // Validation
  const validateStep = useCallback((step) => {
    const newErrors = {}

    if (step === 0) {
      if (selectedRoles.length === 0) {
        newErrors.roles = 'Please select at least one role to purchase'
      }
    }

    if (step === 1) {
      if (recipientType === 'other') {
        if (!recipientAddress.trim()) {
          newErrors.recipientAddress = 'Recipient address is required'
        } else if (!/^0x[a-fA-F0-9]{40}$/.test(recipientAddress.trim())) {
          newErrors.recipientAddress = 'Invalid Ethereum address'
        } else if (recipientAddress.toLowerCase() === '0x0000000000000000000000000000000000000000') {
          newErrors.recipientAddress = 'Cannot use the zero address'
        } else if (recipientAddress.toLowerCase() === account?.toLowerCase()) {
          newErrors.recipientAddress = 'For your own address, select "Purchase for Myself"'
        }
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [selectedRoles, recipientType, recipientAddress, account])

  // Navigation
  const handleNext = useCallback(() => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, STEPS.length - 1))
    }
  }, [currentStep, validateStep])

  const handleBack = useCallback(() => {
    setCurrentStep(prev => Math.max(prev - 1, 0))
  }, [])

  const handleStepClick = useCallback((stepIndex) => {
    if (stepIndex < currentStep) {
      setCurrentStep(stepIndex)
    } else if (stepIndex === currentStep + 1 && validateStep(currentStep)) {
      setCurrentStep(stepIndex)
    }
  }, [currentStep, validateStep])

  // Purchase handler
  const handlePurchase = async () => {
    if (!isConnected || !account) {
      showNotification('Please connect your wallet first', 'error')
      return
    }

    if (!signer) {
      showNotification('Wallet signer not available', 'error')
      return
    }

    if (!isCorrectNetwork) {
      showNotification('Please switch to the correct network', 'error')
      return
    }

    setIsPurchasing(true)
    const results = []

    try {
      const targetAddress = recipientType === 'self' ? account : recipientAddress

      // Show wallet confirmation notification
      showNotification(
        `Please confirm the transaction in your wallet (${pricing.total} USC)`,
        'info',
        10000
      )

      // Process each role purchase
      for (const roleKey of selectedRoles) {
        const roleName = ROLE_INFO[roleKey].name
        const price = ROLE_PRICES[roleKey]

        try {
          // Execute blockchain transaction
          const receipt = await purchaseRoleWithUSC(signer, roleName, price)

          // Grant the role (for self) or record for gift
          if (recipientType === 'self') {
            grantRole(roleKey)
          }

          // Record the purchase
          recordRolePurchase(targetAddress, roleKey, {
            price: price,
            currency: 'USC',
            txHash: receipt.hash,
            purchasedBy: account,
            isGift: recipientType === 'other'
          })

          results.push({
            role: roleKey,
            roleName,
            success: true,
            txHash: receipt.hash
          })
        } catch (error) {
          console.error(`Error purchasing ${roleName}:`, error)
          results.push({
            role: roleKey,
            roleName,
            success: false,
            error: error.message
          })
        }
      }

      setPurchaseResults(results)

      const successCount = results.filter(r => r.success).length
      if (successCount === selectedRoles.length) {
        showNotification(
          `Successfully purchased ${successCount} role${successCount > 1 ? 's' : ''}!`,
          'success',
          7000
        )
        setCurrentStep(3) // Move to complete step
      } else if (successCount > 0) {
        showNotification(
          `Partially completed: ${successCount}/${selectedRoles.length} roles purchased`,
          'warning',
          7000
        )
        setCurrentStep(3)
      } else {
        showNotification('All purchases failed. Please try again.', 'error', 7000)
      }
    } catch (error) {
      console.error('Purchase error:', error)
      showNotification('Purchase failed: ' + error.message, 'error', 7000)
    } finally {
      setIsPurchasing(false)
    }
  }

  // Close handler
  const handleClose = useCallback(() => {
    if (!isPurchasing) {
      resetForm()
      onClose()
    }
  }, [isPurchasing, resetForm, onClose])

  if (!isOpen) return null

  const requiresZkKey = selectedRoles.includes('CLEARPATH_USER') && recipientType === 'self'

  return (
    <div
      className="ppm-overlay"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ppm-title"
    >
      <div className="ppm-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <header className="ppm-header">
          <div className="ppm-header-content">
            <h2 id="ppm-title">Purchase Premium Access</h2>
            <p className="ppm-subtitle">Unlock powerful features for your account</p>
          </div>
          <button
            className="ppm-close-btn"
            onClick={handleClose}
            disabled={isPurchasing}
            aria-label="Close modal"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </header>

        {/* Step Indicator */}
        <nav className="ppm-steps" aria-label="Purchase steps">
          {STEPS.map((step, index) => (
            <button
              key={step.id}
              className={`ppm-step ${index === currentStep ? 'active' : ''} ${index < currentStep ? 'completed' : ''}`}
              onClick={() => handleStepClick(index)}
              disabled={isPurchasing || index > currentStep}
              aria-current={index === currentStep ? 'step' : undefined}
            >
              <span className="ppm-step-icon" aria-hidden="true">
                {index < currentStep ? '✓' : step.icon}
              </span>
              <span className="ppm-step-label">{step.label}</span>
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="ppm-content">
          {/* Step 1: Select Roles */}
          {currentStep === 0 && (
            <div className="ppm-panel" role="tabpanel">
              <section className="ppm-section">
                <div className="ppm-section-header">
                  <h3 className="ppm-section-title">
                    <span aria-hidden="true">🎯</span> Select Premium Roles
                  </h3>
                  <p className="ppm-section-desc">
                    Choose one or more roles to unlock. Bundle multiple roles for discounts!
                  </p>
                </div>

                <div className="ppm-roles-grid">
                  {Object.entries(ROLE_INFO)
                    .filter(([roleKey]) => ROLE_PRICES[roleKey])
                    .map(([roleKey, roleInfo]) => {
                      const details = ROLE_DETAILS[roleKey]
                      const isSelected = selectedRoles.includes(roleKey)
                      const isOwned = recipientType === 'self' && hasRole && hasRole(roleKey)

                      return (
                        <div
                          key={roleKey}
                          className={`ppm-role-card ${isSelected ? 'selected' : ''} ${isOwned ? 'owned' : ''}`}
                        >
                          <label className="ppm-role-label">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleRoleToggle(roleKey)}
                              disabled={isOwned || isPurchasing}
                              className="ppm-role-checkbox"
                            />
                            <div className="ppm-role-content">
                              <div className="ppm-role-header">
                                <span className="ppm-role-icon" aria-hidden="true">
                                  {details?.icon || '⭐'}
                                </span>
                                <div className="ppm-role-title-group">
                                  <span className="ppm-role-name">{roleInfo.name}</span>
                                  <span className="ppm-role-tagline">{details?.tagline}</span>
                                </div>
                                <span className="ppm-role-price">${ROLE_PRICES[roleKey]} USC</span>
                              </div>

                              <div className="ppm-role-details">
                                <div className="ppm-role-duration">
                                  <span className="ppm-duration-badge">
                                    {details?.duration || 'Lifetime access'}
                                  </span>
                                </div>

                                <ul className="ppm-role-features">
                                  {details?.features.map((feature, idx) => (
                                    <li key={idx}>
                                      <span className="ppm-feature-check" aria-hidden="true">✓</span>
                                      {feature}
                                    </li>
                                  ))}
                                </ul>

                                <div className="ppm-role-funds">
                                  <span className="ppm-funds-label">Funds go to:</span>
                                  <span className="ppm-funds-destination">{details?.fundsDestination}</span>
                                  <p className="ppm-funds-usage">{details?.fundsUsage}</p>
                                </div>
                              </div>

                              {isOwned && (
                                <div className="ppm-owned-badge">
                                  <span aria-hidden="true">✓</span> Already Owned
                                </div>
                              )}
                            </div>
                          </label>
                        </div>
                      )
                    })}
                </div>

                {errors.roles && <div className="ppm-error">{errors.roles}</div>}

                {/* Bundle Discount Info */}
                {selectedRoles.length >= 2 && (
                  <div className="ppm-bundle-info">
                    <span className="ppm-bundle-icon" aria-hidden="true">🎁</span>
                    <div>
                      <strong>Bundle Discount Applied!</strong>
                      <p>You&apos;re saving {pricing.discountPercent}% (${pricing.discount.toFixed(2)} USC) by purchasing {pricing.roleCount} roles together.</p>
                    </div>
                  </div>
                )}

                {/* Pricing Summary */}
                {selectedRoles.length > 0 && (
                  <div className="ppm-pricing-summary">
                    <div className="ppm-pricing-row">
                      <span>Subtotal ({pricing.roleCount} role{pricing.roleCount > 1 ? 's' : ''})</span>
                      <span>${pricing.subtotal.toFixed(2)} USC</span>
                    </div>
                    {pricing.discount > 0 && (
                      <div className="ppm-pricing-row ppm-discount">
                        <span>Bundle Discount ({pricing.discountPercent}%)</span>
                        <span>-${pricing.discount.toFixed(2)} USC</span>
                      </div>
                    )}
                    <div className="ppm-pricing-row ppm-total">
                      <span>Total</span>
                      <span>${pricing.total.toFixed(2)} USC</span>
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}

          {/* Step 2: Recipient */}
          {currentStep === 1 && (
            <div className="ppm-panel" role="tabpanel">
              <section className="ppm-section">
                <div className="ppm-section-header">
                  <h3 className="ppm-section-title">
                    <span aria-hidden="true">🎁</span> Who is this for?
                  </h3>
                  <p className="ppm-section-desc">
                    Purchase for yourself or gift to another address.
                  </p>
                </div>

                <div className="ppm-recipient-options">
                  <label className={`ppm-recipient-card ${recipientType === 'self' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="recipientType"
                      value="self"
                      checked={recipientType === 'self'}
                      onChange={() => setRecipientType('self')}
                      disabled={isPurchasing}
                    />
                    <div className="ppm-recipient-content">
                      <span className="ppm-recipient-icon" aria-hidden="true">👤</span>
                      <div>
                        <strong>Purchase for Myself</strong>
                        <p>Roles will be activated for your connected wallet</p>
                        {account && (
                          <code className="ppm-address-preview">
                            {account.slice(0, 6)}...{account.slice(-4)}
                          </code>
                        )}
                      </div>
                    </div>
                  </label>

                  <label className={`ppm-recipient-card ${recipientType === 'other' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="recipientType"
                      value="other"
                      checked={recipientType === 'other'}
                      onChange={() => setRecipientType('other')}
                      disabled={isPurchasing}
                    />
                    <div className="ppm-recipient-content">
                      <span className="ppm-recipient-icon" aria-hidden="true">🎁</span>
                      <div>
                        <strong>Gift to Another Address</strong>
                        <p>Send premium access to a friend or colleague</p>
                      </div>
                    </div>
                  </label>
                </div>

                {recipientType === 'other' && (
                  <div className="ppm-field">
                    <label htmlFor="recipientAddress">
                      Recipient Wallet Address <span className="ppm-required">*</span>
                    </label>
                    <input
                      id="recipientAddress"
                      type="text"
                      value={recipientAddress}
                      onChange={(e) => {
                        setRecipientAddress(e.target.value)
                        setErrors(prev => ({ ...prev, recipientAddress: null }))
                      }}
                      placeholder="0x..."
                      disabled={isPurchasing}
                      className={errors.recipientAddress ? 'error' : ''}
                    />
                    <div className="ppm-hint">
                      Enter the Ethereum address that will receive the premium access
                    </div>
                    {errors.recipientAddress && (
                      <div className="ppm-error">{errors.recipientAddress}</div>
                    )}
                  </div>
                )}

                {/* ZK Key Registration for ClearPath */}
                {requiresZkKey && (
                  <div className="ppm-zk-section">
                    <div className="ppm-info-card">
                      <span className="ppm-info-icon" aria-hidden="true">🔐</span>
                      <div>
                        <strong>ZK Key Registration (Optional)</strong>
                        <p>
                          ClearPath uses zero-knowledge proofs for private governance.
                          You can register your ZK public key now or later.
                        </p>
                      </div>
                    </div>

                    <div className="ppm-field">
                      <label htmlFor="zkPublicKey">ZK Public Key (Optional)</label>
                      <textarea
                        id="zkPublicKey"
                        value={zkPublicKey}
                        onChange={(e) => setZkPublicKey(e.target.value)}
                        placeholder="Enter your zero-knowledge public key..."
                        rows={3}
                        disabled={isPurchasing}
                      />
                      <div className="ppm-hint">
                        This key enables private voting and governance actions
                      </div>
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}

          {/* Step 3: Review & Confirm */}
          {currentStep === 2 && (
            <div className="ppm-panel" role="tabpanel">
              <section className="ppm-section">
                <h3 className="ppm-section-title">
                  <span aria-hidden="true">📋</span> Review Your Purchase
                </h3>

                {/* Transaction Warning */}
                <div className="ppm-warning-card">
                  <span className="ppm-warning-icon" aria-hidden="true">⚠️</span>
                  <div className="ppm-warning-content">
                    <strong>Blockchain Transaction Notice</strong>
                    <ul>
                      <li>This is a <strong>non-refundable</strong> blockchain transaction</li>
                      <li>Once confirmed, the transaction cannot be reversed</li>
                      <li>Funds will be transferred to the DAO Treasury</li>
                      <li>Please verify all details before proceeding</li>
                    </ul>
                  </div>
                </div>

                {/* Order Summary */}
                <div className="ppm-review-card">
                  <h4>Order Summary</h4>

                  <div className="ppm-review-recipient">
                    <span className="ppm-review-label">Recipient</span>
                    <span className="ppm-review-value">
                      {recipientType === 'self' ? (
                        <>
                          <span className="ppm-recipient-badge">You</span>
                          <code>{account?.slice(0, 6)}...{account?.slice(-4)}</code>
                        </>
                      ) : (
                        <>
                          <span className="ppm-recipient-badge ppm-gift">Gift</span>
                          <code>{recipientAddress.slice(0, 6)}...{recipientAddress.slice(-4)}</code>
                        </>
                      )}
                    </span>
                  </div>

                  <div className="ppm-review-roles">
                    <span className="ppm-review-label">Selected Roles</span>
                    <div className="ppm-review-roles-list">
                      {selectedRoles.map(roleKey => {
                        const roleInfo = ROLE_INFO[roleKey]
                        const details = ROLE_DETAILS[roleKey]
                        return (
                          <div key={roleKey} className="ppm-review-role-item">
                            <div className="ppm-review-role-info">
                              <span className="ppm-review-role-icon" aria-hidden="true">
                                {details?.icon}
                              </span>
                              <div>
                                <span className="ppm-review-role-name">{roleInfo.name}</span>
                                <span className="ppm-review-role-duration">{details?.duration}</span>
                              </div>
                            </div>
                            <span className="ppm-review-role-price">${ROLE_PRICES[roleKey]} USC</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="ppm-review-pricing">
                    <div className="ppm-review-pricing-row">
                      <span>Subtotal</span>
                      <span>${pricing.subtotal.toFixed(2)} USC</span>
                    </div>
                    {pricing.discount > 0 && (
                      <div className="ppm-review-pricing-row ppm-discount">
                        <span>Bundle Discount ({pricing.discountPercent}%)</span>
                        <span className="ppm-discount-amount">-${pricing.discount.toFixed(2)} USC</span>
                      </div>
                    )}
                    <div className="ppm-review-pricing-row ppm-total">
                      <span>Total</span>
                      <span>${pricing.total.toFixed(2)} USC</span>
                    </div>
                  </div>

                  <div className="ppm-review-funds-info">
                    <span className="ppm-funds-icon" aria-hidden="true">💰</span>
                    <p>
                      <strong>Where do the funds go?</strong> 100% of your payment goes to the
                      DAO Treasury to support protocol development, security audits, and
                      community initiatives.
                    </p>
                  </div>
                </div>

                {/* Network Warning */}
                {isConnected && !isCorrectNetwork && (
                  <div className="ppm-network-warning">
                    <span aria-hidden="true">⚠️</span>
                    <div>
                      <strong>Wrong Network</strong>
                      <p>Please switch to the correct network to continue.</p>
                      <button type="button" onClick={switchNetwork}>
                        Switch Network
                      </button>
                    </div>
                  </div>
                )}

                {/* Wallet Not Connected */}
                {!isConnected && (
                  <div className="ppm-connect-warning">
                    <span aria-hidden="true">🔗</span>
                    <div>
                      <strong>Wallet Not Connected</strong>
                      <p>Please connect your wallet to complete the purchase.</p>
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}

          {/* Step 4: Complete */}
          {currentStep === 3 && (
            <div className="ppm-panel" role="tabpanel">
              <section className="ppm-section ppm-complete-section">
                <div className="ppm-success-icon" aria-hidden="true">
                  {purchaseResults.every(r => r.success) ? '🎉' : '⚠️'}
                </div>

                <h3 className="ppm-complete-title">
                  {purchaseResults.every(r => r.success)
                    ? 'Purchase Complete!'
                    : 'Purchase Partially Complete'}
                </h3>

                <p className="ppm-complete-desc">
                  {recipientType === 'self'
                    ? 'Your premium access has been activated.'
                    : `Premium access has been gifted to ${recipientAddress.slice(0, 6)}...${recipientAddress.slice(-4)}.`}
                </p>

                <div className="ppm-purchase-results">
                  {purchaseResults.map((result, idx) => (
                    <div
                      key={idx}
                      className={`ppm-result-item ${result.success ? 'success' : 'failed'}`}
                    >
                      <span className="ppm-result-icon" aria-hidden="true">
                        {result.success ? '✓' : '✗'}
                      </span>
                      <div className="ppm-result-info">
                        <span className="ppm-result-name">{result.roleName}</span>
                        {result.success ? (
                          <span className="ppm-result-status">Activated</span>
                        ) : (
                          <span className="ppm-result-error">{result.error}</span>
                        )}
                      </div>
                      {result.txHash && (
                        <a
                          href={`https://blockscout.com/etc/mainnet/tx/${result.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ppm-tx-link"
                        >
                          View Tx
                        </a>
                      )}
                    </div>
                  ))}
                </div>

                {/* What's Next */}
                <div className="ppm-whats-next">
                  <h4>What&apos;s Next?</h4>
                  <ul>
                    {selectedRoles.includes('CLEARPATH_USER') && (
                      <li>
                        <span aria-hidden="true">🔐</span>
                        Access the ClearPath governance dashboard
                      </li>
                    )}
                    {selectedRoles.includes('MARKET_MAKER') && (
                      <li>
                        <span aria-hidden="true">📊</span>
                        Create your first prediction market
                      </li>
                    )}
                    {selectedRoles.includes('TOKENMINT') && (
                      <li>
                        <span aria-hidden="true">🪙</span>
                        Explore the token minting tools
                      </li>
                    )}
                    {selectedRoles.includes('FRIEND_MARKET') && (
                      <li>
                        <span aria-hidden="true">👥</span>
                        Invite friends to your first private market
                      </li>
                    )}
                  </ul>
                </div>
              </section>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <footer className="ppm-footer">
          <div className="ppm-footer-left">
            {currentStep > 0 && currentStep < 3 && (
              <button
                type="button"
                className="ppm-btn-secondary"
                onClick={handleBack}
                disabled={isPurchasing}
              >
                Back
              </button>
            )}
          </div>
          <div className="ppm-footer-right">
            {currentStep < 3 && (
              <button
                type="button"
                className="ppm-btn-secondary"
                onClick={handleClose}
                disabled={isPurchasing}
              >
                Cancel
              </button>
            )}
            {currentStep < 2 && (
              <button
                type="button"
                className="ppm-btn-primary"
                onClick={handleNext}
                disabled={isPurchasing || selectedRoles.length === 0}
              >
                Continue
              </button>
            )}
            {currentStep === 2 && (
              <button
                type="button"
                className="ppm-btn-primary ppm-btn-purchase"
                onClick={handlePurchase}
                disabled={isPurchasing || !isConnected || !isCorrectNetwork}
              >
                {isPurchasing ? (
                  <>
                    <span className="ppm-spinner" aria-hidden="true" />
                    Processing...
                  </>
                ) : (
                  <>
                    Confirm Purchase (${pricing.total.toFixed(2)} USC)
                  </>
                )}
              </button>
            )}
            {currentStep === 3 && (
              <button
                type="button"
                className="ppm-btn-primary"
                onClick={handleClose}
              >
                Done
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  )
}

export default PremiumPurchaseModal
