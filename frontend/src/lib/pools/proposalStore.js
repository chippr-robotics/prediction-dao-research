/**
 * Device-local store of a pool's proposed payout-matrix PREIMAGE (tester bug: "participants are
 * currently unable to see proposed solution").
 *
 * Only the matrix HASH (proposalId) lives on-chain by design; the preimage is coordinated off-chain.
 * The creator's device saves the matrix at propose time so (a) the creator can always re-copy/share it
 * and (b) any device that has received the matrix can re-render the breakdown later. A member who
 * pastes a shared matrix gets it verified against the on-chain proposalId before it is trusted or
 * stored. Never throws.
 */
import { serializeMatrix, parseMatrix, payoutMatrixHash } from './payout'

const key = (pool) => `fairwins_pool_matrix_v1_${String(pool || '').toLowerCase()}`

/** Save the proposed matrix for a pool (overwrites any earlier proposal's copy). */
export function saveProposedMatrix(pool, proposalId, entries) {
  if (!pool || !proposalId || !entries) return
  try {
    localStorage.setItem(key(pool), JSON.stringify({ proposalId, matrix: serializeMatrix(entries) }))
  } catch {
    /* private browsing / quota — degrade to session-only */
  }
}

/** Read the stored matrix for a pool without an id check (used to prefill the claim form once the
 * pool is resolved and the on-chain currentProposalId may no longer be exposed). Parse-checked only —
 * the contract still verifies the hash against lockedOutcome at claim time. Returns { text, entries }
 * or null. */
export function readStoredMatrix(pool) {
  if (!pool) return null
  try {
    const raw = localStorage.getItem(key(pool))
    const stored = raw ? JSON.parse(raw) : null
    const entries = stored ? parseMatrix(stored.matrix) : null
    return entries ? { text: stored.matrix, entries } : null
  } catch {
    return null
  }
}

/**
 * Read the stored matrix for a pool IF it matches `proposalId` (a stale copy of an older proposal is
 * ignored). Returns { text, entries } or null.
 */
export function readProposedMatrix(pool, proposalId) {
  if (!pool || !proposalId) return null
  try {
    const raw = localStorage.getItem(key(pool))
    const stored = raw ? JSON.parse(raw) : null
    if (!stored || stored.proposalId !== proposalId) return null
    const entries = parseMatrix(stored.matrix)
    if (!entries || payoutMatrixHash(entries) !== proposalId) return null
    return { text: stored.matrix, entries }
  } catch {
    return null
  }
}
