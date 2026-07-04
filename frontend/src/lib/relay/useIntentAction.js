/**
 * useIntentAction — the enforcement point for the never-stranded rule (spec 035 FR-014, spec 036
 * FR-016/SC-004). Wraps one action's gasless path (probe → sign → relay → poll) and TRANSPARENTLY
 * falls back to the caller's self-submit path (identical on-chain result, user pays gas) whenever the
 * relayer is unset, unhealthy, unavailable (429/503/network/timeout), or the chain cannot carry a
 * payment-class intent (PaymentUnsupportedOnChain, FR-020). `selfSubmit` is therefore MANDATORY — the
 * hook throws at wiring time if it is missing, so no call site can ship a gasless-only dead end.
 *
 * Honest status (FR-018/SC-007): the machine is
 *   idle → signing → signed → submitting → pending → confirmed | failed | expired | invalidated
 * plus the fallback leg `self-submitting → confirmed | self-submitted`. 'confirmed' is NEVER set
 * before a txHash-bearing confirmed relay status or a mined self-submit receipt.
 *
 * Activity (spec 031): the provider's feed is poll-sourced with no push API, so lifecycle entries are
 * emitted through the pluggable `onActivity(entry)` callback using the spec-031 ActivityEntry shape
 * (`type ∈ intent-submitted|intent-confirmed|intent-failed|intent-expired|intent-invalidated`,
 * `domain: 'intents'`) — wire it to an ActivitySource aux buffer or a toast, as the call site prefers.
 */
import { useCallback, useRef, useState } from 'react'
import { makeRelayer } from './intentClient'
import { PaymentUnsupportedOnChain, RelayerUnavailable } from './errors'

/** Client lifecycle states (spec 035 data-model.md "Intent Status"). */
export const INTENT_STATUS = {
  IDLE: 'idle',
  SIGNING: 'signing',
  SIGNED: 'signed',
  SUBMITTING: 'submitting',
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  FAILED: 'failed',
  EXPIRED: 'expired',
  INVALIDATED: 'invalidated',
  SELF_SUBMITTING: 'self-submitting',
  SELF_SUBMITTED: 'self-submitted',
}

const DEFAULT_POLL_INTERVAL_MS = 4000
const DEFAULT_MAX_POLL_MS = 180000

const ENTRY_SEVERITY = { confirmed: 'success', failed: 'error', expired: 'warning', invalidated: 'info', submitted: 'info' }

/**
 * Build a spec-031 ActivityEntry for an intent lifecycle transition (store-schema.md shape:
 * id/type/message/severity/actionable/createdAt/read + domain/refId).
 * @param {'submitted'|'confirmed'|'failed'|'expired'|'invalidated'} kind
 * @param {{action: string, chainId?: number, intentId?: string, txHash?: string,
 *   uniquenessMarker?: string, message?: string, nowMs?: number}} detail
 * @returns {object} ActivityEntry
 */
export function makeIntentActivityEntry(kind, { action, chainId, intentId, txHash, uniquenessMarker, message, nowMs } = {}) {
  const createdAt = nowMs != null ? nowMs : Date.now()
  const refId = uniquenessMarker || intentId || `${action}:${createdAt}`
  const defaultMessages = {
    submitted: `Gasless ${action} submitted — waiting for on-chain confirmation`,
    confirmed: `Gasless ${action} confirmed on-chain`,
    failed: `Gasless ${action} failed`,
    expired: `Gasless ${action} expired before execution`,
    invalidated: `Gasless ${action} invalidated — it can never execute`,
  }
  return {
    id: `intent:${refId}:${kind}`,
    type: `intent-${kind}`,
    domain: 'intents',
    refId,
    message: message || defaultMessages[kind] || `Gasless ${action}: ${kind}`,
    severity: ENTRY_SEVERITY[kind] || 'info',
    actionable: false,
    createdAt,
    read: false,
    action,
    ...(chainId != null ? { chainId } : {}),
    ...(intentId ? { intentId } : {}),
    ...(txHash ? { txHash } : {}),
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Extract a tx hash from whatever the caller's selfSubmit resolves to (receipt, tx, or raw hash). */
function txHashOf(receipt) {
  if (!receipt) return null
  if (typeof receipt === 'string') return receipt
  return receipt.hash || receipt.transactionHash || receipt.txHash || null
}

/**
 * @param {object} args
 * @param {string} args.action - gateway action name (documents the flow; stamped on activity entries)
 * @param {number} [args.chainId] - active chain (relayer + activity scoping)
 * @param {(...runArgs) => Promise<object>} args.buildIntent - signs and returns the gateway Intent
 *   body (typically a thin wrapper around intentClient.signIntent). May throw
 *   PaymentUnsupportedOnChain to route to self-submit (FR-020).
 * @param {(...runArgs) => Promise<object|string>} args.selfSubmit - MANDATORY fallback: submits the
 *   equivalent transaction from the user's own wallet and resolves with the MINED receipt (or its
 *   hash). Missing ⇒ the hook throws (never-stranded).
 * @param {(nonce: string, intent: object) => Promise<any>} [args.invalidateNonce] - default contract
 *   write for invalidate() (e.g. `(nonce) => registry.invalidateNonce(nonce)`)
 * @param {(entry: object) => void} [args.onActivity] - receives spec-031 ActivityEntry objects at
 *   submitted/confirmed/failed/expired/invalidated transitions
 * @param {number} [args.pollIntervalMs=4000]
 * @param {number} [args.maxPollMs=180000] - polling budget; past it the intent stays 'pending'
 *   (honest — the relayer may still land it) unless its validBefore has passed ('expired')
 * @returns {{status: string, intent: object|null, result: object|null, error: Error|null,
 *   run: (...args) => Promise<object>, invalidate: (write?: Function) => Promise<void>,
 *   selfSubmitNow: (...args) => Promise<object>, reset: () => void}}
 */
export function useIntentAction({
  action,
  chainId,
  buildIntent,
  selfSubmit,
  invalidateNonce,
  onActivity,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  maxPollMs = DEFAULT_MAX_POLL_MS,
}) {
  // Never-stranded rule: refuse to wire a gasless flow with no self-submit twin (FR-014).
  if (typeof selfSubmit !== 'function') {
    throw new Error(`useIntentAction(${action || 'unknown'}): selfSubmit is required — every gasless flow must have a self-submit fallback (never-stranded rule)`)
  }
  if (typeof buildIntent !== 'function') {
    throw new Error(`useIntentAction(${action || 'unknown'}): buildIntent is required`)
  }

  const [status, setStatus] = useState(INTENT_STATUS.IDLE)
  const [intent, setIntent] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  // The signed-but-not-yet-relayed intent, kept transient-only (data-model.md: a signed intent lives
  // only in transient state with Invalidate + Self-submit actions). Cleared on confirm/invalidate.
  const unsubmittedRef = useRef(null)

  const emit = useCallback(
    (kind, detail = {}) => {
      if (typeof onActivity !== 'function') return
      try {
        onActivity(makeIntentActivityEntry(kind, { action, chainId, ...detail }))
      } catch (e) {
        console.warn('[useIntentAction] onActivity callback failed:', e?.message || e)
      }
    },
    [onActivity, action, chainId]
  )

  /** Self-submit leg: only a mined, hash-bearing receipt may show 'confirmed'. */
  const runSelfSubmit = useCallback(
    async (reason, runArgs) => {
      setStatus(INTENT_STATUS.SELF_SUBMITTING)
      try {
        const receipt = await selfSubmit(...runArgs)
        const txHash = txHashOf(receipt)
        unsubmittedRef.current = null
        const res = { via: 'self-submit', reason, txHash }
        setResult(res)
        if (txHash) {
          // A resolved wallet call with a receipt hash = mined → honest 'confirmed'.
          setStatus(INTENT_STATUS.CONFIRMED)
          emit('confirmed', { txHash, message: `${action} confirmed on-chain (self-submitted)` })
        } else {
          // No receipt to verify inclusion with — never claim 'confirmed' (FR-018/SC-007).
          setStatus(INTENT_STATUS.SELF_SUBMITTED)
        }
        return res
      } catch (e) {
        setStatus(INTENT_STATUS.FAILED)
        setError(e)
        emit('failed', { message: `${action} failed: ${e?.message || e}` })
        return { via: 'self-submit', reason, error: e }
      }
    },
    [selfSubmit, emit, action]
  )

  /**
   * Execute the action: probe → sign → relay → poll, self-submitting on any availability gap.
   * Arguments are forwarded verbatim to buildIntent and (on fallback) selfSubmit.
   */
  const run = useCallback(
    async (...runArgs) => {
      setError(null)
      setResult(null)
      setIntent(null)

      // Relayer unset → gasless disabled → self-submit (the dormant-safe default).
      const relayer = makeRelayer(chainId)
      if (!relayer) return runSelfSubmit('relayer-unset', runArgs)

      // Failed health probe routes to self-submit BEFORE the user signs (FR-016).
      const healthy = await relayer.probeHealth()
      if (!healthy) return runSelfSubmit('relayer-unhealthy', runArgs)

      setStatus(INTENT_STATUS.SIGNING)
      let signed
      try {
        signed = await buildIntent(...runArgs)
      } catch (e) {
        if (e instanceof PaymentUnsupportedOnChain || e?.code === 'payment_unsupported_on_chain') {
          return runSelfSubmit('payment-unsupported', runArgs)
        }
        setStatus(INTENT_STATUS.FAILED)
        setError(e)
        return { via: 'relay', error: e }
      }
      unsubmittedRef.current = signed
      setIntent(signed)
      setStatus(INTENT_STATUS.SIGNED)

      setStatus(INTENT_STATUS.SUBMITTING)
      let accepted
      try {
        accepted = await relayer.relayIntent(signed)
      } catch (e) {
        if (e instanceof RelayerUnavailable) return runSelfSubmit(e.code || 'relayer-unavailable', runArgs)
        if (e instanceof PaymentUnsupportedOnChain || e?.code === 'payment_unsupported_on_chain') {
          return runSelfSubmit('payment-unsupported', runArgs)
        }
        // A validation verdict (RelayRejected): the intent stays unsubmitted — Invalidate and
        // self-submit remain available to the caller.
        setStatus(INTENT_STATUS.FAILED)
        setError(e)
        emit('failed', { uniquenessMarker: signed.uniquenessMarker, message: `${action} rejected by relayer: ${e?.reason || e?.message}` })
        return { via: 'relay', error: e }
      }

      emit('submitted', { intentId: accepted.intentId, uniquenessMarker: signed.uniquenessMarker })

      // Only a txHash-bearing 'confirmed' may render as confirmed (FR-018/SC-007).
      if (accepted.status === 'confirmed' && accepted.txHash) {
        unsubmittedRef.current = null
        const res = { via: 'relay', intentId: accepted.intentId, txHash: accepted.txHash }
        setResult(res)
        setStatus(INTENT_STATUS.CONFIRMED)
        emit('confirmed', { intentId: accepted.intentId, txHash: accepted.txHash, uniquenessMarker: signed.uniquenessMarker })
        return res
      }

      setStatus(INTENT_STATUS.PENDING)
      const deadline = Date.now() + maxPollMs
      let last = accepted
      while (Date.now() <= deadline) {
        try {
          last = await relayer.pollStatus(accepted.intentId)
        } catch {
          last = null // transient status-check failure — keep polling within the budget
        }
        if (last && last.status === 'confirmed' && last.txHash) {
          unsubmittedRef.current = null
          const res = { via: 'relay', intentId: accepted.intentId, txHash: last.txHash }
          setResult(res)
          setStatus(INTENT_STATUS.CONFIRMED)
          emit('confirmed', { intentId: accepted.intentId, txHash: last.txHash, uniquenessMarker: signed.uniquenessMarker })
          return res
        }
        if (last && (last.status === 'failed' || last.status === 'rejected')) {
          const e = new Error(last.reason || `Relayed ${action} ${last.status}`)
          setStatus(INTENT_STATUS.FAILED)
          setError(e)
          emit('failed', { intentId: accepted.intentId, uniquenessMarker: signed.uniquenessMarker, message: e.message })
          return { via: 'relay', intentId: accepted.intentId, error: e }
        }
        if (signed.validBefore && Date.now() / 1000 > Number(signed.validBefore)) {
          setStatus(INTENT_STATUS.EXPIRED)
          emit('expired', { intentId: accepted.intentId, uniquenessMarker: signed.uniquenessMarker })
          return { via: 'relay', intentId: accepted.intentId, status: 'expired' }
        }
        await sleep(pollIntervalMs)
      }
      // Poll budget exhausted without a terminal status: stay honestly 'pending' unless expired.
      if (signed.validBefore && Date.now() / 1000 > Number(signed.validBefore)) {
        setStatus(INTENT_STATUS.EXPIRED)
        emit('expired', { intentId: accepted.intentId, uniquenessMarker: signed.uniquenessMarker })
        return { via: 'relay', intentId: accepted.intentId, status: 'expired' }
      }
      return { via: 'relay', intentId: accepted.intentId, status: 'pending' }
    },
    [chainId, buildIntent, runSelfSubmit, emit, action, pollIntervalMs, maxPollMs]
  )

  /**
   * Invalidate the signed-but-unsubmitted intent (FR-006): sends `invalidateNonce(nonce)` (or the
   * token's `cancelAuthorization` — supply it as `write`) so the intent can never execute.
   * @param {(nonce: string, intent: object) => Promise<any>} [write] - overrides the hook-level
   *   invalidateNonce contract write for this call (self-invalidation, user pays gas)
   */
  const invalidate = useCallback(
    async (write) => {
      const pending = unsubmittedRef.current
      if (!pending) throw new Error('useIntentAction.invalidate: no unsubmitted intent to invalidate')
      const writeFn = typeof write === 'function' ? write : invalidateNonce
      if (typeof writeFn !== 'function') {
        throw new Error('useIntentAction.invalidate: a contract write function is required (pass one or configure invalidateNonce)')
      }
      await writeFn(pending.uniquenessMarker, pending)
      unsubmittedRef.current = null
      setStatus(INTENT_STATUS.INVALIDATED)
      emit('invalidated', { uniquenessMarker: pending.uniquenessMarker })
    },
    [invalidateNonce, emit]
  )

  /** Explicit user-chosen "Pay my own gas" escape hatch (e.g. from a signed/failed state). */
  const selfSubmitNow = useCallback((...runArgs) => runSelfSubmit('user-choice', runArgs), [runSelfSubmit])

  const reset = useCallback(() => {
    unsubmittedRef.current = null
    setStatus(INTENT_STATUS.IDLE)
    setIntent(null)
    setResult(null)
    setError(null)
  }, [])

  return { status, intent, result, error, run, invalidate, selfSubmitNow, reset }
}

export default useIntentAction
