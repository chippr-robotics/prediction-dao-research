/**
 * Payout-matrix helpers for ZK-Wager Pool resolution (spec 034).
 *
 * The creator proposes an outcome by committing to a payout matrix: an array of
 * { claimNullifier, amount } rows (each winner identified by their claim-scope Semaphore nullifier — the
 * "claim code" they reveal off-chain). The on-chain proposalId / lockedOutcome is keccak256(abi.encode(
 * PayoutEntry[])), computed identically here so the UI can derive the id the creator proposes and that a
 * claimant must pass back. The matrix preimage is shared off-chain (copied/downloaded) — only its hash
 * lives on-chain.
 */
import { AbiCoder, keccak256 } from 'ethers'

/** Normalise a row to bigint fields. */
function normEntry(e) {
  return { claimNullifier: BigInt(e.claimNullifier), amount: BigInt(e.amount) }
}

/** keccak256(abi.encode(PayoutEntry[])) — equals the contract's lockedOutcome / proposalId. */
export function payoutMatrixHash(entries) {
  const coder = AbiCoder.defaultAbiCoder()
  const enc = coder.encode(
    ['tuple(uint256 claimNullifier,uint256 amount)[]'],
    [entries.map(normEntry)]
  )
  return keccak256(enc)
}

/** Sum of all row amounts (must equal the pool escrow = members * buyIn). */
export function payoutMatrixSum(entries) {
  return entries.reduce((acc, e) => acc + BigInt(e.amount), 0n)
}

/** Serialise the matrix for off-chain sharing (creator → winners). */
export function serializeMatrix(entries) {
  return JSON.stringify(entries.map((e) => ({ claimNullifier: String(e.claimNullifier), amount: String(e.amount) })))
}

/** Parse a shared matrix string back to rows; returns null on malformed input. */
export function parseMatrix(text) {
  try {
    const arr = JSON.parse(text)
    if (!Array.isArray(arr)) return null
    return arr.map((e) => ({ claimNullifier: String(BigInt(e.claimNullifier)), amount: String(BigInt(e.amount)) }))
  } catch {
    return null
  }
}

/**
 * Shared-proposal envelope (spec 034 UX round 3). The creator shares TWO things bundled together:
 *   - `matrix`: the { claimNullifier, amount } rows the contract hashes/claims against (the secret-ish
 *     part — claim codes stay out of sight, but are needed to claim).
 *   - `display`: a { commitment, amount } map so EVERY member's roster card can show a medal + amount
 *     for who's in the money. Identity commitments are public (from Joined events), so sharing them
 *     with amounts reveals nothing the roster doesn't already show.
 * The display map is a convenience annotation: it is validated only by checking its amount multiset
 * matches the on-chain-verified matrix, never trusted for the actual payout (that stays code-gated).
 */
export function serializeSharedProposal({ entries, display }) {
  return JSON.stringify({
    v: 1,
    matrix: entries.map((e) => ({ claimNullifier: String(e.claimNullifier), amount: String(e.amount) })),
    display: (display || []).map((d) => ({ commitment: String(d.commitment), amount: String(d.amount) })),
  })
}

/**
 * Parse a shared proposal. Accepts the envelope above OR a legacy bare `PayoutEntry[]` array (older
 * shares / the on-chain-only path). Returns { entries, display } — `display` is null when absent.
 */
export function parseSharedProposal(text) {
  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) {
      const entries = parseMatrix(text)
      return entries ? { entries, display: null } : null
    }
    if (parsed && Array.isArray(parsed.matrix)) {
      const entries = parseMatrix(JSON.stringify(parsed.matrix))
      if (!entries) return null
      const display = Array.isArray(parsed.display)
        ? parsed.display.map((d) => ({ commitment: String(BigInt(d.commitment)), amount: String(BigInt(d.amount)) }))
        : null
      return { entries, display }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Build a { commitment → amount } lookup for the roster from a verified matrix + its display map.
 * Only used once the matrix hash has been verified against the on-chain proposalId, and only when the
 * display amounts (multiset) match the matrix amounts — so a tampered display can't inflate a card.
 */
export function payoutDisplayMap(entries, display) {
  if (!display || !display.length) return null
  const matrixAmounts = [...entries.map((e) => String(e.amount))].sort()
  const displayAmounts = [...display.map((d) => String(d.amount))].sort()
  if (matrixAmounts.length !== displayAmounts.length) return null
  for (let i = 0; i < matrixAmounts.length; i++) if (matrixAmounts[i] !== displayAmounts[i]) return null
  const map = new Map()
  for (const d of display) map.set(String(d.commitment), BigInt(d.amount))
  return map
}
