import { useChainTokens } from '../../hooks/useChainTokens'

/**
 * Renders the active chain's stablecoin symbol (USDC on Polygon Amoy).
 * Use this in JSX where the symbol is the only thing being rendered, so labels
 * track the connected chain.
 */
export function StableToken() {
  const { stable } = useChainTokens()
  return <>{stable}</>
}

export default StableToken
