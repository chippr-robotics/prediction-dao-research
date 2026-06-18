import { useEffect, useState } from 'react'
import { ethers } from 'ethers'

/**
 * Resolve button with resolve-window countdown.
 *
 * Shows a Resolve button when the connected wallet is authorized and the wager is
 * active and inside its resolution window [tradingEndTime, resolveDeadlineTime].
 * Before tradingEndTime it shows a live countdown instead; after the deadline it
 * renders nothing (the Claim Refund flow takes over).
 *
 * Extracted from MyMarketsModal (spec 017) so both the card grid and the detail
 * view can import it without a circular dependency.
 *
 * @param {object}   props
 * @param {object}   props.market
 * @param {Function} props.onResolve
 * @param {string}   props.account
 * @param {('compact'|'full')} [props.variant='compact'] - 'compact' for cards/rows,
 *   'full' for the detail view.
 */
export default function ResolveButtonWithCountdown({ market, onResolve, account, variant = 'compact' }) {
  // Tick every second so the resolve window opens automatically without a reload.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const userAddr = account?.toLowerCase()
  const isCreator = market.creator?.toLowerCase() === userAddr
  const isOpponent = market.participants?.length > 1 &&
    market.participants[1]?.toLowerCase() === userAddr
  const isArbitrator = market.arbitrator &&
    market.arbitrator !== ethers.ZeroAddress &&
    market.arbitrator.toLowerCase() === userAddr

  const resType = market.resolutionType ?? 0
  const isAuthorized = (() => {
    if (resType === 0) return isCreator || isOpponent || isArbitrator
    if (resType === 1) return isCreator
    if (resType === 2) return isOpponent
    if (resType === 3) return isArbitrator
    return false
  })()

  // A draw returns both stakes and so needs BOTH participants to agree; allow
  // either participant to open the resolution flow to propose/confirm a draw on
  // participant-resolved types (Either/Creator/Opponent), even when they cannot
  // declare a winner (e.g. the opponent on a Creator-resolved wager).
  const canProposeDraw = (resType === 0 || resType === 1 || resType === 2) && (isCreator || isOpponent)

  if (!isAuthorized && !canProposeDraw) return null

  const status = market.computedStatus || market.status
  if (status === 'resolved' || status === 'disputed' || status === 'cancelled' ||
      status === 'canceled' || status === 'refunded' || status === 'expired' ||
      status === 'declined' || status === 'pending_acceptance') {
    return null
  }

  // Resolve-window gate. Resolution is only allowed in
  // [tradingEndTime, resolveDeadlineTime]:
  //   - before tradingEndTime  → show a countdown, no resolve button
  //   - after resolveDeadlineTime → nothing (the Claim Refund flow takes over)
  // Fall back to "resolvable" when the timestamps are missing (e.g. legacy wagers).
  const tradingEndTime = market.tradingEndTime
  const resolveDeadlineTime = market.resolveDeadlineTime
  if (typeof resolveDeadlineTime === 'number' && now > resolveDeadlineTime) {
    return null
  }
  if (typeof tradingEndTime === 'number' && now < tradingEndTime) {
    const diff = tradingEndTime - now
    const days = Math.floor(diff / 86400000)
    const hours = Math.floor((diff % 86400000) / 3600000)
    const minutes = Math.floor((diff % 3600000) / 60000)
    const label = days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
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
