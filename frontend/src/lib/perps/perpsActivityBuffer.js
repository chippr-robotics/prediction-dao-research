/**
 * Perps action buffer (spec 083, T070 / FR-023) — the `lib/earn/earnActivityBuffer` convention.
 *
 * A member action taken in the app leaves ONE record here; the perps ActivitySource drains it on
 * its next detect cycle and turns it into a feed entry. Routing member actions through the source
 * keeps every activity-store write inside the engine's poll (no racing it), while still giving an
 * action the exact transaction it produced instead of the generic snapshot-diff message the venue
 * read can offer.
 *
 * FOUR PROPERTIES THIS MODULE EXISTS TO HOLD:
 *
 * 1. **It stores FACTS, never a claim.** A record carries the machine's own `state` and nothing
 *    that reads as an outcome — no message, no "done" flag. The wording is composed later, by the
 *    source, from that state. A caller therefore *cannot* queue "position closed" for an order the
 *    venue has not executed, however the call site is written: the only word for what happened
 *    comes from `lib/perps/orderState.js`, which reaches `executed` for exactly one signal.
 *
 * 2. **It is GATE-FREE and TOTAL.** Exits queue into it (a close, a reduce, a recovery), so it must
 *    be impossible for anything here to stand between a member and their money: it imports no
 *    screening, no jurisdiction check, no kill switch, and every function swallows its own storage
 *    failures and returns rather than throwing. A full localStorage must not break a close.
 *    `test/perps/safetyInvariants.test.js` lists this file on the EXIT_PATH and asserts the first
 *    half structurally.
 *
 * 3. **It is scoped by ACCOUNT ONLY — deliberately not by chain.** The perps surface is
 *    network-transparent (`config/perps.js`): it lists every venue whatever the wallet's active
 *    chain is, and its source ignores `chainId` entirely. A chain-scoped buffer (what Earn uses,
 *    correctly, for a chain-scoped surface) would strand a record the moment a member switched
 *    networks between acting and the next poll. Each record carries its OWN `chainId` instead.
 *
 * 4. **The latest word about one order replaces the earlier one.** Records are keyed by the order,
 *    so `submitted` → `executed` inside one poll interval publishes the outcome, not both. Once a
 *    record has been drained the next one is a new entry, which is how "sent" and then "executed"
 *    legitimately appear as two lines.
 */
import {
  ORDER_STATE,
  isPendingState,
  isTerminalState,
} from './orderState'
import { PERP_VENUES } from '../../config/perps'
import { getUserPreference, saveUserPreference } from '../../utils/userStorage'

/** Not chain-suffixed — see property 3 in the header. */
const FEATURE_KEY = 'perps_pending_actions_v1'
const MAX_BUFFERED = 20

const HEX32 = /^0x[0-9a-fA-F]{64}$/

/**
 * The states a member action may be REPORTED from, taken from the machine's own vocabulary rather
 * than listed here: everything it calls pending, plus everything it calls terminal. A state added
 * to either set in `orderState.js` becomes reportable with no edit here — and the pre-venue states
 * (validating, signing, …) stay unreportable, because an order the venue has never seen is not
 * activity, it is a form in progress.
 */
export function isReportableOrderState(state) {
  return isPendingState(state) || isTerminalState(state)
}

/**
 * Whether a record is the venue saying it DID the thing. `executed` is reachable only through
 * `SIGNAL.VENUE_EXECUTED`, so this is exactly "the venue confirmed it" and nothing weaker.
 */
export function isVenueConfirmed(record) {
  return stateOf(record) === ORDER_STATE.EXECUTED
}

/**
 * Queue one record. Returns the stored record, or `null` when there is nothing honest to store —
 * an unknown venue, a state the venue has not spoken about, or a caller with no account.
 *
 * ```
 * { key, venue, venueLabel, chainId, action, state, txHash, txUrl, orderRef, reason, symbol, at }
 * ```
 */
export function queuePerpsAction(account, input) {
  try {
    if (!account || !input || typeof input !== 'object') return null

    const venue = typeof input.venue === 'string' && PERP_VENUES[input.venue] ? input.venue : null
    if (!venue) return null

    const state = stateOf(input)
    if (!state || !isReportableOrderState(state)) return null

    const at = Number.isFinite(Number(input.at)) ? Number(input.at) : Date.now()
    const txHash = hashOf(input.txHash)
    const record = Object.freeze({
      key: actionKey({ ...input, venue, state, txHash, at }),
      venue,
      venueLabel: typeof input.venueLabel === 'string' ? input.venueLabel : null,
      chainId: Number.isFinite(Number(input.chainId)) ? Number(input.chainId) : null,
      action: typeof input.action === 'string' && input.action.trim() !== '' ? input.action.trim() : null,
      state,
      txHash,
      // A caller may supply the explorer URL it already built; the source derives one otherwise.
      txUrl: typeof input.txUrl === 'string' && input.txUrl.trim() !== '' ? input.txUrl.trim() : null,
      orderRef: referenceOf(input),
      // The VENUE's own words, verbatim, wherever it gave any (FR-008). Never our paraphrase.
      reason: reasonOf(input.reason),
      symbol: typeof input.symbol === 'string' && input.symbol.trim() !== '' ? input.symbol.trim() : null,
      at,
    })

    const existing = read(account)
    const next = [...existing.filter((r) => r?.key !== record.key), record].slice(-MAX_BUFFERED)
    saveUserPreference(account, FEATURE_KEY, next, true)
    return record
  } catch {
    // A buffer that throws is a buffer that can fail a close. It never does.
    return null
  }
}

/**
 * Queue straight from the order machine's state object — the call an action surface should make,
 * because it hands over the machine's own reading of what happened and derives nothing.
 *
 * `extra` may add facts the machine does not carry (the pair symbol, an explorer URL); it can add
 * no verdict, because the state is taken from the machine, not from `extra`.
 */
export function recordPerpsOrder(account, order, extra = {}) {
  if (!order || typeof order !== 'object') return null
  return queuePerpsAction(account, {
    venue: order.venue,
    venueLabel: order.venueLabel,
    chainId: order.chainId,
    action: order.action,
    txHash: order.txHash,
    userOpHash: order.userOpHash,
    orderRef: orderRefOf(order.venueRef),
    reason: order.reason,
    ...extra,
    // Last, and not overridable: the state is the machine's to state.
    state: stateOf(order),
  })
}

/** Read-and-clear every pending record for this account. */
export function drainPerpsActions(account) {
  try {
    if (!account) return []
    const records = read(account)
    if (records.length > 0) saveUserPreference(account, FEATURE_KEY, [], true)
    return records
  } catch {
    return []
  }
}

/** Peek without clearing (tests / diagnostics). */
export function peekPerpsActions(account) {
  try {
    return account ? read(account) : []
  } catch {
    return []
  }
}

/* ------------------------------------------------------------------------------------------- *
 * Internals
 * ------------------------------------------------------------------------------------------- */

function read(account) {
  const records = getUserPreference(account, FEATURE_KEY, [], true)
  return Array.isArray(records) ? records.filter((r) => r && typeof r === 'object') : []
}

/** A state name, whether the caller passed a machine state object or the bare name. */
function stateOf(value) {
  if (typeof value === 'string') return value
  return typeof value?.state === 'string' ? value.state : null
}

/**
 * One order's identity, stable across its states so `submitted` and `executed` collapse onto the
 * same buffered record. Falls back to the timestamp only when the order carries no reference at
 * all — which still yields a stable id, because the timestamp is stored on the record.
 */
function actionKey({ venue, chainId, action, at, ...rest }) {
  const reference = referenceOf({ ...rest }) ?? `t${at}`
  return `${venue}:${chainId ?? 'x'}:${action ?? 'order'}:${reference}`
}

function referenceOf(input) {
  return (
    hashOf(input?.txHash) ??
    hashOf(input?.userOpHash) ??
    (typeof input?.orderRef === 'string' && input.orderRef.trim() !== ''
      ? input.orderRef.trim().toLowerCase()
      : null)
  )
}

/**
 * A venue handle → a short string used ONLY for identity in this buffer.
 *
 * The two Gains index spaces stay distinguishable (`pending:4` is not `trade:4`) so two different
 * objects can never collapse onto one record. Nothing built here is ever fed back to a calldata
 * builder — those take the branded values from the machine, never a string from a feed record.
 */
function orderRefOf(venueRef) {
  if (!venueRef || typeof venueRef !== 'object') return null
  if (typeof venueRef.orderKey === 'string' && venueRef.orderKey.trim() !== '') {
    return venueRef.orderKey.trim().toLowerCase()
  }
  const pending = indexValueOf(venueRef.pendingOrderIndex)
  if (pending != null) return `pending:${pending}`
  const trade = indexValueOf(venueRef.tradeIndex)
  if (trade != null) return `trade:${trade}`
  return null
}

function indexValueOf(value) {
  if (value == null) return null
  if (typeof value === 'object') {
    const inner = value.value
    return typeof inner === 'number' || typeof inner === 'bigint' ? Number(inner) : null
  }
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function hashOf(value) {
  return typeof value === 'string' && HEX32.test(value.trim()) ? value.trim() : null
}

/** `{ code, text, source }` as the machine produces it, kept verbatim or dropped entirely. */
function reasonOf(reason) {
  const text = typeof reason?.text === 'string' && reason.text.trim() !== '' ? reason.text.trim() : null
  if (!text) return null
  return Object.freeze({
    code: reason?.code ?? null,
    text,
    source: typeof reason?.source === 'string' ? reason.source : null,
  })
}
