/**
 * txProgressBus — a tiny, dependency-free pub/sub that carries the honest
 * passkey-batch lifecycle (spec 041 FR-017: draft → submitted → included |
 * failed | stalled) from WalletContext.sendCalls to ONE global progress
 * overlay, without threading an `onState` callback through every call site.
 *
 * Why a bus (not React context): sendCalls is invoked from ~30 surfaces
 * (transfer, vouchers, wagers, tokens, swap, DAO, custody). Publishing progress
 * through WalletContext's value would re-render every consumer on each ~3s poll
 * tick. A module-level store keeps that churn isolated to the overlay, which
 * subscribes via useSyncExternalStore.
 *
 * The overlay's job is to replace the frozen "Sending…" button state with a
 * truthful signature → submission → confirmation walk-through.
 */

// Coarse, user-facing phases. NOT the raw LIFECYCLE literals — those describe
// the submission engine; these describe what the person is waiting on.
export const PHASE = Object.freeze({
  PREPARING: 'preparing', // building the batch / resolving the account
  SIGNING: 'signing', // the WebAuthn ceremony (device prompt) is up
  SUBMITTING: 'submitting', // handed to the bundler/relayer
  CONFIRMING: 'confirming', // in flight; waiting for on-chain inclusion
  CONFIRMED: 'confirmed', // included on-chain (terminal, happy)
  FAILED: 'failed', // reverted or could not be submitted (terminal)
  STALLED: 'stalled', // submitted but not confirmed within the window (terminal-ish)
})

// The four visible steps in the overlay's progress rail, in order.
export const STEPS = Object.freeze(['Prepare', 'Sign', 'Submit', 'Confirm'])

// Which rail node is "active" for a given phase (index into STEPS; 4 = all done).
export const PHASE_STEP = Object.freeze({
  [PHASE.PREPARING]: 0,
  [PHASE.SIGNING]: 1,
  [PHASE.SUBMITTING]: 2,
  [PHASE.CONFIRMING]: 3,
  [PHASE.CONFIRMED]: 4,
  [PHASE.STALLED]: 3,
  [PHASE.FAILED]: -1,
})

export const isTerminalPhase = (phase) =>
  phase === PHASE.CONFIRMED || phase === PHASE.FAILED || phase === PHASE.STALLED

let current = null // the live snapshot (null = nothing in flight)
let seq = 0
const listeners = new Set()

function emit(next) {
  current = next
  for (const fn of listeners) {
    try {
      fn()
    } catch {
      /* a bad listener must not break the batch */
    }
  }
}

/** useSyncExternalStore subscribe. */
export function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** useSyncExternalStore getSnapshot — stable reference until the next emit(). */
export function getSnapshot() {
  return current
}

/**
 * Start tracking a new batch. Returns the sequence id so a caller could scope
 * later updates, though publishLifecycle/failTx operate on the latest batch.
 */
export function beginTx({ chainId = null } = {}) {
  seq += 1
  emit({
    active: true,
    seq,
    phase: PHASE.PREPARING,
    route: null,
    sponsored: null,
    chainId,
    startedAt: Date.now(),
    txHash: null,
    userOpHash: null,
    reason: null,
  })
  return seq
}

/**
 * Map one engine lifecycle event (submission.js LIFECYCLE) onto a user-facing
 * phase and merge it into the live snapshot. Ignored if no batch is active
 * (e.g. a stray late poll after dismissal).
 */
export function publishLifecycle(s) {
  if (!current?.active || !s?.state) return
  const patch = { ...current }
  switch (s.state) {
    case 'draft': // route chosen; the device prompt is imminent
      patch.phase = PHASE.SIGNING
      if (s.route != null) patch.route = s.route
      if (s.sponsored != null) patch.sponsored = s.sponsored
      break
    case 'submitted': // accepted by bundler/relayer; now waiting for inclusion
      patch.phase = PHASE.CONFIRMING
      if (s.sponsored != null) patch.sponsored = s.sponsored
      if (s.userOpHash) patch.userOpHash = s.userOpHash
      if (s.intentId) patch.userOpHash = patch.userOpHash || s.intentId
      break
    case 'included':
      patch.phase = PHASE.CONFIRMED
      if (s.txHash) patch.txHash = s.txHash
      break
    case 'failed':
      patch.phase = PHASE.FAILED
      patch.reason = s.reason || 'The transaction reverted on-chain.'
      break
    case 'stalled':
      patch.phase = PHASE.STALLED
      if (s.lastKnown?.userOpHash) patch.userOpHash = s.lastKnown.userOpHash
      break
    default:
      return // 'ceremony-signed' and unknowns don't move the visible phase
  }
  emit(patch)
}

/** Force the failed terminal (a thrown error before/around submission). */
export function failTx(reason) {
  if (!current?.active) return
  emit({ ...current, phase: PHASE.FAILED, reason: reason || 'Transaction failed.' })
}

/** Clear the overlay (user dismiss, or auto-dismiss after a happy confirmation). */
export function dismissTx() {
  if (!current) return
  emit(null)
}

// Test seam: reset module state between cases.
export function __resetTxProgress() {
  current = null
  seq = 0
  listeners.clear()
}
