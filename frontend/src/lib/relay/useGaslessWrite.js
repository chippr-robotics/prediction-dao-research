import { useMemo } from 'react'
import { useWeb3 } from '../../hooks/useWeb3'
import { getContractAddressForChain } from '../../config/contracts'
import { signIntent } from './intentClient'
import { INTENT_ACTIONS } from './intentTypes'
import { useIntentAction } from './useIntentAction'

/**
 * useGaslessWrite — the one-line seam every call site uses to route an on-chain write through the
 * gasless relayer WITH a transparent self-submit fallback (spec 035/036 never-stranded rule; the
 * actual state machine lives in {@link useIntentAction}). It resolves the signer + chainId from the
 * wallet context and the EIP-712 verifying contract from the action's `verifier`, so a caller supplies
 * only two things: how to shape the intent params from the run() arguments, and how to self-submit the
 * equivalent wallet transaction.
 *
 * Chain behaviour is automatic and safe:
 *   - relayer URL unset, or the chain absent from the relayer's `/status` → self-submit (probeHealth).
 *   - payment-class action on a chain whose stablecoin lacks EIP-3009 (Mordor/ETC) → `signIntent`
 *     throws PaymentUnsupportedOnChain BEFORE any wallet prompt → self-submit.
 * So wiring a call site here never changes its behaviour on chains the relayer doesn't (yet) serve —
 * it stays a plain self-submit — and lights up gasless only where the relayer is live.
 *
 * @param {string} action - an INTENT_ACTIONS key (e.g. 'cancelOpen', 'claimPayout', 'redeemVoucher').
 * @param {object} cfg
 * @param {(...runArgs: any[]) => object} [cfg.params] - maps run() args → the intent struct params,
 *   minus the fields signIntent auto-fills (actor/nonce/validAfter/validBefore/paymentNonce). Omit for
 *   a no-param action. Receives the exact args passed to `run(...)`.
 * @param {(...runArgs: any[]) => {value: bigint|string}} [cfg.payment] - payment-class only: the USDC
 *   amount to authorize (ReceiveWithAuthorization value). Ignored for signer-attributed actions.
 * @param {(...runArgs: any[]) => Promise<object|string>} cfg.selfSubmit - MANDATORY: the existing
 *   wallet write, resolving with the mined receipt (or its hash). Receives the same run() args.
 * @param {(entry: object) => void} [cfg.onActivity] - spec-031 ActivityEntry sink (optional).
 * @param {string} [cfg.targetContract] - override the EIP-712 verifying contract. Defaults to the
 *   action verifier's address via getContractAddressForChain; pass this when the call site already
 *   holds the exact proxy address (so the relayed target can never diverge from the self-submit one).
 * @param {object} [cfg.rest] - forwarded to useIntentAction (pollIntervalMs, maxPollMs, invalidateNonce).
 * @returns {ReturnType<typeof useIntentAction>} { status, intent, result, error, run, invalidate,
 *   selfSubmitNow, reset }
 */
export function useGaslessWrite(action, { params, payment, selfSubmit, onActivity, targetContract: targetOverride, ...rest } = {}) {
  const { signer, chainId } = useWeb3()
  const verifier = INTENT_ACTIONS[action]?.verifier

  // The EIP-712 verifying contract is the action's target proxy (wagerRegistry | membershipManager).
  const targetContract = useMemo(() => {
    if (targetOverride) return targetOverride
    if (chainId == null || !verifier) return null
    try {
      return getContractAddressForChain(verifier, chainId)
    } catch {
      return null // chain not configured for this contract — buildIntent will surface it; probe self-submits first
    }
  }, [targetOverride, verifier, chainId])

  return useIntentAction({
    action,
    chainId,
    buildIntent: (...runArgs) =>
      signIntent({
        signer,
        chainId,
        action,
        targetContract,
        params: typeof params === 'function' ? params(...runArgs) : params || {},
        ...(typeof payment === 'function' ? { payment: payment(...runArgs) } : {}),
      }),
    selfSubmit,
    onActivity,
    ...rest,
  })
}

export default useGaslessWrite
