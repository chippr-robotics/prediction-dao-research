import { useState } from 'react'
import { useOpponentName } from '../../hooks/useOpponentName'
import { formatShortAddress } from './wagerCardHelpers'
import './OpponentName.css'

/**
 * OpponentName (spec 040, US1 / FR-001..004)
 *
 * The single opponent renderer for My Wagers. Shows the friendliest available name
 * (address book → ENS → deterministic two-word name) and, when interactive, lets the
 * member tap to reveal + copy the full address.
 *
 * - `isSelf` renders "You" and skips resolution.
 * - `interactive={false}` renders a plain, non-focusable span — use inside another
 *   interactive element (e.g. the card's clickable preview header) to avoid nesting
 *   a button in a button.
 */
export default function OpponentName({ address, isSelf = false, interactive = true }) {
  const [revealed, setRevealed] = useState(false)
  const { displayName } = useOpponentName(isSelf ? undefined : address)

  if (isSelf) return <span className="opponent-name opponent-name--self">You</span>

  if (!address || typeof address !== 'string' || !address.startsWith('0x')) {
    return <span className="opponent-name">{formatShortAddress(address)}</span>
  }

  const full = formatShortAddress(address)

  if (!interactive) {
    return <span className="opponent-name">{displayName}</span>
  }

  const copy = (e) => {
    e.stopPropagation()
    navigator.clipboard?.writeText(address).catch(() => {})
  }

  return (
    <span className="opponent-name opponent-name--interactive">
      <button
        type="button"
        className="opponent-name-toggle"
        aria-expanded={revealed}
        aria-label={revealed ? `Hide address for ${displayName}` : `Show full address for ${displayName}`}
        onClick={(e) => { e.stopPropagation(); setRevealed((v) => !v) }}
      >
        {displayName}
      </button>
      {revealed && (
        <span className="opponent-name-address">
          <code className="opponent-name-full" title={address}>{full}</code>
          <button
            type="button"
            className="opponent-name-copy"
            aria-label={`Copy address ${address}`}
            title="Copy address"
            onClick={copy}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </button>
        </span>
      )}
    </span>
  )
}
