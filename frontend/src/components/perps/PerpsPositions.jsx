/**
 * PerpsPositions (spec 082 US2) — the connected account's open positions per venue, read-only.
 *
 * Self-hides when there is nothing to say (disconnected / unsupported / idle) — the Predict
 * PositionsList convention. Per-venue honesty: an unreadable venue is disclosed by name while
 * the others render; GMX is disclosed as view-on-venue (its positions are not readable in-app
 * this release); an account with no positions gets a quiet empty state, not an error.
 * Managing a position ALWAYS happens on the venue — there are no in-app controls (FR-018).
 */
import InfoTip from '../ui/InfoTip'
import PerpsVenueBadge from './PerpsVenueBadge'
import { tradeLinkFor } from '../../lib/perps/linkouts'
import { formatUsd, formatSignedUsd, formatPairPrice, formatLeverage } from '../../lib/perps/format'
import { PERPS_TIPS } from '../../lib/perps/perpsCopy'
import { PERP_VENUES } from '../../config/perps'

export default function PerpsPositions({ status, positions, unreadableVenues, attribution }) {
  if (status === 'idle') return null

  return (
    <section className="perps-positions" aria-label="Your perp positions">
      <h4 className="perps-positions-title">Your positions</h4>

      {unreadableVenues.length > 0 && (
        <p className="perps-positions-unreadable" role="status">
          {unreadableVenues.map((v) => PERP_VENUES[v]?.label ?? v).join(' and ')} positions could not be
          read just now — other venues are unaffected. Your positions themselves are untouched.
        </p>
      )}

      {status === 'loading' && positions.length === 0 ? (
        <p className="perps-loading" role="status">
          Checking venues for open positions…
        </p>
      ) : status === 'unavailable' ? (
        <p className="perps-positions-unreadable" role="status">
          Positions could not be read just now. Your positions themselves are untouched — try again shortly.
        </p>
      ) : positions.length === 0 ? (
        <p className="perps-positions-empty">No open perp positions found for this account.</p>
      ) : (
        <ul className="perps-positions-list">
          {positions.map((p) => {
            const href = tradeLinkFor(p, attribution)
            return (
              <li key={`${p.venue}:${p.id}`} className="perps-position-row">
                <div className="perps-position-main">
                  <span className={`perps-direction perps-direction-${p.direction}`}>
                    {p.direction === 'long' ? 'Long' : 'Short'}
                  </span>
                  <span className="perps-position-symbol">{p.symbol}</span>
                  <PerpsVenueBadge venue={p.venue} chainId={p.chainId} />
                </div>
                <dl className="perps-position-stats">
                  <div>
                    <dt>Size</dt>
                    <dd>{formatUsd(p.sizeUsd)}</dd>
                  </div>
                  <div>
                    <dt>Entry</dt>
                    <dd>{formatPairPrice(p.entryPrice)}</dd>
                  </div>
                  <div>
                    <dt>Leverage</dt>
                    <dd>{formatLeverage(p.leverage)}</dd>
                  </div>
                  <div>
                    <dt>
                      PnL <InfoTip label="About PnL">{PERPS_TIPS.pnl}</InfoTip>
                    </dt>
                    <dd className={p.unrealizedPnlUsd > 0 ? 'perps-pnl-up' : p.unrealizedPnlUsd < 0 ? 'perps-pnl-down' : ''}>
                      {formatSignedUsd(p.unrealizedPnlUsd)}
                    </dd>
                  </div>
                </dl>
                {href && (
                  <a
                    className="perps-trade-link"
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Manage this position on ${PERP_VENUES[p.venue]?.label ?? p.venue} (opens in a new tab)`}
                  >
                    Manage on venue ↗
                  </a>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <p className="perps-positions-note">
        GMX positions are not readable in-app yet — view them on{' '}
        <a href="https://app.gmx.io" target="_blank" rel="noopener noreferrer">
          GMX ↗
        </a>
        . Positions are managed on their venue; FairWins never holds them.
      </p>
    </section>
  )
}
