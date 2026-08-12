/**
 * PerpsPairTable (spec 082 US1, extended by spec 083 US3) — the merged cross-venue pairs table.
 *
 * Honesty rules embodied here: a metric the venue did not report renders '—' (never 0); sorting
 * treats missing values as smallest so real numbers surface first; each row links out to its
 * venue with attribution, visibly marked external (FR-011). Wide content scrolls inside its own
 * container — the page never scrolls horizontally.
 *
 * THE OPEN CONTROL ARRIVES AS DATA, exactly as `PerpsPositions`' `canManage` does. This component
 * asks `offerOpen(pair)` and never answers it: the management kill switch and the per-venue/chain
 * capability are read in ONE file (`PerpsView`), and a second copy of that predicate here is how a
 * control ends up offered on a venue this build has no calldata path for. With no handler, or a
 * `false` answer, the row is link-out only — which is precisely the phase-0 rendering.
 */
import InfoTip from '../ui/InfoTip'
import PerpsVenueBadge from './PerpsVenueBadge'
import { tradeLinkFor } from '../../lib/perps/linkouts'
import {
  formatPairPrice,
  formatFundingPct,
  formatFundingAnnualized,
  formatUsdCompact,
  formatLeverage,
} from '../../lib/perps/format'
import { PERPS_TIPS } from '../../lib/perps/perpsCopy'
import { PERP_VENUES } from '../../config/perps'

function fundingClass(rate) {
  if (rate == null) return ''
  return rate > 0 ? 'perps-funding-positive' : rate < 0 ? 'perps-funding-negative' : ''
}

export default function PerpsPairTable({
  pairs,
  attribution,
  /** `(pair) => boolean` — whether this build offers an in-app open for that row. */
  offerOpen,
  /** `(pair) => void` — opens the OpenPositionSheet. Absent ⇒ no in-app control renders at all. */
  onOpen,
}) {
  // Both halves must be true: a handler to call, and a venue/chain this build can actually build
  // calldata for. Either one missing means the row is link-out only — never a dead button.
  const openable = (pair) => typeof onOpen === 'function' && Boolean(offerOpen?.(pair))
  return (
    <div className="perps-table-block">
      <div className="perps-table-scroll">
        <table className="perps-table">
          <thead>
            <tr>
              <th scope="col">Pair</th>
              <th scope="col">Venue</th>
              <th scope="col" className="perps-num">
                Price
              </th>
              <th scope="col" className="perps-num">
                Funding&nbsp;/&nbsp;1h
              </th>
              <th scope="col" className="perps-num">
                Open interest
              </th>
              <th scope="col" className="perps-num">
                Max leverage
              </th>
              <th scope="col">
                <span className="sr-only">Trade</span>
              </th>
            </tr>
          </thead>
        <tbody>
          {pairs.map((pair) => {
            const href = tradeLinkFor(pair, attribution)
            return (
              <tr key={pair.id}>
                <th scope="row" className="perps-pair-cell">
                  <span className="perps-pair-symbol">{pair.symbol}</span>
                  {pair.variant && <span className="perps-pair-variant">{pair.variant}</span>}
                </th>
                <td>
                  <PerpsVenueBadge venue={pair.venue} chainId={pair.chainId} />
                </td>
                <td className="perps-num">{formatPairPrice(pair.price)}</td>
                <td
                  className={`perps-num ${fundingClass(pair.fundingRate)}`}
                  title={
                    pair.fundingRate != null
                      ? `≈ ${formatFundingAnnualized(pair.fundingRate, pair.fundingIntervalHours)} annualized`
                      : undefined
                  }
                >
                  {formatFundingPct(pair.fundingRate)}
                </td>
                <td className="perps-num">{formatUsdCompact(pair.openInterestUsd)}</td>
                <td className="perps-num">{formatLeverage(pair.maxLeverage)}</td>
                <td className="perps-trade-cell">
                  {/* The in-app open, where this build can actually build the order. The venue
                      link-out below stays on EVERY row regardless — it is the never-stranded path,
                      and it is what phase 0 shipped. */}
                  {openable(pair) && (
                    <button
                      type="button"
                      className="perps-open-btn"
                      onClick={() => onOpen(pair)}
                      aria-label={`Open a position on ${pair.symbol} at ${PERP_VENUES[pair.venue]?.label ?? pair.venue}`}
                    >
                      Open
                    </button>
                  )}
                  {href && (
                    <a
                      className="perps-trade-link"
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Trade ${pair.symbol} on ${pair.venue} (opens the venue in a new tab)`}
                    >
                      Trade ↗
                    </a>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      </div>
      {/* Term legend below the table (the Earn convention) — keeps the dense header row narrow
          while every specialist term keeps its InfoTip (FR-015). */}
      <p className="perps-table-legend">
        <span>
          Funding / 1h <InfoTip label="About funding">{PERPS_TIPS.fundingRate}</InfoTip>
        </span>
        <span>
          Open interest <InfoTip label="About open interest">{PERPS_TIPS.openInterest}</InfoTip>
        </span>
        <span>
          Max leverage <InfoTip label="About leverage">{PERPS_TIPS.maxLeverage}</InfoTip>
        </span>
      </p>
    </div>
  )
}
