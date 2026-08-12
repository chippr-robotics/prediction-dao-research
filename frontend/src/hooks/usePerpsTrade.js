/**
 * usePerpsTrade (spec 083, T030) — the ONE write path for every perps action.
 *
 * Close, reduce, protect, open and recover all run through this hook, which is what makes the
 * honesty rules below properties of the feature rather than of whichever sheet was written last.
 *
 * FOUR THINGS THIS HOOK IS RESPONSIBLE FOR, each because getting it wrong is a specific harm:
 *
 * 1. **The member is always `msg.sender`.** The hook never touches an ownership field — it hands
 *    the descriptor's params to the venue builders, and those refuse an order FairWins would own
 *    (`venues/gains.js`, `venues/gmx.js`, contracts/venue-calldata.md). It deliberately does NOT
 *    inject a `uiFeeReceiver` either: attaching a fee is a decision the surface that DISCLOSES the
 *    fee has to make (fee-rails.md §1), so it arrives in `params` or not at all.
 *
 * 2. **Inclusion is never execution.** A receipt, a 200 response and a UserOp hash are all
 *    `submitted`. Only a venue event reaches `executed`, and the machine
 *    (`lib/perps/orderState.js`) owns that — nothing here re-derives a status, and there is no
 *    branch that maps a successful send to anything terminal. After inclusion the hook decodes the
 *    receipt's own logs (which is where the venue's acknowledgement usually already is) and then
 *    WATCHES the venue's event stream for the terminal one.
 *
 * 3. **Exits are never gated.** Screening and the jurisdiction attestation are INJECTED, never
 *    imported: this module is on the exit path, and a module that cannot reference a gate cannot
 *    apply one to an exit by accident (SC-004 / FR-014). `runEntryGates` is called from exactly one
 *    line, and that line is inside `if (isEntryAction(...))`. `validate`/`build` failures are not
 *    gates — they are refusals to sign something the venue would reject — and recovery is not even
 *    validated (see `VALIDATOR_BY_ACTION`).
 *
 * 4. **Honest numbers.** Nothing here fabricates a value. A venue that reported nothing leaves the
 *    field null for the caller to render '—', and pre-execution numbers stay in the caller's
 *    preview; the only payload this hook publishes as fact is `order.execution`, which is the
 *    venue's own event.
 *
 * TESTABILITY. Every external dependency is injectable through `options.deps` (the
 * `usePredictTrade` convention) — the send rail, the read provider, the gates, the clock and the
 * sleep — so the whole state progression is exercised with no network and no timers.
 */
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { WalletContext } from '../contexts/WalletContext'
import { useEarnSend } from './useEarnSend'
import { NETWORKS } from '../config/networks'
import { PERP_VENUES } from '../config/perps'
import { getReadProvider } from '../utils/rpcProvider'
import * as gains from '../lib/perps/venues/gains'
import * as gmx from '../lib/perps/venues/gmx'
import {
  ORDER_STATE,
  SIGNAL,
  createOrderState,
  gainsEventSignal,
  gainsTimeoutSignal,
  gmxEventSignal,
  isTerminalState,
  orderStatusText,
  reduceOrderState,
  submissionSignal,
} from '../lib/perps/orderState'
import { recordPerpsOrder } from '../lib/perps/perpsActivityBuffer'
import { validateClose, validateOpen, validateProtection } from '../lib/perps/validation'

/* ------------------------------------------------------------------------------------------- *
 * Actions
 * ------------------------------------------------------------------------------------------- */

/**
 * The machine's action vocabulary. Recovery is `'cancel'` and NOT `'recover'`, which is a trap
 * worth naming: `orderState.js` keys two mappers on it — `gainsEventSignal` reads
 * `action === 'cancel'` to tell "my recovery executed" from "the order I was watching never ran"
 * (they share one event), and `gmxEventSignal` does the same for `OrderCancelled`. A descriptor
 * saying `'recover'` is accepted and normalised here so that a caller using the member-facing word
 * cannot silently land on the wrong reading.
 */
export const PERPS_ACTION = Object.freeze({
  OPEN: 'open',
  CLOSE: 'close',
  REDUCE: 'reduce',
  PROTECT: 'protect',
  RECOVER: 'cancel',
})

const ACTION_ALIASES = Object.freeze({
  open: 'open',
  close: 'close',
  reduce: 'reduce',
  protect: 'protect',
  cancel: 'cancel',
  recover: 'cancel',
})

/**
 * THE ONLY ENTRY ACTION. Everything else is an exit — closing, reducing, limiting the downside of,
 * or recovering collateral from a position the member already holds — and no gate may stand in
 * front of any of them. This list existing as one frozen constant is what makes "is this gated?"
 * answerable by reading one line.
 */
export const PERPS_ENTRY_ACTIONS = Object.freeze(['open'])

export function normalizeAction(action) {
  return ACTION_ALIASES[String(action ?? '').trim().toLowerCase()] ?? null
}

/** True for `open` only. Total — an unrecognised action is not an entry, and is refused later. */
export function isEntryAction(action) {
  return PERPS_ENTRY_ACTIONS.includes(normalizeAction(action))
}

/**
 * How an action's outcome ARRIVES, which decides what the watcher waits for.
 *
 *  - `execution`      — a keeper settles it asynchronously. Terminal evidence is the venue's
 *                       execution / cancellation / freeze event. Every market order on both venues.
 *  - `acknowledgement`— the venue ACCEPTING the order is the outcome; it then rests until its
 *                       trigger fires, possibly for days. GMX protection orders. Waiting for an
 *                       execution here would time out on a perfectly healthy stop-loss and report
 *                       `unknown` about an order that is doing exactly its job.
 *  - `direct`         — the venue changes its own state inside the member's transaction and emits
 *                       no order event at all (Gains `updateTp`/`updateSl`). There is nothing to
 *                       watch, so the hook does NOT start a watcher and does not invent an
 *                       execution: the confirmation is the caller re-reading the venue's stored
 *                       values (US2 acceptance 3) and calling `confirmFromVenue` with them —
 *                       `components/perps/positionSheetActions.js#confirmStoredProtection` is that
 *                       read, and its bound ends at `reportUnconfirmed`, never at a spinner.
 */
export const SETTLEMENT = Object.freeze({
  EXECUTION: 'execution',
  ACKNOWLEDGEMENT: 'acknowledgement',
  DIRECT: 'direct',
})

const SETTLEMENT_BY_VENUE_ACTION = Object.freeze({
  gains: Object.freeze({
    open: SETTLEMENT.EXECUTION,
    close: SETTLEMENT.EXECUTION,
    reduce: SETTLEMENT.EXECUTION,
    cancel: SETTLEMENT.EXECUTION,
    protect: SETTLEMENT.DIRECT,
  }),
  gmx: Object.freeze({
    open: SETTLEMENT.EXECUTION,
    close: SETTLEMENT.EXECUTION,
    reduce: SETTLEMENT.EXECUTION,
    cancel: SETTLEMENT.EXECUTION,
    protect: SETTLEMENT.ACKNOWLEDGEMENT,
  }),
})

/**
 * How a venue's action settles. ONE lookup, exported, so the surface that has to CONFIRM a direct
 * settlement asks the same table the hook does rather than re-stating "a Gains protect is direct"
 * somewhere a future venue change would not reach. Total — an unknown pair is keeper-settled, which
 * is the reading that waits for a venue event rather than one that invents a confirmation.
 */
export function settlementFor(venue, action) {
  const key = typeof venue === 'string' ? venue.trim().toLowerCase() : null
  return SETTLEMENT_BY_VENUE_ACTION[key]?.[normalizeAction(action)] ?? SETTLEMENT.EXECUTION
}

/* ------------------------------------------------------------------------------------------- *
 * Refusals
 *
 * Stable codes so a sheet can style one and a test can assert one; the text is member-facing and
 * may be reworded. A refusal is ALWAYS accompanied by the machine landing in `rejected`, so there
 * is no way to refuse silently.
 * ------------------------------------------------------------------------------------------- */

export const PERPS_REFUSAL = Object.freeze({
  ACTION_UNSUPPORTED: 'action_unsupported',
  VENUE_UNSUPPORTED: 'venue_unsupported',
  ACCOUNT_MISSING: 'account_missing',
  CHAIN_MISSING: 'chain_missing',
  VALIDATION: 'validation',
  VALIDATION_MISSING: 'validation_missing',
  BUILD_FAILED: 'build_failed',
  ATTESTATION_MISSING: 'attestation_missing',
  ATTESTATION_UNAVAILABLE: 'attestation_unavailable',
  SCREENING_RESTRICTED: 'screening_restricted',
  SCREENING_UNCONFIRMED: 'screening_unconfirmed',
  SEND_FAILED: 'send_failed',
})

function refuse(code, reason) {
  return { ok: false, code, reason }
}

/* ------------------------------------------------------------------------------------------- *
 * Calldata
 *
 * One table, venue × action → the venue module's own builders. The builders THROW on malformed
 * input (they run when a member is about to sign), and that throw is caught once, at the call site
 * below, and surfaced as a refusal — never as a half-built batch.
 * ------------------------------------------------------------------------------------------- */

const BUILDERS = Object.freeze({
  gains: Object.freeze({
    approve: ({ chainId, params }) =>
      gains.buildApprovalCall({ chainId, token: params.token, amount: params.amount }),
    open: ({ chainId, account, params }) => [gains.buildOpenTradeCall({ chainId, trader: account, ...params })],
    close: ({ chainId, params }) => [gains.buildCloseTradeCall({ chainId, ...params })],
    reduce: ({ chainId, params }) => [gains.buildReducePositionCall({ chainId, ...params })],
    /**
     * Two independent diamond calls. The STOP-LOSS goes first for the same reason GMX's own
     * protection builder emits it first: a member who abandons the second signature is left holding
     * the protective order rather than only the profit-taking one.
     */
    protect: ({ chainId, params }) => {
      const calls = []
      if ('sl' in params) calls.push(gains.buildUpdateSlCall({ chainId, tradeIndex: params.tradeIndex, sl: params.sl }))
      if ('tp' in params) calls.push(gains.buildUpdateTpCall({ chainId, tradeIndex: params.tradeIndex, tp: params.tp }))
      if (!calls.length) {
        throw new RangeError('a protect action needs `sl`, `tp`, or both (pass null to clear one)')
      }
      return calls
    },
    cancel: ({ chainId, params }) => [
      // Takes a PENDING-ORDER index and refuses a trade index — the builder enforces it, and this
      // hook must never "helpfully" convert between the two spaces.
      gains.buildCancelOrderAfterTimeoutCall({ chainId, pendingOrderIndex: params.pendingOrderIndex }),
    ],
  }),
  gmx: Object.freeze({
    // The approval target is GMX's Router, NOT the ExchangeRouter this feature calls. The builder
    // owns that distinction; do not "simplify" it here.
    approve: ({ chainId, params }) => gmx.buildApprovalCall({ chainId, token: params.token, amount: params.amount }),
    open: ({ chainId, account, params }) => [gmx.buildOpenPositionCalls({ chainId, account, ...params })],
    close: ({ chainId, account, params }) => [gmx.buildClosePositionCalls({ chainId, account, ...params })],
    // A reduce IS a decrease with a smaller `sizeDeltaUsd` — the same venue call, not a second one.
    reduce: ({ chainId, account, params }) => [gmx.buildClosePositionCalls({ chainId, account, ...params })],
    protect: ({ chainId, account, params }) => gmx.buildProtectionCalls({ chainId, account, ...params }),
    cancel: ({ chainId, params }) => [gmx.buildCancelOrderCall({ chainId, key: params.key ?? params.orderKey })],
  }),
})

/**
 * The validators that run BEFORE a signature is requested (FR-022).
 *
 * `cancel` maps to null DELIBERATELY: recovering collateral from an order the venue never executed
 * has nothing to validate, and a validator there would be one more thing standing between a member
 * and their money. The venue itself is the only authority on whether the recovery is due yet
 * (`WaitTimeout()`), and the timeout mapper already refuses to OFFER the control before then.
 */
const VALIDATOR_BY_ACTION = Object.freeze({
  open: validateOpen,
  close: validateClose,
  reduce: validateClose,
  protect: validateProtection,
  cancel: null,
})

/* ------------------------------------------------------------------------------------------- *
 * The entry gates
 * ------------------------------------------------------------------------------------------- */

/**
 * Sanctions screening + the jurisdiction attestation, for ENTRY ACTIONS ONLY.
 *
 * Both are injected (`deps.hasAttested`, `deps.screenAccount`) rather than imported — see rule 3 in
 * the module header. Unwired is a REFUSAL, not a pass: the clarification for this feature is
 * fail-closed on entry, and no backstop exists (the venues answer 200 from restricted regions and
 * their contracts are permissionless), so FairWins is the enforcement point. An open that could not
 * be checked must not proceed.
 */
async function runEntryGates(spec, deps) {
  if (typeof deps.hasAttested !== 'function') {
    return refuse(
      PERPS_REFUSAL.ATTESTATION_UNAVAILABLE,
      'This could not be confirmed just now, so a new position cannot be opened. You can still manage what you already hold.',
    )
  }
  if (!deps.hasAttested()) {
    return refuse(
      PERPS_REFUSAL.ATTESTATION_MISSING,
      'Please confirm the trading acknowledgements before opening a position.',
    )
  }

  if (typeof deps.screenAccount !== 'function') {
    return refuse(
      PERPS_REFUSAL.SCREENING_UNCONFIRMED,
      'Your account could not be checked just now, so a new position cannot be opened. You can still manage what you already hold.',
    )
  }
  let status
  try {
    status = await deps.screenAccount(spec.account, spec.chainId)
  } catch {
    status = null // an unreadable check is not a passing one
  }
  if (status === 'restricted') {
    return refuse(
      PERPS_REFUSAL.SCREENING_RESTRICTED,
      'This account cannot open a new position. You can still close, reduce and recover what you already hold.',
    )
  }
  if (status !== 'clear') {
    return refuse(
      PERPS_REFUSAL.SCREENING_UNCONFIRMED,
      'Your account could not be checked just now, so a new position cannot be opened. You can still manage what you already hold.',
    )
  }
  return { ok: true }
}

/* ------------------------------------------------------------------------------------------- *
 * Receipt / log helpers — total, because they run over whatever the wallet rail handed back
 * ------------------------------------------------------------------------------------------- */

/** Every log the submission result carries, across the classic and passkey result shapes. */
function logsFrom(result) {
  const out = []
  if (!result || typeof result !== 'object') return out
  const push = (logs) => {
    if (Array.isArray(logs)) out.push(...logs)
  }
  push(result.logs)
  push(result.receipt?.logs)
  if (Array.isArray(result.receipts)) for (const receipt of result.receipts) push(receipt?.logs)
  return out
}

/**
 * The block the submission landed in — the `createdBlock` a Gains timeout is measured from, and
 * where the watcher starts reading. Null when the rail did not report one; the watcher then starts
 * at the current head rather than inventing a range.
 */
function blockFrom(result) {
  if (!result || typeof result !== 'object') return null
  const candidates = [result.blockNumber, result.receipt?.blockNumber]
  if (Array.isArray(result.receipts)) for (const receipt of result.receipts) candidates.push(receipt?.blockNumber)
  const numbers = candidates.map(toBlockNumber).filter((n) => n !== null)
  return numbers.length ? Math.min(...numbers) : null
}

function toBlockNumber(value) {
  if (typeof value === 'bigint') return value >= 0n ? Number(value) : null
  const n = Number(value)
  if (value == null || value === '' || !Number.isFinite(n) || n < 0) return null
  return n
}

/* ------------------------------------------------------------------------------------------- *
 * Defaults
 * ------------------------------------------------------------------------------------------- */

/** How often the watcher asks the chain for new venue events. */
const DEFAULT_POLL_MS = 4_000

/**
 * How long the watcher keeps asking before it admits it lost the thread.
 *
 * Give-up is `unknown` ("we can't confirm this — check on the venue"), never a failure and never a
 * success: an order we stopped watching may still execute, and saying either would be a claim we
 * cannot support.
 */
const DEFAULT_WATCH_MS = 180_000

/**
 * How far back to look when the wallet rail did not report the block it landed in.
 *
 * The venue's acknowledgement is emitted in the submission transaction itself, so starting the
 * watch at the current head would miss it and end in a false `unknown` about a healthy order. A
 * short lookback re-reads the window it must have been in. It is only used when the block is
 * genuinely unknown — a reported block is always exact.
 */
const WATCH_LOOKBACK_BLOCKS = 20

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/* ------------------------------------------------------------------------------------------- *
 * The hook
 * ------------------------------------------------------------------------------------------- */

export function usePerpsTrade(options = {}) {
  const optionDeps = options.deps
  const walletCtx = useContext(WalletContext)
  const wallet = useMemo(() => walletCtx || {}, [walletCtx])
  const { sendOnChain, canTransactOn, cannotTransactReason, isPasskey } = useEarnSend()

  const deps = useMemo(
    () => ({
      sendOnChain,
      getProvider: getReadProvider,
      // Gates: null by default, which REFUSES an open (fail-closed) and is invisible to every exit.
      hasAttested: null,
      screenAccount: null,
      buildCalls: defaultBuildCalls,
      // FR-023: how an action REPORTS itself. See the reporting effect below.
      recordAction: recordPerpsOrder,
      now: () => Date.now(),
      sleep: defaultSleep,
      ...optionDeps,
    }),
    [optionDeps, sendOnChain],
  )
  const depsRef = useRef(deps)
  useEffect(() => {
    depsRef.current = deps
  })

  const pollMs = options.pollMs ?? DEFAULT_POLL_MS
  const watchMs = options.watchMs ?? DEFAULT_WATCH_MS

  const [order, setOrder] = useState(() => createOrderState(options.identity))
  const [refusal, setRefusal] = useState(null)

  /**
   * The run token. Every async step re-checks it, so a reset, an account change or an unmount
   * silently abandons an in-flight run instead of publishing its result over a newer one.
   */
  const runRef = useRef(0)
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      runRef.current += 1
    }
  }, [])

  const reset = useCallback(() => {
    runRef.current += 1
    setRefusal(null)
    setOrder((current) => reduceOrderState(current, { type: SIGNAL.RESET }))
  }, [])

  /**
   * Account change clears everything IMMEDIATELY (spec edge case): an in-flight confirmation
   * belonging to the previous account must never keep rendering — or resolve — under the new one.
   */
  const account = wallet.address ?? null
  useEffect(() => {
    runRef.current += 1
    setRefusal(null)
    setOrder(createOrderState(options.identity))
    // `options.identity` is caller-owned and often a fresh literal; keying on the account alone is
    // deliberate — this effect exists for the account change, not for a re-rendered options object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account])

  /**
   * Run one action end to end.
   *
   * Resolves as soon as the SUBMISSION outcome is known — the venue watch continues in the
   * background and keeps updating `order`. `result.watched` is the promise that settles with the
   * terminal state, for a caller (or a test) that wants to await execution rather than inclusion.
   */
  const submit = useCallback(
    async (descriptor) => {
      const token = ++runRef.current
      const live = () => runRef.current === token && mountedRef.current
      const io = depsRef.current

      const spec = normalizeDescriptor(descriptor, { account: wallet.address })
      // Identity travels on every signal from here on, so the machine can name the venue and the
      // action in its copy even after the run that produced it has gone.
      const identity = {
        venue: spec.venue,
        chainId: spec.chainId,
        action: spec.action,
        venueLabel: spec.venueLabel,
        venueUrl: spec.venueUrl,
      }

      // The machine is folded HERE and published to React, rather than living in a reducer we
      // cannot read back synchronously. Every transition still goes through `reduceOrderState` —
      // no status is ever derived in this hook or in a component.
      let machine = createOrderState(identity)
      const publish = (next) => {
        machine = next
        if (live()) setOrder(next)
        return next
      }
      publish(machine)
      if (live()) setRefusal(null)

      const step = (signal) => (signal ? publish(reduceOrderState(machine, signal)) : machine)

      const reject = (code, reason) => {
        const verdict = refuse(code, reason)
        if (live()) setRefusal(verdict)
        step({ type: SIGNAL.SUBMIT_FAILED, ...identity, reason: { code, text: reason, source: 'app' } })
        return { ...verdict, order: machine, state: machine.state, watched: Promise.resolve(machine) }
      }

      if (!spec.ok) return reject(spec.code, spec.reason)

      /* 1. VALIDATE — before any wallet prompt, always. */
      step({ type: SIGNAL.VALIDATE, ...identity })
      const validator = VALIDATOR_BY_ACTION[spec.action]
      if (validator) {
        if (spec.validate == null) {
          // An OPEN with nothing to check is refused rather than waved through: it is the one
          // action whose inputs must be checked. An exit with no inputs supplied is the caller
          // saying there is nothing to check, and is allowed to proceed — an exit is never blocked
          // on a check we were not given the material for.
          if (isEntryAction(spec.action)) {
            return reject(
              PERPS_REFUSAL.VALIDATION_MISSING,
              'This position could not be checked before signing. Please try again.',
            )
          }
        } else {
          const verdict = validator(spec.validate)
          if (!verdict?.ok) {
            return reject(PERPS_REFUSAL.VALIDATION, verdict?.reason ?? 'This could not be checked just now.')
          }
        }
      }

      /* 2. BUILD — the venue builders own every scale, index space and ownership field. */
      let calls
      try {
        calls = io.buildCalls(spec)
      } catch (error) {
        return reject(PERPS_REFUSAL.BUILD_FAILED, buildFailureText(error))
      }
      if (!Array.isArray(calls) || calls.length === 0) {
        return reject(PERPS_REFUSAL.BUILD_FAILED, 'This action could not be prepared. Please try again.')
      }

      /* 3. GATES — ENTRY ONLY. The single line that can reach them, and it is inside this branch. */
      if (isEntryAction(spec.action)) {
        step({ type: SIGNAL.SCREEN, ...identity })
        const gate = await runEntryGates(spec, io)
        if (!live()) return abandoned(machine)
        if (!gate.ok) return reject(gate.code, gate.reason)
      }

      /* 4. SEND — the app's existing rail: switch chains, wait for the session to settle, then
       * hand the batch to WalletContext.sendCalls (one passkey ceremony, or sequential classic
       * signatures). The rail's own progress drives the machine's pre-submission states. */
      let result
      try {
        result = await io.sendOnChain(spec.chainId, calls, {
          onState: (state) => {
            if (!live()) return
            if (state?.step === 'switching') step({ type: SIGNAL.SWITCH_CHAIN, ...identity })
            else if (state?.step === 'sending') step({ type: SIGNAL.SIGN, ...identity })
          },
        })
      } catch (error) {
        if (!live()) return abandoned(machine)
        return reject(PERPS_REFUSAL.SEND_FAILED, sendFailureText(error))
      }
      if (!live()) return abandoned(machine)

      // A rail that reported no progress still asked for a signature to get here. Without this the
      // machine would be stranded in `validating` (there is deliberately no validating → submitted
      // edge), which would render as nothing at all while the order was in fact live at the venue.
      if (machine.state !== ORDER_STATE.SIGNING) step({ type: SIGNAL.SIGN, ...identity })

      /* 5. SUBMISSION OUTCOME — `submitted`, `rejected` or `unknown`. NEVER `executed`: no input
       * this rail can produce is allowed to mean the venue filled anything, and `submissionSignal`
       * plus the machine's own guard both enforce that. */
      step(submissionSignal(result, identity))

      /* 6. THE RECEIPT'S OWN LOGS. The venue's acknowledgement (Gains `MarketOrderInitiated`, GMX
       * `OrderCreated`) is normally already in the transaction that created the order, so reading
       * it here is what takes a healthy order from "sent" to "the venue has it" without a round
       * trip. These are the venue's events, not the receipt's status — the distinction rule 2
       * rests on. */
      for (const log of logsFrom(result)) step(signalFromLog(log, spec, machine, identity))

      // `ok` means "the venue has this, or already finished it" — NOT "the position changed". A
      // caller that treats `ok` as done would be making exactly the claim rule 2 forbids; the state
      // is on `order.state`, and `watched` is how you wait for the real answer.
      const settledBadly = isTerminalState(machine) && machine.state !== ORDER_STATE.EXECUTED
      const submitted = {
        ok: !settledBadly,
        code: null,
        reason: settledBadly ? (machine.reason?.text ?? null) : null,
        order: machine,
        state: machine.state,
      }

      /* 7. WATCH — the terminal event, in the background. */
      const watched = (async () => {
        if (spec.settlement === SETTLEMENT.DIRECT) return machine
        if (doneWatching(machine, spec)) return machine
        await watchToTerminal({
          spec,
          identity,
          io,
          live,
          step,
          current: () => machine,
          fromBlock: blockFrom(result),
          pollMs,
          watchMs,
        })
        return machine
      })()
      // A watcher failure is never allowed to surface as an unhandled rejection; it is already
      // expressed in the machine (`unknown`), which is the honest place for it.
      watched.catch(() => {})

      return { ...submitted, watched }
    },
    [wallet.address, pollMs, watchMs],
  )

  /**
   * Terminal confirmation for a DIRECT action — a Gains stop-loss / take-profit update, which the
   * diamond applies inside the member's own transaction and announces with no order event.
   *
   * The caller passes the venue's STORED values, re-read from the venue (US2 acceptance 3), and
   * those become `order.execution`. It is restricted to direct-settlement actions on purpose: for a
   * keeper-settled order the event is the truth, and letting a poll mint an execution there would
   * re-open exactly the "we think it probably went through" path this feature exists to close.
   */
  const confirmFromVenue = useCallback((execution) => {
    setOrder((current) => {
      if (settlementFor(current.venue, current.action) !== SETTLEMENT.DIRECT) return current
      return reduceOrderState(current, {
        type: SIGNAL.VENUE_EXECUTED,
        venue: current.venue,
        chainId: current.chainId,
        action: current.action,
        execution: execution ?? null,
      })
    })
  }, [])

  /**
   * The other end of `confirmFromVenue`: the re-read is BOUNDED, and this is where it lands when
   * the bound is spent.
   *
   * It reports `unknown` — "we can't confirm this, check on the venue" — which is neither a success
   * nor a failure, because both would be claims we cannot support: the transaction was included, so
   * the venue very likely did store the levels, but we did not see it and will not say we did. The
   * machine keeps its edge out of `unknown`, so a later confirmation can still correct the record.
   *
   * Restricted to DIRECT settlement for the same reason `confirmFromVenue` is: a keeper-settled
   * order has its own watcher, and that watcher owns when to give up on it.
   */
  const reportUnconfirmed = useCallback((text) => {
    setOrder((current) => {
      if (settlementFor(current.venue, current.action) !== SETTLEMENT.DIRECT) return current
      const said = typeof text === 'string' && text.trim() !== '' ? text.trim() : null
      return reduceOrderState(current, {
        type: SIGNAL.LOST,
        venue: current.venue,
        chainId: current.chainId,
        action: current.action,
        reason: {
          code: null,
          text: said ?? 'We could not read this back from the venue in time.',
          source: 'app',
        },
      })
    })
  }, [])

  /* ------------------------------------------------------------------------------------------- *
   * REPORTING (T070 / FR-023) — one producer, here, for the same reason there is one write path.
   *
   * Every perps action a member takes runs through this hook, so queueing the machine's own state
   * here is what makes the activity feed complete: no surface has to remember to report, and none
   * of them CAN report something the machine did not say. `recordPerpsOrder` takes the state from
   * the order object and refuses to be overridden, so a caller cannot queue "position closed" for
   * an order the venue has not executed.
   *
   * It is deliberately an EFFECT over `order` rather than a call inside `submit`: the terminal
   * outcome arrives from the venue watcher long after `submit` resolved, and that outcome is the
   * one a member actually wants in their feed. The buffer keys records by the order, so the
   * pending state and the terminal one collapse onto one entry until the source drains them.
   *
   * It reports for the ACCOUNT the machine ran under — read from the same `wallet.address` the run
   * was keyed on — so a record can never be filed under an account that did not take the action.
   * Failures are swallowed inside the buffer: a full localStorage must never break a close.
   * ------------------------------------------------------------------------------------------- */
  useEffect(() => {
    if (!account) return
    try {
      depsRef.current.recordAction?.(account, order)
    } catch {
      // BOOKKEEPING NEVER OUTRANKS THE ACTION. `recordPerpsOrder` already swallows its own storage
      // failures, but the reporter is injectable and this effect runs on the same render as a
      // member's close: a throw here would unmount the sheet mid-exit. A record we could not write
      // is a missing feed line; a sheet that crashed is a member who cannot get out.
    }
    // `order` is a frozen new object per transition, so this fires once per state the machine
    // reaches — which is exactly the reporting granularity FR-023 asks for.
  }, [account, order])

  const networkName = NETWORKS[order.chainId]?.name ?? null
  const statusText = orderStatusText(order, { networkName })

  return {
    /** The whole machine state. The single source of truth — never re-derive a status from it. */
    order,
    status: order.state,
    statusText,
    pending: order.pending,
    terminal: order.terminal,
    /** `{ code, reason }` for the refusal that produced a `rejected` state, or null. */
    refusal,
    /** The member this hook signs for — the address a venue re-read has to be about. */
    account,
    submit,
    reset,
    confirmFromVenue,
    reportUnconfirmed,
    /** Whether this session has a transaction rail on a chain at all (passkey needs ERC-4337). */
    canTransactOn,
    cannotTransactReason,
    isPasskey,
  }
}

/* ------------------------------------------------------------------------------------------- *
 * Descriptor
 * ------------------------------------------------------------------------------------------- */

/**
 * Normalise + check the action descriptor. Total: it never throws, and every refusal carries a
 * member-facing reason, because the earliest possible refusal is the cheapest one.
 *
 * ```
 * { action, venue, chainId, account?, params, validate?, approval? }
 * ```
 */
export function normalizeDescriptor(descriptor, context = {}) {
  const input = descriptor ?? {}
  const action = normalizeAction(input.action)
  if (!action) {
    return { ...refuse(PERPS_REFUSAL.ACTION_UNSUPPORTED, 'This action is not supported here.'), ok: false }
  }
  const venue = typeof input.venue === 'string' ? input.venue.trim().toLowerCase() : null
  if (!venue || !BUILDERS[venue]) {
    return {
      ...refuse(
        PERPS_REFUSAL.VENUE_UNSUPPORTED,
        'Positions on this venue are managed on the venue’s own app.',
      ),
      ok: false,
    }
  }
  const chainId = Number(input.chainId)
  if (!Number.isInteger(chainId) || chainId <= 0) {
    return { ...refuse(PERPS_REFUSAL.CHAIN_MISSING, 'This venue’s network could not be determined.'), ok: false }
  }
  const member = input.account ?? context.account ?? null
  if (typeof member !== 'string' || member === '') {
    return { ...refuse(PERPS_REFUSAL.ACCOUNT_MISSING, 'Connect your wallet to continue.'), ok: false }
  }

  return {
    ok: true,
    action,
    venue,
    chainId,
    account: member,
    params: input.params ?? {},
    validate: input.validate ?? null,
    // An approval is only ever a leading leg of an OPEN. An exit returns collateral; it never needs
    // spending permission, and prepending one there would be a signature for nothing.
    approval: action === 'open' ? (input.approval ?? null) : null,
    settlement: settlementFor(venue, action),
    venueLabel: PERP_VENUES[venue]?.shortLabel ?? PERP_VENUES[venue]?.label ?? venue,
    venueUrl: input.venueUrl ?? PERP_VENUES[venue]?.homepage ?? null,
    /** Gains only: the venue's own `getMarketOrdersTimeoutBlocks()`, read by the caller. */
    timeoutBlocks: toBlockNumber(input.timeoutBlocks),
    orderKey: input.orderKey ?? input.params?.key ?? input.params?.orderKey ?? null,
  }
}

/** The default call-batch builder: the venue's own builders, plus an optional leading approval. */
export function defaultBuildCalls(spec) {
  const table = BUILDERS[spec.venue]
  const build = table?.[spec.action]
  if (typeof build !== 'function') {
    throw new Error(`${spec.venue} does not support "${spec.action}" from this app`)
  }
  const calls = build(spec)
  if (!spec.approval) return calls
  return [table.approve({ chainId: spec.chainId, params: spec.approval }), ...calls]
}

/**
 * A builder throw is a programming-shaped failure with a developer-shaped message (a scale, an
 * index space, a missing address). It is surfaced rather than swallowed — a member who cannot act
 * needs to know why, and silence here would look like a dead button — but it is prefixed so nobody
 * reads a type error as the venue's own words.
 */
function buildFailureText(error) {
  const message = typeof error?.message === 'string' && error.message.trim() !== '' ? error.message.trim() : null
  return message
    ? `This action could not be prepared: ${message}`
    : 'This action could not be prepared. Please try again.'
}

/** The send rail already speaks in member-facing sentences; keep its words. */
function sendFailureText(error) {
  const message =
    (typeof error?.shortMessage === 'string' && error.shortMessage.trim()) ||
    (typeof error?.message === 'string' && error.message.trim()) ||
    ''
  return message !== '' ? message : 'This could not be sent. Please try again.'
}

function abandoned(machine) {
  return { ok: false, code: null, reason: null, order: machine, state: machine.state, watched: Promise.resolve(machine) }
}

/* ------------------------------------------------------------------------------------------- *
 * The venue watch
 * ------------------------------------------------------------------------------------------- */

/**
 * One raw log → a signal, through the VENUE MODULES' decoders. Nothing about a venue's event
 * encoding lives in this hook.
 *
 * `gainsEventSignal` decodes raw logs itself for the three market-order events, but its raw path
 * does not cover `CollateralReturnedAfterTimeout` — so that one is decoded here and handed over in
 * the already-decoded `{ name }` form the same function accepts. Without it a SUCCESSFUL recovery
 * would never resolve and would eventually be reported as `unknown`, which is the one outcome a
 * member recovering stuck collateral must not be given.
 */
function signalFromLog(log, spec, machine, identity) {
  const context = {
    ...identity,
    account: spec.account,
    // Narrow to THIS order once the venue has told us which one it is. Before that these are
    // absent and the mappers accept any matching event — which is correct, because the
    // acknowledgement is the event that tells us the handle in the first place.
    orderKey: machine.venueRef?.orderKey ?? spec.orderKey ?? undefined,
    pendingOrderIndex: machine.venueRef?.pendingOrderIndex ?? undefined,
  }
  if (spec.venue === 'gains') {
    const direct = gainsEventSignal(log, context)
    if (direct) return direct
    const returned = gains.decodeCollateralReturnedAfterTimeout(log)
    return returned ? gainsEventSignal({ name: 'CollateralReturnedAfterTimeout', ...returned }, context) : null
  }
  if (spec.venue === 'gmx') return gmxEventSignal(gmx.decodeOrderEvent(log), context)
  return null
}

/** The `getLogs` filter for a venue's order events, from the venue module. Null ⇒ nothing to watch. */
function filterFor(spec) {
  if (spec.venue === 'gains') return gains.orderEventFilter(spec.chainId)
  if (spec.venue === 'gmx') return gmx.eventTopicsForAccount(spec.account, { chainId: spec.chainId })
  return null
}

/**
 * Whether the watcher has what it came for. Terminal is terminal; and for an ACKNOWLEDGEMENT
 * action, the venue accepting the order IS the outcome — a resting stop-loss is not a stalled one,
 * and waiting for it to fire would report `unknown` about an order that is working correctly.
 */
function doneWatching(machine, spec) {
  if (isTerminalState(machine)) return true
  return spec.settlement === SETTLEMENT.ACKNOWLEDGEMENT && machine.state === ORDER_STATE.VENUE_PENDING
}

async function watchToTerminal({ spec, identity, io, live, step, current, fromBlock, pollMs, watchMs }) {
  const provider = safeProvider(io, spec.chainId)
  const filter = filterFor(spec)
  if (!provider || !filter) {
    // No read connection, or a venue we cannot build a filter for. We cannot follow the order, and
    // saying nothing would leave a spinner forever — so say exactly that, with the venue link.
    step(lostSignal(identity, 'We could not follow this order — check it on the venue.'))
    return
  }

  const started = io.now()
  let from = fromBlock

  for (;;) {
    if (!live()) return
    let head
    try {
      head = toBlockNumber(await provider.getBlockNumber())
    } catch {
      head = null // a failed poll is not an outcome
    }
    if (!live()) return

    if (head !== null) {
      if (from == null) from = Math.max(0, head - WATCH_LOOKBACK_BLOCKS)
      try {
        const logs = await provider.getLogs({ ...filter, fromBlock: from, toBlock: head })
        if (!live()) return
        for (const log of Array.isArray(logs) ? logs : []) step(signalFromLog(log, spec, current(), identity))
      } catch {
        /* one failed range read changes nothing about the order */
      }
      if (!live()) return

      // THE GAINS TIMEOUT. Past `createdBlock + getMarketOrdersTimeoutBlocks()` with no event, the
      // order is recoverable — and the mapper refuses to claim it unless all three block numbers
      // prove it, so a control that would revert `WaitTimeout()` is never offered. The window is
      // venue configuration supplied by the caller from the chain, never a constant.
      if (!doneWatching(current(), spec) && spec.venue === 'gains' && spec.action !== 'cancel' && spec.timeoutBlocks) {
        step(
          gainsTimeoutSignal({
            ...identity,
            createdBlock: fromBlock,
            currentBlock: head,
            timeoutBlocks: spec.timeoutBlocks,
            pendingOrderIndex: current().venueRef?.pendingOrderIndex ?? null,
          }),
        )
      }
      from = head + 1
    }

    if (doneWatching(current(), spec)) return
    if (io.now() - started >= watchMs) {
      step(lostSignal(identity, 'We could not confirm what happened to this order — check it on the venue.'))
      return
    }
    await io.sleep(pollMs)
  }
}

function safeProvider(io, chainId) {
  try {
    return io.getProvider(chainId) || null
  } catch {
    return null
  }
}

/** `unknown` — not success, not failure. The only honest answer when the thread is lost. */
function lostSignal(identity, text) {
  return { type: SIGNAL.LOST, ...identity, reason: { code: null, text, source: 'app' } }
}

export default usePerpsTrade
