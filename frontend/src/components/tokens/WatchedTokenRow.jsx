/**
 * WatchedTokenRow (Spec 034) — one row in the "My Tokens" assets list.
 *
 * Shows the token logo (registry + trusted host only, else placeholder — FR-024),
 * symbol/name, the contract address (FR-018, anti-lookalike), an "unverified"
 * badge for custom/unknown tokens (FR-025), the live balance ("—" when
 * unavailable, never a misleading 0 — FR-005), and a remove control (FR-009).
 */

import { useState } from 'react'
import { resolveLogoSrc } from '../../lib/tokens/tokenLogo'
import TokenLogoPlaceholder from './TokenLogoPlaceholder'

const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '')

export default function WatchedTokenRow({ entry, balance, onRemove }) {
  const [imgFailed, setImgFailed] = useState(false)
  const logoSrc = resolveLogoSrc(entry)
  const showImg = Boolean(logoSrc) && !imgFailed
  const balanceText = balance?.status === 'ok' ? balance.formatted : '—'

  return (
    <div className="tm-row tm-watch-row">
      <div className="tm-watch-ident">
        {showImg ? (
          <img
            className="tm-logo"
            src={logoSrc}
            alt=""
            width="28"
            height="28"
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <TokenLogoPlaceholder symbol={entry.symbol} />
        )}
        <div style={{ minWidth: 0 }}>
          <div className="tm-row-name">
            {entry.symbol}
            {entry.source === 'custom' && (
              <span className="tm-unverified-badge" title="Not in the token registry">
                unverified
              </span>
            )}
          </div>
          <div className="tm-row-sub">{entry.name || '—'}</div>
          <code className="tm-row-addr" title={entry.address}>
            {short(entry.address)}
          </code>
        </div>
      </div>
      <div className="tm-balance tm-mono" aria-label={`${entry.symbol} balance`}>
        {balanceText}
      </div>
      <div>
        <button
          type="button"
          className="tm-btn"
          onClick={() => onRemove(entry.address, entry.chainId)}
          aria-label={`Remove ${entry.symbol} from your watchlist`}
        >
          Remove
        </button>
      </div>
    </div>
  )
}
