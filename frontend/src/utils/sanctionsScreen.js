/**
 * Advisory client-side sanctions screening (Spec 007 — FR-016).
 *
 * This is a UX-only pre-check: it reads the on-chain SanctionsGuard so the UI can warn /
 * block early before a user spends gas. It is NOT the enforcement layer — the on-chain
 * guard in WagerRegistry/MembershipManager (FR-054) is what actually prevents a sanctioned
 * address from proceeding, even if this client check is bypassed.
 *
 * Fail-closed UX: if the guard address isn't configured or the read fails, we return
 * `available: false` so the UI does NOT claim the address is "clear" (it should surface an
 * uncertain/blocked state rather than green-light).
 */

import { ethers } from 'ethers'
import { SANCTIONS_GUARD_ABI } from '../abis/SanctionsGuard'
import { getContractAddress } from '../config/contracts'

/**
 * Screen using an already-constructed guard contract (testable seam).
 * @param {{ isAllowed: (a: string) => Promise<boolean> }} guard
 * @param {string} account
 * @returns {Promise<{ allowed: boolean, available: boolean }>}
 */
export async function screenWithContract(guard, account) {
  try {
    const allowed = await guard.isAllowed(account)
    return { allowed: Boolean(allowed), available: true }
  } catch {
    return { allowed: false, available: false } // fail-closed UX
  }
}

/**
 * Screen an address against the configured on-chain SanctionsGuard.
 * @param {string} account - wallet address to screen
 * @param {import('ethers').Provider} provider - a read provider
 * @returns {Promise<{ allowed: boolean, available: boolean }>}
 */
export async function screenAddress(account, provider) {
  const address = getContractAddress('sanctionsGuard')
  if (!address) return { allowed: false, available: false } // not configured -> can't screen
  const guard = new ethers.Contract(address, SANCTIONS_GUARD_ABI, provider)
  return screenWithContract(guard, account)
}

/**
 * Convenience: true only when the address was successfully screened AND is allowed.
 * An unavailable result is treated as not-clear (fail-closed).
 * @param {{ allowed: boolean, available: boolean }} result
 * @returns {boolean}
 */
export function isClear(result) {
  return Boolean(result && result.available && result.allowed)
}
