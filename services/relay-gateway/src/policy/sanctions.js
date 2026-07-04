/**
 * Sanctions re-screen of the RECOVERED SIGNER — fail-closed (FR-013, SC-005).
 *
 * Defense-in-depth duplicate of the contracts' own on-chain screen: the on-chain guard remains
 * authoritative, but re-screening here means the relayer never even pays gas for a wallet the
 * guard would reject, and never submits unscreened. Semantics:
 *
 *   - guard says not allowed             -> 403 sanctioned_signer
 *   - screening cannot be performed      -> 503 screening_unavailable   (FAIL CLOSED — never
 *     (RPC error, decode error, no guard)   "assume fine and submit")
 *
 * Uses ISanctionsGuard.isAllowed(address) (contracts/interfaces/ISanctionsGuard.sol), which is
 * itself fail-closed over the Chainalysis oracle + deny-list.
 */
import { ethers } from 'ethers'
import { GatewayError } from '../errors.js'

export const SANCTIONS_GUARD_ABI = ['function isAllowed(address account) view returns (bool)']

const iface = new ethers.Interface(SANCTIONS_GUARD_ABI)

/**
 * @param {{providers: Record<number, {call: Function}>, chains: Record<number, {sanctionsGuard: string}>}} deps
 */
export function createSanctionsScreen({ providers, chains }) {
  return {
    /**
     * @param {number} chainId
     * @param {string} signer recovered signer address
     * @throws {GatewayError} 403 sanctioned_signer | 503 screening_unavailable
     */
    async screen(chainId, signer) {
      const chain = chains[chainId]
      const provider = providers[chainId]
      if (!chain?.sanctionsGuard || !provider) {
        throw new GatewayError(503, 'screening_unavailable', 'sanctions screening is required but not configured for this chain')
      }
      let allowed
      try {
        const data = iface.encodeFunctionData('isAllowed', [signer])
        const result = await provider.call({ to: chain.sanctionsGuard, data })
        ;[allowed] = iface.decodeFunctionResult('isAllowed', result)
      } catch {
        // Fail closed: an unreachable/erroring guard is NEVER treated as allowed (SC-005).
        throw new GatewayError(503, 'screening_unavailable', 'sanctions screening could not be performed; try again or self-submit')
      }
      if (!allowed) {
        throw new GatewayError(403, 'sanctioned_signer', 'signer failed sanctions screening')
      }
    },
  }
}
