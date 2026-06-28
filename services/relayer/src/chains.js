/**
 * Per-chain ethers v6 wiring for the relayer. One provider + one gas-only signer per enabled chain.
 *
 * Minimal ABIs only — the relayer touches exactly three methods:
 *   ZKWagerPoolFactory.poolAddressToId(address) -> uint256  (is this a pool we know? non-zero == yes)
 *   SanctionsGuard.isAllowed(address) -> bool               (re-screen `from`, FR-021d)
 *   ZKWagerPool.{buyIn(),token(),joinWithAuthorization(...)}(the only submit)
 */
import { ethers } from 'ethers'

export const FACTORY_ABI = [
  'function poolAddressToId(address pool) view returns (uint256)',
]

export const SANCTIONS_GUARD_ABI = [
  'function isAllowed(address account) view returns (bool)',
]

export const POOL_ABI = [
  'function buyIn() view returns (uint256)',
  'function token() view returns (address)',
  'function joinWithAuthorization(uint256 identityCommitment,address from,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,uint8 v,bytes32 r,bytes32 s)',
]

/**
 * Build runtime chain handles from validated config. Lazy-free: providers/signers are created up front
 * (one per chain) and reused; the service is otherwise stateless.
 * @param {ReturnType<import('./config.js').loadConfig>} config
 */
export function buildChains(config) {
  const handles = {}
  for (const chainId of config.enabledChainIds) {
    const c = config.chains[chainId]
    // staticNetwork: we trust ENABLED_CHAIN_IDS, and skip per-call chainId round-trips.
    const provider = new ethers.JsonRpcProvider(c.rpcUrl, chainId, { staticNetwork: ethers.Network.from(chainId) })
    const signer = new ethers.Wallet(config.privateKey, provider)
    const factory = new ethers.Contract(c.poolFactory, FACTORY_ABI, provider)
    const sanctionsGuard = c.sanctionsGuard ? new ethers.Contract(c.sanctionsGuard, SANCTIONS_GUARD_ABI, provider) : null
    handles[chainId] = {
      chainId,
      config: c,
      provider,
      signer,
      factory,
      sanctionsGuard,
      pool: (address) => new ethers.Contract(address, POOL_ABI, signer),
    }
  }
  return handles
}
