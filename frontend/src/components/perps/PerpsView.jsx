/**
 * PerpsView (spec 082, extended by spec 083) — the Perps view inside the Trade section
 * (`?view=perps`).
 *
 * One merged, searchable market-data surface over Gains Network / GMX / Hyperliquid, the connected
 * account's positions, and the orders a venue is still holding. Every state is honest
 * (FR-004/FR-005/FR-013): loading, ready, per-venue degraded (named, with the healthy venues still
 * rendering), fully unavailable, and the testnet-cohort notice (FR-017). The Hyperliquid builder
 * fee is disclosed here BEFORE any link-out when configured above zero — zero means no fee line at
 * all (FR-010).
 *
 * THIS FILE IS WHERE SPEC 083's COMPOSITION DECISIONS LIVE, and there are three of them:
 *
 * 1. **The management gate is here and only here.** `canManage` is
 *    `perpsManageFeatureEnabled() && perpsManageEnabled(venue, chainId)` — the release kill switch
 *    AND the per-venue/per-chain capability. With the flag off no management control renders
 *    anywhere: the view is exactly the spec-082 read-only surface, because a disabled or dead
 *    button would be the dishonest outcome (`config/perps.js`). Nothing downstream re-derives this
 *    — `PositionSheet` and `PerpsPendingOrders` deliberately cannot even read the flag, so a
 *    second copy of the question here is the only way it could be answered inconsistently.
 *
 * 2. **The stuck-order list is NOT behind that flag.** An order the venue never executed is holding
 *    the member's collateral, and US4 acceptance 3 is explicit: a recovery control is never gated by
 *    screening, jurisdiction, killswitch **or feature flag** (FR-005 / SC-004). It is mounted
 *    whenever an account is connected — including in the market-data-unavailable branch, because a
 *    pairs feed being down says nothing about whether a member can get their collateral back. It
 *    self-hides when there is genuinely nothing to say, so with the flag off and no stuck order the
 *    view renders as it always did.
 *
 * 3. **It sits ABOVE the positions list.** A stuck order is more urgent than a healthy position.
 *
 * The one thing the cohort gate still governs is whether this build reads MAINNET venues at all:
 * on a testnet cohort every venue read is passed a null account / a false `available()`, so no
 * cross-cohort read happens (constitution III), and the notice renders instead of the data.
 */
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { WalletContext } from '../../contexts/WalletContext.js'
import InfoTip from '../ui/InfoTip'
import PerpsPairTable from './PerpsPairTable'
import PerpsPendingOrders from './PerpsPendingOrders'
import PerpsPositions from './PerpsPositions'
import PositionSheet from './PositionSheet'
import { usePerpsMarkets } from '../../hooks/usePerpsMarkets'
import { usePerpsOrders } from '../../hooks/usePerpsOrders'
import { usePerpsPositions } from '../../hooks/usePerpsPositions'
import { fetchPerpsConfig } from '../../lib/perps/perpsClient'
import {
  PERP_VENUES,
  PERP_VENUE_IDS,
  perpsCohortSupported,
  perpsGatewayUrl,
  perpsManageEnabled,
  perpsManageFeatureEnabled,
} from '../../config/perps'
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
  const account = wallet.isConnected ? wallet.address : null
  const markets = usePerpsMarkets({ deps: { ...deps?.markets, available: gate(deps?.markets?.available) } })
  const positions = usePerpsPositions(account, {
    deps: { ...deps?.positions, available: gate(deps?.positions?.available) },
  })
  // `usePerpsOrders` has no `available()` of its own — deliberately, so no gate can ever be wired
  // into the recovery read. The cohort boundary is honoured by withholding the ACCOUNT instead:
  // there is nothing for a testnet build to read on mainnet venues, and reading them anyway would
  // cross the cohort boundary (constitution III).
  const orders = usePerpsOrders(cohortOk ? account : null, { deps: deps?.orders })
  const { attribution, fee } = usePerpsConfigState(deps?.config)

  /* The whole management gate, in one expression. `perpsManageFeatureEnabled()` is read at render
   * time (never frozen into a module constant), and the per-row half asks whether this build can
   * actually build calldata for that venue on that chain — Hyperliquid answers no everywhere, which
   * is what keeps FR-021's "no dead in-app control" true without a special case for it. */
  const manageEnabled = perpsManageFeatureEnabled()
  const canManage = useCallback(
    (position) => manageEnabled && Boolean(position) && perpsManageEnabled(position.venue, position.chainId),
    [manageEnabled],
  )

  const [managed, setManaged] = useState(null)
  const dismissSheet = useCallback(() => setManaged(null), [])

  // Account change closes the sheet DURING RENDER, not in an effect: an open sheet aimed at the
  // previous account's position — and the venue handles inside it — must never be painted for
  // another account (spec 083 edge case). This is React's documented adjust-state-on-prop-change
  // pattern, and it matches the "hard reset before paint" the perps hooks already do.
  const [sheetAccount, setSheetAccount] = useState(account)
  if (sheetAccount !== account) {
    setSheetAccount(account)
    setManaged(null)
  }

  /* The sheet shows the venue's LATEST read of the position while the venue still reports it, and
   * keeps the last snapshot once it does not. That second half is deliberate: the moment a close
   * executes the row leaves the list, and re-resolving to `null` there would yank the venue's own
   * "Position closed." off screen before the member had read it. The figures are then the last ones
   * the venue reported, which is what they always were. */
  const managedPosition = useMemo(() => {
    if (!managed) return null
    return positions.positions.find((p) => p.id === managed.id) ?? managed
  }, [managed, positions.positions])

  /* THE CURRENT PRICE, AND WHY IT IS COMPOSED HERE.
   *
   * A position read carries what the member is holding, not what the market is doing: neither the
   * gateway's `normalizeGainsPositions` nor the GMX Reader returns a mark price, so a sheet handed
   * only a position has no price at all. That is not cosmetic — `closeTradeMarket(index, price)`
   * takes the price its slippage bound is measured from, so with no price the sheet can only refuse
   * the close (which it did, honestly, and which made US1 unreachable in the assembled view).
   *
   * The venue's own live price is already on screen one section up — it is what the pairs table
   * renders — so it is passed down rather than read again. Matched on VENUE FIRST: one venue's
   * price may never stand in for another's, and a pair only one venue lists must not silently
   * borrow the other's number. `allPairs`, not `pairs`, because the latter is filtered by the
   * member's own search box. No match (a GMX row, whose Reader reports no symbol) leaves it null,
   * and null renders '—' and refuses the close — the honest outcome, never a guessed price. */
  const markPrice = useMemo(() => {
    const symbol = managedPosition?.symbol
    if (!symbol || !managedPosition?.venue) return null
    const sameVenue = markets.allPairs.filter((p) => p.venue === managedPosition.venue && p.symbol === symbol)
    // Gains lists the same pair on every chain it runs on; prefer the position's own chain, and
    // fall back to the venue's other listing only when the position did not name one.
    const pair =
      sameVenue.find((p) => p.chainId != null && p.chainId === managedPosition.chainId) ?? sameVenue[0] ?? null
    const price = Number(pair?.price)
    return Number.isFinite(price) && price > 0 ? price : null
  }, [managedPosition, markets.allPairs])

  // Both refreshes ride a ref: `usePerpsPositions`/`usePerpsOrders` hand back a fresh `refresh`
  // closure every render, so putting either in a dependency array would make this callback's
  // identity change every render — and it is an effect dependency inside the sheet.
  const refreshRef = useRef(null)
  useEffect(() => {
    refreshRef.current = { positions: positions.refresh, orders: orders.refresh }
  })
  const handleActionComplete = useCallback(() => {
    // Only ever called on the venue's own execution event (the sheet drives the state machine), so
    // this re-reads what the venue actually did — never what the member asked for.
    refreshRef.current?.positions?.()
    refreshRef.current?.orders?.()
  }, [])

  const pendingOrders = (
    <PerpsPendingOrders
      status={orders.status}
      orders={orders.orders}
      unreadableVenues={orders.unreadableVenues}
      sources={orders.sources}
      refresh={orders.refresh}
      deps={deps?.trade}
    />
  )

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
        {/* Market data being down says nothing about a member's collateral. This list reads GMX
            straight from the chain and self-hides when there is nothing waiting, so it costs the
            ordinary member nothing and it is the difference between a recovery control existing and
            being hidden behind an unrelated outage (US4 acceptance 3). */}
        {pendingOrders}
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

      {/* Above the positions list: an order the venue never executed is holding collateral, which
          is more urgent than any healthy position below it. */}
      {pendingOrders}

      <PerpsPositions
        status={positions.status}
        positions={positions.positions}
        unreadableVenues={positions.unreadableVenues}
        attribution={attribution}
        canManage={canManage}
        onManage={manageEnabled ? setManaged : null}
      />

      {managedPosition && (
        <PositionSheet
          position={managedPosition}
          markPrice={markPrice}
          attribution={attribution}
          onClose={dismissSheet}
          onActionComplete={handleActionComplete}
          deps={deps?.sheet}
        />
      )}

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
