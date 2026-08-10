import { useEffect, useState } from 'react'
import { resolveControlState, countdownLabel } from './resolveWindow'

/**
 * Resolve button with resolve-window countdown.
 *
 * Shows a Resolve button when the connected wallet is authorized and the wager is
 * active and inside its resolution window [tradingEndTime, resolveDeadlineTime].
 * Before tradingEndTime it shows a live countdown instead; after the deadline it
 * renders nothing (the Claim Refund flow takes over).
 *
 * Extracted from MyMarketsModal (spec 017) so both the list rows and the detail
 * view can import it without a circular dependency.
 *
 * @param {object}   props
 * @param {object}   props.market
 * @param {Function} props.onResolve
 * @param {string}   props.account
 * @param {('compact'|'full')} [props.variant='compact'] - 'compact' for rows,
 *   'full' for the detail view.
 */
export default function ResolveButtonWithCountdown({ market, onResolve, account, variant = 'compact' }) {
  // Tick every second so the resolve window opens automatically without a reload.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const { state, msUntilOpen } = resolveControlState(market, account, now)

  if (state === 'none') return null

  if (state === 'countdown') {
    const label = countdownLabel(msUntilOpen)
    if (variant === 'full') {
      return (
        <div className="mm-resolve-countdown-full" title="Resolution opens after the wager's end time">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          Resolution opens in <strong>{label}</strong>
        </div>
      )
    }
    return (
      <span className="mm-resolve-countdown" title="Resolution opens after the wager's end time">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
        {label}
      </span>
    )
  }

  if (variant === 'full') {
    return (
      <button
        type="button"
        className="mm-btn-primary"
        onClick={() => onResolve(market)}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        Resolve Market
      </button>
    )
  }
  return (
    <button
      type="button"
      className="wc-action wc-action-primary"
      onClick={(e) => { e.stopPropagation(); onResolve(market) }}
      title="Resolve wager"
    >
      Resolve
    </button>
  )
}
