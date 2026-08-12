/**
 * Perps → activity feed (spec 083 T070 / FR-023).
 *
 * The property under test is not "an entry appears". It is that the feed can only ever say what
 * the VENUE said: an order the member submitted is worded as sent, an order the venue executed is
 * worded as done, and there is no input to either the buffer or the source that turns the first
 * into the second. That is why the buffer stores a machine STATE and no message — a call site
 * cannot hand the feed a verdict.
 *
 * The other three properties: a venue outage is never a position change (and never eats a queued
 * action), an entry with no transaction behind it SAYS so instead of leaving a silent absence, and
 * one member's actions can never surface under another's account.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPerpsSource } from '../../data/notifications/sources/perpsSource'
import {
  drainPerpsActions,
  isReportableOrderState,
  isVenueConfirmed,
  peekPerpsActions,
  queuePerpsAction,
  recordPerpsOrder,
} from '../../lib/perps/perpsActivityBuffer'
import {
  ORDER_STATE,
  SIGNAL,
  createOrderState,
  reduceOrderState,
} from '../../lib/perps/orderState'

const ACCOUNT = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const OTHER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const ARBITRUM = 42161
const TX = `0x${'ab'.repeat(32)}`
const OTHER_TX = `0x${'cd'.repeat(32)}`
const NOW = 1_765_000_000_000

const POS = (id, sizeUsd = 1000) => ({ id, venue: id.split(':')[0], direction: 'long', sizeUsd })

/** A source over a stubbed gateway read and the REAL buffer — the wiring is the thing under test. */
const make = (body) =>
  createPerpsSource({ deps: { available: () => true, fetchPositions: vi.fn(async () => body) } })

const withPositions = (positions, status = 'read') =>
  make({ positions, sources: { gains: { status }, gmx: { status: 'read' } } })

const action = (over = {}) => ({
  venue: 'gains',
  chainId: ARBITRUM,
  action: 'close',
  state: ORDER_STATE.EXECUTED,
  txHash: TX,
  at: NOW,
  ...over,
})

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

/* --------------------------------------------------------------------------------------------- *
 * The buffer
 * --------------------------------------------------------------------------------------------- */

describe('the action buffer stores facts, never a verdict', () => {
  it('queues, peeks, and drains once', () => {
    expect(queuePerpsAction(ACCOUNT, action())).toBeTruthy()
    expect(peekPerpsActions(ACCOUNT)).toHaveLength(1)
    expect(drainPerpsActions(ACCOUNT)).toHaveLength(1)
    expect(drainPerpsActions(ACCOUNT)).toEqual([])
  })

  it('has nowhere to put a message, a status word, or a "done" flag', () => {
    const record = queuePerpsAction(ACCOUNT, { ...action(), message: 'Position closed.', done: true })
    expect(Object.keys(record)).not.toContain('message')
    expect(Object.keys(record)).not.toContain('done')
    // The one word for what happened is the machine's.
    expect(record.state).toBe(ORDER_STATE.EXECUTED)
  })

  it('refuses a state the venue has never spoken about, and an unknown venue', () => {
    for (const state of [ORDER_STATE.IDLE, ORDER_STATE.VALIDATING, ORDER_STATE.SIGNING, 'invented']) {
      expect(isReportableOrderState(state), `${state} was reportable`).toBe(false)
      expect(queuePerpsAction(ACCOUNT, action({ state })), `${state} was queued`).toBeNull()
    }
    expect(queuePerpsAction(ACCOUNT, action({ venue: 'not-a-venue' }))).toBeNull()
    expect(peekPerpsActions(ACCOUNT)).toEqual([])
  })

  it('collapses one order onto one record — the latest word wins', () => {
    queuePerpsAction(ACCOUNT, action({ state: ORDER_STATE.SUBMITTED }))
    queuePerpsAction(ACCOUNT, action({ state: ORDER_STATE.EXECUTED }))
    const records = peekPerpsActions(ACCOUNT)
    expect(records).toHaveLength(1)
    expect(records[0].state).toBe(ORDER_STATE.EXECUTED)

    // A DIFFERENT order is a different record, not an overwrite.
    queuePerpsAction(ACCOUNT, action({ txHash: OTHER_TX, action: 'reduce' }))
    expect(peekPerpsActions(ACCOUNT)).toHaveLength(2)
  })

  it('takes the state from the order machine, and an `extra` cannot override it', () => {
    // The legal walk to `submitted`: signed, then included. Inclusion is not execution.
    const submitted = [{ type: SIGNAL.SIGN }, { type: SIGNAL.SUBMITTED, txHash: TX }].reduce(
      reduceOrderState,
      createOrderState({ venue: 'gains', chainId: ARBITRUM, action: 'close' }),
    )
    const record = recordPerpsOrder(ACCOUNT, submitted, { state: ORDER_STATE.EXECUTED })
    expect(record.state).toBe(ORDER_STATE.SUBMITTED)
    expect(isVenueConfirmed(record)).toBe(false)
    expect(record.txHash).toBe(TX)
  })

  it('cannot fail an exit: bad input and dead storage both return quietly', () => {
    expect(queuePerpsAction(null, action())).toBeNull()
    expect(queuePerpsAction(ACCOUNT, null)).toBeNull()
    expect(drainPerpsActions(null)).toEqual([])

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => queuePerpsAction(ACCOUNT, action())).not.toThrow()
  })

  it('never carries one account’s actions to another', () => {
    queuePerpsAction(ACCOUNT, action())
    expect(peekPerpsActions(OTHER)).toEqual([])
    expect(drainPerpsActions(OTHER)).toEqual([])
    // …and draining the other account left the owner's record where it was.
    expect(peekPerpsActions(ACCOUNT)).toHaveLength(1)
  })
})

/* --------------------------------------------------------------------------------------------- *
 * The feed
 * --------------------------------------------------------------------------------------------- */

describe('a venue-confirmed action becomes a precise entry', () => {
  it('reports the close as done, links the member’s transaction, and names the venue', async () => {
    queuePerpsAction(ACCOUNT, action())
    const result = await withPositions([]).detect({ account: ACCOUNT, nowMs: NOW, prior: {} })

    expect(result.ok).toBe(true)
    expect(result.entries).toHaveLength(1)
    const [entry] = result.entries
    expect(entry.domain).toBe('perps')
    expect(entry.refId).toBe('gains')
    expect(entry.severity).toBe('success')
    expect(entry.message).toBe('Gains Network closed your position.')
    expect(entry.txUrl).toContain(TX)
    expect(entry.link.to).toContain('venue=gains')
    // A drained record is gone: the same cycle re-run publishes nothing twice.
    const again = await withPositions([]).detect({ account: ACCOUNT, nowMs: NOW + 1, prior: {} })
    expect(again.entries).toEqual([])
  })

  it('explains the position change itself — no duplicate generic entry for the same venue', async () => {
    const first = await withPositions([POS('gains:1')]).detect({ account: ACCOUNT, nowMs: NOW, prior: {} })

    queuePerpsAction(ACCOUNT, action())
    const result = await withPositions([]).detect({
      account: ACCOUNT,
      nowMs: NOW + 1,
      prior: { snapshots: first.nextSnapshots },
    })

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].type).toBe('perps-close-executed')
    expect(result.entries.some((e) => e.type === 'perps-position-changed')).toBe(false)
    // The baseline still moved, so the next cycle is not a change all over again.
    expect(result.nextSnapshots['perps:gains'].count).toBe(0)
  })

  it('gives the venue’s own reason, verbatim, when the venue refused', async () => {
    queuePerpsAction(
      ACCOUNT,
      action({
        state: ORDER_STATE.REJECTED,
        reason: { code: null, text: 'OrderNotFulfillableAtAcceptablePrice', source: 'gmx' },
        venue: 'gmx',
      }),
    )
    const [entry] = (await withPositions([]).detect({ account: ACCOUNT, nowMs: NOW, prior: {} })).entries
    expect(entry.message).toContain('OrderNotFulfillableAtAcceptablePrice')
    expect(entry.severity).toBe('warning')
    expect(entry.actionable).toBe(false)
  })

  it('marks a stuck order as needing attention rather than reporting an outcome', async () => {
    queuePerpsAction(ACCOUNT, action({ state: ORDER_STATE.TIMED_OUT, action: 'open' }))
    const [entry] = (await withPositions([]).detect({ account: ACCOUNT, nowMs: NOW, prior: {} })).entries
    expect(entry.actionable).toBe(true)
    expect(entry.message).toMatch(/recover your collateral/)
  })
})

describe('a submitted action never reads as done', () => {
  /** Anything a member could skim as "it happened". */
  const READS_AS_DONE = /\bclosed\b|\bopened\b|\breduced\b|\bexecuted\b|\bfilled\b|\bdone\b|\bcomplete/i

  it('EXHAUSTIVE: every state the venue has not executed is worded as unfinished', async () => {
    const unexecuted = [
      ORDER_STATE.SUBMITTED,
      ORDER_STATE.VENUE_PENDING,
      ORDER_STATE.REJECTED,
      ORDER_STATE.FROZEN,
      ORDER_STATE.TIMED_OUT,
      ORDER_STATE.UNKNOWN,
    ]
    for (const state of unexecuted) {
      localStorage.clear()
      queuePerpsAction(ACCOUNT, action({ state }))
      const [entry] = (await withPositions([]).detect({ account: ACCOUNT, nowMs: NOW, prior: {} })).entries
      expect(entry, `${state} produced no entry`).toBeTruthy()
      expect(entry.message, `${state} reads as done: ${entry.message}`).not.toMatch(READS_AS_DONE)
      expect(entry.severity).not.toBe('success')
    }
  })

  it('says SENT, and does not claim the position changed', async () => {
    queuePerpsAction(ACCOUNT, action({ state: ORDER_STATE.SUBMITTED }))
    const [entry] = (await withPositions([POS('gains:1')]).detect({ account: ACCOUNT, nowMs: NOW, prior: {} })).entries
    expect(entry.message).toBe('Your close order was sent to Gains Network — not confirmed yet.')
    expect(entry.type).toBe('perps-close-submitted')
    expect(entry.severity).toBe('info')
  })

  it('does not suppress the venue’s own account of what changed', async () => {
    // A submitted order explains nothing: if the position set moved, that is the venue speaking,
    // and it must still be reported.
    const first = await withPositions([POS('gains:1')]).detect({ account: ACCOUNT, nowMs: NOW, prior: {} })
    queuePerpsAction(ACCOUNT, action({ state: ORDER_STATE.SUBMITTED }))
    const result = await withPositions([]).detect({
      account: ACCOUNT,
      nowMs: NOW + 1,
      prior: { snapshots: first.nextSnapshots },
    })
    expect(result.entries.map((e) => e.type)).toEqual(['perps-close-submitted', 'perps-position-changed'])
  })
})

describe('the record gap is disclosed, never left silent (FR-023)', () => {
  it('says the venue is the only record when no transaction backs the entry', async () => {
    queuePerpsAction(ACCOUNT, action({ txHash: null, orderRef: 'gains-order-9' }))
    const [entry] = (await withPositions([]).detect({ account: ACCOUNT, nowMs: NOW, prior: {} })).entries
    expect(entry.txUrl).toBeNull()
    expect(entry.message).toMatch(/FairWins holds no transaction record for this — Gains Network is the only record/)
  })

  it('says nothing of the sort when the member’s own transaction is linked', async () => {
    queuePerpsAction(ACCOUNT, action())
    const [entry] = (await withPositions([]).detect({ account: ACCOUNT, nowMs: NOW, prior: {} })).entries
    expect(entry.message).not.toMatch(/no transaction record/)
  })

  it('discloses it on a snapshot-diff entry too — a venue-side change has no record of ours', async () => {
    const first = await withPositions([POS('gains:1')]).detect({ account: ACCOUNT, nowMs: NOW, prior: {} })
    const result = await withPositions([]).detect({
      account: ACCOUNT,
      nowMs: NOW + 1,
      prior: { snapshots: first.nextSnapshots },
    })
    expect(result.entries[0].type).toBe('perps-position-changed')
    expect(result.entries[0].message).toMatch(/closed on Gains Network/)
    expect(result.entries[0].message).toMatch(/no transaction record/)
    expect(result.entries[0].txUrl).toBeUndefined()
  })
})

describe('a venue outage is not a position change, and does not eat an action', () => {
  it('keeps the baseline when a venue is unreadable', async () => {
    const first = await withPositions([POS('gains:1')]).detect({ account: ACCOUNT, nowMs: NOW, prior: {} })
    const result = await withPositions([], 'degraded').detect({
      account: ACCOUNT,
      nowMs: NOW + 1,
      prior: { snapshots: first.nextSnapshots },
    })
    expect(result.entries).toEqual([])
    expect(result.nextSnapshots['perps:gains']).toEqual(first.nextSnapshots['perps:gains'])
  })

  it('leaves a queued action buffered when the whole read fails, instead of dropping it', async () => {
    queuePerpsAction(ACCOUNT, action())
    const down = createPerpsSource({
      deps: { available: () => true, fetchPositions: vi.fn(async () => Promise.reject(new Error('down'))) },
    })
    // The engine keeps the prior slice on ok:false — an entry produced here would be discarded.
    expect(await down.detect({ account: ACCOUNT, nowMs: NOW, prior: {} })).toEqual({ ok: false })
    expect(peekPerpsActions(ACCOUNT)).toHaveLength(1)

    // …and the next healthy cycle publishes it.
    const result = await withPositions([]).detect({ account: ACCOUNT, nowMs: NOW + 1, prior: {} })
    expect(result.entries).toHaveLength(1)
  })

  it('does not drain while the surface is unavailable', async () => {
    queuePerpsAction(ACCOUNT, action())
    const off = createPerpsSource({ deps: { available: () => false, fetchPositions: vi.fn() } })
    const result = await off.detect({ account: ACCOUNT, nowMs: NOW, prior: {} })
    expect(result.entries).toEqual([])
    expect(peekPerpsActions(ACCOUNT)).toHaveLength(1)
  })
})

describe('account isolation holds through the feed', () => {
  it('never publishes one member’s action under another member’s account', async () => {
    queuePerpsAction(ACCOUNT, action())
    const source = withPositions([])

    const other = await source.detect({ account: OTHER, nowMs: NOW, prior: {} })
    expect(other.entries).toEqual([])

    const owner = await source.detect({ account: ACCOUNT, nowMs: NOW, prior: {} })
    expect(owner.entries).toHaveLength(1)
  })

  it('publishes nothing at all with no account connected', async () => {
    queuePerpsAction(ACCOUNT, action())
    const result = await withPositions([]).detect({ account: null, nowMs: NOW, prior: {} })
    expect(result.entries).toEqual([])
    expect(peekPerpsActions(ACCOUNT)).toHaveLength(1)
  })
})

/* --------------------------------------------------------------------------------------------- *
 * THE PRODUCER EXISTS — the assertion whose absence made every test above pass vacuously
 *
 * Everything else in this file drives the buffer directly. That proves the buffer and the source
 * behave; it proves NOTHING about whether the app ever puts anything in the buffer. It did not:
 * the source shipped draining a queue no shipped code ever wrote to, so the entire action half of
 * the feed reported silence while its own suite was green.
 *
 * These two tests are the connection. The first is structural — some shipped module must call the
 * producer — and the second drives the REAL chain end to end, so a producer that is wired but
 * queues the wrong thing is caught too.
 * --------------------------------------------------------------------------------------------- */

/** Comments legitimately NAME the producer; it is the CODE that has to call it. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
}

describe('the buffer has a producer in shipped code', () => {
  it('is written to by the ONE write path, and by nothing else', async () => {
    // Globbed per directory: a brace in the DIRECTORY part of an `import.meta.glob` pattern
    // silently matches nothing, which would make this test pass by finding no files at all.
    const files = {
      ...import.meta.glob('../../hooks/**/*.js', { query: '?raw', import: 'default' }),
      ...import.meta.glob('../../components/**/*.jsx', { query: '?raw', import: 'default' }),
      ...import.meta.glob('../../components/**/*.js', { query: '?raw', import: 'default' }),
      ...import.meta.glob('../../lib/**/*.js', { query: '?raw', import: 'default' }),
      ...import.meta.glob('../../data/**/*.js', { query: '?raw', import: 'default' }),
    }
    // The glob itself must have found the tree, or "no writers" would be an artefact of a bad
    // pattern rather than a fact about the code.
    expect(Object.keys(files).length).toBeGreaterThan(200)
    const writers = []
    for (const [path, load] of Object.entries(files)) {
      if (path.includes('/test/') || path.endsWith('perpsActivityBuffer.js')) continue
      const source = String(await load())
      // COMMENTS ARE STRIPPED FIRST, and that is not a nicety: a mutation that deleted the wiring
      // but left the paragraph explaining it still matched, so this test reported a producer that
      // no longer existed. Prose about a thing is not the thing.
      //
      // Matched by NAME rather than by call site: the hook wires it as an injectable dependency
      // (`recordAction: recordPerpsOrder`), so requiring `recordPerpsOrder(` would report zero
      // producers for a correctly wired one — the opposite false negative.
      if (/\b(recordPerpsOrder|queuePerpsAction)\b/.test(stripComments(source))) writers.push(path)
    }
    // Exactly one, and it is the hook every perps action runs through. Zero is the bug this
    // catches; two would mean a surface reporting an action the machine did not run.
    expect(writers.map((p) => p.replace(/^\.\.\/\.\.\//, ''))).toEqual(['hooks/usePerpsTrade.js'])
  })

  it('a real order state reaches a real feed entry, with the venue’s own wording', () => {
    // The full chain, no stubs between the ends: an order the venue EXECUTED →
    // `recordPerpsOrder` → the buffer → the source's drain → one entry.
    const executed = [
      { type: SIGNAL.SIGN },
      { type: SIGNAL.SUBMITTED, txHash: TX },
      { type: SIGNAL.VENUE_ACKNOWLEDGED },
      { type: SIGNAL.VENUE_EXECUTED },
    ].reduce(reduceOrderState, createOrderState({ venue: 'gains', chainId: ARBITRUM, action: 'close' }))
    expect(executed.state).toBe(ORDER_STATE.EXECUTED)

    expect(recordPerpsOrder(ACCOUNT, executed)).not.toBeNull()
    expect(peekPerpsActions(ACCOUNT)).toHaveLength(1)

    const drained = drainPerpsActions(ACCOUNT)
    expect(drained).toHaveLength(1)
    expect(drained[0].state).toBe(ORDER_STATE.EXECUTED)
    expect(drained[0].txHash).toBe(TX)
    expect(isVenueConfirmed(drained[0])).toBe(true)
  })

  it('and a SUBMITTED order reaches the feed worded as sent, never as done', () => {
    const submitted = [{ type: SIGNAL.SIGN }, { type: SIGNAL.SUBMITTED, txHash: TX }].reduce(
      reduceOrderState,
      createOrderState({ venue: 'gains', chainId: ARBITRUM, action: 'close' }),
    )
    expect(recordPerpsOrder(ACCOUNT, submitted)).not.toBeNull()
    const [record] = drainPerpsActions(ACCOUNT)
    expect(isReportableOrderState(record.state)).toBe(true)
    expect(isVenueConfirmed(record)).toBe(false)
  })
})
