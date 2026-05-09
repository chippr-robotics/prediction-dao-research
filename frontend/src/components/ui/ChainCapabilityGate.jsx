import { useChainTokens } from '../../hooks/useChainTokens'

/**
 * Conditionally render children based on whether the active chain supports a
 * named capability. Keys come from `capabilities` on each network entry in
 * frontend/src/config/networks.js. Currently used to hide Polymarket-pegging
 * UI on Mordor (`polymarketSidebets`) so users are steered toward Amoy.
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
