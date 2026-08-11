/**
 * PerpsView (spec 082) — the Perps view inside the Trade section (`?view=perps`).
 *
 * One merged, searchable market-data surface over Gains Network / GMX / Hyperliquid, plus the
 * connected account's read-only positions. Every state is honest (FR-004/FR-005/FR-013):
 * loading, ready, per-venue degraded (named, with the healthy venues still rendering), fully
 * unavailable, and the testnet-cohort notice (FR-017). Trading happens on the venue via
 * attributed link-outs; the Hyperliquid builder fee is disclosed here BEFORE any link-out when
 * configured above zero — zero means no fee line at all (FR-010).
 */
import { useContext, useEffect, useState } from 'react'
import { WalletContext } from '../../contexts/WalletContext.js'
import InfoTip from '../ui/InfoTip'
import PerpsPairTable from './PerpsPairTable'
import PerpsPositions from './PerpsPositions'
import { usePerpsMarkets } from '../../hooks/usePerpsMarkets'
import { usePerpsPositions } from '../../hooks/usePerpsPositions'
import { fetchPerpsConfig } from '../../lib/perps/perpsClient'
import { PERP_VENUES, PERP_VENUE_IDS, perpsCohortSupported, perpsGatewayUrl } from '../../config/perps'
import { bpsToPct } from '../../lib/perps/format'
import {
  PERPS_TIPS,
  PERPS_RISK_DISCLOSURE,
  PERPS_EXTERNAL_NOTE,
  PERPS_TESTNET_NOTE,
  PERPS_UNAVAILABLE_NOTE,
  PERPS_FEE_UNCONFIRMED_NOTE,
} from '../../lib/perps/perpsCopy'
import './Perps.css'

const SORT_OPTIONS = [
  { id: 'oi', label: 'Open interest' },
  { id: 'volume', label: '24h volume' },
  { id: 'funding', label: 'Funding rate' },
  { id: 'symbol', label: 'Pair name' },
]

/** Public attribution + HL builder-fee config; `fee: null` = could not be confirmed (disclosed). */
function usePerpsConfigState(deps) {
  const [state, setState] = useState({ attribution: {}, fee: undefined }) // undefined = loading
  useEffect(() => {
    let alive = true
    const load = deps?.fetchConfig ?? fetchPerpsConfig
    load()
      .then((body) => {
        if (!alive) return
        setState({ attribution: body?.attribution ?? {}, fee: body?.hyperliquidBuilderFee ?? null })
      })
      .catch(() => {
        if (alive) setState({ attribution: {}, fee: null })
      })
    return () => {
      alive = false
    }
  }, [deps])
  return state
}

export default function PerpsView({ deps }) {
  const wallet = useContext(WalletContext) || {}
  // Cohort gating is structural: on a testnet cohort the hooks never fetch (FR-017) — the notice
  // below is rendered INSTEAD of cross-cohort data, not on top of a fetch of it.
  const cohortOk = perpsCohortSupported()
  const gate = (avail) => () => cohortOk && (avail ? avail() : perpsGatewayUrl() !== '')
  const markets = usePerpsMarkets({ deps: { ...deps?.markets, available: gate(deps?.markets?.available) } })
  const positions = usePerpsPositions(wallet.isConnected ? wallet.address : null, {
    deps: { ...deps?.positions, available: gate(deps?.positions?.available) },
  })
  const { attribution, fee } = usePerpsConfigState(deps?.config)

  // Cohort + configuration honesty come before anything else (FR-013/FR-017).
  if (!perpsCohortSupported()) {
    return (
      <section className="perps-view" aria-label="Perps">
        <PerpsHeader />
        <p className="perps-unavailable" role="status">
          {PERPS_TESTNET_NOTE}
        </p>
      </section>
    )
  }
  if (perpsGatewayUrl() === '' || markets.status === 'unavailable') {
    return (
      <section className="perps-view" aria-label="Perps">
        <PerpsHeader />
        <div className="perps-unavailable" role="status">
          <p>{PERPS_UNAVAILABLE_NOTE}</p>
          {perpsGatewayUrl() !== '' && (
            <button type="button" className="perps-retry" onClick={markets.refresh}>
              Try again
            </button>
          )}
        </div>
      </section>
    )
  }

  return (
    <section className="perps-view" aria-label="Perps">
      <PerpsHeader />

      <div className="perps-controls">
        <div className="perps-venue-filter" role="group" aria-label="Filter by venue">
          <button
            type="button"
            className={`perps-filter-pill ${markets.venueFilter === 'all' ? 'active' : ''}`}
            aria-pressed={markets.venueFilter === 'all'}
            onClick={() => markets.setVenueFilter('all')}
          >
            All venues
          </button>
          {PERP_VENUE_IDS.map((id) => (
            <button
              key={id}
              type="button"
              className={`perps-filter-pill ${markets.venueFilter === id ? 'active' : ''}`}
              aria-pressed={markets.venueFilter === id}
              onClick={() => markets.setVenueFilter(id)}
            >
              {PERP_VENUES[id].label}
            </button>
          ))}
        </div>
        <label className="perps-search">
          <span className="sr-only">Search pairs</span>
          <input
            type="search"
            placeholder="Search pairs (BTC, ETH…)"
            value={markets.search}
            onChange={(e) => markets.setSearch(e.target.value)}
            aria-label="Search pairs"
          />
        </label>
        <label className="perps-sort">
          <span className="perps-sort-label">Sort by</span>
          <select value={markets.sortKey} onChange={(e) => markets.setSortKey(e.target.value)} aria-label="Sort pairs">
            {SORT_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {markets.degradedVenues.length > 0 && (
        <p className="perps-degraded-banner" role="status">
          {markets.degradedVenues.map((v) => PERP_VENUES[v]?.label ?? v).join(' and ')} market data is
          temporarily unavailable — those pairs are hidden rather than shown stale. Other venues are live.
        </p>
      )}

      {markets.status === 'loading' ? (
        <p className="perps-loading" role="status">
          Loading pairs from {PERP_VENUE_IDS.length} venues…
        </p>
      ) : markets.pairs.length === 0 ? (
        <p className="perps-empty" role="status">
          {markets.search || markets.venueFilter !== 'all'
            ? 'No pairs match your search or filter.'
            : 'No pairs are available right now.'}
        </p>
      ) : (
        <>
          <p className="sr-only" role="status">
            Showing {markets.pairs.length} of {markets.totalCount} pairs
          </p>
          <PerpsPairTable pairs={markets.pairs} attribution={attribution} />
        </>
      )}

      <PerpsPositions
        status={positions.status}
        positions={positions.positions}
        unreadableVenues={positions.unreadableVenues}
        attribution={attribution}
      />

      <footer className="perps-footnotes">
        {fee === undefined ? null : fee === null ? (
          <p className="perps-fee-note" role="status">
            {PERPS_FEE_UNCONFIRMED_NOTE}
          </p>
        ) : fee.bps > 0 ? (
          <p className="perps-fee-note">
            FairWins charges a {bpsToPct(fee.bps)} fee on Hyperliquid orders placed through FairWins{' '}
            <InfoTip label="About the FairWins fee">{PERPS_TIPS.builderFee}</InfoTip>
          </p>
        ) : null}
        <p className="perps-benefit-note">
          Trading on GMX via FairWins gives you a GMX fee discount{' '}
          <InfoTip label="About the GMX discount">{PERPS_TIPS.gmxDiscount}</InfoTip> Gains Network trades cost
          you nothing extra <InfoTip label="About Gains referral">{PERPS_TIPS.gainsReferral}</InfoTip>
        </p>
        <p className="perps-external-note">{PERPS_EXTERNAL_NOTE}</p>
        <p className="perps-risk-note">{PERPS_RISK_DISCLOSURE}</p>
      </footer>
    </section>
  )
}

function PerpsHeader() {
  return (
    <div className="perps-header">
      <div>
        <h3>
          Perps <InfoTip label="About perps venues">{PERPS_TIPS.venue}</InfoTip>
        </h3>
        <p className="perps-subtitle">
          Perpetual-futures pairs across Gains Network, GMX, and Hyperliquid — live prices, funding, open
          interest, and your open positions. Trading happens on the venue with your own wallet.
        </p>
      </div>
    </div>
  )
}
