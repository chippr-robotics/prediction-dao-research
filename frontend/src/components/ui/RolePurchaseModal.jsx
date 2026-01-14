import { useState } from 'react'
import { useRoles } from '../../hooks/useRoles'
import { useWeb3 } from '../../hooks/useWeb3'
import { useWalletTransactions } from '../../hooks/useWalletManagement'
import { useNotification } from '../../hooks/useUI'
import { recordRolePurchase } from '../../utils/roleStorage'
import { purchaseRoleWithUSC } from '../../utils/blockchainService'
import './RolePurchaseModal.css'

// Membership tiers matching TieredRoleManager contract
const MEMBERSHIP_TIERS = {
  BRONZE: { id: 1, name: 'Bronze', color: '#cd7f32' },
  SILVER: { id: 2, name: 'Silver', color: '#c0c0c0' },
  GOLD: { id: 3, name: 'Gold', color: '#ffd700' },
  PLATINUM: { id: 4, name: 'Platinum', color: '#e5e4e2' }
}

// Tier benefits for display
const TIER_BENEFITS = {
  BRONZE: {
    dailyBets: 10,
    monthlyMarkets: 5,
    maxPosition: '100 USC',
    features: ['Basic market access', 'Standard support']
  },
  SILVER: {
    dailyBets: 25,
    monthlyMarkets: 15,
    maxPosition: '500 USC',
    features: ['Priority support', 'Advanced analytics']
  },
  GOLD: {
    dailyBets: 50,
    monthlyMarkets: 30,
    maxPosition: '2,000 USC',
    features: ['Premium support', 'Full analytics', 'Private markets']
  },
  PLATINUM: {
    dailyBets: 'Unlimited',
    monthlyMarkets: 'Unlimited',
    maxPosition: 'Unlimited',
    features: ['Dedicated support', 'API access', 'Exclusive features']
  }
}

function RolePurchaseModal({ onClose }) {
  const { ROLES, ROLE_INFO, grantRole, hasRole, loadRoles } = useRoles()
  const { account, isConnected } = useWeb3()
  const { signer } = useWalletTransactions()
  const { showNotification } = useNotification()
  const [selectedRole, setSelectedRole] = useState(ROLES.FRIEND_MARKET)
  const [selectedTier, setSelectedTier] = useState('BRONZE')
  const [zkPublicKey, setZkPublicKey] = useState('')
  const [isPurchasing, setIsPurchasing] = useState(false)
  const [purchaseStep, setPurchaseStep] = useState('select') // select, tier, payment, register, complete

  // Prices in USC stablecoin by role and tier
  const TIER_PRICES = {
    BRONZE: {
      [ROLES.MARKET_MAKER]: 100,
      [ROLES.CLEARPATH_USER]: 250,
      [ROLES.TOKENMINT]: 150,
      [ROLES.FRIEND_MARKET]: 50,
    },
    SILVER: {
      [ROLES.MARKET_MAKER]: 200,
      [ROLES.CLEARPATH_USER]: 400,
      [ROLES.TOKENMINT]: 300,
      [ROLES.FRIEND_MARKET]: 100,
    },
    GOLD: {
      [ROLES.MARKET_MAKER]: 350,
      [ROLES.CLEARPATH_USER]: 650,
      [ROLES.TOKENMINT]: 500,
      [ROLES.FRIEND_MARKET]: 175,
    },
    PLATINUM: {
      [ROLES.MARKET_MAKER]: 600,
      [ROLES.CLEARPATH_USER]: 1000,
      [ROLES.TOKENMINT]: 800,
      [ROLES.FRIEND_MARKET]: 300,
    }
  }

  const handlePurchase = async () => {
    if (!isConnected || !account) {
      showNotification('Please connect your wallet first', 'error')
      return
    }

    if (!signer) {
      showNotification('Wallet signer not available', 'error')
      return
    }

    setIsPurchasing(true)
    setPurchaseStep('payment')

    try {
      const price = TIER_PRICES[selectedTier][selectedRole]
      const roleName = ROLE_INFO[selectedRole].name
      const tierValue = MEMBERSHIP_TIERS[selectedTier].id

      // Show notification for wallet confirmation
      showNotification('Please confirm the transaction in your wallet', 'info', 5000)

      // Execute blockchain transaction with tier
      const receipt = await purchaseRoleWithUSC(signer, roleName, price, tierValue)

      // Grant the role locally first for immediate feedback
      const success = grantRole(selectedRole)

      if (success) {
        // Record the purchase with tier info
        recordRolePurchase(account, selectedRole, {
          price: price,
          currency: 'USC',
          tier: selectedTier,
          tierValue: tierValue,
          txHash: receipt.hash,
        })

        // Refresh roles from blockchain to sync on-chain state
        try {
          await loadRoles()
        } catch (refreshError) {
          console.warn('Failed to refresh roles from blockchain:', refreshError)
        }

        showNotification(`Successfully purchased ${roleName} (${MEMBERSHIP_TIERS[selectedTier].name})!`, 'success', 7000)

        // Move to registration step for ClearPath
        if (selectedRole === ROLES.CLEARPATH_USER) {
          setPurchaseStep('register')
        } else {
          setPurchaseStep('complete')
        }
      } else {
        showNotification('Failed to grant role', 'error')
        setPurchaseStep('select')
      }
    } catch (error) {
      console.error('Purchase error:', error)
      showNotification('Purchase failed: ' + error.message, 'error', 7000)
      setPurchaseStep('select')
    } finally {
      setIsPurchasing(false)
    }
  }

  const handleRegisterKey = async () => {
    if (!zkPublicKey.trim()) {
      showNotification('Please enter your ZK public key', 'error')
      return
    }

    setIsPurchasing(true)

    try {
      // Simulate ZK key registration
      // In a real implementation, this would register the key with the ClearPath system
      await new Promise(resolve => setTimeout(resolve, 1500))

      showNotification('ZK key registered successfully!', 'success')
      setPurchaseStep('complete')
    } catch (error) {
      console.error('Registration error:', error)
      showNotification('Registration failed: ' + error.message, 'error')
    } finally {
      setIsPurchasing(false)
    }
  }

  const handleComplete = () => {
    onClose && onClose()
  }

  const selectedRoleInfo = ROLE_INFO[selectedRole]
  const price = TIER_PRICES[selectedTier]?.[selectedRole] || 0
  const tierInfo = MEMBERSHIP_TIERS[selectedTier]
  const tierBenefits = TIER_BENEFITS[selectedTier]

  return (
    <div className="role-purchase-modal">
      <div className="purchase-modal-header">
        <h2>Purchase Premium Access</h2>
        <button onClick={onClose} className="close-modal-btn" aria-label="Close">
          ×
        </button>
      </div>

      <div className="purchase-modal-content">
        {purchaseStep === 'select' && (
          <div className="select-step">
            <p className="step-description">
              Select a role and membership tier. Higher tiers unlock more features and higher limits.
            </p>

            <div className="role-options">
              {Object.entries(ROLE_INFO)
                .filter(([roleKey]) => TIER_PRICES.BRONZE[roleKey])
                .map(([roleKey, roleInfo]) => {
                  const isOwned = hasRole && hasRole(roleKey)
                  return (
                    <label key={roleKey} className={`role-option ${isOwned ? 'role-option-owned' : ''} ${selectedRole === roleKey ? 'role-option-selected' : ''}`}>
                      <input
                        type="radio"
                        name="role"
                        value={roleKey}
                        checked={selectedRole === roleKey}
                        onChange={(e) => setSelectedRole(e.target.value)}
                        className="role-radio"
                        disabled={isOwned}
                      />
                      <div className="role-option-content">
                        <div className="role-option-header">
                          <span className="role-option-name">{roleInfo.name}</span>
                          {isOwned ? (
                            <span className="role-option-owned-badge">Already Owned</span>
                          ) : (
                            <span className="role-option-price">from ${TIER_PRICES.BRONZE[roleKey]} USC</span>
                          )}
                        </div>
                        <p className="role-option-description">{roleInfo.description}</p>
                      </div>
                    </label>
                  )
                })}
            </div>

            <button
              onClick={() => setPurchaseStep('tier')}
              disabled={!selectedRole || (hasRole && hasRole(selectedRole))}
              className="purchase-btn"
            >
              Select Tier
            </button>
          </div>
        )}

        {purchaseStep === 'tier' && (
          <div className="tier-step">
            <button onClick={() => setPurchaseStep('select')} className="back-btn">
              ← Back to Roles
            </button>

            <h3>Select Membership Tier</h3>
            <p className="step-description">
              Choose your {selectedRoleInfo?.name} tier. Higher tiers offer more benefits and limits.
            </p>

            <div className="tier-options">
              {Object.entries(MEMBERSHIP_TIERS).map(([tierKey, tier]) => {
                const tierPrice = TIER_PRICES[tierKey][selectedRole]
                const benefits = TIER_BENEFITS[tierKey]
                return (
                  <label
                    key={tierKey}
                    className={`tier-option ${selectedTier === tierKey ? 'tier-option-selected' : ''}`}
                    style={{ '--tier-color': tier.color }}
                  >
                    <input
                      type="radio"
                      name="tier"
                      value={tierKey}
                      checked={selectedTier === tierKey}
                      onChange={(e) => setSelectedTier(e.target.value)}
                      className="tier-radio"
                    />
                    <div className="tier-option-content">
                      <div className="tier-option-header">
                        <span className="tier-badge" style={{ backgroundColor: tier.color }}>
                          {tier.name}
                        </span>
                        <span className="tier-price">${tierPrice} USC</span>
                      </div>
                      <div className="tier-limits">
                        <div className="limit-item">
                          <span className="limit-label">Daily Bets:</span>
                          <span className="limit-value">{benefits.dailyBets}</span>
                        </div>
                        <div className="limit-item">
                          <span className="limit-label">Monthly Markets:</span>
                          <span className="limit-value">{benefits.monthlyMarkets}</span>
                        </div>
                        <div className="limit-item">
                          <span className="limit-label">Max Position:</span>
                          <span className="limit-value">{benefits.maxPosition}</span>
                        </div>
                      </div>
                      <ul className="tier-features">
                        {benefits.features.map((feature, idx) => (
                          <li key={idx}>{feature}</li>
                        ))}
                      </ul>
                    </div>
                  </label>
                )
              })}
            </div>

            <div className="selected-role-summary">
              <h4>Purchase Summary</h4>
              <div className="summary-details">
                <div className="summary-row">
                  <span className="summary-label">Role:</span>
                  <span className="summary-value">{selectedRoleInfo?.name}</span>
                </div>
                <div className="summary-row">
                  <span className="summary-label">Tier:</span>
                  <span className="summary-value" style={{ color: tierInfo?.color }}>
                    {tierInfo?.name}
                  </span>
                </div>
                <div className="summary-row">
                  <span className="summary-label">Price:</span>
                  <span className="summary-value">${price} USC</span>
                </div>
                <div className="summary-row">
                  <span className="summary-label">Duration:</span>
                  <span className="summary-value">30 days</span>
                </div>
              </div>
            </div>

            <button
              onClick={handlePurchase}
              disabled={isPurchasing || !isConnected}
              className="purchase-btn"
            >
              {isPurchasing ? 'Processing...' : `Purchase ${tierInfo?.name} Access`}
            </button>
          </div>
        )}

        {purchaseStep === 'payment' && (
          <div className="payment-step">
            <div className="loading-spinner" aria-hidden="true">
              <div className="spinner"></div>
            </div>
            <h3>Processing Payment</h3>
            <p>Confirm the transaction in your wallet and wait for confirmation...</p>
            <div className="payment-details">
              <div className="detail-row">
                <span>Amount:</span>
                <span>${price} USC</span>
              </div>
              <div className="detail-row">
                <span>Role:</span>
                <span>{selectedRoleInfo?.name}</span>
              </div>
              <div className="detail-row">
                <span>Tier:</span>
                <span style={{ color: tierInfo?.color }}>{tierInfo?.name}</span>
              </div>
            </div>
          </div>
        )}

        {purchaseStep === 'register' && (
          <div className="register-step">
            <div className="success-icon" aria-hidden="true">✓</div>
            <h3>Payment Successful!</h3>
            <p className="register-description">
              To access ClearPath's ZK-protected governance features, please register your zero-knowledge public key.
            </p>

            <div className="register-form">
              <label htmlFor="zkPublicKey">ZK Public Key</label>
              <textarea
                id="zkPublicKey"
                value={zkPublicKey}
                onChange={(e) => setZkPublicKey(e.target.value)}
                placeholder="Enter your zero-knowledge public key..."
                className="zk-key-input"
                rows="4"
              />
              <p className="input-help">
                This key will be used to verify your identity in zero-knowledge proofs for private governance actions.
              </p>
            </div>

            <div className="register-actions">
              <button
                onClick={handleRegisterKey}
                disabled={isPurchasing || !zkPublicKey.trim()}
                className="register-btn"
              >
                {isPurchasing ? 'Registering...' : 'Register Key'}
              </button>
              <button
                onClick={() => setPurchaseStep('complete')}
                className="skip-btn"
              >
                Skip for Now
              </button>
            </div>
          </div>
        )}

        {purchaseStep === 'complete' && (
          <div className="complete-step">
            <div className="success-icon-large" aria-hidden="true">✓</div>
            <h3>All Set!</h3>
            <p className="complete-description">
              You now have <strong style={{ color: tierInfo?.color }}>{tierInfo?.name}</strong> access to <strong>{selectedRoleInfo?.name}</strong> features.
            </p>
            <div className="complete-features">
              <h4>Your Benefits</h4>
              <ul>
                <li>Daily Bets: {tierBenefits?.dailyBets}</li>
                <li>Monthly Markets: {tierBenefits?.monthlyMarkets}</li>
                <li>Max Position: {tierBenefits?.maxPosition}</li>
                {tierBenefits?.features.map((feature, idx) => (
                  <li key={idx}>{feature}</li>
                ))}
              </ul>
            </div>
            <button onClick={handleComplete} className="complete-btn">
              Get Started
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default RolePurchaseModal
