/**
 * PositionSheet (spec 083, T034 + T040) — how a member exits a leveraged position.
 *
 * This is the surface US1 and US2 are the acceptance criteria for, and the one where a
 * well-meaning shortcut costs a member real money. Five rules shape every line below:
 *
 * 1. **THE MEMBER IS ALWAYS `msg.sender`.** This component never touches an ownership field. It
 *    assembles a descriptor of *what the member asked for* and hands it to `usePerpsTrade`, which
 *    hands it to the venue builders — and those refuse an order FairWins would own. The only
 *    FairWins address that can leave here is `uiFeeReceiver`, and it travels as its own named
 *    parameter into `buildClosePositionCalls`/`buildProtectionCalls`, never near `receiver`.
 *
 * 2. **INCLUSION IS NEVER EXECUTION.** No status is derived here. `usePerpsTrade` publishes the
 *    state machine (`lib/perps/orderState.js`) and this file renders `trade.statusText` verbatim,
 *    so "Sent to Gains" on inclusion and "Position closed." only on the venue's own execution event
 *    are properties of the machine, not of this sheet. There is deliberately no local `done` flag —
 *    that is exactly the shape (`VaultSheet.jsx`'s `txState.step === 'done'`) that turns a stalled
 *    submission into a claim of success.
 *
 * 3. **EXITS ARE NEVER GATED.** Nothing here imports the attestation, the management kill switch,
 *    or the venue's open-permission check — a sibling test greps this file for each of those names,
 *    so they cannot return even as a comment. `exitAvailability()` is the only venue-status call,
 *    and it is consulted purely to render the venue's own warning — its
 *    `offer` is structurally `true`. An unreadable fee rate, an unreadable venue and a session that
 *    cannot transact all produce an explanation plus the venue's own link; none of them removes the
 *    exit. A sibling test asserts the absence of those imports over this file's source.
 *
 * 4. **HONEST NUMBERS.** Every figure is the venue's, rendered '—' where the venue reported
 *    nothing (never 0), and every pre-execution figure is labelled *estimated*. The position's
 *    facts come from the venue read; the close preview is arithmetic over those facts and says so.
 *
 * 5. **SMART DEFAULTS, ONE TAP.** "Close all" is pre-selected, protection is pre-filled from
 *    `defaults.js#suggestProtection` (which guarantees a level `validateProtection` accepts), and
 *    the slippage default is the venue SDK's own. A member who agrees with all of it taps once.
 *
 * TESTABILITY. Every side effect is injectable through `deps` — the trade hook, the fee read and
 * the clock — so the whole lifecycle is exercised with no network.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import InfoTip from '../ui/InfoTip'
import { NETWORKS } from '../../config/networks'
import { PERP_VENUES, perpsUiFeeReceiver } from '../../config/perps'
import { usePerpsTrade } from '../../hooks/usePerpsTrade'
import { ORDER_STATE } from '../../lib/perps/orderState'
import { suggestProtection } from '../../lib/perps/defaults'
import { feeUsdFromNotional } from '../../lib/perps/feeUnits'
import { bpsToPct, formatLeverage, formatPairPrice, formatSignedUsd, formatUsd } from '../../lib/perps/format'
import { tradeLinkFor } from '../../lib/perps/linkouts'
import { PERPS_TIPS } from '../../lib/perps/perpsCopy'
import { validateProtection } from '../../lib/perps/validation'
import { exitAvailability } from '../../lib/perps/venueStatus'
import {
  bigintOrNull,
  buildExitDescriptor,
  buildProtectDescriptor,
  defaultReadFeeBps,
  directionOf,
  numberOrNull,
  positiveNumber,
} from './positionSheetActions'
import './PositionSheet.css'

const DASH = '—'

/**
 * The shares a member can close in one tap. 100 is the common case and the default, so the
 * ordinary exit is a single tap rather than a number to type (SC-001).
 */
export const CLOSE_PRESETS = Object.freeze([25, 50, 75, 100])

/* ------------------------------------------------------------------------------------------- *
 * The sheet
 * ------------------------------------------------------------------------------------------- */

export default function PositionSheet({
  position,
  /** The current price, when the caller has one the venue reported. */
  markPrice: markPriceProp = null,
  /** Protection AS THE VENUE STORES IT — `{ stopLoss, takeProfit }`. Never the requested values. */
  protection = null,
  /** The venue's operational state, for its own warning. It can never withhold the exit. */
  venueStatus = null,
  /** The venue's own fee for this exit, where the caller knows it. Absent renders '—', never 0. */
  venueFeeUsd = null,
  /** GMX only: `{ executionFee, acceptablePrice? }` — the keeper fee the member pays. */
  venueQuote = null,
  /** Public venue attribution, for the link-out. */
  attribution = null,
  onClose,
  onActionComplete,
  deps,
}) {
  const sheetRef = useRef(null)
  const restoreFocusRef = useRef(null)

  // The trade hook is injectable for tests. `deps` must be stable across renders — it selects which
  // hook is called, so a changing identity would reorder hooks.
  const useTrade = deps?.useTrade ?? usePerpsTrade
  const venueMeta = PERP_VENUES[position?.venue] ?? null
  const venueLabel = venueMeta?.shortLabel ?? venueMeta?.label ?? position?.venue ?? 'the venue'
  const trade = useTrade({
    deps: deps?.trade,
    identity: {
      venue: position?.venue ?? null,
      chainId: position?.chainId ?? null,
      venueLabel,
      venueUrl: venueMeta?.homepage ?? null,
    },
  })

  const [percent, setPercent] = useState(100)
  const [refusal, setRefusal] = useState(null)
  const [fee, setFee] = useState(null) // null = still reading
  const [stopText, setStopText] = useState('')
  const [takeText, setTakeText] = useState('')
  const editedRef = useRef(false)

  /* Sheet shell: focus save/restore, Escape, and the body scroll lock with its cleanup.
   *
   * TWO THINGS HERE ARE DELIBERATE, and both are defects if you write the obvious version.
   *
   * 1. **It is guarded on `position`.** This component renders NOTHING without one (see the
   *    `if (!position) return null` below), and locking `body { overflow: hidden }` while nothing
   *    is on screen leaves the page unscrollable with no visible sheet to dismiss — a leaked lock
   *    with no way out. `AssetDetailSheet` guards on `aggregate` for the same reason.
   *
   * 2. **`onClose` rides a ref instead of being a dependency.** This sheet lives inside a view
   *    that re-renders on a 30s market poll and a 60s position poll, so a caller passing an inline
   *    `onClose` would re-run the effect on each one: the cleanup restores focus, the effect then
   *    records THAT as the element to restore to and pulls focus back to the sheet — a member
   *    typing a stop-loss price would be yanked to the top of the sheet every poll, and the real
   *    return target would be lost. Keyed on the sheet's own identity, the shell runs exactly once
   *    per open, which is what "save and restore focus" means.
   */
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })
  const hasPosition = Boolean(position)
  useEffect(() => {
    if (!hasPosition) return undefined
    restoreFocusRef.current = document.activeElement
    sheetRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current?.()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.body.style.overflow = previousOverflow
      restoreFocusRef.current?.focus?.()
    }
  }, [hasPosition])

  const venue = position?.venue ?? null
  const chainId = position?.chainId ?? null

  /* The live rate, from the contract that enforces it. A failure is disclosed and changes nothing
   * about whether the member may close (fee-rails.md rule 4). */
  const readFee = deps?.readFee ?? defaultReadFeeBps
  useEffect(() => {
    if (!venue) return undefined
    let alive = true
    setFee(null)
    Promise.resolve()
      .then(() => readFee({ venue, chainId }))
      .then((result) => {
        if (alive) setFee(result ?? { failed: true })
      })
      .catch(() => {
        if (alive) setFee({ failed: true })
      })
    return () => {
      alive = false
    }
    // `readFee` is a dependency the caller owns; re-reading on a new venue/chain is the intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venue, chainId])

  const isLong = directionOf(position)
  const markPrice = positiveNumber(markPriceProp) ?? positiveNumber(position?.markPrice) ?? positiveNumber(position?.currentPrice) ?? positiveNumber(position?.price)
  const sizeUsd = positiveNumber(position?.sizeUsd) ?? positiveNumber(position?.sizeInUsdDisplay)
  const liquidationPrice = positiveNumber(position?.liquidationPrice)

  /* SMART DEFAULT for protection: the venue's stored levels where it has any, otherwise a
   * suggestion derived from the position's own risk — and `suggestProtection` only ever returns
   * levels `validateProtection` accepts, so the pre-filled value is never one the app then refuses. */
  const suggested = useMemo(
    () =>
      suggestProtection({
        entry: position?.entryPrice ?? null,
        mark: markPrice,
        leverage: position?.leverage ?? null,
        isLong,
        liquidationPrice,
      }),
    [position?.entryPrice, position?.leverage, markPrice, isLong, liquidationPrice],
  )
  const storedStop = positiveNumber(protection?.stopLoss)
  const storedTake = positiveNumber(protection?.takeProfit)

  useEffect(() => {
    // Never overwrite what the member has typed. Once they edit, the fields are theirs.
    if (editedRef.current) return
    setStopText(numberToText(storedStop ?? suggested.stopLoss))
    setTakeText(numberToText(storedTake ?? suggested.takeProfit))
  }, [storedStop, storedTake, suggested.stopLoss, suggested.takeProfit])

  const stopLoss = textToLevel(stopText)
  const takeProfit = textToLevel(takeText)

  const protectionCheck = useMemo(
    () =>
      validateProtection({
        position: { markPrice, entryPrice: position?.entryPrice ?? null, isLong, liquidationPrice },
        stopLoss: stopLoss === 'invalid' ? -1 : stopLoss,
        takeProfit: takeProfit === 'invalid' ? -1 : takeProfit,
        liquidationPrice,
        isLong,
      }),
    [markPrice, position?.entryPrice, isLong, liquidationPrice, stopLoss, takeProfit],
  )

  /* "An order of ours is in flight", asked of the machine rather than answered here.
   *
   * The obvious version enumerates the pre-submission state names — and that is a state list
   * copied into a component, which is the shape rule 2 exists to prevent: the machine grows a
   * state, this list does not, and the sheet quietly stops disabling its controls mid-ceremony.
   * `idle` is "nothing sent" and a terminal state is "the venue has finished with it" (including
   * `frozen` / `timed_out`, which need the member to act); everything between the two is in
   * flight, by the machine's own definition of those two words. */
  const busy = trade.status !== ORDER_STATE.IDLE && !trade.terminal
  // A status nobody supplied is not a status we may characterise: `exitAvailability(null)` reports
  // "this venue may refuse it", which would be a claim about the venue built out of our own silence.
  // The exit is offered either way — `offer` is structurally true — so only the NOTE is withheld.
  const exit = venueStatus == null ? { offer: true, venueWillAccept: true, note: null } : exitAvailability(venueStatus)
  const venueUrl = tradeLinkFor(position, attribution ?? {})
  const networkName = NETWORKS[chainId]?.name ?? null

  /* The venue's execution is the ONLY thing that reports a change. `trade.status` is the machine's,
   * never re-derived, and the parent is told to re-read only once per resolved order. */
  const reportedRef = useRef(null)
  useEffect(() => {
    if (trade.status !== ORDER_STATE.EXECUTED) return
    if (reportedRef.current === trade.order) return
    reportedRef.current = trade.order
    onActionComplete?.(trade.order)
  }, [trade.status, trade.order, onActionComplete])

  const send = useCallback(
    async (built) => {
      if (!built.ok) {
        setRefusal(built.reason)
        return
      }
      setRefusal(null)
      // A session with no rail on this chain is not a restriction — it is the absence of a way to
      // send. Saying so, with the venue's own surface named, keeps the exit available without
      // asking for a signature that cannot land.
      if (trade.canTransactOn && !trade.canTransactOn(built.descriptor.chainId)) {
        setRefusal(
          `${trade.cannotTransactReason?.(built.descriptor.chainId) ?? 'This session cannot send transactions on that network.'} You can still close this position on ${venueLabel}.`,
        )
        return
      }
      await trade.submit(built.descriptor)
    },
    [trade, venueLabel],
  )

  const onExit = useCallback(() => {
    send(
      buildExitDescriptor({
        position,
        percent,
        markPrice,
        quote: venueQuote,
        uiFeeReceiver: perpsUiFeeReceiver(),
      }),
    )
  }, [send, position, percent, markPrice, venueQuote])

  const onProtect = useCallback(() => {
    if (!protectionCheck.ok) {
      // The refusal is already on screen beside the field; repeating it here keeps a member who
      // reached the button by keyboard from being met with silence.
      setRefusal(protectionCheck.reason)
      return
    }
    send(
      buildProtectDescriptor({
        position,
        stopLoss: stopLoss === 'invalid' ? null : stopLoss,
        takeProfit: takeProfit === 'invalid' ? null : takeProfit,
        stored: { stopLoss: storedStop, takeProfit: storedTake },
        markPrice,
        quote: venueQuote,
        uiFeeReceiver: perpsUiFeeReceiver(),
      }),
    )
  }, [send, position, stopLoss, takeProfit, storedStop, storedTake, markPrice, venueQuote, protectionCheck])

  if (!position) return null

  const titleId = 'perps-position-sheet-title'
  const fraction = percent / 100
  const closingNotional = sizeUsd === null ? null : sizeUsd * fraction
  const feeBps = fee && !fee.failed ? Number(fee.bps) : null
  const feeApplies = feeBps !== null && feeBps > 0
  const feeUsd = feeApplies && closingNotional !== null ? feeUsdFromNotional(closingNotional, feeBps) : null
  const pnlShare = numberOrNull(position?.unrealizedPnlUsd)
  const collateralUsd = numberOrNull(position?.collateralUsd)
  const proceeds =
    collateralUsd === null || pnlShare === null ? null : (collateralUsd + pnlShare) * fraction
  const statusText = trade.statusText
  const executed = trade.status === ORDER_STATE.EXECUTED

  return (
    <div className="asset-sheet-backdrop">
      <button
        type="button"
        className="asset-sheet-scrim"
        aria-label="Dismiss this position panel"
        onClick={onClose}
      />
      <div
        className="asset-sheet perps-position-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={sheetRef}
      >
        <div className="asset-sheet-grabber" aria-hidden="true" />

        <div className="asset-sheet-header">
          <div className="asset-sheet-heading">
            <h3 id={titleId}>
              {isLong === null ? '' : isLong ? 'Long ' : 'Short '}
              {position.symbol || 'this position'}
            </h3>
            <p className="pps-venue">
              On {venueMeta?.label ?? venueLabel}
              {networkName ? ` · ${networkName}` : ''}
            </p>
          </div>
          {/* "Dismiss", not "Close": the primary action on this sheet closes a POSITION, and two
              controls a tap apart called "Close" is the kind of ambiguity that costs money. */}
          <button type="button" className="asset-sheet-close" onClick={onClose}>
            Dismiss
          </button>
        </div>

        <dl className="pps-facts">
          <Fact label="Size" value={formatUsd(position.sizeUsd)} />
          <Fact label="Entry price" value={formatPairPrice(position.entryPrice)} />
          <Fact label="Current price" value={formatPairPrice(markPrice)} />
          <Fact label="Leverage" value={formatLeverage(position.leverage)} />
          <Fact
            label="Liquidation price"
            value={formatPairPrice(position.liquidationPrice)}
            tip={PERPS_TIPS.liquidation}
            tipLabel="About liquidation"
          />
          <Fact
            label="Unrealized P&L"
            value={formatSignedUsd(position.unrealizedPnlUsd)}
            valueClass={pnlClass(position.unrealizedPnlUsd)}
            tip={PERPS_TIPS.pnl}
            tipLabel="About P&L"
          />
        </dl>
        <p className="pps-attrib">
          Every figure above is as {venueLabel} reports it. “{DASH}” means {venueLabel} did not
          report that value — it is not zero.
        </p>

        {statusText && (
          <p
            className={`pps-status ${executed ? 'pps-status-done' : trade.terminal ? 'pps-status-attention' : 'pps-status-pending'}`}
            role="status"
          >
            {statusText}
          </p>
        )}
        {refusal && (
          <p className="pps-error" role="alert">
            {refusal}
          </p>
        )}

        <section className="pps-section" aria-labelledby="pps-close-heading">
          <h4 id="pps-close-heading" className="pps-section-title">
            Close this position
          </h4>

          <fieldset className="pps-presets-fieldset">
            <legend>How much to close</legend>
            <div className="pps-presets">
              {CLOSE_PRESETS.map((option) => (
                <label
                  key={option}
                  className={`pps-preset ${percent === option ? 'selected' : ''}`}
                  htmlFor={`pps-percent-${option}`}
                >
                  <input
                    id={`pps-percent-${option}`}
                    type="radio"
                    name="pps-percent"
                    value={option}
                    checked={percent === option}
                    disabled={busy}
                    onChange={() => {
                      setPercent(option)
                      setRefusal(null)
                    }}
                  />
                  <span>{option === 100 ? 'All of it' : `${option}%`}</span>
                </label>
              ))}
            </div>
            <p className="pps-note">
              Closing all of it is chosen for you — pick a share to take part of it off instead.
            </p>
          </fieldset>

          {percent < 100 && venue === 'gains' && !hasRawCollateral(position) && (
            <p className="pps-note">
              Gains reduces this by lowering the position’s size. Your collateral stays in the
              position and the leverage comes down with the size.
            </p>
          )}

          <dl className="pps-breakdown">
            <div>
              <dt>Estimated proceeds</dt>
              <dd>{proceeds === null ? DASH : formatUsd(proceeds)}</dd>
            </div>
            <div>
              <dt>{venueLabel}’s own fees</dt>
              <dd>{venueFeeUsd == null ? DASH : formatUsd(venueFeeUsd)}</dd>
            </div>
            {/* A ZERO RATE SHOWS NO FEE LINE AT ALL (FR-012) — not "$0.00", which reads as a fee
                that happens to round down. The line exists only when a rate above zero applies. */}
            {feeApplies && (
              <div>
                <dt>FairWins fee ({bpsToPct(feeBps)} of size)</dt>
                <dd>{feeUsd === null ? DASH : formatUsd(feeUsd)}</dd>
              </div>
            )}
          </dl>
          {feeApplies && (
            <p className="pps-note">
              The FairWins fee is charged on the position’s size ({formatUsd(closingNotional)}), not
              on the amount you put in, and {venueLabel} takes it when this executes.
            </p>
          )}
          {fee?.failed && (
            <p className="pps-note" role="note">
              The FairWins fee rate could not be confirmed just now, so it is not shown. Closing is
              not affected — nothing about your exit depends on that rate.
            </p>
          )}
          <p className="pps-note">
            These are estimates from {venueLabel}’s last reported figures. The amounts that count
            are the ones {venueLabel} settles at.
          </p>

          {!exit.venueWillAccept && exit.note && (
            <p className="pps-note" role="note">
              {exit.note}
            </p>
          )}

          <button type="button" className="pps-primary" onClick={onExit} disabled={busy}>
            {percent === 100 ? 'Close this position' : `Close ${percent}% of this position`}
          </button>
        </section>

        <section className="pps-section" aria-labelledby="pps-protect-heading">
          <h4 id="pps-protect-heading" className="pps-section-title">
            Protect this position
          </h4>
          <p className="pps-note">
            A stop-loss closes the position if the price moves against you; a take-profit closes it
            once you are ahead. Both are stored by {venueLabel}.
          </p>

          <div className="pps-protect-grid">
            <div className="pps-field">
              <label htmlFor="pps-stop">Stop-loss price</label>
              <input
                id="pps-stop"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder={DASH}
                value={stopText}
                disabled={busy}
                aria-describedby="pps-stop-impact"
                onChange={(e) => {
                  editedRef.current = true
                  setStopText(e.target.value)
                  setRefusal(null)
                }}
              />
              <p id="pps-stop-impact" className="pps-impact">
                {impactText({ level: stopLoss, sizeUsd, entryPrice: position.entryPrice, isLong, venueLabel })}
              </p>
              <button
                type="button"
                className="pps-secondary"
                disabled={busy || stopText.trim() === ''}
                onClick={() => {
                  editedRef.current = true
                  setStopText('')
                  setRefusal(null)
                }}
              >
                Remove stop-loss
              </button>
            </div>

            <div className="pps-field">
              <label htmlFor="pps-take">Take-profit price</label>
              <input
                id="pps-take"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder={DASH}
                value={takeText}
                disabled={busy}
                aria-describedby="pps-take-impact"
                onChange={(e) => {
                  editedRef.current = true
                  setTakeText(e.target.value)
                  setRefusal(null)
                }}
              />
              <p id="pps-take-impact" className="pps-impact">
                {impactText({ level: takeProfit, sizeUsd, entryPrice: position.entryPrice, isLong, venueLabel })}
              </p>
              <button
                type="button"
                className="pps-secondary"
                disabled={busy || takeText.trim() === ''}
                onClick={() => {
                  editedRef.current = true
                  setTakeText('')
                  setRefusal(null)
                }}
              >
                Remove take-profit
              </button>
            </div>
          </div>

          {storedStop === null && storedTake === null && (suggested.stopLoss !== null || suggested.takeProfit !== null) && (
            <p className="pps-note">
              These are suggestions worked out from this position’s own liquidation price — change
              them to whatever you want, or clear them.
            </p>
          )}

          {/* THE LIQUIDATION BOUND, refused BEFORE any wallet prompt: a stop at or beyond it never
              fires, because the venue liquidates the position first (US2 acceptance 2). */}
          {!protectionCheck.ok && (
            <p className="pps-error" role="alert">
              {protectionCheck.reason}
            </p>
          )}
          {protectionCheck.ok && protectionCheck.warning && (
            <p className="pps-note" role="note">
              {protectionCheck.warning}
            </p>
          )}

          <button
            type="button"
            className="pps-primary pps-primary-secondary"
            onClick={onProtect}
            disabled={busy || !protectionCheck.ok}
          >
            Save protection
          </button>
          <p className="pps-note">
            Saved levels are shown as {venueLabel} stores them, once {venueLabel} has recorded them.
          </p>
        </section>

        <p className="pps-footer">
          FairWins never holds this position — it is yours at {venueMeta?.label ?? venueLabel}, and
          you can always manage it there.{' '}
          {venueUrl && (
            <a
              className="pps-venue-link"
              href={venueUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Manage this position on ${venueMeta?.label ?? venueLabel} (opens in a new tab)`}
            >
              Manage on {venueLabel} ↗
            </a>
          )}
        </p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------------------------------- *
 * Rendering helpers
 * ------------------------------------------------------------------------------------------- */

function Fact({ label, value, valueClass, tip, tipLabel }) {
  return (
    <div className="pps-fact">
      <dt>
        {label}
        {tip && (
          <InfoTip label={tipLabel ?? label} className="pps-info">
            {tip}
          </InfoTip>
        )}
      </dt>
      <dd className={valueClass ?? undefined}>{value}</dd>
    </div>
  )
}

function pnlClass(pnl) {
  const n = numberOrNull(pnl)
  if (n === null || n === 0) return undefined
  return n > 0 ? 'pps-pnl-up' : 'pps-pnl-down'
}

/**
 * What a protection level is worth in money, ESTIMATED from the venue's own size and entry. It is
 * labelled as an estimate and rendered '—' whenever any input is missing, because a level's impact
 * computed from a guessed entry price would be a fabricated promise.
 */
function impactText({ level, sizeUsd, entryPrice, isLong, venueLabel }) {
  if (level === null || level === 'invalid') return 'Leave this blank to have none.'
  const entry = positiveNumber(entryPrice)
  if (entry === null || sizeUsd === null || isLong === null) {
    return `At ${formatPairPrice(level)}. ${DASH} — ${venueLabel} did not report enough to estimate what that is worth.`
  }
  const move = ((level - entry) / entry) * (isLong ? 1 : -1)
  return `At ${formatPairPrice(level)}, about ${formatSignedUsd(sizeUsd * move)} — estimated, before ${venueLabel}’s fees.`
}

function hasRawCollateral(position) {
  const raw = bigintOrNull(position?.venueRef?.collateralAmount ?? position?.collateralAmount)
  return raw !== null && raw > 0n
}

/** '' → null ("remove it"), junk → 'invalid', otherwise a positive number. */
function textToLevel(text) {
  const s = String(text ?? '').trim()
  if (s === '') return null
  const n = Number(s)
  if (!Number.isFinite(n) || n <= 0) return 'invalid'
  return n
}

function numberToText(value) {
  const n = positiveNumber(value)
  if (n === null) return ''
  // Enough precision for a forex quote without printing float noise into a member's input field.
  return String(Number(n.toFixed(8)))
}
