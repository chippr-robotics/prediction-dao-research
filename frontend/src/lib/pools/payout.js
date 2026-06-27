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
