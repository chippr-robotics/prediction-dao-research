import { useState } from 'react'
import { useRoles } from '../../hooks/useRoles'
import { useWeb3 } from '../../hooks/useWeb3'
import { recordRolePurchase } from '../../utils/roleStorage'
import './RolePurchaseModal.css'

function RolePurchaseModal({ onClose }) {
  const { ROLES, ROLE_INFO, grantRole } = useRoles()
  const { account, isConnected } = useWeb3()
  const [selectedRole, setSelectedRole] = useState(ROLES.CLEARPATH_USER)
  const [zkPublicKey, setZkPublicKey] = useState('')
  const [isPurchasing, setIsPurchasing] = useState(false)
  const [purchaseStep, setPurchaseStep] = useState('select') // select, payment, register, complete

  // Mock prices in USDC (6 decimals)
  const ROLE_PRICES = {
    [ROLES.MARKET_MAKER]: 100,
    [ROLES.CLEARPATH_USER]: 250,
    [ROLES.TOKENMINT]: 150,
  }

  const handlePurchase = async () => {
    if (!isConnected || !account) {
      alert('Please connect your wallet first')
      return
    }

    setIsPurchasing(true)
    setPurchaseStep('payment')

    try {
      // Simulate payment transaction
      // In a real implementation, this would interact with a smart contract
      await new Promise(resolve => setTimeout(resolve, 2000))

      // Grant the role
      const success = grantRole(selectedRole)
      
      if (success) {
        // Record the purchase
        recordRolePurchase(account, selectedRole, {
          price: ROLE_PRICES[selectedRole],
          currency: 'USDC',
          txHash: '0x' + Math.random().toString(16).substr(2, 64), // Mock tx hash
        })

        // Move to registration step for ClearPath
        if (selectedRole === ROLES.CLEARPATH_USER) {
          setPurchaseStep('register')
        } else {
          setPurchaseStep('complete')
        }
      } else {
        alert('Failed to grant role')
        setPurchaseStep('select')
      }
    } catch (error) {
      console.error('Purchase error:', error)
      alert('Purchase failed: ' + error.message)
      setPurchaseStep('select')
    } finally {
      setIsPurchasing(false)
    }
  }

  const handleRegisterKey = async () => {
    if (!zkPublicKey.trim()) {
      alert('Please enter your ZK public key')
      return
    }

    setIsPurchasing(true)

    try {
      // Simulate ZK key registration
      // In a real implementation, this would register the key with the ClearPath system
      await new Promise(resolve => setTimeout(resolve, 1500))

      setPurchaseStep('complete')
    } catch (error) {
      console.error('Registration error:', error)
      alert('Registration failed: ' + error.message)
    } finally {
      setIsPurchasing(false)
    }
  }

  const handleComplete = () => {
    onClose && onClose()
  }

  const selectedRoleInfo = ROLE_INFO[selectedRole]
  const price = ROLE_PRICES[selectedRole]

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
              Select a premium role to unlock exclusive features. All purchases are processed securely using stablecoin.
            </p>

            <div className="role-options">
              {Object.entries(ROLE_INFO)
                .filter(([roleKey]) => ROLE_PRICES[roleKey])
                .map(([roleKey, roleInfo]) => (
                  <label key={roleKey} className="role-option">
                    <input
                      type="radio"
                      name="role"
                      value={roleKey}
                      checked={selectedRole === roleKey}
                      onChange={(e) => setSelectedRole(e.target.value)}
                      className="role-radio"
                    />
                    <div className="role-option-content">
                      <div className="role-option-header">
                        <span className="role-option-name">{roleInfo.name}</span>
                        <span className="role-option-price">${ROLE_PRICES[roleKey]} USDC</span>
                      </div>
                      <p className="role-option-description">{roleInfo.description}</p>
                    </div>
                  </label>
                ))}
            </div>

            <div className="selected-role-summary">
              <h3>Selected Role</h3>
              <div className="summary-details">
                <div className="summary-row">
                  <span className="summary-label">Role:</span>
                  <span className="summary-value">{selectedRoleInfo.name}</span>
                </div>
                <div className="summary-row">
                  <span className="summary-label">Price:</span>
                  <span className="summary-value">${price} USDC</span>
                </div>
              </div>
            </div>

            <button
              onClick={handlePurchase}
              disabled={isPurchasing || !isConnected}
              className="purchase-btn"
            >
              {isPurchasing ? 'Processing...' : 'Purchase Access'}
            </button>
          </div>
        )}

        {purchaseStep === 'payment' && (
          <div className="payment-step">
            <div className="loading-spinner" aria-hidden="true">
              <div className="spinner"></div>
            </div>
            <h3>Processing Payment</h3>
            <p>Please wait while we process your payment...</p>
            <div className="payment-details">
              <div className="detail-row">
                <span>Amount:</span>
                <span>${price} USDC</span>
              </div>
              <div className="detail-row">
                <span>Role:</span>
                <span>{selectedRoleInfo.name}</span>
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
            <div className="success-icon-large" aria-hidden="true">🎉</div>
            <h3>All Set!</h3>
            <p className="complete-description">
              You now have access to <strong>{selectedRoleInfo.name}</strong> features.
            </p>
            <div className="complete-features">
              <h4>What's Next?</h4>
              <ul>
                {selectedRole === ROLES.CLEARPATH_USER && (
                  <>
                    <li>Access DAO governance and management</li>
                    <li>Participate in prediction markets for proposals</li>
                    <li>View and vote on organizational decisions</li>
                  </>
                )}
                {selectedRole === ROLES.MARKET_MAKER && (
                  <>
                    <li>Create new prediction markets</li>
                    <li>Set market parameters and liquidity</li>
                    <li>Earn fees from market activity</li>
                  </>
                )}
                {selectedRole === ROLES.TOKENMINT && (
                  <>
                    <li>Mint new ERC20 tokens</li>
                    <li>Create and manage NFT collections</li>
                    <li>Integrate with ETC swap contracts</li>
                  </>
                )}
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
