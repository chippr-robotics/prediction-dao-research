import { useState, useCallback, useMemo } from 'react'
import { useRoles } from '../../hooks/useRoles'
import { useWeb3 } from '../../hooks/useWeb3'
import { useWalletTransactions } from '../../hooks/useWalletManagement'
import { useNotification } from '../../hooks/useUI'
import { recordRolePurchase } from '../../utils/roleStorage'
import { purchaseRoleWithUSC, registerZKKey } from '../../utils/blockchainService'
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
  { id: 'review', label: 'Review', icon: '2' },
  { id: 'complete', label: 'Complete', icon: '3' }
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

// Note: Bundle discounts are not currently supported by the contract
// Each role purchase is a separate transaction at individual price

function PremiumPurchaseModal({ isOpen = true, onClose }) {
  const { ROLE_INFO, grantRole, hasRole } = useRoles()
  const { account, isConnected, isCorrectNetwork, switchNetwork } = useWeb3()
  const { signer } = useWalletTransactions()
  const { showNotification } = useNotification()

  // Step navigation
  const [currentStep, setCurrentStep] = useState(0)

  // Selected roles (multi-select)
  const [selectedRoles, setSelectedRoles] = useState([])

  // ZK key for ClearPath (optional)
  const [zkPublicKey, setZkPublicKey] = useState('')

  // UI state
  const [isPurchasing, setIsPurchasing] = useState(false)
  const [purchaseResults, setPurchaseResults] = useState([])
  const [errors, setErrors] = useState({})

  // Calculate pricing (no bundle discounts - each role is separate transaction)
  const pricing = useMemo(() => {
    const total = selectedRoles.reduce((sum, role) => sum + ROLE_PRICES[role], 0)
    const roleCount = selectedRoles.length

    return {
      total,
      roleCount
    }
  }, [selectedRoles])

  // Reset form
  const resetForm = useCallback(() => {
    setCurrentStep(0)
    setSelectedRoles([])
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

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [selectedRoles])

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
      // Show notification about multiple transactions
      const transactionCount = selectedRoles.length
      const notificationMessage =
        transactionCount > 1
          ? `You will need to confirm ${transactionCount} separate transactions in your wallet (one per role, total ${pricing.total} USC). Each role purchase is a separate blockchain transaction.`
          : `Please confirm the transaction in your wallet (${pricing.total} USC)`

      showNotification(notificationMessage, 'info', 10000)

      // Process each role purchase (each is a separate transaction)
      for (const roleKey of selectedRoles) {
        const roleName = ROLE_INFO[roleKey].name
        const price = ROLE_PRICES[roleKey]

        try {
          // Execute blockchain transaction
          const receipt = await purchaseRoleWithUSC(signer, roleName, price)

          // Grant the role to the current user
          grantRole(roleKey)

          // Record the purchase
          recordRolePurchase(account, roleKey, {
            price: price,
            currency: 'USC',
            txHash: receipt.hash,
            purchasedBy: account
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

      // Handle ZK key registration for ClearPath (optional, only if key provided)
      if (zkPublicKey.trim() && selectedRoles.includes('CLEARPATH_USER')) {
        try {
          await registerZKKey(signer, zkPublicKey.trim())
          showNotification('ZK key registered successfully', 'success', 5000)
        } catch (zkError) {
          console.error('ZK key registration failed:', zkError)
          // Don't fail the entire purchase if ZK key registration fails
          showNotification(
            'Role purchased successfully, but ZK key registration failed. You can register your key later.',
            'warning',
            7000
          )
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
        setCurrentStep(2) // Move to complete step (now step index 2)
      } else if (successCount > 0) {
        showNotification(
          `Partially completed: ${successCount}/${selectedRoles.length} roles purchased. Successful purchases have been applied.`,
          'warning',
          10000
        )
        setCurrentStep(2)
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

  const requiresZkKey = selectedRoles.includes('CLEARPATH_USER')

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
                    Choose one or more roles to unlock. Each role is a separate transaction.
                  </p>
                </div>

                <div className="ppm-roles-grid">
                  {Object.entries(ROLE_INFO)
                    .filter(([roleKey]) => ROLE_PRICES[roleKey])
                    .map(([roleKey, roleInfo]) => {
                      const details = ROLE_DETAILS[roleKey]
                      const isSelected = selectedRoles.includes(roleKey)
                      const isOwned = hasRole && hasRole(roleKey)

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

                {/* Pricing Summary */}
                {selectedRoles.length > 0 && (
                  <div className="ppm-pricing-summary">
                    <div className="ppm-pricing-row">
                      <span>Selected ({pricing.roleCount} role{pricing.roleCount > 1 ? 's' : ''})</span>
                      <span>${pricing.total.toFixed(2)} USC</span>
                    </div>
                    <div className="ppm-pricing-row ppm-total">
                      <span>Total</span>
                      <span>${pricing.total.toFixed(2)} USC</span>
                    </div>
                    {pricing.roleCount > 1 && (
                      <div className="ppm-pricing-note">
                        <small>Note: Each role requires a separate transaction</small>
                      </div>
                    )}
                  </div>
                )}

                {/* ZK Key Registration for ClearPath (optional) */}
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

          {/* Step 2: Review & Confirm (formerly step 3) */}
          {currentStep === 1 && (
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
                      <span className="ppm-recipient-badge">You</span>
                      <code>{account?.slice(0, 6)}...{account?.slice(-4)}</code>
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
                    <div className="ppm-review-pricing-row ppm-total">
                      <span>Total ({pricing.roleCount} transaction{pricing.roleCount > 1 ? 's' : ''})</span>
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

          {/* Step 3: Complete (formerly step 4) */}
          {currentStep === 2 && (
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
                  Your premium access has been activated.
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
            {currentStep > 0 && currentStep < 2 && (
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
            {currentStep < 2 && (
              <button
                type="button"
                className="ppm-btn-secondary"
                onClick={handleClose}
                disabled={isPurchasing}
              >
                Cancel
              </button>
            )}
            {currentStep < 1 && (
              <button
                type="button"
                className="ppm-btn-primary"
                onClick={handleNext}
                disabled={isPurchasing || selectedRoles.length === 0}
              >
                Continue
              </button>
            )}
            {currentStep === 1 && (
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
            {currentStep === 2 && (
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
