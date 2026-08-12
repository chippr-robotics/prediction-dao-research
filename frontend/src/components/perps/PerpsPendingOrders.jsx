/**
 * PerpsPendingOrders (spec 083, T035, US4) — the member's PENDING and STUCK orders, with the
 * recovery control offered by name.
 *
 * WHY THIS SURFACE EXISTS. An order that was neither filled nor cancelled is still holding the
 * member's collateral. An order in limbo with no visible control is indistinguishable from lost
 * money, so this is a first-class list — never an error buried in a log, and never a spinner that
 * outlives the thing it is waiting for.
 *
 * FOUR RULES, AS THEY LAND HERE:
 *
 * 1. **Exits are never gated.** This module imports NO screening, NO jurisdiction attestation and
 *    NO feature flag — a sibling test asserts that over this file's own source, the way
 *    `test/perps/safetyInvariants.test.js` does for the lib modules. The write path
 *    (`usePerpsTrade`) reaches its gates from exactly one line, inside `if (isEntryAction(...))`,
 *    and a recovery is `cancel`, which is not an entry action. A second test drives this component
 *    with gates that would REFUSE and asserts the recovery still sends.
 *
 * 2. **Inclusion is never execution.** Nothing here derives a status. Every line of state text is
 *    `order.statusText` / `trade.statusText`, produced by `lib/perps/orderState.js` — so a member
 *    whose recovery transaction was included reads "Sent to Gains.", and only a venue event ever
 *    turns that into "Order cancelled."
 *
 * 3. **The index space cannot be got wrong.** `recoveryDescriptor` (its own module, and read its
 *    header) takes the branded pending-order index straight off `order.recovery` and nothing else.
 *    Getting the space wrong does not revert — it acts on a DIFFERENT OBJECT
 *    (contracts/venue-calldata.md) — so this component never handles an index itself: it hands the
 *    whole order to that one function and the descriptor to the trade hook.
 *
 * 4. **Honest numbers.** Every figure the venue did not report renders '—'. Everything shown about
 *    an unexecuted order is labelled *requested*, because that is all it is: what the member asked
 *    for, not what the venue produced.
 *
 * NEVER A DEAD CONTROL. The recovery button renders only when `order.recovery` exists — i.e. when
 * the venue's own timeout has been PROVEN and a usable handle came with it. A stuck order without
 * one is still listed, and says so, with a link to the venue: silence would be the failure.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import PerpsVenueBadge from './PerpsVenueBadge'
import { recoveryDescriptor } from './pendingOrderRecovery'
import { usePerpsTrade } from '../../hooks/usePerpsTrade'
import { PERP_VENUES } from '../../config/perps'
import { ORDER_STATE } from '../../lib/perps/orderState'
import { formatLeverage, formatPairPrice, formatUsd } from '../../lib/perps/format'
import './PerpsPendingOrders.css'

const DASH = '—'

/** Venue order for the groups. Venues outside the table follow, in whatever order they arrive. */
const VENUE_ORDER = Object.freeze(['gains', 'gmx', 'hyperliquid'])

/** The two states a member has to act on themselves — everything else resolves without them. */
const ATTENTION_STATES = Object.freeze([ORDER_STATE.TIMED_OUT, ORDER_STATE.FROZEN])

/**
 * What the member asked the venue to do, for the row title. Copy only — the machine's `action` is
 * the source, so a pending order is never described by a word this component invented.
 */
const ACTION_TITLE = Object.freeze({
  open: 'Opening a position',
  close: 'Closing a position',
  reduce: 'Reducing a position',
  protect: 'Updating protection',
  cancel: 'Cancelling an order',
})

/* --------------------------------------------------------------------------------------------- *
 * The component
 * --------------------------------------------------------------------------------------------- */

export default function PerpsPendingOrders({
  status = 'idle',
  orders = [],
  unreadableVenues = [],
  sources = {},
  refresh,
  /** Injected into `usePerpsTrade` — the send rail, the read provider, the clock (tests). */
  deps,
}) {
  const trade = usePerpsTrade({ deps })
  const [activeId, setActiveId] = useState(null)

  // `refresh` from `usePerpsOrders` is a fresh closure every render, so it can never be an effect
  // dependency: the effect below sets state, which re-renders, which would produce a new `refresh`
  // and re-run the effect forever. The ref keeps the latest one without making its identity matter.
  const refreshRef = useRef(refresh)
  useEffect(() => {
    refreshRef.current = refresh
  })

  // A venue execution — the ONLY thing that means the collateral actually came back — is when the
  // list is worth re-reading. Inclusion is not, which is exactly why this keys on `executed`.
  useEffect(() => {
    if (trade.status === ORDER_STATE.EXECUTED) refreshRef.current?.()
  }, [trade.status])

  const recover = useCallback(
    async (order) => {
      const descriptor = recoveryDescriptor(order)
      if (!descriptor) return
      setActiveId(order.id)
      await trade.submit(descriptor)
    },
    [trade],
  )

  const groups = useMemo(() => groupByVenue(orders), [orders])
  const notices = useMemo(() => unreadableNotices(unreadableVenues, sources), [unreadableVenues, sources])
  const windowedNotes = useMemo(() => windowedSourceNotes(sources), [sources])

  // SELF-HIDES when there is nothing to say. A disconnected member, a still-loading read with
  // nothing in it yet, and an account with no pending orders all render nothing at all — the quiet
  // case is the common one and it should not occupy the view. An UNREADABLE venue is not that case:
  // it is the one situation where an empty list would be a lie, so it always renders.
  if (status === 'idle') return null
  if (orders.length === 0 && notices.length === 0 && status !== 'unavailable') return null

  return (
    <section className="perps-orders" aria-labelledby="perps-orders-title">
      <div className="perps-orders-header">
        <h4 className="perps-orders-title" id="perps-orders-title">
          Orders waiting at the venue
        </h4>
        {typeof refresh === 'function' && (
          <button type="button" className="perps-orders-refresh" onClick={refresh}>
            Refresh
          </button>
        )}
      </div>

      {notices.map((notice) => (
        <p key={notice.venue} className="perps-orders-unreadable" role="status">
          {notice.text}
        </p>
      ))}

      {status === 'unavailable' && orders.length === 0 ? (
        <p className="perps-orders-unreadable" role="status">
          Pending orders could not be read just now, so this list may be incomplete. Anything the venue
          is holding is untouched — try again shortly.
        </p>
      ) : null}

      {groups.map(({ venue, rows }) => (
        <div className="perps-orders-group" key={venue}>
          <h5 className="perps-orders-group-title">{venueLabel(venue)}</h5>
          <ul className="perps-orders-list">
            {rows.map((order) => (
              <OrderRow
                key={order.id}
                order={order}
                trade={trade}
                active={activeId === order.id}
                onRecover={recover}
              />
            ))}
          </ul>
        </div>
      ))}

      {windowedNotes.map((note) => (
        <p key={note.venue} className="perps-orders-note">
          {note.text}
        </p>
      ))}
    </section>
  )
}

/* --------------------------------------------------------------------------------------------- *
 * One order
 * --------------------------------------------------------------------------------------------- */

function OrderRow({ order, trade, active, onRecover }) {
  const attention = ATTENTION_STATES.includes(order.state)
  const busy = active && trade.pending
  const requested = requestedFrom(order)
  const elapsed = elapsedBlocks(order.timing)
  const remaining = order.timing?.blocksRemaining
  const venue = venueLabel(order.venue)

  // The venue's own words, verbatim, and only when they add something the status line did not
  // already say. Translating a venue's reason would mean inventing a cause we have not confirmed.
  const reason = order.reason?.text && order.reason.text !== order.statusText ? order.reason : null

  return (
    <li className={`perps-orders-row${attention ? ' perps-orders-row-attention' : ''}`}>
      <div className="perps-orders-row-head">
        {order.direction && (
          <span className={`perps-orders-direction perps-orders-direction-${order.direction}`}>
            {order.direction === 'long' ? 'Long' : 'Short'}
          </span>
        )}
        <span className="perps-orders-symbol">{order.symbol ?? DASH}</span>
        <PerpsVenueBadge venue={order.venue} chainId={order.chainId} />
        {attention && <span className="perps-orders-flag">Needs your attention</span>}
      </div>

      <p className="perps-orders-what">{ACTION_TITLE[order.orderState?.action] ?? 'Order at the venue'}</p>

      {/* The machine's own line. Never re-derived here — "sent" must never become "done". */}
      {order.statusText && <p className="perps-orders-status">{order.statusText}</p>}

      {reason && (
        <p className="perps-orders-reason">
          <span className="perps-orders-reason-label">
            {reason.source === order.venue ? `${venue} said:` : 'Why:'}
          </span>{' '}
          <span className="perps-orders-reason-text">{reason.text}</span>
        </p>
      )}

      {/* Everything below is what was REQUESTED. None of it is the position's state — the venue has
          not executed this order, so there is no position for it to be the state of (rule 4). */}
      <dl className="perps-orders-stats">
        <div>
          <dt>Requested size</dt>
          <dd>{formatUsd(requested.sizeUsd)}</dd>
        </div>
        <div>
          <dt>Requested leverage</dt>
          <dd>{formatLeverage(requested.leverage)}</dd>
        </div>
        <div>
          <dt>Requested price</dt>
          <dd>{formatPairPrice(requested.price)}</dd>
        </div>
        <div>
          <dt>Waiting</dt>
          <dd>{elapsed == null ? DASH : `${elapsed.toLocaleString('en-US')} blocks`}</dd>
        </div>
        <div>
          <dt>Order type</dt>
          <dd>{humanizeOrderType(order.orderTypeName) ?? DASH}</dd>
        </div>
      </dl>

      {/* A countdown ONLY where all three block numbers proved it. `blocksRemaining` is null
          whenever any of them is missing, and a guessed window would be a fabricated number. */}
      {remaining != null && remaining > 0 && (
        <p className="perps-orders-countdown">
          {venue} may still execute this. If it does not, you can recover your collateral in about{' '}
          {remaining.toLocaleString('en-US')} more blocks.
        </p>
      )}

      {order.recovery ? (
        <div className="perps-orders-actions">
          <button
            type="button"
            className="perps-orders-recover"
            onClick={() => onRecover(order)}
            disabled={busy}
            aria-busy={busy || undefined}
          >
            {order.recovery.label}
          </button>
          <p className="perps-orders-recover-note">{collateralNote(order, venue)}</p>
        </div>
      ) : attention ? (
        // Stuck, but the venue did not report a handle we can aim a call at. Saying nothing here
        // would leave the member staring at collateral with no way forward, so the venue's own app
        // is named instead — the one place that can always resolve it.
        <p className="perps-orders-no-handle">
          {venue} did not report a reference for this order, so it cannot be resolved from here.{' '}
          <VenueLink venue={order.venue} />
        </p>
      ) : null}

      {/* The in-flight recovery, straight from the machine: "Sent to Gains." on inclusion, and
          "Order cancelled." only once the venue's own event says so. */}
      {active && (trade.refusal || trade.statusText) && (
        <p
          className="perps-orders-progress"
          role={trade.refusal ? 'alert' : 'status'}
          data-state={trade.status}
        >
          {trade.refusal?.reason ?? trade.statusText}
        </p>
      )}

      {/* Disclosed BEFORE the wallet prompt rather than discovered at signing time. It is a
          disclosure, not a gate: the control stays live, because nothing may stand between a member
          and their collateral — the send simply refuses in plain words if this rail cannot do it. */}
      {order.recovery && !trade.canTransactOn(order.chainId) && (
        <p className="perps-orders-rail-note">{trade.cannotTransactReason(order.chainId)}</p>
      )}
    </li>
  )
}

function VenueLink({ venue }) {
  const href = PERP_VENUES[venue]?.homepage
  if (!href) return null
  return (
    <a
      className="perps-orders-venue-link"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open ${venueLabel(venue)} in a new tab`}
    >
      Open {venueLabel(venue)} ↗
    </a>
  )
}

/* --------------------------------------------------------------------------------------------- *
 * Shaping helpers — all TOTAL, because they run during render over whatever the venue reported
 * --------------------------------------------------------------------------------------------- */

/** Groups rows by venue, table order first. Pure display — it never reorders within a venue. */
function groupByVenue(orders) {
  const rows = Array.isArray(orders) ? orders.filter(Boolean) : []
  const byVenue = new Map()
  for (const order of rows) {
    const venue = typeof order.venue === 'string' ? order.venue : 'unknown'
    if (!byVenue.has(venue)) byVenue.set(venue, [])
    byVenue.get(venue).push(order)
  }
  const known = VENUE_ORDER.filter((v) => byVenue.has(v))
  const rest = [...byVenue.keys()].filter((v) => !VENUE_ORDER.includes(v))
  return [...known, ...rest].map((venue) => ({ venue, rows: byVenue.get(venue) }))
}

/**
 * The pre-execution numbers the venue reported for this order, read out of the payload it came in.
 * Every one of them is nullable and every one is labelled "requested" where it renders: an order
 * the venue has not executed has no size, no price and no leverage of its own yet.
 */
function requestedFrom(order) {
  const raw = order?.raw ?? {}
  return {
    sizeUsd: finite(raw.requestedSizeUsd),
    leverage: finite(raw.requestedLeverage),
    price: finite(raw.requestedPrice),
  }
}

/** How long the venue has been holding this, in the only unit we can prove: blocks. */
function elapsedBlocks(timing) {
  const created = finite(timing?.createdBlock)
  const current = finite(timing?.currentBlock)
  if (created == null || current == null) return null
  return Math.max(0, Math.trunc(current - created))
}

/** `MARKET_PARTIAL_OPEN` → `Market partial open`. Null stays null and renders '—'. */
function humanizeOrderType(name) {
  if (typeof name !== 'string' || name.trim() === '') return null
  const words = name.trim().toLowerCase().replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * Whether this cancellation returns collateral. `returnsCollateral` is `null` when the venue did
 * not report the order type — and an unknown is stated as an unknown, never rounded to a promise.
 */
function collateralNote(order, venue) {
  if (order.returnsCollateral === true) return `This returns your collateral to your wallet.`
  if (order.returnsCollateral === false) {
    return `This order type holds no collateral, so there is nothing to return — cancelling clears it at ${venue}.`
  }
  return `${venue} did not report this order's type, so we can't say whether collateral comes back.`
}

/** An unreadable venue, named, with the venue's own detail where the read supplied one. */
function unreadableNotices(unreadableVenues, sources) {
  const venues = Array.isArray(unreadableVenues) ? unreadableVenues : []
  return venues.map((venue) => {
    const detail = sources?.[venue]?.detail
    return {
      venue,
      text:
        `${venueLabel(venue)} orders could not be read just now, so anything stuck there is not listed ` +
        `here — this list is not proof that nothing is waiting.` +
        (typeof detail === 'string' && detail.trim() !== '' ? ` ${detail.trim()}` : ''),
    }
  })
}

/**
 * A source that was READ but only over a window discloses it. A windowed list presented as the
 * whole truth is the same failure as an empty one presented as proven absence.
 */
function windowedSourceNotes(sources) {
  return Object.entries(sources ?? {})
    .filter(([, s]) => s?.status === 'read' && s?.windowed && typeof s?.detail === 'string' && s.detail.trim() !== '')
    .map(([venue, s]) => ({ venue, text: s.detail.trim() }))
}

function venueLabel(venue) {
  return PERP_VENUES[venue]?.shortLabel ?? PERP_VENUES[venue]?.label ?? venue
}

function finite(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}
