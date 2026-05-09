import { useSwitchChain } from 'wagmi'
import { useChainTokens } from '../../hooks/useChainTokens'
import { PRIMARY_CHAIN_ID, getNetwork } from '../../config/networks'

/**
 * Top-of-app banner shown when the user is connected to a chain marked
 * `limitedFunctionality: true` in networks.js (currently Mordor). Explains
 * which features are missing and offers a one-click switch to the primary
 * chain (Polygon Amoy).
 *
 * Renders nothing when on a fully-supported chain.
 */
export function LimitedFunctionalityBanner() {
  const { limitedFunctionality, networkName } = useChainTokens()
  const { switchChain } = useSwitchChain()

  if (!limitedFunctionality) return null

  const primary = getNetwork(PRIMARY_CHAIN_ID)
  const primaryName = primary?.name || 'Polygon Amoy'

  return (
    <div
      role="status"
      style={{
        padding: '0.75rem 1rem',
        background: '#FFF4CE',
        color: '#5A4500',
        borderBottom: '1px solid #E0C97A',
        display: 'flex',
        gap: '0.75rem',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '0.9rem',
      }}
    >
      <span>
        You're connected to <strong>{networkName}</strong>. Polymarket-pegged
        side bets aren't available here — switch to <strong>{primaryName}</strong> for
        full functionality.
      </span>
      <button
        type="button"
        onClick={() => switchChain?.({ chainId: PRIMARY_CHAIN_ID })}
        style={{
          padding: '0.4rem 0.75rem',
          background: '#5A4500',
          color: '#FFF4CE',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontWeight: 600,
        }}
      >
        Switch to {primaryName}
      </button>
    </div>
  )
}

export default LimitedFunctionalityBanner
