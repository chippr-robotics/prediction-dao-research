import { useChainTokens } from '../../hooks/useChainTokens'

/**
 * Conditionally render children based on whether the active chain supports a
 * named capability. Keys come from `capabilities` on each network entry in
 * frontend/src/config/networks.js (e.g. `polymarketSidebets`, `dex`,
 * `friendMarkets`).
 *
 * Pass `fallback` to render an alternative (e.g. an explainer with a "switch
 * network" button); otherwise renders nothing when the capability is absent.
 */
export function ChainCapabilityGate({ capability, fallback = null, children }) {
  const { capabilities } = useChainTokens()
  if (!capabilities?.[capability]) return fallback
  return children
}

export default ChainCapabilityGate
