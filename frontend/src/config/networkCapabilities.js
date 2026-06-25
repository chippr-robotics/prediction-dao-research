/**
 * Per-chain protocol capability descriptors.
 *
 * Powers the informational tags on the My Account → Network tab so members can
 * see which FairWins features are actually live on a given network before they
 * switch. `deployed(chainId)` resolves against the per-chain deployment record
 * (contracts.js) and the per-chain capability flags (networks.js) — it does not
 * hit the chain, so it is cheap to call during render.
 */

import { getContractAddressForChain } from './contracts'
import { getNetwork } from './networks'

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/

const isDeployed = (addr) => typeof addr === 'string' && ADDRESS_RE.test(addr)

const hasContract = (chainId, name) =>
  isDeployed(getContractAddressForChain(name, chainId))

export const NETWORK_FEATURES = [
  {
    key: 'wagers',
    label: 'P2P Wagers',
    description: 'Create and settle peer-to-peer wagers.',
    deployed: (chainId) => hasContract(chainId, 'wagerRegistry'),
  },
  {
    key: 'membership',
    label: 'Memberships',
    description: 'On-chain membership tiers and access roles.',
    deployed: (chainId) => hasContract(chainId, 'membershipManager'),
  },
  {
    key: 'encryptedWagers',
    label: 'Encrypted Wagers',
    description: 'Private wagers backed by the on-chain key registry.',
    deployed: (chainId) => hasContract(chainId, 'keyRegistry'),
  },
  {
    key: 'sanctionsGuard',
    label: 'Sanctions Guard',
    description: 'OFAC sanctions screening enforced on participation.',
    deployed: (chainId) => hasContract(chainId, 'sanctionsGuard'),
  },
  {
    key: 'polymarketOracle',
    label: 'Polymarket Oracle',
    description: 'Settle wagers by reference to Polymarket markets.',
    deployed: (chainId) => hasContract(chainId, 'polymarketAdapter'),
  },
  {
    key: 'chainlinkOracle',
    label: 'Chainlink Oracle',
    description: 'Resolve via Chainlink Data Feeds / Functions.',
    deployed: (chainId) =>
      hasContract(chainId, 'chainlinkDataFeedAdapter') ||
      hasContract(chainId, 'chainlinkFunctionsAdapter'),
  },
  {
    key: 'umaOracle',
    label: 'UMA Oracle',
    description: 'Resolve via the UMA Optimistic Oracle.',
    deployed: (chainId) => hasContract(chainId, 'umaAdapter'),
  },
  {
    key: 'swap',
    label: 'Token Swap',
    description: 'In-app token swaps via the network’s DEX (Uniswap or ETCswap).',
    deployed: (chainId) => Boolean(getNetwork(chainId)?.capabilities?.dex),
  },
]

/**
 * Resolve every capability tag for a chain, flattening `deployed` to a boolean.
 *
 * @param {number} chainId
 * @returns {{ key: string, label: string, description: string, deployed: boolean }[]}
 */
export function getNetworkFeatures(chainId) {
  return NETWORK_FEATURES.map(({ key, label, description, deployed }) => ({
    key,
    label,
    description,
    deployed: deployed(chainId),
  }))
}

export default getNetworkFeatures
