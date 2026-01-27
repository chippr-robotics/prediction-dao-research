import { useState, useCallback, useMemo, useEffect } from 'react'
import { useRoles } from '../../hooks/useRoles'
import { useWeb3 } from '../../hooks/useWeb3'
import { useWalletTransactions } from '../../hooks/useWalletManagement'
import { useNotification } from '../../hooks/useUI'
import { useTierPrices } from '../../hooks/useTierPrices'
import { recordRolePurchase } from '../../utils/roleStorage'
import { purchaseRoleWithUSC, registerZKKey, getUserTierOnChain } from '../../utils/blockchainService'
import { getTransactionUrl } from '../../config/blockExplorer'
import './PremiumPurchaseModal.css'

/**
 * PremiumPurchaseModal Component
 *
 * Modern, minimalist modal for purchasing premium access roles with tiered membership.
 * Features:
 * - Multi-product selection with checkboxes
 * - Tiered membership (Bronze, Silver, Gold, Platinum)
 * - Clear blockchain transaction warnings
 * - Detailed role information with features and fund destination
 * - Step-based wizard flow
 */

const STEPS = [
  { id: 'select', label: 'Select Role', icon: '1' },
  { id: 'tier', label: 'Choose Tier', icon: '2' },
  { id: 'review', label: 'Review', icon: '3' },
  { id: 'complete', label: 'Complete', icon: '4' }
]

// Shortened steps for upgrade/extend flow
const SHORTENED_STEPS = [
  { id: 'tier', label: 'Choose Tier', icon: '1' },
  { id: 'review', label: 'Review', icon: '2' },
  { id: 'complete', label: 'Complete', icon: '3' }
]

// Membership tiers matching TieredRoleManager contract
const MEMBERSHIP_TIERS = {
  BRONZE: { id: 1, name: 'Bronze', color: '#cd7f32' },
  SILVER: { id: 2, name: 'Silver', color: '#c0c0c0' },
  GOLD: { id: 3, name: 'Gold', color: '#ffd700' },
  PLATINUM: { id: 4, name: 'Platinum', color: '#e5e4e2' }
}

// Tier benefits matching TierLimits struct from TierRegistry contract:
// - dailyBetLimit, weeklyBetLimit, monthlyMarketCreation, maxPositionSize
// - maxConcurrentMarkets, withdrawalLimit, canCreatePrivateMarkets
// - canUseAdvancedFeatures, feeDiscount (basis points)
const TIER_BENEFITS = {
  BRONZE: {
    dailyBetLimit: 10,
    weeklyBetLimit: 50,
    monthlyMarketCreation: 5,
    maxPositionSize: '100 USC',
    maxConcurrentMarkets: 3,
    withdrawalLimit: '500 USC',
    canCreatePrivateMarkets: false,
    canUseAdvancedFeatures: false,
    feeDiscount: 0,
    duration: '30 days'
  },
  SILVER: {
    dailyBetLimit: 25,
    weeklyBetLimit: 125,
    monthlyMarketCreation: 15,
    maxPositionSize: '500 USC',
    maxConcurrentMarkets: 10,
    withdrawalLimit: '2,000 USC',
    canCreatePrivateMarkets: false,
    canUseAdvancedFeatures: true,
    feeDiscount: 5,
    duration: '30 days'
  },
  GOLD: {
    dailyBetLimit: 50,
    weeklyBetLimit: 250,
    monthlyMarketCreation: 30,
    maxPositionSize: '2,000 USC',
    maxConcurrentMarkets: 25,
    withdrawalLimit: '10,000 USC',
    canCreatePrivateMarkets: true,
    canUseAdvancedFeatures: true,
    feeDiscount: 10,
    duration: '30 days'
  },
  PLATINUM: {
    dailyBetLimit: 'Unlimited',
    weeklyBetLimit: 'Unlimited',
    monthlyMarketCreation: 'Unlimited',
    maxPositionSize: 'Unlimited',
    maxConcurrentMarkets: 'Unlimited',
    withdrawalLimit: 'Unlimited',
    canCreatePrivateMarkets: true,
    canUseAdvancedFeatures: true,
    feeDiscount: 20,
    duration: '30 days'
  }
}

// Extended role information with features and fund destination
const ROLE_DETAILS = {
  MARKET_MAKER: {
    icon: '📊',
    tagline: 'Create prediction markets',
    features: [
      'Create prediction markets',
      'Set custom market parameters',
      'Earn fees from trading activity',
      'Access analytics dashboard'
    ],
    fundsDestination: 'DAO Treasury',
    fundsUsage: 'Funds support protocol development and liquidity'
  },
  CLEARPATH_USER: {
    icon: '🔐',
    tagline: 'DAO governance access',
    features: [
      'Full DAO governance participation',
      'Vote on proposals',
      'Access ZK-protected features',
      'View organizational reports'
    ],
    fundsDestination: 'DAO Treasury',
    fundsUsage: 'Funds support governance infrastructure'
  },
  TOKENMINT: {
    icon: '🪙',
    tagline: 'Token creation tools',
    features: [
      'Mint custom ERC20 tokens',
      'Create NFT collections',
      'Integrate with ETC swap',
      'Token management tools'
    ],
    fundsDestination: 'DAO Treasury',
    fundsUsage: 'Funds support smart contract maintenance'
  },
  FRIEND_MARKET: {
    icon: '👥',
    tagline: 'Private markets with friends',
    features: [
      'Create private 1v1 markets',
      'Small group competitions',
      'Share via QR codes',
      'Custom arbitrators'
    ],
    fundsDestination: 'DAO Treasury',
    fundsUsage: 'Funds support social features'
  }
}

// Role-specific benefit categories
// Each role type shows different relevant limits/features
const ROLE_BENEFIT_CATEGORIES = {
  TOKENMINT: {
    type: 'token_creation',
    tierBenefits: {
      BRONZE: { tokenCreations: 5, nftCollections: 2, etcSwapListing: false, advancedFeatures: false },
      SILVER: { tokenCreations: 15, nftCollections: 10, etcSwapListing: true, advancedFeatures: true },
      GOLD: { tokenCreations: 50, nftCollections: 25, etcSwapListing: true, advancedFeatures: true },
      PLATINUM: { tokenCreations: 'Unlimited', nftCollections: 'Unlimited', etcSwapListing: true, advancedFeatures: true }
    }
  },
  CLEARPATH_USER: {
    type: 'governance',
    tierBenefits: {
      BRONZE: { proposalsPerMonth: 3, daosManaged: 2, zkPrivacy: true, advancedAnalytics: false },
      SILVER: { proposalsPerMonth: 10, daosManaged: 5, zkPrivacy: true, advancedAnalytics: true },
      GOLD: { proposalsPerMonth: 25, daosManaged: 10, zkPrivacy: true, advancedAnalytics: true },
      PLATINUM: { proposalsPerMonth: 'Unlimited', daosManaged: 'Unlimited', zkPrivacy: true, advancedAnalytics: true }
    }
  },
  FRIEND_MARKET: {
    type: 'betting',
    useLegacyBenefits: true
  },
  MARKET_MAKER: {
    type: 'betting',
    useLegacyBenefits: true
  }
}

// Note: Tier prices are now fetched from TierRegistry contract via useTierPrices hook
// All prices are in USC (stablecoin) - ETC is only used for gas

/**
 * RoleBenefitsDisplay - Renders role-specific tier benefits
 * Shows different limits/features based on role type (token, governance, betting)
 */
function RoleBenefitsDisplay({ roleKey, tierName, chainLimits }) {
  const category = ROLE_BENEFIT_CATEGORIES[roleKey]

  if (!category) return null

  // Token creation role (TOKENMINT)
  if (category.type === 'token_creation') {
    const benefits = category.tierBenefits[tierName]
    return (
      <div className="ppm-tier-limits ppm-tier-limits--tokens">
        <div className="ppm-limit-item">
          <span className="ppm-limit-label">Tokens/Month:</span>
          <span className="ppm-limit-value">{benefits.tokenCreations}</span>
        </div>
        <div className="ppm-limit-item">
          <span className="ppm-limit-label">NFT Collections:</span>
          <span className="ppm-limit-value">{benefits.nftCollections}</span>
        </div>
        <div className="ppm-limit-item">
          <span className="ppm-limit-label">ETCSwap Listing:</span>
          <span className="ppm-limit-value">{benefits.etcSwapListing ? 'Yes' : 'No'}</span>
        </div>
        <div className="ppm-limit-item">
          <span className="ppm-limit-label">Advanced Features:</span>
          <span className="ppm-limit-value">{benefits.advancedFeatures ? 'Yes' : 'No'}</span>
        </div>
      </div>
    )
  }

  // Governance role (CLEARPATH_USER)
  if (category.type === 'governance') {
    const benefits = category.tierBenefits[tierName]
    return (
      <div className="ppm-tier-limits ppm-tier-limits--governance">
        <div className="ppm-limit-item">
          <span className="ppm-limit-label">Proposals/Month:</span>
          <span className="ppm-limit-value">{benefits.proposalsPerMonth}</span>
        </div>
        <div className="ppm-limit-item">
          <span className="ppm-limit-label">DAOs Managed:</span>
          <span className="ppm-limit-value">{benefits.daosManaged}</span>
        </div>
        <div className="ppm-limit-item">
          <span className="ppm-limit-label">ZK Privacy:</span>
          <span className="ppm-limit-value">{benefits.zkPrivacy ? 'Enabled' : 'No'}</span>
        </div>
        <div className="ppm-limit-item">
          <span className="ppm-limit-label">Advanced Analytics:</span>
          <span className="ppm-limit-value">{benefits.advancedAnalytics ? 'Yes' : 'No'}</span>
        </div>
      </div>
    )
  }

  // Betting roles (FRIEND_MARKET, MARKET_MAKER) - use legacy benefits or chain limits
  const benefits = chainLimits || TIER_BENEFITS[tierName]
  return (
    <div className="ppm-tier-limits">
      <div className="ppm-limit-item">
        <span className="ppm-limit-label">Daily Bets:</span>
        <span className="ppm-limit-value">{benefits.dailyBetLimit}</span>
      </div>
      <div className="ppm-limit-item">
        <span className="ppm-limit-label">Weekly Bets:</span>
        <span className="ppm-limit-value">{benefits.weeklyBetLimit}</span>
      </div>
      <div className="ppm-limit-item">
        <span className="ppm-limit-label">Markets/Month:</span>
        <span className="ppm-limit-value">{benefits.monthlyMarketCreation}</span>
      </div>
      <div className="ppm-limit-item">
        <span className="ppm-limit-label">Max Position:</span>
        <span className="ppm-limit-value">{benefits.maxPositionSize}</span>
      </div>
      <div className="ppm-limit-item">
        <span className="ppm-limit-label">Active Markets:</span>
        <span className="ppm-limit-value">{benefits.maxConcurrentMarkets}</span>
      </div>
      <div className="ppm-limit-item">
        <span className="ppm-limit-label">Daily Withdrawals:</span>
        <span className="ppm-limit-value">{benefits.withdrawalLimit}</span>
      </div>
    </div>
  )
}

/**
 * RoleBenefitFeatures - Renders role-specific feature checkmarks
 */
function RoleBenefitFeatures({ roleKey, tierName, chainLimits }) {
  const category = ROLE_BENEFIT_CATEGORIES[roleKey]

  if (!category) return null

  // Token creation features
  if (category.type === 'token_creation') {
    const benefits = category.tierBenefits[tierName]
    return (
      <ul className="ppm-tier-features">
        <li>
          <span className="ppm-feature-check" aria-hidden="true">✓</span>
          Create ERC20 Tokens
        </li>
        <li>
          <span className="ppm-feature-check" aria-hidden="true">✓</span>
          Create NFT Collections
        </li>
        {benefits.etcSwapListing && (
          <li>
            <span className="ppm-feature-check" aria-hidden="true">✓</span>
            ETCSwap Integration
          </li>
        )}
        {benefits.advancedFeatures && (
          <li>
            <span className="ppm-feature-check" aria-hidden="true">✓</span>
            Advanced Token Features
          </li>
        )}
      </ul>
    )
  }

  // Governance features
  if (category.type === 'governance') {
    const benefits = category.tierBenefits[tierName]
    return (
      <ul className="ppm-tier-features">
        <li>
          <span className="ppm-feature-check" aria-hidden="true">✓</span>
          DAO Governance Access
        </li>
        <li>
          <span className="ppm-feature-check" aria-hidden="true">✓</span>
          Vote on Proposals
        </li>
        {benefits.zkPrivacy && (
          <li>
            <span className="ppm-feature-check" aria-hidden="true">✓</span>
            ZK Privacy Features
          </li>
        )}
        {benefits.advancedAnalytics && (
          <li>
            <span className="ppm-feature-check" aria-hidden="true">✓</span>
            Advanced Analytics
          </li>
        )}
      </ul>
    )
  }

  // Betting features
  const benefits = chainLimits || TIER_BENEFITS[tierName]
  return (
    <ul className="ppm-tier-features">
      {benefits.canCreatePrivateMarkets && (
        <li>
          <span className="ppm-feature-check" aria-hidden="true">✓</span>
          Private Markets
        </li>
      )}
      {benefits.canUseAdvancedFeatures && (
        <li>
          <span className="ppm-feature-check" aria-hidden="true">✓</span>
          Advanced Features
        </li>
      )}
      {benefits.feeDiscount > 0 && (
        <li>
          <span className="ppm-feature-check" aria-hidden="true">✓</span>
          {benefits.feeDiscount}% Fee Discount
        </li>
      )}
    </ul>
  )
}

/**
 * PremiumPurchaseModal Component
 *
 * @param {boolean} isOpen - Whether the modal is open
 * @param {function} onClose - Close handler
 * @param {string} preselectedRole - Role to pre-select (e.g., 'FRIEND_MARKET')
 * @param {string} action - Action type: 'purchase', 'upgrade', or 'extend'
 */
function PremiumPurchaseModal({ isOpen = true, onClose, preselectedRole = null, action = 'purchase' }) {
  const { ROLE_INFO, grantRole, hasRole, loadRoles } = useRoles()
  const { account, isConnected, isCorrectNetwork, switchNetwork, chainId } = useWeb3()
  const { signer } = useWalletTransactions()
  const { showNotification } = useNotification()

  // Normalize preselectedRole - ensure it's a string, not an object
  // This prevents crashes when an object is accidentally passed instead of a role name string
  const normalizedRole = useMemo(() => {
    if (!preselectedRole) return null
    if (typeof preselectedRole === 'object') {
      console.warn('[PremiumPurchaseModal] preselectedRole was an object, extracting roleName:', preselectedRole)
      return preselectedRole.roleName || preselectedRole.name || null
    }
    return preselectedRole
  }, [preselectedRole])

  // Determine if this is an upgrade/extend flow
  const isUpgradeFlow = action === 'upgrade'
  const isExtendFlow = action === 'extend'

  // Step navigation - skip role selection if preselected for upgrade/extend
  const [currentStep, setCurrentStep] = useState(
    normalizedRole && (isUpgradeFlow || isExtendFlow) ? 1 : 0
  )

  // Selected roles (multi-select) - pre-select if provided
  const [selectedRoles, setSelectedRoles] = useState(
    normalizedRole ? [normalizedRole] : []
  )

  // Selected tier
  const [selectedTier, setSelectedTier] = useState('BRONZE')

  // ZK key for ClearPath (optional)
  const [zkPublicKey, setZkPublicKey] = useState('')

  // UI state
  const [isPurchasing, setIsPurchasing] = useState(false)
  const [purchaseResults, setPurchaseResults] = useState([])
  const [errors, setErrors] = useState({})

  // Track user's current tier for each role (fetched from blockchain)
  const [userCurrentTiers, setUserCurrentTiers] = useState({})
  const [isLoadingTiers, setIsLoadingTiers] = useState(false)

  // Fetch tier prices and limits from contract
  const { getPrice, getTotalPrice, getLimits } = useTierPrices()

  // Calculate pricing based on tier (uses prices from contract)
  const pricing = useMemo(() => {
    const total = getTotalPrice(selectedRoles, selectedTier)
    const roleCount = selectedRoles.length

    return {
      total,
      roleCount
    }
  }, [selectedRoles, selectedTier, getTotalPrice])

  // Fetch user's current tier for selected roles
  const fetchUserTiers = useCallback(async () => {
    if (!account || selectedRoles.length === 0) return

    setIsLoadingTiers(true)
    try {
      const tiers = {}
      for (const role of selectedRoles) {
        const { tier, tierName } = await getUserTierOnChain(account, role)
        tiers[role] = { tier, tierName }
      }
      setUserCurrentTiers(tiers)
      console.log('[PremiumPurchaseModal] User current tiers:', tiers)

      // Auto-select the minimum valid tier (current + 1, but at least BRONZE)
      const maxCurrentTier = Math.max(...selectedRoles.map(r => tiers[r]?.tier || 0))
      const minSelectableTier = maxCurrentTier + 1

      if (minSelectableTier <= 4) {
        const tierKeys = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM']
        const defaultTier = tierKeys[minSelectableTier - 1] || 'BRONZE'
        setSelectedTier(defaultTier)
      }
    } catch (error) {
      console.error('[PremiumPurchaseModal] Error fetching user tiers:', error)
    } finally {
      setIsLoadingTiers(false)
    }
  }, [account, selectedRoles])

  // Fetch tiers when moving to tier step
  useEffect(() => {
    if (currentStep === 1) {
      fetchUserTiers()
    }
  }, [currentStep, fetchUserTiers])

  // Calculate highest current tier across selected roles
  const highestCurrentTier = useMemo(() => {
    if (selectedRoles.length === 0) return 0
    return Math.max(...selectedRoles.map(r => userCurrentTiers[r]?.tier || 0))
  }, [selectedRoles, userCurrentTiers])

  // Filter tiers to only show upgrades (tier > current) or same tier for extend
  const availableTiers = useMemo(() => {
    if (isExtendFlow) {
      // For extend, show current tier and higher tiers
      return Object.entries(MEMBERSHIP_TIERS).filter(([, tier]) => tier.id >= highestCurrentTier)
    }
    // For upgrade/purchase, show only higher tiers
    return Object.entries(MEMBERSHIP_TIERS).filter(([, tier]) => tier.id > highestCurrentTier)
  }, [highestCurrentTier, isExtendFlow])

  // Reset form
  const resetForm = useCallback(() => {
    setCurrentStep(normalizedRole && (isUpgradeFlow || isExtendFlow) ? 1 : 0)
    setSelectedRoles(normalizedRole ? [normalizedRole] : [])
    setSelectedTier('BRONZE')
    setZkPublicKey('')
    setPurchaseResults([])
    setErrors({})
    setIsPurchasing(false)
    setUserCurrentTiers({})
  }, [normalizedRole, isUpgradeFlow, isExtendFlow])

  // Handle role toggle
  const handleRoleToggle = useCallback((roleKey) => {
    setSelectedRoles(prev => {
      if (prev.includes(roleKey)) {
        return prev.filter(r => r !== roleKey)
      }
      return [...prev, roleKey]
    })
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
      // Check if user already has max tier
      if (highestCurrentTier >= 4) {
        newErrors.tier = 'You already have the maximum tier (Platinum)'
      }
      // Check if a valid tier is selected
      const selectedTierInfo = MEMBERSHIP_TIERS[selectedTier]
      if (!selectedTierInfo || selectedTierInfo.id <= highestCurrentTier) {
        newErrors.tier = 'Please select a higher tier'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [selectedRoles, highestCurrentTier, selectedTier])

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

  // Get a verified signer that is authorized for the connected account
  // Always requests fresh authorization to avoid stale signer issues after rejected transactions
  const getVerifiedSigner = async () => {
    if (!window.ethereum) {
      throw new Error('No wallet detected. Please install MetaMask or another Web3 wallet.')
    }

    try {
      // Always request fresh authorization - this handles cases where:
      // 1. User previously rejected a transaction (signer becomes stale)
      // 2. User switched accounts in the wallet
      // 3. Wallet session expired
      console.log('[PremiumPurchaseModal] Requesting wallet authorization...')
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })

      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts returned from wallet')
      }

      // Verify the returned account matches the expected connected account
      const authorizedAccount = accounts[0].toLowerCase()
      const expectedAccount = account?.toLowerCase()

      if (expectedAccount && authorizedAccount !== expectedAccount) {
        console.warn('[PremiumPurchaseModal] Account mismatch:', {
          authorized: authorizedAccount,
          expected: expectedAccount
        })
        throw new Error(`Wallet account mismatch. Expected ${account?.slice(0, 8)}... but got ${accounts[0].slice(0, 8)}...`)
      }

      // Create fresh provider and signer with the authorized account
      const { ethers } = await import('ethers')
      const freshProvider = new ethers.BrowserProvider(window.ethereum)
      const freshSigner = await freshProvider.getSigner()

      // Double-check the signer address
      const signerAddress = await freshSigner.getAddress()
      console.log('[PremiumPurchaseModal] Signer address:', signerAddress)
      console.log('[PremiumPurchaseModal] Connected address:', account)

      if (signerAddress.toLowerCase() !== authorizedAccount) {
        throw new Error('Signer address does not match authorized account')
      }

      console.log('[PremiumPurchaseModal] Fresh signer obtained successfully')
      return freshSigner
    } catch (error) {
      console.error('[PremiumPurchaseModal] Failed to get verified signer:', error)

      // Provide user-friendly error messages
      if (error.code === 4001) {
        throw new Error('You rejected the wallet connection request. Please try again and approve the connection.')
      }
      if (error.code === 4100) {
        throw new Error('The wallet account is not authorized. Please reconnect your wallet.')
      }

      throw new Error(`Wallet authorization failed: ${error.message}`)
    }
  }

  // Purchase handler
  const handlePurchase = async () => {
    if (!isConnected || !account) {
      showNotification('Please connect your wallet first', 'error')
      return
    }

    if (!isCorrectNetwork) {
      showNotification('Please switch to the correct network', 'error')
      return
    }

    setIsPurchasing(true)
    const results = []
    const tierValue = MEMBERSHIP_TIERS[selectedTier].id
    const tierName = MEMBERSHIP_TIERS[selectedTier].name

    try {
      // Get a verified signer before starting transactions
      const verifiedSigner = await getVerifiedSigner()

      const transactionCount = selectedRoles.length
      const notificationMessage =
        transactionCount > 1
          ? `You will need to confirm ${transactionCount} separate transactions (${tierName} tier, total ${pricing.total} USC).`
          : `Please confirm the transaction in your wallet (${tierName} tier, ${pricing.total} USC)`

      showNotification(notificationMessage, 'info', 10000)

      // Process each role purchase
      for (const roleKey of selectedRoles) {
        const roleName = ROLE_INFO[roleKey].name
        const price = getPrice(roleKey, selectedTier)

        try {
          // Execute blockchain transaction with verified signer
          const receipt = await purchaseRoleWithUSC(verifiedSigner, roleName, price, tierValue)

          // Grant the role to the current user
          grantRole(roleKey)

          // Record the purchase
          recordRolePurchase(account, roleKey, {
            price: price,
            currency: 'USC',
            tier: selectedTier,
            tierValue: tierValue,
            txHash: receipt.hash,
            purchasedBy: account
          })

          results.push({
            role: roleKey,
            roleName,
            tier: tierName,
            success: true,
            txHash: receipt.hash
          })
        } catch (error) {
          console.error(`Error purchasing ${roleName}:`, error)
          results.push({
            role: roleKey,
            roleName,
            tier: tierName,
            success: false,
            error: error.message
          })
        }
      }

      // Handle ZK key registration for ClearPath (optional)
      if (zkPublicKey.trim() && selectedRoles.includes('CLEARPATH_USER')) {
        try {
          await registerZKKey(verifiedSigner, zkPublicKey.trim())
          showNotification('ZK key registered successfully', 'success', 5000)
        } catch (zkError) {
          console.error('ZK key registration failed:', zkError)
          showNotification(
            'Role purchased successfully, but ZK key registration failed. You can register your key later.',
            'warning',
            7000
          )
        }
      }

      setPurchaseResults(results)

      const successCount = results.filter(r => r.success).length

      if (successCount > 0) {
        try {
          await loadRoles()
        } catch (refreshError) {
          console.warn('Failed to refresh roles from blockchain:', refreshError)
        }
      }

      if (successCount === selectedRoles.length) {
        showNotification(
          `Successfully purchased ${successCount} role${successCount > 1 ? 's' : ''} (${tierName})!`,
          'success',
          7000
        )
        setCurrentStep(3) // Complete step
      } else if (successCount > 0) {
        showNotification(
          `Partially completed: ${successCount}/${selectedRoles.length} roles purchased.`,
          'warning',
          10000
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

  const requiresZkKey = selectedRoles.includes('CLEARPATH_USER')
  const tierInfo = MEMBERSHIP_TIERS[selectedTier]
  const tierBenefits = TIER_BENEFITS[selectedTier]

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
            <h2 id="ppm-title">
              {isUpgradeFlow ? 'Upgrade Membership' : isExtendFlow ? 'Extend Membership' : 'Purchase Premium Access'}
            </h2>
            <p className="ppm-subtitle">
              {isUpgradeFlow
                ? 'Upgrade to a higher tier for increased limits'
                : isExtendFlow
                ? 'Extend your membership before it expires'
                : 'Unlock powerful features with tiered membership'}
            </p>
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
          {(normalizedRole && (isUpgradeFlow || isExtendFlow) ? SHORTENED_STEPS : STEPS).map((step, index) => {
            // Map display index to actual step index
            const actualIndex = normalizedRole && (isUpgradeFlow || isExtendFlow) ? index + 1 : index
            const isActive = actualIndex === currentStep
            const isCompleted = actualIndex < currentStep

            return (
              <button
                key={step.id}
                className={`ppm-step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
                onClick={() => handleStepClick(actualIndex)}
                disabled={isPurchasing || actualIndex > currentStep}
                aria-current={isActive ? 'step' : undefined}
              >
                <span className="ppm-step-icon" aria-hidden="true">
                  {isCompleted ? '✓' : step.icon}
                </span>
                <span className="ppm-step-label">{step.label}</span>
              </button>
            )
          })}
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
                    Choose one or more roles to unlock. You'll select your membership tier next.
                  </p>
                </div>

                <div className="ppm-roles-grid">
                  {Object.entries(ROLE_INFO)
                    .filter(([roleKey]) => getPrice(roleKey, 'BRONZE'))
                    .map(([roleKey, roleInfo]) => {
                      const details = ROLE_DETAILS[roleKey]
                      const isSelected = selectedRoles.includes(roleKey)
                      const isOwned = hasRole && hasRole(roleKey)
                      const bronzePrice = getPrice(roleKey, 'BRONZE')

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
                                <span className="ppm-role-price">from ${bronzePrice} USC</span>
                              </div>

                              <ul className="ppm-role-features">
                                {details?.features.map((feature, idx) => (
                                  <li key={idx}>
                                    <span className="ppm-feature-check" aria-hidden="true">✓</span>
                                    {feature}
                                  </li>
                                ))}
                              </ul>

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
              </section>
            </div>
          )}

          {/* Step 2: Choose Tier */}
          {currentStep === 1 && (
            <div className="ppm-panel" role="tabpanel">
              <section className="ppm-section">
                <div className="ppm-section-header">
                  <h3 className="ppm-section-title">
                    <span aria-hidden="true">🏆</span>
                    {isExtendFlow ? 'Extend or Upgrade Membership' : 'Choose Membership Tier'}
                  </h3>
                  <p className="ppm-section-desc">
                    {isExtendFlow
                      ? 'Renew at your current tier or upgrade for higher limits.'
                      : 'Higher tiers unlock more features and higher limits.'}
                  </p>
                </div>

                {/* Show selected role when in upgrade/extend mode */}
                {normalizedRole && (isUpgradeFlow || isExtendFlow) && (
                  <div className="ppm-info-card ppm-selected-role-info">
                    <span className="ppm-info-icon" aria-hidden="true">
                      {ROLE_DETAILS[normalizedRole]?.icon || '⭐'}
                    </span>
                    <div>
                      <strong>{isExtendFlow ? 'Extending' : 'Upgrading'}: {ROLE_INFO[normalizedRole]?.name}</strong>
                      <p>{ROLE_DETAILS[normalizedRole]?.tagline}</p>
                    </div>
                  </div>
                )}

                {/* Show loading state while fetching tiers */}
                {isLoadingTiers && (
                  <div className="ppm-loading-tiers">
                    <div className="ppm-spinner" aria-hidden="true"></div>
                    <p>Checking your current membership tier...</p>
                  </div>
                )}

                {/* Show current tier info if user has existing membership */}
                {!isLoadingTiers && highestCurrentTier > 0 && (
                  <div className="ppm-info-card ppm-current-tier-info">
                    <span className="ppm-info-icon" aria-hidden="true">ℹ️</span>
                    <div>
                      <strong>Current Membership</strong>
                      <p>
                        You currently have{' '}
                        <span
                          className="ppm-tier-badge"
                          style={{ backgroundColor: Object.values(MEMBERSHIP_TIERS)[highestCurrentTier - 1]?.color }}
                        >
                          {Object.values(MEMBERSHIP_TIERS)[highestCurrentTier - 1]?.name}
                        </span>
                        {' '}tier. You can only upgrade to a higher tier.
                      </p>
                    </div>
                  </div>
                )}

                {/* Show max tier message if user already has Platinum */}
                {!isLoadingTiers && highestCurrentTier >= 4 && (
                  <div className="ppm-warning-card">
                    <span className="ppm-warning-icon" aria-hidden="true">🎉</span>
                    <div className="ppm-warning-content">
                      <strong>Maximum Tier Reached</strong>
                      <p>
                        You already have Platinum tier - the highest membership level!
                        There are no upgrades available for the selected role(s).
                      </p>
                    </div>
                  </div>
                )}

                {/* Tier selection grid - only show available tiers */}
                {!isLoadingTiers && availableTiers.length > 0 && (
                  <div className="ppm-tier-grid">
                    {availableTiers.map(([tierKey, tier]) => {
                      const tierTotal = selectedRoles.reduce((sum, role) => sum + getPrice(role, tierKey), 0)
                      const isSelected = selectedTier === tierKey
                      const primaryRole = selectedRoles[0]
                      const chainLimits = getLimits(primaryRole, tierKey)

                      return (
                        <label
                          key={tierKey}
                          className={`ppm-tier-card ${isSelected ? 'selected' : ''}`}
                          style={{ '--tier-color': tier.color }}
                        >
                          <input
                            type="radio"
                            name="tier"
                            value={tierKey}
                            checked={isSelected}
                            onChange={() => setSelectedTier(tierKey)}
                            disabled={isPurchasing}
                            className="ppm-tier-radio"
                          />
                          <div className="ppm-tier-content">
                            <div className="ppm-tier-header">
                              <span
                                className="ppm-tier-badge"
                                style={{ backgroundColor: tier.color }}
                              >
                                {tier.name}
                              </span>
                              <span className="ppm-tier-price">${tierTotal} USC</span>
                            </div>

                            {/* Single role: show that role's specific benefits */}
                            {selectedRoles.length === 1 && (
                              <>
                                <RoleBenefitsDisplay
                                  roleKey={primaryRole}
                                  tierName={tierKey}
                                  chainLimits={chainLimits}
                                />
                                <RoleBenefitFeatures
                                  roleKey={primaryRole}
                                  tierName={tierKey}
                                  chainLimits={chainLimits}
                                />
                              </>
                            )}

                            {/* Multiple roles: show grouped benefits per role */}
                            {selectedRoles.length > 1 && (
                              <div className="ppm-multi-role-benefits">
                                {selectedRoles.map(roleKey => {
                                  const roleChainLimits = getLimits(roleKey, tierKey)
                                  return (
                                    <div key={roleKey} className="ppm-role-benefit-section">
                                      <h5>
                                        {ROLE_DETAILS[roleKey]?.icon} {ROLE_INFO[roleKey]?.name}
                                      </h5>
                                      <RoleBenefitsDisplay
                                        roleKey={roleKey}
                                        tierName={tierKey}
                                        chainLimits={roleChainLimits}
                                      />
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        </label>
                      )
                    })}
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
                      <li>Membership is valid for <strong>{tierBenefits?.duration}</strong></li>
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

                  <div className="ppm-review-tier">
                    <span className="ppm-review-label">Membership Tier</span>
                    <span
                      className="ppm-tier-badge"
                      style={{ backgroundColor: tierInfo?.color }}
                    >
                      {tierInfo?.name}
                    </span>
                  </div>

                  <div className="ppm-review-roles">
                    <span className="ppm-review-label">Selected Roles</span>
                    <div className="ppm-review-roles-list">
                      {selectedRoles.map(roleKey => {
                        const roleInfo = ROLE_INFO[roleKey]
                        const details = ROLE_DETAILS[roleKey]
                        const rolePrice = getPrice(roleKey, selectedTier)
                        return (
                          <div key={roleKey} className="ppm-review-role-item">
                            <div className="ppm-review-role-info">
                              <span className="ppm-review-role-icon" aria-hidden="true">
                                {details?.icon}
                              </span>
                              <div>
                                <span className="ppm-review-role-name">{roleInfo.name}</span>
                                <span className="ppm-review-role-duration">{tierBenefits?.duration}</span>
                              </div>
                            </div>
                            <span className="ppm-review-role-price">${rolePrice} USC</span>
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
                      DAO Treasury to support protocol development and community initiatives.
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
                  Your <strong style={{ color: tierInfo?.color }}>{tierInfo?.name}</strong> membership has been activated.
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
                          <span className="ppm-result-status">
                            {result.tier} - Activated
                          </span>
                        ) : (
                          <span className="ppm-result-error">{result.error}</span>
                        )}
                      </div>
                      {result.txHash && (
                        <a
                          href={getTransactionUrl(chainId || 63, result.txHash)}
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

                {/* Tier Benefits - Per Role */}
                <div className="ppm-tier-summary">
                  <h4>Your {tierInfo?.name} Benefits</h4>
                  {selectedRoles.map(roleKey => {
                    const roleChainLimits = getLimits(roleKey, selectedTier)
                    return (
                      <div key={roleKey} className="ppm-role-summary-section">
                        <h5>{ROLE_DETAILS[roleKey]?.icon} {ROLE_INFO[roleKey]?.name}</h5>
                        <RoleBenefitsDisplay
                          roleKey={roleKey}
                          tierName={selectedTier}
                          chainLimits={roleChainLimits}
                        />
                      </div>
                    )
                  })}
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
                        Create your first friend market
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
