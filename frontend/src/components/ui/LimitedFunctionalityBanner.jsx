import { useEffect, useRef } from 'react'
import { useSwitchChain } from 'wagmi'
import { useChainTokens } from '../../hooks/useChainTokens'
import { PRIMARY_CHAIN_ID, getNetwork } from '../../config/networks'
import './LimitedFunctionalityBanner.css'

/**
 * Banner shown when the user is connected to a chain marked
 * `limitedFunctionality: true` in networks.js (Mordor today). Renders nothing
 * on fully-supported chains. Stacks below the DevelopmentWarningBanner via the
 * shared --dev-banner-height CSS variable, and publishes its own height as
 * --limited-banner-height so the Header can offset by the combined stack.
 */
function LimitedFunctionalityBanner() {
  const { limitedFunctionality, networkName } = useChainTokens()
  const { switchChain, isPending } = useSwitchChain()
  const ref = useRef(null)

  // Publish the rendered height as a CSS variable so the Header (and any other
  // sticky/fixed surface) can lay out below the full banner stack. When not
  // rendered, the variable is removed so the Header sits at top: 0.
  useEffect(() => {
    if (!limitedFunctionality) {
      document.documentElement.style.removeProperty('--limited-banner-height')
      return
    }

    const apply = () => {
      const h = ref.current?.getBoundingClientRect().height
      if (h) {
        document.documentElement.style.setProperty('--limited-banner-height', `${Math.ceil(h)}px`)
      }
    }
    apply()
    window.addEventListener('resize', apply)
    return () => {
      window.removeEventListener('resize', apply)
      document.documentElement.style.removeProperty('--limited-banner-height')
    }
  }, [limitedFunctionality])

  if (!limitedFunctionality) return null

  const primary = getNetwork(PRIMARY_CHAIN_ID)
  const primaryName = primary?.name || 'Polygon Amoy'

  const handleSwitch = () => {
    if (typeof switchChain === 'function') {
      switchChain({ chainId: PRIMARY_CHAIN_ID })
    }
  }

  return (
    <div
      ref={ref}
      className="limited-functionality-banner"
      role="status"
      aria-live="polite"
    >
      <div className="limited-functionality-banner__content">
        <span className="limited-functionality-banner__icon" aria-hidden="true">⚠️</span>
        <span className="limited-functionality-banner__text">
          You're connected to <strong>{networkName}</strong>. Polymarket-pegged
          side bets aren't available here — switch to <strong>{primaryName}</strong> for
          full functionality.
        </span>
        <button
          type="button"
          className="limited-functionality-banner__action"
          onClick={handleSwitch}
          disabled={isPending}
        >
          {isPending ? 'Switching…' : `Switch to ${primaryName}`}
        </button>
      </div>
    </div>
  )
}

export default LimitedFunctionalityBanner
