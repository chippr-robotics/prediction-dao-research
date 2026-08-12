/**
 * The perps order state machine (spec 083, T015, contracts/order-state-machine.md).
 *
 * ONE module owns this because the failure it prevents — telling a member their position is open
 * when all that happened is a transaction got included — is exactly the kind that gets reintroduced
 * by a well-meaning copy-paste into a sheet. Per-component lifecycle logic is how it comes back.
 *
 * THE CENTRAL RULE, made structural: **there is no edge from `submitted` to `executed`.** Inclusion,
 * a 200 response, a bundler accepting a UserOp — all of them are `submitted`, and the transition
 * table below simply does not contain the edge that would let any of them become `executed`. On top
 * of the table, the reducer refuses to produce `executed` for any signal other than
 * `SIGNAL.VENUE_EXECUTED`, which only the venue event mappers can emit. Two independent guards,
 * because one of them is a table someone will edit.
 *
 * A STALLED UserOp IS NOT SUCCESS. `submissionSignal` classifies every submission outcome
 * explicitly and maps anything it cannot positively read as included to `unknown`. The pattern to
 * avoid is live in this repo — `components/earn/VaultSheet.jsx` and `hooks/useStakingActions.js`
 * throw only on `state === 'failed'`, so a `stalled` result falls through their happy path and gets
 * recorded as a completed action. Do not copy that shape here or anywhere downstream.
 *
 * TOTALITY. `reduceOrderState` runs inside a `useReducer` and the mappers run over arbitrary logs in
 * effects, so nothing here throws: an unrecognized signal leaves the state untouched (and says so
 * via `ignoredSignal`), and a log from another contract maps to `null` — "no signal", not "no
 * change we should hide".
 *
 * The member-facing copy lives at the bottom, in its own table that the machine never reads. A copy
 * change must not be able to move an order between states.
 */
import { PERP_VENUES } from '../../config/perps'
import { PERPS_GAINS_TIMEOUT_OBSERVATION } from './perpsCopy'
import {
  cancelReasonText,
  decodeMarketExecuted,
  decodeMarketOpenCanceled,
  decodeMarketOrderInitiated,
  isTradeIndex,
} from './venues/gains'

/* ------------------------------------------------------------------------------------------- *
 * States
 * ------------------------------------------------------------------------------------------- */

export const ORDER_STATE = Object.freeze({
  IDLE: 'idle',
  VALIDATING: 'validating',
  SCREENING: 'screening',
  SWITCHING: 'switching',
  SIGNING: 'signing',
  SUBMITTED: 'submitted',
  VENUE_PENDING: 'venue_pending',
  EXECUTED: 'executed',
  REJECTED: 'rejected',
  FROZEN: 'frozen',
  TIMED_OUT: 'timed_out',
  UNKNOWN: 'unknown',
})

export const ORDER_STATES = Object.freeze(Object.values(ORDER_STATE))

/**
 * BOTH of these are pending. `submitted` is the trap state: it is the one that looks like success
 * to a caller checking "did the transaction go through", and it is the one that must never be
 * rendered as "opened" or "closed".
 */
export const PENDING_STATES = Object.freeze([ORDER_STATE.SUBMITTED, ORDER_STATE.VENUE_PENDING])

/**
 * `frozen`, `timed_out` and `unknown` are terminal in the sense that nothing further arrives on its
 * own — each one is a dead end the MEMBER has to act on, which is why they render with a named
 * recovery control or a venue link rather than a spinner.
 */
export const TERMINAL_STATES = Object.freeze([
  ORDER_STATE.EXECUTED,
  ORDER_STATE.REJECTED,
  ORDER_STATE.FROZEN,
  ORDER_STATE.TIMED_OUT,
  ORDER_STATE.UNKNOWN,
])

export function isPendingState(state) {
  return PENDING_STATES.includes(stateNameOf(state))
}

export function isTerminalState(state) {
  return TERMINAL_STATES.includes(stateNameOf(state))
}

/** Accepts either a state name or a whole state object, so callers never have to unwrap. */
function stateNameOf(state) {
  if (typeof state === 'string') return state
  return typeof state?.state === 'string' ? state.state : null
}

/* ------------------------------------------------------------------------------------------- *
 * Signals
 * ------------------------------------------------------------------------------------------- */

export const SIGNAL = Object.freeze({
  VALIDATE: 'validate',
  SCREEN: 'screen',
  SWITCH_CHAIN: 'switch_chain',
  SIGN: 'sign',
  /** The transaction was included / the call was accepted. NOT execution. */
  SUBMITTED: 'submitted',
  /** The submission itself failed — wallet declined, revert, screening refusal. */
  SUBMIT_FAILED: 'submit_failed',
  /** The venue acknowledged the order (Gains MarketOrderInitiated / GMX OrderCreated). */
  VENUE_ACKNOWLEDGED: 'venue_acknowledged',
  /** The venue EXECUTED it. The only signal that may ever produce `executed`. */
  VENUE_EXECUTED: 'venue_executed',
  VENUE_REJECTED: 'venue_rejected',
  VENUE_FROZEN: 'venue_frozen',
  VENUE_TIMED_OUT: 'venue_timed_out',
  /** We lost the thread — a stalled UserOp, a submission with no reference, a dead watcher. */
  LOST: 'lost',
  RESET: 'reset',
})

const TARGET_STATE_BY_SIGNAL = Object.freeze({
  [SIGNAL.VALIDATE]: ORDER_STATE.VALIDATING,
  [SIGNAL.SCREEN]: ORDER_STATE.SCREENING,
  [SIGNAL.SWITCH_CHAIN]: ORDER_STATE.SWITCHING,
  [SIGNAL.SIGN]: ORDER_STATE.SIGNING,
  [SIGNAL.SUBMITTED]: ORDER_STATE.SUBMITTED,
  [SIGNAL.SUBMIT_FAILED]: ORDER_STATE.REJECTED,
  [SIGNAL.VENUE_ACKNOWLEDGED]: ORDER_STATE.VENUE_PENDING,
  [SIGNAL.VENUE_EXECUTED]: ORDER_STATE.EXECUTED,
  [SIGNAL.VENUE_REJECTED]: ORDER_STATE.REJECTED,
  [SIGNAL.VENUE_FROZEN]: ORDER_STATE.FROZEN,
  [SIGNAL.VENUE_TIMED_OUT]: ORDER_STATE.TIMED_OUT,
  [SIGNAL.LOST]: ORDER_STATE.UNKNOWN,
  [SIGNAL.RESET]: ORDER_STATE.IDLE,
})

/* ------------------------------------------------------------------------------------------- *
 * Transitions
 * ------------------------------------------------------------------------------------------- */

/**
 * The legal edges. `RESET` is handled outside this table (any state may be abandoned when the
 * member closes the sheet or switches accounts), so `idle` appears only as a source here.
 *
 * > `submitted` DELIBERATELY OMITS `executed`. Inclusion is not execution — the venue's own
 * > execution event is the only thing that may move an order there, and it arrives while the order
 * > is `venue_pending`. Adding `executed` to this row would re-create the exact bug the module
 * > exists to prevent.
 *
 * `frozen`, `timed_out` and `unknown` keep venue-sourced edges out of them: a frozen order the
 * member cancels ends `rejected`, a timed-out order a keeper picks up late really did execute, and
 * regaining a lost thread must be allowed to correct the record.
 */
export const ORDER_TRANSITIONS = Object.freeze({
  [ORDER_STATE.IDLE]: Object.freeze([
    ORDER_STATE.VALIDATING,
    ORDER_STATE.SCREENING,
    ORDER_STATE.SWITCHING,
    ORDER_STATE.SIGNING,
  ]),
  // Screening applies to opens only (FR-014); exits go straight from validating to signing.
  [ORDER_STATE.VALIDATING]: Object.freeze([
    ORDER_STATE.SCREENING,
    ORDER_STATE.SWITCHING,
    ORDER_STATE.SIGNING,
    ORDER_STATE.REJECTED,
  ]),
  [ORDER_STATE.SCREENING]: Object.freeze([
    ORDER_STATE.SWITCHING,
    ORDER_STATE.SIGNING,
    ORDER_STATE.REJECTED,
  ]),
  [ORDER_STATE.SWITCHING]: Object.freeze([ORDER_STATE.SIGNING, ORDER_STATE.REJECTED]),
  [ORDER_STATE.SIGNING]: Object.freeze([
    ORDER_STATE.SUBMITTED,
    ORDER_STATE.REJECTED,
    ORDER_STATE.UNKNOWN,
  ]),
  [ORDER_STATE.SUBMITTED]: Object.freeze([
    ORDER_STATE.VENUE_PENDING,
    ORDER_STATE.REJECTED,
    ORDER_STATE.FROZEN,
    ORDER_STATE.TIMED_OUT,
    ORDER_STATE.UNKNOWN,
    // NO ORDER_STATE.EXECUTED — see the note above.
  ]),
  [ORDER_STATE.VENUE_PENDING]: Object.freeze([
    ORDER_STATE.EXECUTED,
    ORDER_STATE.REJECTED,
    ORDER_STATE.FROZEN,
    ORDER_STATE.TIMED_OUT,
    ORDER_STATE.UNKNOWN,
  ]),
  [ORDER_STATE.EXECUTED]: Object.freeze([]),
  [ORDER_STATE.REJECTED]: Object.freeze([]),
  [ORDER_STATE.FROZEN]: Object.freeze([
    ORDER_STATE.EXECUTED,
    ORDER_STATE.REJECTED,
    ORDER_STATE.UNKNOWN,
  ]),
  [ORDER_STATE.TIMED_OUT]: Object.freeze([
    ORDER_STATE.EXECUTED,
    ORDER_STATE.REJECTED,
    ORDER_STATE.UNKNOWN,
  ]),
  [ORDER_STATE.UNKNOWN]: Object.freeze([
    ORDER_STATE.VENUE_PENDING,
    ORDER_STATE.EXECUTED,
    ORDER_STATE.REJECTED,
    ORDER_STATE.FROZEN,
    ORDER_STATE.TIMED_OUT,
  ]),
})

/** Total: unknown state names are simply not connected to anything. */
export function canTransition(from, to) {
  return (ORDER_TRANSITIONS[stateNameOf(from)] ?? []).includes(stateNameOf(to))
}

/* ------------------------------------------------------------------------------------------- *
 * The reducer
 * ------------------------------------------------------------------------------------------- */

/**
 * A fresh machine for one action. `venue`, `chainId`, `action` and `venueUrl` are identity, not
 * progress — they survive every transition and a `RESET`, because the sheet still knows which
 * position it is about after an order resolves.
 *
 * `action` is one of open | close | reduce | protect | cancel, and it only ever selects copy.
 */
export function createOrderState(input) {
  // Destructured INSIDE the body, from `?? {}`: a parameter-list default only covers `undefined`, so
  // `createOrderState(props)` with a props object that is null while data loads would THROW — the
  // trap `validation.js` and `defaults.js` both call out. Totality has to survive an explicit null.
  const { venue = null, chainId = null, action = null, venueUrl = null, venueLabel = null } = input ?? {}
  return Object.freeze({
    state: ORDER_STATE.IDLE,
    venue,
    chainId,
    action,
    venueUrl,
    venueLabel,
    pending: false,
    terminal: false,
    txHash: null,
    userOpHash: null,
    /** How the submission itself resolved: 'included' | 'failed' | 'stalled' | null. */
    submission: null,
    /** Venue handles for acting on this order: { orderKey } | { pendingOrderIndex, tradeIndex }. */
    venueRef: null,
    /** { code, text, source } — the venue's own words wherever the venue gave any. */
    reason: null,
    /** The venue's execution payload, in VENUE units. Absent until `executed`. */
    execution: null,
    /** Set when a signal could not be applied, so a caller can log it. Never silently dropped. */
    ignoredSignal: null,
    path: Object.freeze([ORDER_STATE.IDLE]),
  })
}

/**
 * Apply one signal. Pure and total: `null` in → the same state back; an illegal or unrecognized
 * signal → the same state with `ignoredSignal` describing what was refused.
 */
export function reduceOrderState(current, signal) {
  const state = normalizeState(current)
  if (signal == null) return state

  const type = signal?.type
  const target = TARGET_STATE_BY_SIGNAL[type]
  if (!target) return ignore(state, signal, `unrecognized signal ${describe(type)}`)

  // GUARD 1 (independent of the table): only a venue execution event may ever produce `executed`.
  // A future signal that happened to target `executed` — a receipt handler, a "success" response —
  // is refused here before the table is even consulted.
  if (target === ORDER_STATE.EXECUTED && type !== SIGNAL.VENUE_EXECUTED) {
    return ignore(state, signal, 'only a venue execution event may report an order as executed')
  }

  if (type === SIGNAL.RESET) {
    // Identity survives; every trace of the resolved order does not.
    return createOrderState({
      venue: signal.venue ?? state.venue,
      chainId: signal.chainId ?? state.chainId,
      action: signal.action ?? state.action,
      venueUrl: signal.venueUrl ?? state.venueUrl,
      venueLabel: signal.venueLabel ?? state.venueLabel,
    })
  }

  // Re-observing the state we are already in (a second poll of the same event) merges whatever new
  // evidence it carries without pretending anything moved.
  if (target === state.state) return commit(state, signal, target, state.path)

  if (!canTransition(state.state, target)) {
    // THE ONE INTENTIONAL COMPOSITION. An execution event proves two things at once: the venue took
    // the order AND it filled it. Rather than open a submitted→executed edge (which any inclusion
    // handler could then reach), the acknowledgement is applied first and the execution second, so
    // `executed` is still only ever entered from `venue_pending`, and still only ever by
    // SIGNAL.VENUE_EXECUTED.
    if (state.state === ORDER_STATE.SUBMITTED && type === SIGNAL.VENUE_EXECUTED) {
      const acknowledged = commit(state, signal, ORDER_STATE.VENUE_PENDING, state.path)
      return commit(acknowledged, signal, ORDER_STATE.EXECUTED, acknowledged.path)
    }
    return ignore(state, signal, `${state.state} → ${target} is not a legal transition`)
  }

  return commit(state, signal, target, state.path)
}

/**
 * Anything that is not a machine state becomes a fresh one, keeping whatever identity it carried.
 * A state object with an unrecognized `state` is a bug somewhere upstream; continuing to build on
 * it would let a nonsense state name flow into the UI as though the machine had produced it.
 */
function normalizeState(current) {
  if (!current || typeof current !== 'object') return createOrderState()
  if (ORDER_STATES.includes(current.state)) return current
  return createOrderState(current)
}

function commit(state, signal, target, path) {
  // A caller may hand us a hand-built `{ state }` (a restored snapshot, a test fixture) with no
  // path; totality survives that rather than the reducer throwing inside a render.
  const trail = Array.isArray(path) ? path : []
  const nextPath = trail[trail.length - 1] === target ? trail : [...trail, target]
  return Object.freeze({
    ...state,
    ...evidenceFrom(state, signal),
    state: target,
    pending: PENDING_STATES.includes(target),
    terminal: TERMINAL_STATES.includes(target),
    ignoredSignal: null,
    path: Object.freeze(nextPath),
  })
}

/**
 * Evidence is merged, never replaced by absence: a later signal that does not mention the
 * pending-order index must not erase the one the recovery control depends on.
 */
function evidenceFrom(state, signal) {
  return {
    venue: signal.venue ?? state.venue,
    chainId: signal.chainId ?? state.chainId,
    action: signal.action ?? state.action,
    venueUrl: signal.venueUrl ?? state.venueUrl,
    venueLabel: signal.venueLabel ?? state.venueLabel,
    txHash: signal.txHash ?? state.txHash,
    userOpHash: signal.userOpHash ?? state.userOpHash,
    submission: signal.submission ?? state.submission,
    // Branded Gains indices pass through UNTOUCHED — normalising one to a number here would strip
    // the brand that keeps the two index spaces from being interchanged (venue-calldata.md).
    venueRef: mergeRef(state.venueRef, signal.venueRef),
    reason: signal.reason ?? state.reason,
    execution: signal.execution ?? state.execution,
  }
}

function mergeRef(base, next) {
  if (!next) return base
  return Object.freeze({ ...(base ?? {}), ...next })
}

function ignore(state, signal, why) {
  return Object.freeze({ ...state, ignoredSignal: Object.freeze({ signal, why }) })
}

function describe(value) {
  if (value == null) return String(value)
  return typeof value === 'string' ? `"${value}"` : `a ${typeof value}`
}

/* ------------------------------------------------------------------------------------------- *
 * Mapper: submission outcome → signal
 * ------------------------------------------------------------------------------------------- */

const HEX32 = /^0x[0-9a-fA-F]{64}$/

/**
 * The result of handing the batch to the wallet → a signal. It accepts every shape this app
 * produces: the passkey lifecycle result (`{ state: 'included' | 'failed' | 'stalled', … }`), the
 * classic `WalletContext.sendCalls` result (`{ route: 'direct', receipts, txHash }`), a bare ethers
 * TransactionReceipt, and a bare hash string.
 *
 * NOT ONE OF THEM CAN PRODUCE `executed` — the richest thing any of them proves is that the
 * transaction is on chain, which is `submitted`. A test asserts this over every accepted input.
 *
 * The stalled branch is explicit on purpose: reading only for `'failed'` (as VaultSheet.jsx and
 * useStakingActions.js do) lets a stalled UserOp fall through as success. Anything not positively
 * read as included is `unknown`, which renders as "we can't confirm this" with a venue link.
 */
export function submissionSignal(result, context = {}) {
  if (result == null) return null

  if (typeof result === 'string') {
    // A bare hash is a reference, not an outcome — the strongest reading is "it was submitted".
    return HEX32.test(result.trim()) ? submitted({ txHash: result.trim() }, context) : null
  }
  if (typeof result !== 'object') return null

  const txHash = pickHash(result.txHash) ?? pickHash(result.transactionHash) ?? pickHash(result.hash)
  const userOpHash = pickHash(result.userOpHash)

  const lifecycle = typeof result.state === 'string' ? result.state : null
  if (lifecycle) {
    switch (lifecycle) {
      case 'included':
        return submitted({ txHash, userOpHash, submission: 'included' }, context)
      case 'failed':
        return {
          type: SIGNAL.SUBMIT_FAILED,
          ...identity(context),
          txHash,
          userOpHash,
          submission: 'failed',
          reason: reasonOf(result.reason, 'wallet'),
        }
      case 'stalled':
        // Submitted, never confirmed. Not success, not failure — we do not know, and the member is
        // told exactly that and pointed at the venue.
        return {
          type: SIGNAL.LOST,
          ...identity(context),
          txHash,
          userOpHash,
          submission: 'stalled',
          reason: reasonOf(
            'The network did not confirm this in time — it may still go through.',
            'app',
          ),
        }
      case 'submitted':
        return submitted({ txHash, userOpHash }, context)
      case 'draft':
      case 'ceremony-signed':
        return { type: SIGNAL.SIGN, ...identity(context) }
      default:
        // An outcome we cannot read is not an outcome we may assume succeeded.
        return {
          type: SIGNAL.LOST,
          ...identity(context),
          txHash,
          userOpHash,
          reason: reasonOf(`The wallet reported an unrecognized state ("${lifecycle}").`, 'app'),
        }
    }
  }

  // Classic path: one receipt per call, already awaited. A reverted receipt would normally have
  // thrown in tx.wait(), but a status of 0 is checked anyway — it is cheap and it is the truth.
  if (Array.isArray(result.receipts)) {
    const reverted = result.receipts.some((r) => isRevertedReceipt(r))
    if (reverted) {
      return {
        type: SIGNAL.SUBMIT_FAILED,
        ...identity(context),
        txHash,
        submission: 'failed',
        reason: reasonOf('The transaction was reverted by the network.', 'chain'),
      }
    }
    const last = result.receipts[result.receipts.length - 1]
    const hash = txHash ?? pickHash(last?.hash) ?? pickHash(last?.transactionHash)
    return hash ? submitted({ txHash: hash, submission: 'included' }, context) : lost(context)
  }

  // A bare receipt.
  if (result.status != null) {
    if (isRevertedReceipt(result)) {
      return {
        type: SIGNAL.SUBMIT_FAILED,
        ...identity(context),
        txHash,
        submission: 'failed',
        reason: reasonOf('The transaction was reverted by the network.', 'chain'),
      }
    }
    return txHash ? submitted({ txHash, submission: 'included' }, context) : lost(context)
  }

  if (txHash || userOpHash) return submitted({ txHash, userOpHash }, context)

  // Something came back, but nothing that identifies a transaction. That is a lost thread, not a
  // success — the same case VaultSheet phrases as "Submitted, but no transaction reference".
  return lost(context)
}

function submitted(fields, context) {
  return { type: SIGNAL.SUBMITTED, ...identity(context), ...fields }
}

function lost(context) {
  return {
    type: SIGNAL.LOST,
    ...identity(context),
    reason: reasonOf('The wallet returned no transaction reference.', 'app'),
  }
}

function isRevertedReceipt(receipt) {
  const status = receipt?.status
  if (status == null) return false
  if (typeof status === 'bigint') return status === 0n
  if (typeof status === 'number') return status === 0
  if (typeof status === 'string') return status === '0' || status === '0x0'
  return false
}

function pickHash(value) {
  return typeof value === 'string' && HEX32.test(value.trim()) ? value.trim() : null
}

/**
 * Whether these WORDS came from the venue itself — a decoded Gains `CancelReason`, GMX's own error
 * name — rather than being a sentence we wrote about what we observed.
 *
 * ONLY a `true` here may ever render as "<venue> said:". The case this exists for is the TIMEOUT:
 * the venue emitted nothing at all, the state is our inference from block height, and attributing
 * that inference to the venue is exactly the dishonesty this spec exists to prevent — worse here
 * than anywhere else, because it is the surface a member reads when their collateral is stuck. Our
 * own observations are stated unattributed, in our own voice, in normal type.
 *
 * `source` values in this module: `'gains'` / `'gmx'` are the VENUE's words; `'wallet'`, `'chain'`
 * and `'app'` are ours (or another actor's) and are never attributed to a venue.
 *
 * Total: junk in yields `false`, so a render branches instead of throwing.
 */
export function isVenueStatedReason(reason, venue) {
  const text = typeof reason?.text === 'string' ? reason.text.trim() : ''
  const source = typeof reason?.source === 'string' ? reason.source.trim() : ''
  const venueId = typeof venue === 'string' ? venue.trim() : ''
  if (text === '' || source === '' || venueId === '') return false
  return source === venueId
}

function reasonOf(text, source, code = null) {
  const t = typeof text === 'string' && text.trim() !== '' ? text.trim() : null
  if (t === null && code == null) return null
  return Object.freeze({ code, text: t, source })
}

function identity(context) {
  return {
    venue: context?.venue ?? null,
    chainId: context?.chainId ?? null,
    action: context?.action ?? null,
    venueUrl: context?.venueUrl ?? null,
    venueLabel: context?.venueLabel ?? null,
  }
}

/* ------------------------------------------------------------------------------------------- *
 * Mapper: Gains events → signal
 * ------------------------------------------------------------------------------------------- */

/**
 * A Gains log (or an already-decoded event carrying `name`) → a signal.
 *
 * Raw logs are decoded with the venue module's own decoders, which are total — a log from another
 * contract yields `null`, meaning "not our event", never a state change.
 *
 * `context` may carry `{ account, pendingOrderIndex }`; when it does, an event belonging to a
 * different trader or a different order is refused. Acting on someone else's event would be worse
 * than missing our own.
 */
export function gainsEventSignal(event, context = {}) {
  const decoded = gainsDecoded(event)
  if (!decoded) return null
  if (!matchesGainsOrder(decoded, context)) return null

  // `venue` is fixed by the mapper, not by the caller's context — a Gains event is a Gains event.
  const base = { ...identity({ ...context, venue: 'gains' }) }

  switch (decoded.name) {
    case 'MarketOrderInitiated':
      return {
        ...base,
        type: SIGNAL.VENUE_ACKNOWLEDGED,
        // The PENDING-ORDER index — the only index `cancelOrderAfterTimeout` accepts.
        venueRef: refFrom({ pendingOrderIndex: decoded.pendingOrderIndex, orderId: decoded.orderId }),
      }
    case 'MarketExecuted':
      return {
        ...base,
        type: SIGNAL.VENUE_EXECUTED,
        // The TRADE index — a different space, and the one every management call consumes.
        venueRef: refFrom({ tradeIndex: decoded.tradeIndex, orderId: decoded.orderId }),
        // Fill price, actual size and liquidation price exist for the first time here (FR-009).
        execution: decoded,
      }
    case 'MarketOpenCanceled':
      return {
        ...base,
        type: SIGNAL.VENUE_REJECTED,
        venueRef: refFrom({ pendingOrderIndex: decoded.pendingOrderIndex, orderId: decoded.orderId }),
        reason: reasonOf(
          decoded.cancelReasonText ?? cancelReasonText(decoded.cancelReason),
          'gains',
          decoded.cancelReason ?? null,
        ),
      }
    case 'CollateralReturnedAfterTimeout':
      // Two different orders can see this event, and it means opposite things to each. To the
      // RECOVERY call the member just made, it is that call executing. To the original order being
      // recovered, it is the confirmation that it never ran. Read the tracked action, never guess.
      return context?.action === 'cancel'
        ? { ...base, type: SIGNAL.VENUE_EXECUTED, execution: decoded }
        : {
            ...base,
            type: SIGNAL.VENUE_REJECTED,
            // OUR SENTENCE about the venue's event, not the venue's own words. Gains emitted an
            // event, not this text, so the source is `'app'` — see `isVenueStatedReason` for why
            // that distinction is load-bearing rather than cosmetic.
            reason: reasonOf(
              'Gains did not execute this order in time and returned your collateral.',
              'app',
            ),
          }
    default:
      return null
  }
}

function gainsDecoded(event) {
  if (Array.isArray(event?.topics)) {
    const initiated = decodeMarketOrderInitiated(event)
    if (initiated) return { name: 'MarketOrderInitiated', ...initiated }
    const executed = decodeMarketExecuted(event)
    if (executed) return { name: 'MarketExecuted', ...executed }
    const canceled = decodeMarketOpenCanceled(event)
    if (canceled) return { name: 'MarketOpenCanceled', ...canceled }
    return null
  }
  const name = event?.name ?? event?.eventName
  return typeof name === 'string' ? { ...event, name } : null
}

function matchesGainsOrder(decoded, context) {
  const trader = decoded.trader ?? decoded.user ?? decoded.orderId?.user ?? null
  if (context?.account && trader && !sameAddress(context.account, trader)) return false
  const expected = indexValueOf(context?.pendingOrderIndex)
  const actual = indexValueOf(decoded.orderId?.index ?? decoded.pendingOrderIndex)
  if (expected != null && actual != null && expected !== actual) return false
  return true
}

/* ------------------------------------------------------------------------------------------- *
 * Mapper: Gains market-order timeout → signal
 * ------------------------------------------------------------------------------------------- */

/**
 * Past `getMarketOrdersTimeoutBlocks()` with no event, a Gains market order is recoverable →
 * `timed_out`, carrying the PENDING-ORDER index the recovery call needs.
 *
 * It returns `null` unless the timeout can be PROVEN from the three block numbers: claiming a
 * timeout we cannot demonstrate would offer a recovery control that reverts `WaitTimeout()`. The
 * timeout window is venue configuration read from the chain — never a constant from a comment.
 *
 * THE REASON IT CARRIES IS OURS, NOT THE VENUE'S. This is the one venue signal produced with no
 * venue message behind it at all: Gains emitted nothing, and we derived the timeout from block
 * height against the window the diamond itself reports. Its `source` is therefore `'app'`, which is
 * what keeps the stuck-order surface from rendering "Gains said:" over a sentence Gains never
 * produced — on the one surface a member reads when their collateral is stuck.
 */
export function gainsTimeoutSignal(input) {
  // Destructured INSIDE the body, from `?? {}`. A parameter-list default only covers `undefined`, and
  // the natural call site here is a pending order's timing record — which is null exactly when the
  // venue read failed, i.e. when the member most needs the recovery control. A throw there would take
  // down the stuck-order panel instead of offering the recovery.
  const { createdBlock, currentBlock, timeoutBlocks, pendingOrderIndex = null, ...context } = input ?? {}
  const created = toBlockNumber(createdBlock)
  const now = toBlockNumber(currentBlock)
  const window = toBlockNumber(timeoutBlocks)
  if (created === null || now === null || window === null || window <= 0) return null
  if (now - created < window) return null

  // A TRADE index here would build a recovery call against a different object entirely
  // (venue-calldata.md, the index trap). Refuse rather than offer a control aimed at the wrong one.
  if (pendingOrderIndex != null && isTradeIndex(pendingOrderIndex)) return null

  return {
    type: SIGNAL.VENUE_TIMED_OUT,
    ...identity({ ...context, venue: 'gains' }),
    venueRef: refFrom({ pendingOrderIndex }),
    reason: reasonOf(PERPS_GAINS_TIMEOUT_OBSERVATION, 'app'),
  }
}

function toBlockNumber(value) {
  if (typeof value === 'bigint') return value >= 0n ? Number(value) : null
  const n = Number(value)
  if (value == null || value === '' || !Number.isFinite(n) || n < 0) return null
  return n
}

/* ------------------------------------------------------------------------------------------- *
 * Mapper: GMX events → signal
 * ------------------------------------------------------------------------------------------- */

const GMX_SIGNAL_BY_EVENT = Object.freeze({
  OrderCreated: SIGNAL.VENUE_ACKNOWLEDGED,
  OrderExecuted: SIGNAL.VENUE_EXECUTED,
  OrderCancelled: SIGNAL.VENUE_REJECTED,
  OrderFrozen: SIGNAL.VENUE_FROZEN,
})

/**
 * A DECODED GMX order event → a signal. Every GMX order event arrives as one `EventLog2` from the
 * single EventEmitter with its payload nested inside `EventLogData`; unpacking that is the venue
 * module's job (`lib/perps/venues/gmx.js`), so this mapper takes its output:
 * `{ eventName, key, account, reason }`, with `topic1`/`topic2` accepted for the raw topic names.
 *
 * `OrderUpdated` and the auto-update events deliberately map to `null` — they change an order's
 * numbers, not its state, and reporting them as progress would be noise the member cannot act on.
 *
 * Nothing auto-clears `frozen`: GMX's `REQUEST_EXPIRATION_TIME` does not free a frozen trigger
 * order, so the state stays until the member cancels or updates it.
 */
export function gmxEventSignal(event, context = {}) {
  const name = event?.eventName ?? event?.name
  const type = GMX_SIGNAL_BY_EVENT[name]
  if (!type) return null

  const key = typeof event?.key === 'string' ? event.key : typeof event?.topic1 === 'string' ? event.topic1 : null
  const account = event?.account ?? event?.topic2 ?? null
  if (context?.orderKey && key && !sameHex(context.orderKey, key)) return null
  if (context?.account && account && !sameAddress(context.account, account)) return null

  const reasonText = typeof event?.reason === 'string' ? event.reason : null

  // The same event means OPPOSITE things to two different orders — the mirror of the
  // `CollateralReturnedAfterTimeout` case above. `OrderCancelled` is a REJECTION of the order that
  // was waiting, but when the tracked action IS the cancel the member just made, that same event is
  // that call EXECUTING. Reading the tracked action is the only way to tell; the event alone cannot.
  if (type === SIGNAL.VENUE_REJECTED && name === 'OrderCancelled' && context?.action === 'cancel') {
    return {
      ...identity({ ...context, venue: 'gmx' }),
      type: SIGNAL.VENUE_EXECUTED,
      venueRef: refFrom({ orderKey: key }),
      execution: event,
    }
  }

  return {
    type,
    ...identity({ ...context, venue: 'gmx' }),
    venueRef: refFrom({ orderKey: key }),
    // GMX states its reason as its own error name ("OrderNotFulfillableAtAcceptablePrice"). It is
    // surfaced verbatim: translating it would mean inventing a cause we have not confirmed (FR-008).
    reason: type === SIGNAL.VENUE_ACKNOWLEDGED ? null : reasonOf(reasonText, 'gmx'),
    execution: type === SIGNAL.VENUE_EXECUTED ? event : null,
  }
}

/* ------------------------------------------------------------------------------------------- *
 * Shared helpers
 * ------------------------------------------------------------------------------------------- */

function refFrom(fields) {
  const entries = Object.entries(fields).filter(([, v]) => v != null)
  return entries.length ? Object.freeze(Object.fromEntries(entries)) : null
}

/** A branded Gains index, a bigint, or a number → its numeric value, without stripping any brand. */
function indexValueOf(value) {
  if (value == null) return null
  if (typeof value === 'object') {
    const inner = value.value
    return typeof inner === 'number' || typeof inner === 'bigint' ? Number(inner) : null
  }
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function sameAddress(a, b) {
  const left = addressTail(a)
  const right = addressTail(b)
  return left !== null && right !== null && left === right
}

/** GMX pads the account into a bytes32 topic, so compare the trailing 20 bytes, not the string. */
function addressTail(value) {
  if (typeof value !== 'string') return null
  const hex = value.trim().toLowerCase().replace(/^0x/, '')
  return hex.length >= 40 ? hex.slice(-40) : null
}

function sameHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/* ------------------------------------------------------------------------------------------- *
 * Member-facing copy
 *
 * SEPARATE FROM THE MACHINE ON PURPOSE. Nothing above reads these tables, so rewording a status can
 * never move an order between states, and a state with no copy renders as nothing rather than
 * blocking a transition.
 *
 * The wording rules that matter: `submitted` says SENT, never "opened" or "closed"; `unknown` makes
 * no claim in either direction and points at the venue; `rejected` prefers the venue's own reason
 * verbatim over anything we would write.
 * ------------------------------------------------------------------------------------------- */

export const ORDER_STATUS_TEXT = Object.freeze({
  [ORDER_STATE.IDLE]: null,
  [ORDER_STATE.VALIDATING]: null,
  [ORDER_STATE.SCREENING]: 'Checking…',
  [ORDER_STATE.SWITCHING]: 'Switch to {network}',
  [ORDER_STATE.SIGNING]: 'Confirm in your wallet.',
  [ORDER_STATE.SUBMITTED]: 'Sent to {venue}.',
  [ORDER_STATE.VENUE_PENDING]: '{venue} is executing this.',
  [ORDER_STATE.EXECUTED]: 'Done.',
  [ORDER_STATE.REJECTED]: '{venue} did not go ahead with this.',
  [ORDER_STATE.FROZEN]: 'Needs your attention.',
  [ORDER_STATE.TIMED_OUT]: '{venue} did not execute this in time.',
  [ORDER_STATE.UNKNOWN]: 'We can’t confirm this — check on {venue}.',
})

/** `executed` is the one state whose text depends on what the member asked for. */
export const EXECUTED_TEXT_BY_ACTION = Object.freeze({
  open: 'Position opened.',
  close: 'Position closed.',
  reduce: 'Position reduced.',
  protect: 'Protection updated.',
  cancel: 'Order cancelled.',
})

/**
 * The line to show for a state. TOTAL — it runs during render, so junk in yields `null` and the
 * caller renders nothing rather than the panel coming down.
 *
 * Accepts a whole state object (the usual case) or a bare state name plus a context.
 */
export function orderStatusText(state, context = {}) {
  const name = stateNameOf(state)
  if (!name) return null
  const ctx = typeof state === 'object' && state !== null ? { ...state, ...context } : { ...context }

  if (name === ORDER_STATE.EXECUTED) {
    return EXECUTED_TEXT_BY_ACTION[ctx.action] ?? ORDER_STATUS_TEXT[ORDER_STATE.EXECUTED]
  }
  if (name === ORDER_STATE.REJECTED) {
    // The venue's words, verbatim, wherever the venue gave any (FR-008).
    const venueReason = ctx.reason?.text
    if (typeof venueReason === 'string' && venueReason.trim() !== '') return venueReason
  }

  const template = ORDER_STATUS_TEXT[name]
  if (typeof template !== 'string') return null
  return template
    .replace('{venue}', venueLabelFor(ctx.venueLabel ?? ctx.venue))
    .replace('{network}', typeof ctx.networkName === 'string' && ctx.networkName ? ctx.networkName : 'the right network')
}

/** A venue's short name, or a phrase that names no venue rather than printing an id. */
function venueLabelFor(venue) {
  if (typeof venue !== 'string' || venue.trim() === '') return 'the venue'
  const known = PERP_VENUES[venue]
  return known?.shortLabel ?? known?.label ?? venue
}
