import { useState, useMemo } from 'react'
import { useRoles } from '../hooks/useRoles'
import { useWeb3 } from '../hooks/useWeb3'
import { useNotification } from '../hooks/useUI'
import { recordRolePurchase } from '../utils/roleStorage'
import './RolePurchaseScreen.css'

// Payment configuration
const PAYMENT_RECEIVER_ADDRESS = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb' // Example payment address
const PAYMENT_TOKEN = 'USDC' // USDC for payments

// Individual role prices in USDC
const ROLE_PRICES = {
  MARKET_MAKER: 100,
  CLEARPATH_USER: 250,
  TOKENMINT: 150,
}

// Bundle discount percentage
const BUNDLE_DISCOUNT_TWO = 0.15 // 15% discount for 2 roles
const BUNDLE_DISCOUNT_ALL = 0.25 // 25% discount for all 3 roles

function RolePurchaseScreen() {
  const { ROLES, ROLE_INFO, grantRole, hasRole } = useRoles()
  const { account, isConnected } = useWeb3()
  const { showNotification } = useNotification()
  
  const [selectedProducts, setSelectedProducts] = useState(new Set())
  const [isPurchasing, setIsPurchasing] = useState(false)
  const [purchaseStep, setPurchaseStep] = useState('select') // select, payment, complete

  // Available roles for purchase (excluding admin)
  const availableRoles = useMemo(() => {
    return Object.entries(ROLE_INFO)
      .filter(([roleKey]) => ROLE_PRICES[roleKey])
      .map(([roleKey, info]) => ({
        key: roleKey,
        ...info,
        price: ROLE_PRICES[roleKey],
        owned: hasRole(roleKey)
      }))
  }, [hasRole, ROLE_INFO])

  // Calculate bundle options
  const bundleOptions = useMemo(() => {
    const roleKeys = availableRoles.map(r => r.key)
    const bundles = []

    // Two-role bundles
    for (let i = 0; i < roleKeys.length; i++) {
      for (let j = i + 1; j < roleKeys.length; j++) {
        const roles = [roleKeys[i], roleKeys[j]]
        const basePrice = roles.reduce((sum, key) => sum + ROLE_PRICES[key], 0)
        const discountedPrice = Math.round(basePrice * (1 - BUNDLE_DISCOUNT_TWO))
        const savings = basePrice - discountedPrice
        
        bundles.push({
          id: `bundle-${roles.join('-')}`,
          name: `${ROLE_INFO[roles[0]].name} + ${ROLE_INFO[roles[1]].name}`,
          roles,
          basePrice,
          price: discountedPrice,
          savings,
          discount: BUNDLE_DISCOUNT_TWO
        })
      }
    }

    // All three bundle
    const allRoles = roleKeys
    const allBasePrice = allRoles.reduce((sum, key) => sum + ROLE_PRICES[key], 0)
    const allDiscountedPrice = Math.round(allBasePrice * (1 - BUNDLE_DISCOUNT_ALL))
    const allSavings = allBasePrice - allDiscountedPrice
    
    bundles.push({
      id: 'bundle-all',
      name: 'Complete Access Bundle',
      roles: allRoles,
      basePrice: allBasePrice,
      price: allDiscountedPrice,
      savings: allSavings,
      discount: BUNDLE_DISCOUNT_ALL,
      featured: true
    })

    return bundles
  }, [availableRoles, ROLE_INFO])

  // Calculate total price
  const calculateTotal = useMemo(() => {
    if (selectedProducts.size === 0) return { subtotal: 0, discount: 0, total: 0 }

    const items = Array.from(selectedProducts)
    
    // Check if it's a bundle
    const isSingleBundle = items.length === 1 && items[0].startsWith('bundle-')
    if (isSingleBundle) {
      const bundle = bundleOptions.find(b => b.id === items[0])
      return {
        subtotal: bundle.basePrice,
        discount: bundle.savings,
        total: bundle.price
      }
    }

    // Individual items
    const subtotal = items.reduce((sum, key) => sum + (ROLE_PRICES[key] || 0), 0)
    return { subtotal, discount: 0, total: subtotal }
  }, [selectedProducts, bundleOptions])

  const toggleProduct = (productId) => {
    setSelectedProducts(prev => {
      const newSet = new Set()
      
      // If selecting a bundle, clear all and add bundle
      if (productId.startsWith('bundle-')) {
        if (!prev.has(productId)) {
          newSet.add(productId)
        }
      } else {
        // If selecting individual, clear bundles first
        Array.from(prev).forEach(id => {
          if (!id.startsWith('bundle-')) {
            newSet.add(id)
          }
        })
        
        // Toggle the individual product
        if (prev.has(productId)) {
          newSet.delete(productId)
        } else {
          newSet.add(productId)
        }
      }
      
      return newSet
    })
  }

  const handlePurchase = async () => {
    if (!isConnected || !account) {
      showNotification('Please connect your wallet first', 'error')
      return
    }

    if (selectedProducts.size === 0) {
      showNotification('Please select at least one product', 'error')
      return
    }

    setIsPurchasing(true)
    setPurchaseStep('payment')

    try {
      // Get selected roles
      const selectedItems = Array.from(selectedProducts)
      let rolesToGrant = []
      
      if (selectedItems[0].startsWith('bundle-')) {
        const bundle = bundleOptions.find(b => b.id === selectedItems[0])
        rolesToGrant = bundle.roles
      } else {
        rolesToGrant = selectedItems
      }

      // Simulate payment transaction
      // In production, this would call a smart contract
      const { total } = calculateTotal
      
      // Mock transaction - in production, use ethers/wagmi to send transaction
      await simulatePaymentTransaction(account, total)

      // Grant roles
      for (const role of rolesToGrant) {
        const success = grantRole(role)
        if (!success) {
          throw new Error(`Failed to grant role: ${role}`)
        }
      }

      // Record purchases
      let txHash
      if (import.meta.env.PROD) {
        throw new Error('Mock transaction hash generation is not allowed in production environment.')
      } else {
        txHash = 'MOCK_TX_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11)
      }

      for (const role of rolesToGrant) {
        recordRolePurchase(account, role, {
          price: ROLE_PRICES[role],
          currency: PAYMENT_TOKEN,
          txHash: txHash,
          bundlePurchase: selectedItems[0].startsWith('bundle-')
        })
      }

      showNotification('Purchase successful!', 'success')
      setPurchaseStep('complete')
    } catch (error) {
      console.error('Purchase error:', error)
      showNotification('Purchase failed: ' + error.message, 'error')
      setPurchaseStep('select')
    } finally {
      setIsPurchasing(false)
    }
  }

  const simulatePaymentTransaction = async (fromAddress, amount) => {
    // Simulate blockchain transaction delay
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // In production, this would be replaced with actual transaction:
    // const tx = await contract.purchaseRoles({ value: ethers.utils.parseUnits(amount.toString(), 6) })
    // await tx.wait()
    
    console.log(`Simulated payment: ${amount} ${PAYMENT_TOKEN} from ${fromAddress} to ${PAYMENT_RECEIVER_ADDRESS}`)
  }

  const handleComplete = () => {
    setSelectedProducts(new Set())
    setPurchaseStep('select')
  }

  return (
    <div className="role-purchase-screen">
      <div className="purchase-container">
        {/* Header */}
        <header className="purchase-header">
          <h1>Unlock Premium Access</h1>
          <p className="header-subtitle">
            Choose individual roles or save with bundle packages
          </p>
          {!isConnected && (
            <div className="wallet-warning">
              <span className="warning-icon">⚠️</span>
              Connect your wallet to purchase roles
            </div>
          )}
        </header>

        {purchaseStep === 'select' && (
          <>
            {/* Featured Bundle */}
            <section className="featured-section">
              <div className="section-badge">🌟 BEST VALUE</div>
              <h2>Complete Access Bundle</h2>
              {bundleOptions.filter(b => b.featured).map(bundle => (
                <div
                  key={bundle.id}
                  className={`bundle-card featured ${selectedProducts.has(bundle.id) ? 'selected' : ''}`}
                  onClick={() => toggleProduct(bundle.id)}
                >
                  <div className="bundle-header">
                    <div className="bundle-info">
                      <h3>{bundle.name}</h3>
                      <p className="bundle-includes">
                        Includes all three premium roles
                      </p>
                    </div>
                    <div className="bundle-pricing">
                      <div className="original-price">${bundle.basePrice}</div>
                      <div className="bundle-price">${bundle.price} {PAYMENT_TOKEN}</div>
                      <div className="savings-badge">Save ${bundle.savings} ({Math.round(bundle.discount * 100)}% off)</div>
                    </div>
                  </div>
                  
                  <div className="bundle-benefits">
                    {bundle.roles.map(roleKey => (
                      <div key={roleKey} className="benefit-item">
                        <span className="check-icon">✓</span>
                        <div>
                          <strong>{ROLE_INFO[roleKey].name}</strong>
                          <p>{ROLE_INFO[roleKey].description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </section>

            {/* Individual Products */}
            <section className="products-section">
              <h2>Individual Roles</h2>
              <div className="products-grid">
                {availableRoles.map(role => (
                  <div
                    key={role.key}
                    className={`product-card ${selectedProducts.has(role.key) ? 'selected' : ''} ${role.owned ? 'owned' : ''}`}
                    onClick={() => !role.owned && toggleProduct(role.key)}
                  >
                    {role.owned && <div className="owned-badge">Owned</div>}
                    <div className="product-header">
                      <h3>{role.name}</h3>
                      <div className="product-price">${role.price} {PAYMENT_TOKEN}</div>
                    </div>
                    <p className="product-description">{role.description}</p>
                    <div className="product-features">
                      <h4>Features:</h4>
                      <ul>
                        {getFeaturesList(role.key).map((feature, idx) => (
                          <li key={idx}>{feature}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Two-Role Bundles */}
            <section className="bundles-section">
              <h2>Two-Role Bundles</h2>
              <p className="section-description">Mix and match any two roles and save {Math.round(BUNDLE_DISCOUNT_TWO * 100)}%</p>
              <div className="bundles-grid">
                {bundleOptions.filter(b => !b.featured).map(bundle => (
                  <div
                    key={bundle.id}
                    className={`bundle-card ${selectedProducts.has(bundle.id) ? 'selected' : ''}`}
                    onClick={() => toggleProduct(bundle.id)}
                  >
                    <div className="bundle-header">
                      <h3>{bundle.name}</h3>
                      <div className="bundle-pricing">
                        <div className="original-price">${bundle.basePrice}</div>
                        <div className="bundle-price">${bundle.price} {PAYMENT_TOKEN}</div>
                      </div>
                    </div>
                    <div className="bundle-savings">Save ${bundle.savings}</div>
                    <div className="bundle-includes-list">
                      {bundle.roles.map(roleKey => (
                        <div key={roleKey} className="include-item">
                          <span className="check-icon">✓</span>
                          {ROLE_INFO[roleKey].name}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Purchase Summary */}
            {selectedProducts.size > 0 && (
              <div className="purchase-summary">
                <div className="summary-content">
                  <div className="summary-details">
                    <div className="summary-row">
                      <span>Subtotal:</span>
                      <span>${calculateTotal.subtotal}</span>
                    </div>
                    {calculateTotal.discount > 0 && (
                      <div className="summary-row discount">
                        <span>Bundle Discount:</span>
                        <span>-${calculateTotal.discount}</span>
                      </div>
                    )}
                    <div className="summary-row total">
                      <span>Total:</span>
                      <span>${calculateTotal.total} {PAYMENT_TOKEN}</span>
                    </div>
                  </div>
                  <button
                    onClick={handlePurchase}
                    disabled={isPurchasing || !isConnected}
                    className="purchase-button"
                  >
                    {!isConnected 
                      ? 'Connect Wallet to Purchase'
                      : isPurchasing 
                        ? 'Processing...' 
                        : 'Complete Purchase'
                    }
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {purchaseStep === 'payment' && (
          <div className="payment-processing">
            <div className="loading-spinner">
              <div className="spinner"></div>
            </div>
            <h2>Processing Payment</h2>
            <p>Please confirm the transaction in your wallet...</p>
            <div className="payment-details">
              <div className="detail-row">
                <span>Amount:</span>
                <span>${calculateTotal.total} {PAYMENT_TOKEN}</span>
              </div>
              <div className="detail-row">
                <span>Recipient:</span>
                <span className="address">{PAYMENT_RECEIVER_ADDRESS.substring(0, 10)}...{PAYMENT_RECEIVER_ADDRESS.slice(-8)}</span>
              </div>
            </div>
          </div>
        )}

        {purchaseStep === 'complete' && (
          <div className="payment-complete">
            <div className="success-icon">🎉</div>
            <h2>Purchase Successful!</h2>
            <p>Your roles have been activated. You now have access to premium features.</p>
            <div className="granted-roles">
              <h3>Activated Roles:</h3>
              <ul>
                {Array.from(selectedProducts).flatMap(id => {
                  if (id.startsWith('bundle-')) {
                    const bundle = bundleOptions.find(b => b.id === id)
                    return bundle.roles
                  }
                  return [id]
                }).map(roleKey => (
                  <li key={roleKey}>
                    <span className="check-icon">✓</span>
                    {ROLE_INFO[roleKey].name}
                  </li>
                ))}
              </ul>
            </div>
            <button onClick={handleComplete} className="complete-button">
              Continue
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// Helper function to get features list for each role
function getFeaturesList(roleKey) {
  const features = {
    MARKET_MAKER: [
      'Create prediction markets',
      'Set custom market parameters',
      'Earn fees from market activity',
      'Manage market liquidity'
    ],
    CLEARPATH_USER: [
      'Access DAO governance',
      'Submit and vote on proposals',
      'Participate in futarchy markets',
      'View governance analytics'
    ],
    TOKENMINT: [
      'Mint ERC20 tokens',
      'Create NFT collections',
      'Manage token metadata',
      'Integrate with ETC swap'
    ]
  }
  return features[roleKey] || []
}

export default RolePurchaseScreen
