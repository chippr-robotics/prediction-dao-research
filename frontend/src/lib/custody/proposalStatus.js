// Spec 043 (US2) — pure derivation of a vault proposal's status from on-chain facts (data-model.md state
// machine). No chain access here; callers supply the facts they read.

export const STATUS = {
  PENDING: 'pending', // approvals < threshold, executable nonce not yet reached or not enough approvals
  READY: 'ready', // approvals >= threshold AND nonce === current Safe nonce
  EXECUTED: 'executed',
  FAILED: 'failed',
  SUPERSEDED: 'superseded', // another tx executed at this nonce, or the proposer cancelled
}

/**
 * @param {object} f
 * @param {number} f.approvals       distinct owner approvals recorded on-chain for this safeTxHash
 * @param {number} f.threshold       current Safe threshold
 * @param {number} f.currentNonce    the Safe's current nonce
 * @param {number} f.proposalNonce   the nonce this proposal was built against
 * @param {boolean} [f.executed]     the Safe emitted ExecutionSuccess for this hash
 * @param {boolean} [f.failed]       the Safe emitted ExecutionFailure for this hash
 * @param {boolean} [f.cancelled]    the proposer emitted Cancelled for this hash
 * @returns {string} one of STATUS
 */
export function deriveProposalStatus(f) {
  if (f.executed) return STATUS.EXECUTED
  if (f.failed) return STATUS.FAILED
  // A proposal built against a past nonce can never execute — a different tx took that slot.
  if (f.proposalNonce < f.currentNonce) return STATUS.SUPERSEDED
  if (f.cancelled) return STATUS.SUPERSEDED
  // At (or ahead of) the current nonce: ready only when this is the next nonce AND threshold is met.
  if (f.proposalNonce === f.currentNonce && f.approvals >= f.threshold) return STATUS.READY
  return STATUS.PENDING
}

/** Whether a status belongs in the live queue (vs. history). */
export function isQueued(status) {
  return status === STATUS.PENDING || status === STATUS.READY
}

/** Approvals still needed before a proposal can execute (0 when ready/execut­able). */
export function approvalsRemaining(approvals, threshold) {
  return Math.max(0, Number(threshold) - Number(approvals))
}
