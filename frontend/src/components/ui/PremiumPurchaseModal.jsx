import { useState, useCallback, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRoles } from '../../hooks/useRoles'
import { useWeb3 } from '../../hooks/useWeb3'
import { useNotification } from '../../hooks/useUI'
import { useTierPrices } from '../../hooks/useTierPrices'
import { useEncryption } from '../../hooks/useEncryption'
import { recordRolePurchase } from '../../utils/roleStorage'
import { getUserTierOnChain } from '../../utils/blockchainService'
import { getCurrentDocument } from '../../utils/legalDocs'
import { getContractAddressForChain } from '../../config/contracts'
import { ACCOUNT_MODERATION_PATH } from '../../constants/legalLinks'
import MembershipAttestation from '../compliance/MembershipAttestation'
import { getTransactionUrl } from '../../config/blockExplorer'
import { usePurchaseFlow } from '../../hooks/usePurchaseFlow'
import PurchaseProgressView from './PurchaseProgressView'
import './PremiumPurchaseModal.css'

/**
 * PremiumPurchaseModal — tier-selection flow for the single paid role
 * (`WAGER_PARTICIPANT`). All tier benefits are framed around peer-to-peer
 * wagers because that is the only thing the new on-chain `Limits` struct
 * gates: `monthlyMarketCreation` and `maxConcurrentMarkets`.
 *
 * Steps:
 *   1. Choose tier
 *   2. Review (with required acknowledgement of pause + freeze powers)
 *   3. Complete
 */

const STEPS = [
  { id: 'tier',     label: 'Choose Tier', icon: '1' },
  { id: 'review',   label: 'Review',      icon: '2' },
  { id: 'complete', label: 'Complete',    icon: '3' },
]

const MEMBERSHIP_TIERS = {
  BRONZE:   { id: 1, name: 'Bronze',   color: '#cd7f32' },
  SILVER:   { id: 2, name: 'Silver',   color: '#c0c0c0' },
  GOLD:     { id: 3, name: 'Gold',     color: '#ffd700' },
  PLATINUM: { id: 4, name: 'Platinum', color: '#e5e4e2' },
}

// UI fallbacks — overridden by on-chain `Limits` from `useTierPrices.getLimits`.
const TIER_FALLBACK_LIMITS = {
  BRONZE:   { monthlyMarketCreation: 15,  maxConcurrentMarkets: 5,  duration: '30 days' },
  SILVER:   { monthlyMarketCreation: 30,  maxConcurrentMarkets: 10, duration: '30 days' },
  GOLD:     { monthlyMarketCreation: 100, maxConcurrentMarkets: 30, duration: '30 days' },
  PLATINUM: { monthlyMarketCreation: 0,   maxConcurrentMarkets: 0,  duration: '30 days' },
}

const ROLE_KEY = 'WAGER_PARTICIPANT'

const ROLE_COPY = {
  icon: '🎲',
  tagline: 'Create and accept peer-to-peer wagers',
  features: [
    'Create 1v1 wagers in USDC or WMATIC',
    'Self-resolve, third-party arbitrator, or Polymarket auto-resolve',
    'Share via QR code or direct link',
    'Escrow + refund protection if a counterparty no-shows',
  ],
}

const fmtLimit = (v) => (v === 0 || v === '0' || v === null || v === undefined) ? 'Unlimited' : v

function TierLimits({ tierName, chainLimits }) {
  const fb = TIER_FALLBACK_LIMITS[tierName] || {}
  const monthly = chainLimits?.monthlyMarketCreation ?? fb.monthlyMarketCreation
  const concurrent = chainLimits?.maxConcurrentMarkets ?? fb.maxConcurrentMarkets
  return (
    <div className="ppm-tier-limits">
      <div className="ppm-limit-item">
        <span className="ppm-limit-label">Wagers / month:</span>
        <span className="ppm-limit-value">{fmtLimit(monthly)}</span>
      </div>
      <div className="ppm-limit-item">
        <span className="ppm-limit-label">Open wagers at once:</span>
        <span className="ppm-limit-value">{fmtLimit(concurrent)}</span>
      </div>
    </div>
  )
}

/**
 * @param {object}   props
 * @param {boolean}  props.isOpen
 * @param {function} props.onClose
 * @param {string}   [props.action]  - 'purchase' (default), 'upgrade', or 'extend'
 */
function PremiumPurchaseModal({ isOpen = true, onClose, action = 'purchase' }) {
  const { grantRole, loadRoles } = useRoles()
  const { account, isConnected, isCorrectNetwork, switchNetwork, chainId } = useWeb3()
  const { showNotification } = useNotification()
  const { getPrice, getLimits, usingFallbackPrices } = useTierPrices()
  const { ensureInitialized } = useEncryption()
  const flow = usePurchaseFlow()
  const navigate = useNavigate()

  const isUpgradeFlow = action === 'upgrade'
  const isExtendFlow = action === 'extend'

  // The voucher rail (spec 026) is a parallel way to get the same membership:
  // buy a transferable voucher to gift/resell, or redeem one you hold. It lives
  // on the dedicated /vouchers view; only surface the entry point where the
  // voucher contracts are actually deployed for the connected chain.
  const voucherAvailable = Boolean(
    getContractAddressForChain('membershipVoucher', chainId) &&
    getContractAddressForChain('membershipManager', chainId)
  )

  const [currentStep, setCurrentStep] = useState(0)
  const [selectedTier, setSelectedTier] = useState('BRONZE')
  const [acknowledged, setAcknowledged] = useState(false)
  const [showProcessing, setShowProcessing] = useState(false)
  const [purchaseResult, setPurchaseResult] = useState(null)
  const [errors, setErrors] = useState({})
  const [keyRegStatus, setKeyRegStatus] = useState(null) // null | 'registering' | 'success' | 'skipped' | 'failed'
  const [keyRegError, setKeyRegError] = useState(null)

  // While any wallet interaction is in flight the modal must not be dismissed
  // (FR-012) and the step/footer controls are locked.
  const isBusy = flow.status === 'running'

  const [userCurrentTier, setUserCurrentTier] = useState(0)
  const [isLoadingTier, setIsLoadingTier] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!account) return
    // Clear any tier read from a previously-selected chain so a testnet tier
    // doesn't linger when the wallet switches to mainnet (where the user may
    // have no membership). Re-fetch for the chain the wallet is now on.
    setUserCurrentTier(0)
    setIsLoadingTier(true)
    getUserTierOnChain(account, ROLE_KEY, chainId).then(({ tier }) => {
      if (cancelled) return
      setUserCurrentTier(tier || 0)
      // Default tier select to the lowest available upgrade (or BRONZE for fresh)
      const minTier = (tier || 0) + 1
      if (minTier <= 4) {
        const tierKeys = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM']
        setSelectedTier(tierKeys[minTier - 1])
      }
    }).catch((err) => {
      console.warn('[PremiumPurchaseModal] tier fetch failed:', err)
    }).finally(() => {
      if (!cancelled) setIsLoadingTier(false)
    })
    return () => { cancelled = true }
  }, [account, chainId])

  const availableTiers = useMemo(() => {
    return Object.entries(MEMBERSHIP_TIERS).filter(([, tier]) => {
      if (isExtendFlow) return tier.id >= userCurrentTier && userCurrentTier > 0
      return tier.id > userCurrentTier
    })
  }, [userCurrentTier, isExtendFlow])

  const selectedTierInfo = MEMBERSHIP_TIERS[selectedTier]
  const selectedPrice = getPrice(ROLE_KEY, selectedTier)
  const chainLimits = getLimits(ROLE_KEY, selectedTier)

  const validateStep = useCallback((step) => {
    const next = {}
    if (step === 0) {
      if (!selectedTierInfo) next.tier = 'Select a tier to continue'
      else if (!isExtendFlow && selectedTierInfo.id <= userCurrentTier) {
        next.tier = 'Select a tier higher than your current one'
      }
    }
    if (step === 1 && !acknowledged) {
      next.ack = 'Please acknowledge the operator-powers notice to continue'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }, [selectedTierInfo, userCurrentTier, isExtendFlow, acknowledged])

  const handleNext = useCallback(() => {
    if (validateStep(currentStep)) setCurrentStep((s) => Math.min(s + 1, STEPS.length - 1))
  }, [currentStep, validateStep])

  const handleBack = useCallback(() => setCurrentStep((s) => Math.max(s - 1, 0)), [])

  const handleStepClick = useCallback((stepIndex) => {
    if (stepIndex < currentStep) setCurrentStep(stepIndex)
    else if (stepIndex === currentStep + 1 && validateStep(currentStep)) setCurrentStep(stepIndex)
  }, [currentStep, validateStep])

  const handlePurchase = async () => {
    if (!isConnected || !account) {
      showNotification('Please connect your wallet first', 'error')
      return
    }
    if (!isCorrectNetwork) {
      showNotification('Please switch to the correct network', 'error')
      return
    }
    if (!validateStep(1)) return

    const tierValue = selectedTierInfo.id
    const tierName = selectedTierInfo.name
    showNotification(`Confirm the wallet prompts to complete your ${tierName} membership (${selectedPrice} USDC)`, 'info', 10000)

    // Switch to the dedicated Processing view (spec 022) — the step indicator
    // surfaces each wallet interaction in turn.
    setShowProcessing(true)
    try {
      // Get a fresh signer
      const { ethers } = await import('ethers')
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
      if (!accounts || accounts.length === 0) throw new Error('No wallet account authorised')
      const provider = new ethers.BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()

      // Spec 007 (FR-039): record the accepted in-force Terms version hash on-chain.
      const acceptedTermsHash = getCurrentDocument('terms')?.hash || null

      await flow.start({
        signer,
        account,
        roleName: ROLE_KEY,
        priceUSD: selectedPrice,
        tier: tierValue,
        action,
        termsHash: acceptedTermsHash,
        ensureInitialized,
        // Membership is active the moment payment confirms — run side effects then,
        // before the (non-blocking) key steps.
        onPaid: async (receipt) => {
          grantRole(ROLE_KEY)
          recordRolePurchase(account, ROLE_KEY, {
            price: selectedPrice,
            currency: 'USDC',
            tier: selectedTier,
            tierValue,
            txHash: receipt.hash,
            purchasedBy: account,
          }, chainId)
          try { await loadRoles() } catch (e) { console.warn('refresh roles failed:', e) }
          showNotification(`${tierName} membership activated.`, 'success', 7000)
        },
      })
    } catch (err) {
      // Failure to even acquire a signer (before the flow starts). In-flow failures
      // are handled by the progress view's Retry / Continue actions.
      console.error('[PremiumPurchaseModal] purchase setup failed:', err)
      setPurchaseResult({ success: false, error: err.message })
      showNotification('Purchase failed: ' + err.message, 'error', 7000)
      setShowProcessing(false)
      setCurrentStep(2)
    }
  }

  // React to the flow reaching a terminal success (all steps done, or the member
  // chose "Continue anyway" past a non-blocking key step).
  useEffect(() => {
    if (flow.status !== 'succeeded') return
    setPurchaseResult({ success: true, tier: selectedTierInfo?.name, txHash: flow.purchaseReceipt?.hash })
    setKeyRegStatus(flow.keyRegOutcome) // 'success' | 'skipped' | 'failed'
    if (flow.keyRegOutcome === 'failed') {
      setKeyRegError('Key registration was not completed')
    }
    setShowProcessing(false)
    setCurrentStep(2)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.status])

  const resetForm = useCallback(() => {
    setCurrentStep(0)
    setSelectedTier('BRONZE')
    setAcknowledged(false)
    setPurchaseResult(null)
    setErrors({})
    setShowProcessing(false)
    setKeyRegStatus(null)
    setKeyRegError(null)
    flow.reset()
  }, [flow])

  const handleClose = useCallback(() => {
    if (!isBusy) {
      resetForm()
      onClose?.()
    }
  }, [isBusy, resetForm, onClose])

  // Leave the purchase modal and open the dedicated voucher view (buy or redeem).
  const goToVouchers = useCallback((hash = '') => {
    if (isBusy) return
    resetForm()
    onClose?.()
    navigate(`/vouchers${hash}`)
  }, [isBusy, resetForm, onClose, navigate])

  if (!isOpen) return null

  return (
    <div
      className="ppm-overlay"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ppm-title"
    >
      <div className="ppm-modal" onClick={(e) => e.stopPropagation()}>
        <header className="ppm-header">
          <div className="ppm-header-content">
            <h2 id="ppm-title">
              {isUpgradeFlow ? 'Upgrade Membership' : isExtendFlow ? 'Extend Membership' : 'Get Wager Access'}
            </h2>
            <p className="ppm-subtitle">
              {isUpgradeFlow
                ? 'Move to a higher tier for more monthly and concurrent wagers.'
                : isExtendFlow
                  ? 'Add another 30 days at your current tier.'
                  : 'Purchase the Wager Participant role to create and accept peer-to-peer wagers.'}
            </p>
          </div>
          <button
            className="ppm-close-btn"
            onClick={handleClose}
            disabled={isBusy}
            aria-label="Close modal"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </header>

        <nav className="ppm-steps" aria-label="Purchase steps">
          {STEPS.map((step, index) => {
            const isActive = index === currentStep
            const isCompleted = index < currentStep
            return (
              <button
                key={step.id}
                className={`ppm-step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
                onClick={() => handleStepClick(index)}
                disabled={isBusy || index > currentStep}
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

        <div className="ppm-content">
          {/* Processing view (spec 022): dedicated per-wallet-interaction progress,
              shown between Review and Complete. */}
          {showProcessing && (
            <div className="ppm-panel" role="tabpanel">
              <section className="ppm-section">
                <h3 className="ppm-section-title">
                  <span aria-hidden="true">⏳</span> Completing your purchase
                </h3>
                <PurchaseProgressView
                  steps={flow.steps}
                  activeIndex={flow.activeIndex}
                  activeStep={flow.activeStep}
                  status={flow.status}
                  completedCount={flow.completedCount}
                  total={flow.total}
                  progressFraction={flow.progressFraction}
                  canContinueAnyway={flow.canContinueAnyway}
                  onRetry={flow.retry}
                  onContinueAnyway={flow.continueAnyway}
                />
              </section>
            </div>
          )}

          {/* Step 1: Tier */}
          {!showProcessing && currentStep === 0 && (
            <div className="ppm-panel" role="tabpanel">
              <section className="ppm-section">
                <div className="ppm-section-header">
                  <h3 className="ppm-section-title">
                    <span aria-hidden="true">{ROLE_COPY.icon}</span> {ROLE_COPY.tagline}
                  </h3>
                  <ul className="ppm-role-features">
                    {ROLE_COPY.features.map((f, i) => (
                      <li key={i}><span className="ppm-feature-check" aria-hidden="true">✓</span>{f}</li>
                    ))}
                  </ul>
                </div>

                {isLoadingTier && (
                  <div className="ppm-loading-tiers">
                    <div className="ppm-spinner" aria-hidden="true"></div>
                    <p>Checking your current membership tier...</p>
                  </div>
                )}

                {!isLoadingTier && userCurrentTier > 0 && (
                  <div className="ppm-info-card ppm-current-tier-info">
                    <span className="ppm-info-icon" aria-hidden="true">ℹ️</span>
                    <div>
                      <strong>Current Membership</strong>
                      <p>
                        You currently have{' '}
                        <span
                          className="ppm-tier-badge"
                          style={{ backgroundColor: Object.values(MEMBERSHIP_TIERS)[userCurrentTier - 1]?.color }}
                        >
                          {Object.values(MEMBERSHIP_TIERS)[userCurrentTier - 1]?.name}
                        </span>
                        {isExtendFlow ? '. You can extend at the same tier or upgrade.' : '. You can only upgrade to a higher tier.'}
                      </p>
                    </div>
                  </div>
                )}

                {!isLoadingTier && userCurrentTier >= 4 && !isExtendFlow && (
                  <div className="ppm-warning-card">
                    <span className="ppm-warning-icon" aria-hidden="true">🎉</span>
                    <div className="ppm-warning-content">
                      <strong>Maximum Tier Reached</strong>
                      <p>You're already on Platinum — the highest tier. There's nothing to upgrade to.</p>
                    </div>
                  </div>
                )}

                {!isLoadingTier && availableTiers.length > 0 && (
                  <div className="ppm-tier-grid">
                    {availableTiers.map(([tierKey, tier]) => {
                      const tierPrice = getPrice(ROLE_KEY, tierKey)
                      const tierChainLimits = getLimits(ROLE_KEY, tierKey)
                      const isSelected = selectedTier === tierKey
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
                            disabled={isBusy}
                            className="ppm-tier-radio"
                          />
                          <div className="ppm-tier-content">
                            <div className="ppm-tier-header">
                              <span className="ppm-tier-badge" style={{ backgroundColor: tier.color }}>
                                {tier.name}
                              </span>
                              <span className="ppm-tier-price">${tierPrice} USDC</span>
                            </div>
                            <TierLimits tierName={tierKey} chainLimits={tierChainLimits} />
                            <p className="ppm-tier-duration">30 days</p>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                )}

                {errors.tier && <div className="ppm-error">{errors.tier}</div>}
              </section>

              {/* Voucher rail (spec 026): same membership, bought/redeemed as a
                  transferable token. Shown only where vouchers are deployed. */}
              {voucherAvailable && (
                <section className="ppm-section ppm-voucher-alt">
                  <h3 className="ppm-section-title">
                    <span aria-hidden="true">🎟️</span> Have a voucher — or want to gift access?
                  </h3>
                  <p className="ppm-voucher-alt-text">
                    A voucher is a transferable token that redeems into the same membership. Redeem one you were
                    given, or buy a voucher to gift or resell.
                  </p>
                  <div className="ppm-voucher-alt-actions">
                    <button
                      type="button"
                      className="ppm-btn-secondary"
                      onClick={() => goToVouchers('#vch-redeem-h')}
                      disabled={isBusy}
                    >
                      Redeem a voucher
                    </button>
                    <button
                      type="button"
                      className="ppm-btn-secondary"
                      onClick={() => goToVouchers('#vch-buy-h')}
                      disabled={isBusy}
                    >
                      Buy a giftable voucher
                    </button>
                  </div>
                </section>
              )}
            </div>
          )}

          {/* Step 2: Review */}
          {!showProcessing && currentStep === 1 && (
            <div className="ppm-panel" role="tabpanel">
              <section className="ppm-section">
                <h3 className="ppm-section-title">
                  <span aria-hidden="true">📋</span> Review Your Purchase
                </h3>

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
                    <span className="ppm-tier-badge" style={{ backgroundColor: selectedTierInfo?.color }}>
                      {selectedTierInfo?.name}
                    </span>
                  </div>
                  <div className="ppm-review-roles">
                    <span className="ppm-review-label">Role</span>
                    <div className="ppm-review-roles-list">
                      <div className="ppm-review-role-item">
                        <div className="ppm-review-role-info">
                          <span className="ppm-review-role-icon" aria-hidden="true">{ROLE_COPY.icon}</span>
                          <div>
                            <span className="ppm-review-role-name">Wager Participant</span>
                            <span className="ppm-review-role-duration">30 days</span>
                          </div>
                        </div>
                        <span className="ppm-review-role-price">${selectedPrice} USDC</span>
                      </div>
                    </div>
                  </div>
                  <div className="ppm-review-pricing">
                    <div className="ppm-review-pricing-row ppm-total">
                      <span>Total</span>
                      <span>${selectedPrice.toFixed(2)} USDC</span>
                    </div>
                    {usingFallbackPrices && (
                      <p className="ppm-price-estimate" role="status">
                        ⚠ Estimated price — live pricing couldn’t be loaded from the
                        membership contract, so this is a fallback estimate. Confirm
                        the exact amount in your wallet before approving.
                      </p>
                    )}
                  </div>

                  <TierLimits tierName={selectedTier} chainLimits={chainLimits} />
                </div>

                <div className="ppm-warning-card">
                  <span className="ppm-warning-icon" aria-hidden="true">⚠️</span>
                  <div className="ppm-warning-content">
                    <strong>Operator powers — please acknowledge</strong>
                    <ul>
                      <li>
                        The protocol can be <strong>paused</strong> by a Guardian-Role holder in
                        response to security incidents. Pausing temporarily blocks all wager
                        creation, acceptance, and settlement.
                      </li>
                      <li>
                        An <strong>Account Moderator</strong> can freeze your account for cause
                        (fraud, abuse, court order, etc.). A frozen account cannot create or accept
                        wagers, or claim payouts or refunds, until unfrozen. See{' '}
                        <a href={ACCOUNT_MODERATION_PATH} target="_blank" rel="noopener noreferrer">
                          Account Moderation policy
                        </a>.
                      </li>
                      <li>
                        This is a <strong>non-refundable</strong> blockchain transaction. Once
                        confirmed, it cannot be reversed.
                      </li>
                    </ul>
                    {/* Spec 007 (US5): discrete, un-pre-ticked eligibility attestations.
                        allTicked drives `acknowledged`, which gates validation + the
                        purchase button below; the accepted Terms version is recorded
                        on-chain via purchaseTierWithTerms in handlePurchase. */}
                    <MembershipAttestation onChange={setAcknowledged} />
                    {errors.ack && <div className="ppm-error">{errors.ack}</div>}
                  </div>
                </div>

                {isConnected && !isCorrectNetwork && (
                  <div className="ppm-network-warning">
                    <span aria-hidden="true">⚠️</span>
                    <div>
                      <strong>Wrong Network</strong>
                      <p>Please switch to the correct network to continue.</p>
                      <button type="button" onClick={switchNetwork}>Switch Network</button>
                    </div>
                  </div>
                )}

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

          {/* Step 3: Complete */}
          {currentStep === 2 && (
            <div className="ppm-panel" role="tabpanel">
              <section className="ppm-section ppm-complete-section">
                <div className="ppm-success-icon" aria-hidden="true">
                  {purchaseResult?.success ? '🎉' : '⚠️'}
                </div>
                <h3 className="ppm-complete-title">
                  {purchaseResult?.success ? 'Purchase Complete!' : 'Purchase Failed'}
                </h3>
                <p className="ppm-complete-desc">
                  {purchaseResult?.success
                    ? <>Your <strong style={{ color: selectedTierInfo?.color }}>{selectedTierInfo?.name}</strong> Wager Participant membership is active for 30 days.</>
                    : purchaseResult?.error}
                </p>
                {purchaseResult?.txHash && (
                  <a
                    href={getTransactionUrl(chainId || 80002, purchaseResult.txHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ppm-tx-link"
                  >
                    View transaction
                  </a>
                )}
                {purchaseResult?.success && (
                  <div className="ppm-key-reg-status">
                    {keyRegStatus === 'registering' && (
                      <div className="ppm-info-card">
                        <span className="ppm-spinner" aria-hidden="true" />
                        <span>Registering your encryption key...</span>
                      </div>
                    )}
                    {keyRegStatus === 'success' && (
                      <div className="ppm-info-card ppm-key-reg-success">
                        <span aria-hidden="true">&#x1F512;</span>
                        <span>Encryption key registered &mdash; you can send and receive private wagers.</span>
                      </div>
                    )}
                    {keyRegStatus === 'skipped' && (
                      <div className="ppm-info-card ppm-key-reg-success">
                        <span aria-hidden="true">&#x1F512;</span>
                        <span>Encryption key already registered.</span>
                      </div>
                    )}
                    {keyRegStatus === 'failed' && (
                      <div className="ppm-info-card ppm-key-reg-warn">
                        <span aria-hidden="true">&#x26A0;&#xFE0F;</span>
                        <span>
                          Key registration was not completed{keyRegError ? `: ${keyRegError}` : ''}.
                          You can register later from <strong>Security</strong> settings.
                        </span>
                      </div>
                    )}
                  </div>
                )}
                <div className="ppm-tier-summary">
                  <h4>Your {selectedTierInfo?.name} limits</h4>
                  <TierLimits tierName={selectedTier} chainLimits={chainLimits} />
                </div>
              </section>
            </div>
          )}
        </div>

        <footer className="ppm-footer">
          <div className="ppm-footer-left">
            {!showProcessing && currentStep > 0 && currentStep < 2 && (
              <button type="button" className="ppm-btn-secondary" onClick={handleBack} disabled={isBusy}>
                Back
              </button>
            )}
          </div>
          <div className="ppm-footer-right">
            {/* During the Processing view, recovery actions live in the progress
                view itself (Retry / Continue anyway), so the form footer is hidden. */}
            {!showProcessing && currentStep < 2 && (
              <button type="button" className="ppm-btn-secondary" onClick={handleClose} disabled={isBusy}>
                Cancel
              </button>
            )}
            {!showProcessing && currentStep === 0 && (
              <button
                type="button"
                className="ppm-btn-primary"
                onClick={handleNext}
                disabled={isBusy || availableTiers.length === 0}
              >
                Continue
              </button>
            )}
            {!showProcessing && currentStep === 1 && (
              <button
                type="button"
                className="ppm-btn-primary ppm-btn-purchase"
                onClick={handlePurchase}
                disabled={isBusy || !isConnected || !isCorrectNetwork || !acknowledged}
              >
                Confirm Purchase (${selectedPrice.toFixed(2)} USDC)
              </button>
            )}
            {currentStep === 2 && (
              <button type="button" className="ppm-btn-primary" onClick={handleClose}>
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
