import { useState, useRef, useCallback, useMemo } from 'react'
import { purchaseRoleWithStablecoin, checkApprovalNeeded, resolveMembershipIntentParams } from '../utils/blockchainService'
import { ensureKeyRegistered } from '../utils/keyRegistryService'
import { useGaslessWrite } from '../lib/relay/useGaslessWrite'

/**
 * Spec 022 — Membership Purchase Progress Indicator.
 *
 * Step state machine that drives the dedicated "Processing" view of
 * PremiumPurchaseModal. It surfaces the real wallet interactions of a membership
 * purchase as discrete, labeled steps with live state, and supports safe recovery:
 *
 *   approve (optional) -> pay -> sign -> register
 *
 * - The approve step is OMITTED when the member already has sufficient allowance
 *   (FR-009), determined by a read-only pre-flight (`checkApprovalNeeded`).
 * - approve/pay are surfaced via the `onProgress` callback of
 *   `purchaseRoleWithStablecoin`; sign/register are orchestrated here.
 * - sign/register are non-blocking: the membership is already active once `pay`
 *   confirms, so a key-step failure offers Retry AND Continue anyway (FR-010).
 * - Retry resumes from the failed step without re-running the payment (FR-008).
 *
 * This hook changes NO purchase mechanics (FR-001a); it only observes and
 * sequences the existing calls.
 */

const STEP_DEFS = {
  approve: { id: 'approve', label: 'Approve USDC spending', detail: 'Authorize the membership contract to collect your USDC — no funds move yet.', kind: 'transaction', blocking: true },
  pay: { id: 'pay', label: 'Pay for membership', detail: 'Send your USDC and receive the membership.', kind: 'transaction', blocking: true },
  sign: { id: 'sign', label: 'Sign to set up private wagers', detail: 'Sign a message to derive your encryption key — no funds move, no gas.', kind: 'signature', blocking: false },
  register: { id: 'register', label: 'Register your encryption key', detail: 'Publish your encryption key so others can send you private wagers.', kind: 'transaction', blocking: false },
}

const makeStep = (id) => ({ ...STEP_DEFS[id], state: 'pending', failureReason: null, txHash: null })

/**
 * @param {object} [deps] - injectable for tests; defaults to the real services.
 */
export function usePurchaseFlow(deps = {}) {
  const purchaseFn = deps.purchaseRoleWithStablecoin || purchaseRoleWithStablecoin
  const approvalCheckFn = deps.checkApprovalNeeded || checkApprovalNeeded
  const registerKeyFn = deps.ensureKeyRegistered || ensureKeyRegistered

  const [steps, setSteps] = useState([])
  const [status, setStatus] = useState('idle') // idle | running | succeeded | failed
  const [keyRegOutcome, setKeyRegOutcome] = useState(null) // null | success | skipped | failed

  const paramsRef = useRef(null)
  const receiptRef = useRef(null)
  const publicKeyRef = useRef(null)

  const updateStep = useCallback((id, patch) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }, [])

  // Map approve/pay events from the service onto step state.
  const handleProgress = useCallback((evt) => {
    const { step, phase, txHash } = evt || {}
    if (!step || phase === 'skipped') return
    if (phase === 'start') updateStep(step, { state: 'active', failureReason: null })
    else if (phase === 'sent') updateStep(step, { state: 'confirming', txHash })
    else if (phase === 'confirmed') updateStep(step, { state: 'completed', txHash })
  }, [updateStep])

  // Gasless seam (specs 035 + 036): relay the payment when a relayer is live, else self-submit via the
  // existing approve+pay service call (never-stranded). The EIP-3009 `value` is the exact price the
  // contract pulls (resolveMembershipIntentParams). Self-submit reads live params from paramsRef and
  // reuses handleProgress so approve/pay step events fire identically on the fallback path.
  const selfSubmitPurchase = () => purchaseFn(
    paramsRef.current.signer, paramsRef.current.roleName, paramsRef.current.priceUSD,
    paramsRef.current.tier, paramsRef.current.action, paramsRef.current.termsHash, handleProgress,
  )
  const purchaseTx = useGaslessWrite('purchaseTier', {
    params: (ip) => ({ role: ip.roleHash, tier: ip.validTier, acceptedTermsHash: ip.acceptedTermsHash }),
    payment: (ip) => ({ value: ip.price }),
    selfSubmit: selfSubmitPurchase,
  })
  const upgradeTx = useGaslessWrite('upgradeTier', {
    params: (ip) => ({ role: ip.roleHash, tier: ip.validTier, acceptedTermsHash: ip.acceptedTermsHash }),
    payment: (ip) => ({ value: ip.price }),
    selfSubmit: selfSubmitPurchase,
  })
  const extendTx = useGaslessWrite('extendMembership', {
    params: (ip) => ({ role: ip.roleHash }),
    payment: (ip) => ({ value: ip.price }),
    selfSubmit: selfSubmitPurchase,
  })

  // Mark the in-flight (or next pending) step as failed and attribute the reason.
  const markFailed = useCallback((reason) => {
    setSteps((prev) => {
      let idx = prev.findIndex((s) => s.state === 'active' || s.state === 'confirming')
      if (idx === -1) idx = prev.findIndex((s) => s.state === 'pending')
      if (idx === -1) return prev
      return prev.map((s, i) => (i === idx ? { ...s, state: 'failed', failureReason: reason } : s))
    })
  }, [])

  /**
   * Run the flow from a given segment: 'purchase' (approve+pay), 'sign', or
   * 'register'. Used for both the initial run and resume-after-failure.
   */
  const runSegments = useCallback(async (fromSegment) => {
    const p = paramsRef.current
    if (!p) return
    setStatus('running')
    try {
      if (fromSegment === 'purchase') {
        // Passkey smart accounts (spec 041, FR-016) batch approve+purchase into ONE biometric
        // confirmation via the 4337 bundler — a single 'pay' step, no approve step. Everyone else
        // routes the pay through the spec-035/036 gasless seam: relay when a relayer is live, else
        // self-submit approve+pay (resolveMembershipIntentParams gives the exact price the contract
        // pulls). Same on-chain result either way.
        let receipt
        if (p.batchPurchase) {
          updateStep('pay', { state: 'active', failureReason: null })
          receipt = await p.batchPurchase()
          updateStep('pay', { state: 'completed', txHash: receipt?.txHash })
        } else {
          const ip = await resolveMembershipIntentParams(p.signer, p.roleName, p.tier, p.action, p.termsHash)
          const tx = p.action === 'upgrade' ? upgradeTx : (p.action === 'extend' ? extendTx : purchaseTx)
          const result = await tx.run(ip)
          if (result?.error) throw result.error
          receipt = result
        }
        receiptRef.current = receipt
        // Defensively ensure approve (if present) + pay show completed.
        setSteps((prev) => prev.map((s) =>
          (s.id === 'approve' || s.id === 'pay') && s.state !== 'completed'
            ? { ...s, state: 'completed' }
            : s,
        ))
        // Membership is now active — fire side effects exactly once.
        try { await p.onPaid?.(receipt) } catch (e) { console.warn('[usePurchaseFlow] onPaid failed:', e?.message) }
      }

      if (fromSegment === 'purchase' || fromSegment === 'sign') {
        updateStep('sign', { state: 'active', failureReason: null })
        try {
          const keys = await p.ensureInitialized()
          if (!keys?.publicKey) throw new Error('Could not derive encryption keys')
          publicKeyRef.current = keys.publicKey
          updateStep('sign', { state: 'completed' })
        } catch (err) {
          // Device-dependent degradation (spec 041, clarification Q1): a
          // passkey/authenticator without deterministic key material keeps the
          // membership fully valid — only encrypted features gate off, and the
          // UI says so explicitly instead of failing the whole purchase.
          if (err?.name === 'EncryptionUnavailable') {
            updateStep('sign', { state: 'skipped', failureReason: err.message })
            updateStep('register', { state: 'skipped', failureReason: 'Encrypted features unavailable on this device' })
            setKeyRegOutcome('unavailable')
            setStatus('succeeded')
            return
          }
          throw err
        }
      }

      // register
      updateStep('register', { state: 'active', failureReason: null })
      const wasNew = await registerKeyFn(p.signer, p.account, publicKeyRef.current)
      updateStep('register', { state: 'completed' })
      setKeyRegOutcome(wasNew ? 'success' : 'skipped')
      setStatus('succeeded')
    } catch (err) {
      markFailed(err?.message || 'Step failed')
      setStatus('failed')
    }
  }, [registerKeyFn, updateStep, markFailed, purchaseTx, upgradeTx, extendTx])

  /**
   * Begin a fresh purchase flow. Builds the step list (omitting approval when not
   * needed) and runs it end to end.
   */
  const start = useCallback(async (params) => {
    paramsRef.current = params
    receiptRef.current = null
    publicKeyRef.current = null
    setKeyRegOutcome(null)
    setStatus('running')

    // Passkey batch path never shows a separate approve step (FR-016).
    const approvalNeeded = params.batchPurchase
      ? false
      : await approvalCheckFn(
          params.signer, params.roleName, params.priceUSD, params.tier, params.action,
        )
    const ids = approvalNeeded ? ['approve', 'pay', 'sign', 'register'] : ['pay', 'sign', 'register']
    setSteps(ids.map(makeStep))

    await runSegments('purchase')
  }, [approvalCheckFn, runSegments])

  /** Resume from the first failed step without repeating completed paid steps. */
  const retry = useCallback(async () => {
    const failedIdx = steps.findIndex((s) => s.state === 'failed')
    if (failedIdx === -1) return
    const failedId = steps[failedIdx].id
    // Reset the failed step and everything after it back to pending.
    setSteps((prev) => prev.map((s, i) =>
      i >= failedIdx ? { ...s, state: 'pending', failureReason: null } : s,
    ))
    const segment = (failedId === 'approve' || failedId === 'pay')
      ? 'purchase'
      : (failedId === 'sign' ? 'sign' : 'register')
    await runSegments(segment)
  }, [steps, runSegments])

  /**
   * Accept a non-blocking key-step failure and finish as success. Valid only when
   * the outstanding failure is a non-blocking (sign/register) step (FR-010).
   */
  const continueAnyway = useCallback(() => {
    const failed = steps.find((s) => s.state === 'failed')
    if (!failed || failed.blocking) return
    setKeyRegOutcome('failed')
    setStatus('succeeded')
  }, [steps])

  const reset = useCallback(() => {
    paramsRef.current = null
    receiptRef.current = null
    publicKeyRef.current = null
    setSteps([])
    setStatus('idle')
    setKeyRegOutcome(null)
  }, [])

  // Derived selectors (data-model.md).
  const total = steps.length
  const completedCount = useMemo(() => steps.filter((s) => s.state === 'completed').length, [steps])
  const activeIndex = useMemo(() => {
    const i = steps.findIndex((s) => s.state === 'active' || s.state === 'confirming' || s.state === 'failed')
    return i === -1 ? null : i
  }, [steps])
  const progressFraction = total > 0 ? completedCount / total : 0
  const activeStep = activeIndex == null ? null : steps[activeIndex]
  const canContinueAnyway = useMemo(
    () => status === 'failed' && steps.some((s) => s.state === 'failed' && !s.blocking),
    [status, steps],
  )

  return {
    steps,
    status,
    total,
    completedCount,
    activeIndex,
    activeStep,
    progressFraction,
    keyRegOutcome,
    canContinueAnyway,
    purchaseReceipt: receiptRef.current,
    start,
    retry,
    continueAnyway,
    reset,
  }
}

export default usePurchaseFlow
