/**
 * The perps order state machine (spec 083, T015, contracts/order-state-machine.md).
 *
 * The suite is organised around the one rule the module exists to enforce — inclusion is never
 * execution — and then around the three states this app has historically got wrong: a stalled
 * UserOp (reported as success elsewhere in this repo), `unknown` (usually not modelled at all), and
 * a rejection whose venue reason gets dropped on the way to the member.
 */
import { describe, it, expect } from 'vitest'
import { Interface } from 'ethers'
import { GAINS_DIAMOND_ABI, GAINS_CANCEL_REASON } from '../../abis/perps/gainsDiamond'
import {
  CANCEL_REASON_TEXT,
  isPendingOrderIndex,
  isTradeIndex,
  pendingOrderIndex,
  tradeIndex,
} from '../../lib/perps/venues/gains'
import {
  ORDER_STATE,
  ORDER_STATES,
  ORDER_STATUS_TEXT,
  ORDER_TRANSITIONS,
  EXECUTED_TEXT_BY_ACTION,
  PENDING_STATES,
  TERMINAL_STATES,
  SIGNAL,
  canTransition,
  createOrderState,
  gainsEventSignal,
  gainsTimeoutSignal,
  gmxEventSignal,
  isPendingState,
  isTerminalState,
  isVenueStatedReason,
  orderStatusText,
  reduceOrderState,
  submissionSignal,
} from '../../lib/perps/orderState'
import { PERPS_GAINS_TIMEOUT_OBSERVATION } from '../../lib/perps/perpsCopy'

const diamond = new Interface(GAINS_DIAMOND_ABI)

const MEMBER = '0xd504dC1ac094F45272f46b25A2874bDab45132Da'
const STRANGER = '0x1111111111111111111111111111111111111111'
const TX_HASH = `0x${'ab'.repeat(32)}`
const USEROP_HASH = `0x${'cd'.repeat(32)}`
const ORDER_KEY = `0x${'ef'.repeat(32)}`
const HUNDRED_USDC = 100_000_000n

/** GMX pads the account into `topic2` as a bytes32. */
const MEMBER_TOPIC = `0x${'0'.repeat(24)}${MEMBER.slice(2).toLowerCase()}`

const initiatedLog = diamond.encodeEventLog('MarketOrderInitiated', [[MEMBER, 9], MEMBER, 0, true])
const executedLog = diamond.encodeEventLog('MarketExecuted', [
  [MEMBER, 9],
  MEMBER,
  5,
  [MEMBER, 5, 0, 10_000, true, true, 3, 0, HUNDRED_USDC, 634_125_000_000_000n, 0, 0, false, 0, 0],
  true,
  634_125_000_000_000n,
  634_130_000_000_000n,
  570_000_000_000_000n,
  [0, 0, 0, 0, 0, 0],
  0,
  0,
  100_000_000n,
])
const canceledLog = diamond.encodeEventLog('MarketOpenCanceled', [
  [MEMBER, 9],
  MEMBER,
  0,
  GAINS_CANCEL_REASON.SLIPPAGE,
  HUNDRED_USDC,
])

/**
 * Every shape a "the transaction went through" input takes in this app: the passkey lifecycle
 * result, the classic sendCalls result, a raw ethers receipt, and bare hashes.
 */
const SUBMISSION_INPUTS = [
  TX_HASH,
  { state: 'included', txHash: TX_HASH },
  { state: 'submitted', userOpHash: USEROP_HASH },
  { state: 'stalled', userOpHash: USEROP_HASH, lastKnown: { state: 'pending' } },
  { state: 'failed', reason: 'user operation reverted', userOpHash: USEROP_HASH },
  { state: 'ceremony-signed' },
  { route: 'direct', receipts: [{ status: 1, hash: TX_HASH }], txHash: TX_HASH },
  { route: 'direct', receipts: [{ status: 0, hash: TX_HASH }], txHash: TX_HASH },
  { hash: TX_HASH, status: 1, blockNumber: 12345 },
  { hash: TX_HASH, status: 0, blockNumber: 12345 },
  { userOpHash: USEROP_HASH },
  { txHash: TX_HASH },
  {},
]

/** A machine parked in an arbitrary state, so exhaustive assertions can start anywhere. */
function atState(name, extra = {}) {
  return Object.freeze({ ...createOrderState({ venue: 'gains', action: 'open' }), state: name, ...extra })
}

function run(signals, start = createOrderState({ venue: 'gains', action: 'open' })) {
  return signals.reduce((state, signal) => reduceOrderState(state, signal), start)
}

/* =============================================================================================
 * THE RULE
 * ========================================================================================== */

describe('inclusion is never execution', () => {
  it('has no submitted → executed edge in the transition table', () => {
    expect(canTransition(ORDER_STATE.SUBMITTED, ORDER_STATE.EXECUTED)).toBe(false)
    expect(ORDER_TRANSITIONS[ORDER_STATE.SUBMITTED]).not.toContain(ORDER_STATE.EXECUTED)
  })

  it('reaches `executed` from nowhere except a state the venue has already acknowledged', () => {
    const sources = ORDER_STATES.filter((from) => canTransition(from, ORDER_STATE.EXECUTED))
    // `frozen` and `timed_out` are venue-acknowledged orders that later executed; `unknown` is a
    // thread we regained. None of them is an inclusion signal.
    expect(sources.sort()).toEqual(
      [ORDER_STATE.VENUE_PENDING, ORDER_STATE.FROZEN, ORDER_STATE.TIMED_OUT, ORDER_STATE.UNKNOWN].sort(),
    )
  })

  it('maps no submission input — receipt, UserOp hash, 200-shaped result — to an execution signal', () => {
    for (const input of SUBMISSION_INPUTS) {
      const signal = submissionSignal(input, { venue: 'gains', action: 'open' })
      expect(signal?.type).not.toBe(SIGNAL.VENUE_EXECUTED)
    }
  })

  it('never yields `executed` from any submission input, starting in any state', () => {
    // Every state except the one that is already executed — an order the venue filled does not
    // become unfilled because a receipt turned up late.
    const starts = ORDER_STATES.filter((s) => s !== ORDER_STATE.EXECUTED)
    for (const input of SUBMISSION_INPUTS) {
      const signal = submissionSignal(input, { venue: 'gains', action: 'open' })
      for (const from of starts) {
        const next = reduceOrderState(atState(from), signal)
        expect(next.state).not.toBe(ORDER_STATE.EXECUTED)
      }
    }
  })

  it('leaves a full submit walk at `submitted` — sent, not opened', () => {
    const state = run([
      { type: SIGNAL.VALIDATE },
      { type: SIGNAL.SCREEN },
      { type: SIGNAL.SIGN },
      submissionSignal({ state: 'included', txHash: TX_HASH }, { venue: 'gains', action: 'open' }),
    ])
    expect(state.state).toBe(ORDER_STATE.SUBMITTED)
    expect(state.pending).toBe(true)
    expect(state.terminal).toBe(false)
    expect(state.txHash).toBe(TX_HASH)
    expect(orderStatusText(state)).toBe('Sent to Gains.')
    expect(orderStatusText(state)).not.toMatch(/opened|closed/i)
  })

  it('refuses any signal that is not a venue execution event to report execution', () => {
    // The 1:1 signal→state map plus the reducer's guard mean only VENUE_EXECUTED can land there.
    const invented = [
      { type: 'executed' },
      { type: 'success' },
      { type: SIGNAL.SUBMITTED, txHash: TX_HASH },
      { type: SIGNAL.VENUE_ACKNOWLEDGED },
    ]
    for (const signal of invented) {
      for (const from of ORDER_STATES.filter((s) => s !== ORDER_STATE.EXECUTED)) {
        expect(reduceOrderState(atState(from), signal).state).not.toBe(ORDER_STATE.EXECUTED)
      }
    }
  })

  it('promotes a venue execution seen while still `submitted` THROUGH venue_pending', () => {
    // The order is real and it filled — the event proves both. It still enters `executed` from
    // `venue_pending`, so the missing edge stays missing.
    const submittedState = run([
      { type: SIGNAL.SIGN },
      submissionSignal({ state: 'included', txHash: TX_HASH }, { venue: 'gains' }),
    ])
    expect(submittedState.state).toBe(ORDER_STATE.SUBMITTED)

    const executed = reduceOrderState(submittedState, gainsEventSignal(executedLog, { account: MEMBER }))
    expect(executed.state).toBe(ORDER_STATE.EXECUTED)
    expect(executed.path).toContain(ORDER_STATE.VENUE_PENDING)
    expect(executed.path.slice(-2)).toEqual([ORDER_STATE.VENUE_PENDING, ORDER_STATE.EXECUTED])
  })
})

/* =============================================================================================
 * States and transitions
 * ========================================================================================== */

describe('states', () => {
  it('treats submitted AND venue_pending as pending, and nothing else', () => {
    expect(PENDING_STATES).toEqual([ORDER_STATE.SUBMITTED, ORDER_STATE.VENUE_PENDING])
    expect(isPendingState(ORDER_STATE.SUBMITTED)).toBe(true)
    expect(isPendingState(ORDER_STATE.VENUE_PENDING)).toBe(true)
    expect(isPendingState(ORDER_STATE.EXECUTED)).toBe(false)
    expect(isPendingState(atState(ORDER_STATE.VENUE_PENDING))).toBe(true)
  })

  it('names five terminal states, including the two that need the member to act', () => {
    expect([...TERMINAL_STATES].sort()).toEqual(
      [
        ORDER_STATE.EXECUTED,
        ORDER_STATE.REJECTED,
        ORDER_STATE.FROZEN,
        ORDER_STATE.TIMED_OUT,
        ORDER_STATE.UNKNOWN,
      ].sort(),
    )
    expect(isTerminalState(ORDER_STATE.FROZEN)).toBe(true)
    expect(isTerminalState(ORDER_STATE.TIMED_OUT)).toBe(true)
    expect(isTerminalState(ORDER_STATE.SUBMITTED)).toBe(false)
  })

  it('lets an exit skip screening — screening gates opening only (FR-014)', () => {
    const closing = run(
      [{ type: SIGNAL.VALIDATE }, { type: SIGNAL.SIGN }],
      createOrderState({ venue: 'gains', action: 'close' }),
    )
    expect(closing.state).toBe(ORDER_STATE.SIGNING)
    expect(closing.ignoredSignal).toBeNull()
  })

  it('ignores an illegal transition instead of applying it, and says which one', () => {
    const executed = reduceOrderState(atState(ORDER_STATE.EXECUTED), { type: SIGNAL.VENUE_REJECTED })
    expect(executed.state).toBe(ORDER_STATE.EXECUTED)
    expect(executed.ignoredSignal?.why).toMatch(/not a legal transition/)
  })

  it('nothing auto-clears a frozen order — only a venue event moves it', () => {
    const frozen = atState(ORDER_STATE.FROZEN)
    expect(reduceOrderState(frozen, { type: SIGNAL.VENUE_ACKNOWLEDGED }).state).toBe(ORDER_STATE.FROZEN)
    expect(reduceOrderState(frozen, { type: SIGNAL.SUBMITTED }).state).toBe(ORDER_STATE.FROZEN)
    expect(reduceOrderState(frozen, { type: SIGNAL.VENUE_REJECTED }).state).toBe(ORDER_STATE.REJECTED)
  })

  it('keeps identity across a reset and drops every trace of the resolved order', () => {
    const settled = run([
      { type: SIGNAL.SIGN },
      { type: SIGNAL.SUBMITTED, txHash: TX_HASH },
      { type: SIGNAL.VENUE_REJECTED, reason: { code: 3, text: 'nope', source: 'gains' } },
    ])
    const fresh = reduceOrderState(settled, { type: SIGNAL.RESET })
    expect(fresh.state).toBe(ORDER_STATE.IDLE)
    expect(fresh.venue).toBe('gains')
    expect(fresh.action).toBe('open')
    expect(fresh.txHash).toBeNull()
    expect(fresh.reason).toBeNull()
  })

  it('merges evidence without erasing it — a later signal cannot drop the recovery index', () => {
    const acknowledged = reduceOrderState(
      run([{ type: SIGNAL.SIGN }, { type: SIGNAL.SUBMITTED, txHash: TX_HASH }]),
      gainsEventSignal(initiatedLog, { account: MEMBER }),
    )
    expect(isPendingOrderIndex(acknowledged.venueRef.pendingOrderIndex)).toBe(true)

    const later = reduceOrderState(acknowledged, { type: SIGNAL.VENUE_TIMED_OUT })
    expect(isPendingOrderIndex(later.venueRef.pendingOrderIndex)).toBe(true)
    expect(later.txHash).toBe(TX_HASH)
  })
})

/* =============================================================================================
 * A stalled UserOp is not success
 * ========================================================================================== */

describe('a stalled UserOp is not success', () => {
  it('classifies the stalled lifecycle explicitly, as unknown', () => {
    const signal = submissionSignal(
      { state: 'stalled', userOpHash: USEROP_HASH },
      { venue: 'gmx', action: 'close', venueUrl: 'https://app.gmx.io/#/trade/' },
    )
    expect(signal.type).toBe(SIGNAL.LOST)

    const state = reduceOrderState(atState(ORDER_STATE.SIGNING), signal)
    expect(state.state).toBe(ORDER_STATE.UNKNOWN)
    expect(state.state).not.toBe(ORDER_STATE.EXECUTED)
    expect(state.state).not.toBe(ORDER_STATE.SUBMITTED)
    expect(state.submission).toBe('stalled')
    expect(state.userOpHash).toBe(USEROP_HASH)
  })

  it('does not depend on a "failed" check — the trap the earn sheets fall into', () => {
    // VaultSheet.jsx / useStakingActions.js throw only on state === 'failed'; a stalled result
    // passes their check and is recorded as a completed action. Here it never reads as success.
    const stalled = { state: 'stalled', userOpHash: USEROP_HASH }
    expect(stalled.state).not.toBe('failed')
    const state = reduceOrderState(atState(ORDER_STATE.SIGNING), submissionSignal(stalled))
    expect(state.terminal).toBe(true)
    expect(state.pending).toBe(false)
    expect(orderStatusText(state)).toMatch(/can’t confirm/)
  })

  it('treats an unreadable submission state, and a result with no reference, as unknown too', () => {
    for (const input of [{ state: 'weird-new-state' }, {}]) {
      const state = reduceOrderState(atState(ORDER_STATE.SIGNING), submissionSignal(input))
      expect(state.state).toBe(ORDER_STATE.UNKNOWN)
      expect(state.reason?.text).toBeTruthy()
    }
  })

  it('a failed submission is rejected with the wallet’s own reason, not unknown', () => {
    const state = reduceOrderState(
      atState(ORDER_STATE.SIGNING),
      submissionSignal({ state: 'failed', reason: 'user operation reverted' }),
    )
    expect(state.state).toBe(ORDER_STATE.REJECTED)
    expect(state.reason.text).toBe('user operation reverted')
    expect(state.reason.source).toBe('wallet')
  })

  it('a reverted receipt is rejected, an included one is only submitted', () => {
    const reverted = reduceOrderState(
      atState(ORDER_STATE.SIGNING),
      submissionSignal({ hash: TX_HASH, status: 0 }),
    )
    expect(reverted.state).toBe(ORDER_STATE.REJECTED)
    expect(reverted.reason.source).toBe('chain')

    const included = reduceOrderState(
      atState(ORDER_STATE.SIGNING),
      submissionSignal({ route: 'direct', receipts: [{ status: 1, hash: TX_HASH }], txHash: TX_HASH }),
    )
    expect(included.state).toBe(ORDER_STATE.SUBMITTED)
  })
})

/* =============================================================================================
 * `unknown` is a real state
 * ========================================================================================== */

describe('unknown is a real terminal state', () => {
  it('carries the venue link the member is told to check', () => {
    const state = reduceOrderState(
      atState(ORDER_STATE.SUBMITTED),
      submissionSignal(
        { state: 'stalled' },
        { venue: 'gmx', venueUrl: 'https://app.gmx.io/#/trade/?market=ETH%2FUSD' },
      ),
    )
    expect(state.state).toBe(ORDER_STATE.UNKNOWN)
    expect(state.venueUrl).toBe('https://app.gmx.io/#/trade/?market=ETH%2FUSD')
    expect(orderStatusText(state)).toBe('We can’t confirm this — check on GMX.')
  })

  it('claims neither success nor failure', () => {
    const text = orderStatusText(ORDER_STATE.UNKNOWN, { venue: 'gains' })
    expect(text).not.toMatch(/opened|closed|failed|rejected|success/i)
  })

  it('is corrected by a venue event when the thread comes back', () => {
    const recovered = reduceOrderState(
      atState(ORDER_STATE.UNKNOWN),
      gainsEventSignal(executedLog, { account: MEMBER }),
    )
    expect(recovered.state).toBe(ORDER_STATE.EXECUTED)
  })
})

/* =============================================================================================
 * Gains mappers
 * ========================================================================================== */

describe('Gains event mapping', () => {
  it('MarketOrderInitiated acknowledges the order and keeps the PENDING-ORDER index', () => {
    const signal = gainsEventSignal(initiatedLog, { account: MEMBER, action: 'open' })
    expect(signal.type).toBe(SIGNAL.VENUE_ACKNOWLEDGED)
    expect(signal.venue).toBe('gains')

    const state = reduceOrderState(atState(ORDER_STATE.SUBMITTED), signal)
    expect(state.state).toBe(ORDER_STATE.VENUE_PENDING)
    // The brand survives the machine — the recovery builder refuses a raw number for good reason.
    expect(isPendingOrderIndex(state.venueRef.pendingOrderIndex)).toBe(true)
    expect(state.venueRef.pendingOrderIndex.value).toBe(9)
    expect(state.venueRef.tradeIndex).toBeUndefined()
    expect(orderStatusText(state)).toBe('Gains is executing this.')
  })

  it('MarketExecuted executes the order and carries the TRADE index and the venue’s numbers', () => {
    const state = reduceOrderState(
      atState(ORDER_STATE.VENUE_PENDING),
      gainsEventSignal(executedLog, { account: MEMBER, action: 'open' }),
    )
    expect(state.state).toBe(ORDER_STATE.EXECUTED)
    expect(isTradeIndex(state.venueRef.tradeIndex)).toBe(true)
    expect(state.venueRef.tradeIndex.value).toBe(5)
    // Values that only exist after execution (FR-009), in venue units, unconverted.
    expect(state.execution.liqPrice).toBe(570_000_000_000_000n)
    expect(orderStatusText(state)).toBe('Position opened.')
  })

  it('MarketOpenCanceled rejects with the venue’s own reason', () => {
    const state = reduceOrderState(
      atState(ORDER_STATE.VENUE_PENDING),
      gainsEventSignal(canceledLog, { account: MEMBER, action: 'open' }),
    )
    expect(state.state).toBe(ORDER_STATE.REJECTED)
    expect(state.reason.code).toBe(GAINS_CANCEL_REASON.SLIPPAGE)
    expect(state.reason.source).toBe('gains')
    expect(state.reason.text).toBe(CANCEL_REASON_TEXT[GAINS_CANCEL_REASON.SLIPPAGE])
    expect(orderStatusText(state)).toBe(CANCEL_REASON_TEXT[GAINS_CANCEL_REASON.SLIPPAGE])
  })

  it('reports an unmapped cancel reason as its number rather than dropping it', () => {
    const state = reduceOrderState(
      atState(ORDER_STATE.VENUE_PENDING),
      gainsEventSignal({ name: 'MarketOpenCanceled', cancelReason: 9, trader: MEMBER }),
    )
    expect(state.state).toBe(ORDER_STATE.REJECTED)
    expect(state.reason.text).toBe('Gains cancel reason 9')
  })

  it('refuses events belonging to another trader or another order', () => {
    expect(gainsEventSignal(initiatedLog, { account: STRANGER })).toBeNull()
    expect(gainsEventSignal(initiatedLog, { account: MEMBER, pendingOrderIndex: pendingOrderIndex(7) })).toBeNull()
    expect(gainsEventSignal(initiatedLog, { account: MEMBER, pendingOrderIndex: pendingOrderIndex(9) })).not.toBeNull()
  })

  it('reads a returned-collateral event against the action actually being tracked', () => {
    const returned = { name: 'CollateralReturnedAfterTimeout', trader: MEMBER, collateralAmount: HUNDRED_USDC }
    // Tracking the original order: it never ran.
    expect(gainsEventSignal(returned, { account: MEMBER, action: 'open' }).type).toBe(SIGNAL.VENUE_REJECTED)
    // Tracking the recovery call the member just made: that call executed.
    expect(gainsEventSignal(returned, { account: MEMBER, action: 'cancel' }).type).toBe(SIGNAL.VENUE_EXECUTED)
  })

  it('is total over foreign, malformed and unrelated logs', () => {
    const junk = [null, undefined, 42, 'nope', {}, { topics: [], data: '0x' }, { name: 'Transfer' }]
    for (const log of junk) {
      expect(() => gainsEventSignal(log)).not.toThrow()
      expect(gainsEventSignal(log)).toBeNull()
    }
  })
})

describe('Gains market-order timeout', () => {
  const past = { createdBlock: 1_000, currentBlock: 1_200, timeoutBlocks: 200 }

  it('times out only once the venue’s own window has actually elapsed', () => {
    expect(gainsTimeoutSignal(past)?.type).toBe(SIGNAL.VENUE_TIMED_OUT)
    expect(gainsTimeoutSignal({ ...past, currentBlock: 1_199 })).toBeNull()
    expect(gainsTimeoutSignal({ ...past, currentBlock: 1_000 })).toBeNull()
  })

  it('carries the PENDING-ORDER index the recovery call consumes', () => {
    const state = reduceOrderState(
      atState(ORDER_STATE.VENUE_PENDING),
      gainsTimeoutSignal({ ...past, pendingOrderIndex: pendingOrderIndex(9), action: 'open' }),
    )
    expect(state.state).toBe(ORDER_STATE.TIMED_OUT)
    expect(state.terminal).toBe(true)
    expect(isPendingOrderIndex(state.venueRef.pendingOrderIndex)).toBe(true)
    expect(orderStatusText(state)).toBe('Gains did not execute this in time.')
  })

  it('REFUSES a trade index — recovering by the wrong index acts on a different object', () => {
    expect(gainsTimeoutSignal({ ...past, pendingOrderIndex: tradeIndex(5) })).toBeNull()
  })

  it('claims no timeout it cannot prove', () => {
    const unprovable = [
      undefined,
      {},
      { ...past, timeoutBlocks: 0 },
      { ...past, timeoutBlocks: null },
      { ...past, createdBlock: null },
      { ...past, currentBlock: 'soon' },
      { ...past, createdBlock: -1 },
    ]
    for (const input of unprovable) {
      expect(() => gainsTimeoutSignal(input)).not.toThrow()
      expect(gainsTimeoutSignal(input)).toBeNull()
    }
  })

  it('accepts the bigint block numbers ethers v6 hands back', () => {
    expect(gainsTimeoutSignal({ createdBlock: 1_000n, currentBlock: 1_200n, timeoutBlocks: 200n })).not.toBeNull()
  })

  it('states the timeout as OUR observation — the venue emitted nothing, so nothing is attributed', () => {
    const signal = gainsTimeoutSignal(past)
    // Source `'app'`, never `'gains'`: a timeout is derived from block height. Attributing it to the
    // venue rendered as "Gains said: …" over a sentence Gains never produced.
    expect(signal.reason.source).toBe('app')
    expect(signal.reason.source).not.toBe('gains')
    expect(isVenueStatedReason(signal.reason, 'gains')).toBe(false)
    // It says how we know, rather than who told us.
    expect(signal.reason.text).toBe(PERPS_GAINS_TIMEOUT_OBSERVATION)
    expect(signal.reason.text).toMatch(/block height/)
  })

  it('does NOT collapse into the venue-stated case a real CancelReason occupies', () => {
    const canceled = reduceOrderState(
      atState(ORDER_STATE.VENUE_PENDING),
      gainsEventSignal(canceledLog, { account: MEMBER, action: 'open' }),
    )
    // The venue's own decoded reason keeps its attribution…
    expect(isVenueStatedReason(canceled.reason, 'gains')).toBe(true)
    // …and our inference never gains one. Two different facts, two different treatments.
    expect(isVenueStatedReason(gainsTimeoutSignal(past).reason, 'gains')).toBe(false)
  })
})

describe('isVenueStatedReason', () => {
  it('is true only for words the venue itself produced', () => {
    expect(isVenueStatedReason({ text: 'OrderNotFulfillableAtAcceptablePrice', source: 'gmx' }, 'gmx')).toBe(true)
    expect(isVenueStatedReason({ text: 'The price moved.', source: 'gains' }, 'gains')).toBe(true)
    // Ours, another actor's, or another venue's — none of them may be attributed to this venue.
    expect(isVenueStatedReason({ text: 'We worked this out.', source: 'app' }, 'gains')).toBe(false)
    expect(isVenueStatedReason({ text: 'Wallet declined.', source: 'wallet' }, 'gains')).toBe(false)
    expect(isVenueStatedReason({ text: 'Reverted.', source: 'chain' }, 'gains')).toBe(false)
    expect(isVenueStatedReason({ text: 'Something.', source: 'gmx' }, 'gains')).toBe(false)
  })

  it('is total, and never attributes an empty or missing reason to anyone', () => {
    for (const input of [null, undefined, 42, 'nope', {}, { text: 'x' }, { source: 'gains' }, { text: '   ', source: 'gains' }]) {
      expect(() => isVenueStatedReason(input, 'gains')).not.toThrow()
      expect(isVenueStatedReason(input, 'gains')).toBe(false)
    }
    expect(isVenueStatedReason({ text: 'x', source: 'gains' }, null)).toBe(false)
    expect(isVenueStatedReason({ text: 'x', source: 'gains' }, '')).toBe(false)
  })
})

/* =============================================================================================
 * GMX mappers
 * ========================================================================================== */

describe('GMX event mapping', () => {
  const created = { eventName: 'OrderCreated', key: ORDER_KEY, account: MEMBER }

  it('OrderCreated acknowledges the order and keeps its key', () => {
    const state = reduceOrderState(atState(ORDER_STATE.SUBMITTED), gmxEventSignal(created, { action: 'open' }))
    expect(state.state).toBe(ORDER_STATE.VENUE_PENDING)
    expect(state.venue).toBe('gmx')
    expect(state.venueRef.orderKey).toBe(ORDER_KEY)
    expect(orderStatusText(state)).toBe('GMX is executing this.')
  })

  it('OrderExecuted is the only GMX event that executes an order', () => {
    const state = reduceOrderState(
      atState(ORDER_STATE.VENUE_PENDING),
      gmxEventSignal({ eventName: 'OrderExecuted', key: ORDER_KEY, account: MEMBER }, { action: 'close' }),
    )
    expect(state.state).toBe(ORDER_STATE.EXECUTED)
    expect(orderStatusText(state)).toBe('Position closed.')
  })

  it('OrderCancelled surfaces GMX’s reason verbatim rather than translating it', () => {
    const state = reduceOrderState(
      atState(ORDER_STATE.VENUE_PENDING),
      gmxEventSignal({
        eventName: 'OrderCancelled',
        key: ORDER_KEY,
        account: MEMBER,
        reason: 'OrderNotFulfillableAtAcceptablePrice',
      }),
    )
    expect(state.state).toBe(ORDER_STATE.REJECTED)
    expect(state.reason.text).toBe('OrderNotFulfillableAtAcceptablePrice')
    expect(state.reason.source).toBe('gmx')
    expect(orderStatusText(state)).toBe('OrderNotFulfillableAtAcceptablePrice')
  })

  it('OrderFrozen freezes with its reason, and stays frozen', () => {
    const frozen = reduceOrderState(
      atState(ORDER_STATE.VENUE_PENDING),
      gmxEventSignal({ eventName: 'OrderFrozen', key: ORDER_KEY, account: MEMBER, reason: 'InsufficientFundsForFee' }),
    )
    expect(frozen.state).toBe(ORDER_STATE.FROZEN)
    expect(frozen.reason.text).toBe('InsufficientFundsForFee')
    expect(orderStatusText(frozen)).toBe('Needs your attention.')
  })

  it('matches the account through the bytes32-padded topic GMX actually emits', () => {
    const signal = gmxEventSignal(
      { eventName: 'OrderExecuted', topic1: ORDER_KEY, topic2: MEMBER_TOPIC },
      { account: MEMBER, orderKey: ORDER_KEY },
    )
    expect(signal.type).toBe(SIGNAL.VENUE_EXECUTED)
    expect(signal.venueRef.orderKey).toBe(ORDER_KEY)
  })

  it('refuses another order’s key or another account’s event', () => {
    expect(gmxEventSignal(created, { orderKey: `0x${'11'.repeat(32)}` })).toBeNull()
    expect(gmxEventSignal(created, { account: STRANGER })).toBeNull()
  })

  it('ignores events that change an order’s numbers but not its state', () => {
    for (const name of ['OrderUpdated', 'OrderSizeDeltaAutoUpdated', 'OrderCollateralDeltaAmountAutoUpdated']) {
      expect(gmxEventSignal({ eventName: name, key: ORDER_KEY })).toBeNull()
    }
  })

  it('is total over junk', () => {
    for (const event of [null, undefined, 7, 'OrderExecuted', {}, { eventName: 'Nope' }]) {
      expect(() => gmxEventSignal(event)).not.toThrow()
      expect(gmxEventSignal(event)).toBeNull()
    }
  })
})

/* =============================================================================================
 * Copy
 * ========================================================================================== */

describe('member-facing status text', () => {
  it('names every state, so none renders as a blank the member cannot interpret', () => {
    for (const state of ORDER_STATES) {
      expect(Object.prototype.hasOwnProperty.call(ORDER_STATUS_TEXT, state)).toBe(true)
    }
  })

  it('says SENT for submitted — never opened or closed', () => {
    expect(ORDER_STATUS_TEXT[ORDER_STATE.SUBMITTED]).toMatch(/^Sent to /)
    for (const state of [ORDER_STATE.SUBMITTED, ORDER_STATE.VENUE_PENDING]) {
      expect(ORDER_STATUS_TEXT[state]).not.toMatch(/opened|closed|done/i)
    }
  })

  it('names the outcome per action only once the venue executed it', () => {
    expect(orderStatusText(ORDER_STATE.EXECUTED, { action: 'reduce' })).toBe(EXECUTED_TEXT_BY_ACTION.reduce)
    expect(orderStatusText(ORDER_STATE.EXECUTED, { action: 'protect' })).toBe(EXECUTED_TEXT_BY_ACTION.protect)
    // An action we do not have copy for still says something true.
    expect(orderStatusText(ORDER_STATE.EXECUTED, { action: 'something-new' })).toBe('Done.')
  })

  it('falls back to a phrase that names no venue rather than printing an id', () => {
    expect(orderStatusText(ORDER_STATE.SUBMITTED, {})).toBe('Sent to the venue.')
    expect(orderStatusText(ORDER_STATE.SWITCHING, { networkName: 'Arbitrum' })).toBe('Switch to Arbitrum')
  })

  it('is total — junk in, null out, because it runs during render', () => {
    for (const junk of [null, undefined, 42, 'not-a-state', {}, { state: 7 }, []]) {
      expect(() => orderStatusText(junk)).not.toThrow()
      expect(orderStatusText(junk)).toBeNull()
    }
    expect(orderStatusText(ORDER_STATE.IDLE)).toBeNull()
  })

  it('is separate from the machine — the copy tables are frozen and unreachable from a transition', () => {
    expect(Object.isFrozen(ORDER_STATUS_TEXT)).toBe(true)
    expect(Object.isFrozen(EXECUTED_TEXT_BY_ACTION)).toBe(true)
    // Same transition, whatever the copy says.
    const before = reduceOrderState(atState(ORDER_STATE.VENUE_PENDING), { type: SIGNAL.VENUE_FROZEN })
    expect(before.state).toBe(ORDER_STATE.FROZEN)
    expect(before.terminal).toBe(true)
  })
})

/* =============================================================================================
 * Totality
 * ========================================================================================== */

describe('totality', () => {
  it('the reducer never throws and never invents a state', () => {
    const junk = [null, undefined, 0, 'nope', {}, [], { type: null }, { type: {} }, NaN]
    for (const state of junk) {
      for (const signal of junk) {
        expect(() => reduceOrderState(state, signal)).not.toThrow()
        expect(ORDER_STATES).toContain(reduceOrderState(state, signal).state)
      }
    }
  })

  it('survives a hand-built or restored state object with no history', () => {
    const restored = { state: ORDER_STATE.SUBMITTED, venue: 'gains', action: 'close' }
    const next = reduceOrderState(restored, { type: SIGNAL.VENUE_ACKNOWLEDGED })
    expect(next.state).toBe(ORDER_STATE.VENUE_PENDING)
    expect(next.path).toEqual([ORDER_STATE.VENUE_PENDING])
  })

  it('a null signal leaves the state untouched, and an unreadable one is recorded not dropped', () => {
    const state = atState(ORDER_STATE.VENUE_PENDING)
    expect(reduceOrderState(state, null)).toBe(state)
    expect(reduceOrderState(state, { type: 'made-up' }).ignoredSignal.why).toMatch(/unrecognized signal/)
  })

  it('submissionSignal is total over junk', () => {
    for (const junk of [null, undefined, 0, false, 'nope', '0xdead', [], NaN]) {
      expect(() => submissionSignal(junk)).not.toThrow()
    }
    expect(submissionSignal('nope')).toBeNull()
    expect(submissionSignal(null)).toBeNull()
  })

  it('an EXPLICIT null options object degrades instead of throwing', () => {
    // A parameter-list default only covers `undefined`. The natural call site for the timeout mapper
    // is a pending order's timing record, which is null exactly when the venue read failed — i.e.
    // when the member most needs the recovery control this drives.
    expect(() => gainsTimeoutSignal(null)).not.toThrow()
    expect(gainsTimeoutSignal(null)).toBeNull()
    expect(() => createOrderState(null)).not.toThrow()
    expect(createOrderState(null).state).toBe(ORDER_STATE.IDLE)
  })
})
