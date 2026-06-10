import { describe, it, expect } from 'vitest'
import { diffWagers } from '../data/notifications/diffEngine'
import { ResolutionType } from '../constants/wagerDefaults'

/**
 * diffEngine.js compares the persisted WagerSnapshot baseline against freshly
 * polled normalized wagers and emits ActivityEntry items per the catalog in
 * specs/012-wager-notifications/contracts/notification-types.md.
 *
 * Pinned here:
 *   - EVERY row of the state-transition catalog (type, perspective, severity,
 *     actionable, template), including the 'state-changed' factual fallback
 *   - the first-sight rule (no prior snapshot ⇒ snapshot only, ZERO entries)
 *   - idempotence (diffing identical inputs twice emits nothing the 2nd time)
 *   - dedup id stability (`wagerId:type`, `wagerId:drawProposed:proposer`)
 *   - draw-proposed / draw-revoked extras incl. self-proposal exclusion and
 *     terminal-state clearing
 *   - honest finality: no "you won"/"Claim" copy outside the two winner states
 *   - purity: deterministic, never mutates inputs, time only via nowMs
 */

// Mixed-case on purpose: every address comparison must lowercase both sides.
const CREATOR = '0xAaAA000000000000000000000000000000000001'
const OPPONENT = '0xBbBB000000000000000000000000000000000002'
const CREATOR_SHORT = '0xAaAA…0001'
const OPPONENT_SHORT = '0xBbBB…0002'
const CREATOR_LOWER = CREATOR.toLowerCase()
const CREATOR_LOWER_SHORT = '0xaaaa…0001'

// Fixed clock anchors (ms). The diff engine never reads Date.now().
const NOW = 1_765_000_000_000
const ACCEPT_DL = NOW + 60_000
const TRADING_END = NOW + 3_600_000
const RESOLVE_DL = TRADING_END + 48 * 3_600_000
const IN_WINDOW = RESOLVE_DL - 5 * 3_600_000 // 5h before close, after TRADING_END

function makeWager(overrides = {}) {
  return {
    id: '42',
    creator: CREATOR,
    opponent: OPPONENT,
    arbitrator: null,
    status: 'active',
    winner: null,
    paid: false,
    acceptanceDeadline: ACCEPT_DL,
    tradingEndTime: TRADING_END,
    resolveDeadlineTime: RESOLVE_DL,
    resolutionType: ResolutionType.Either,
    creatorStake: '10.0',
    opponentStake: '10.0',
    stakeTokenSymbol: 'USDC',
    description: 'Lakers in 6',
    ...overrides,
  }
}

function makeSnapshot(overrides = {}) {
  return {
    id: '42',
    state: 'active',
    status: 'active',
    winner: null,
    paid: false,
    acceptanceDeadline: ACCEPT_DL,
    resolveDeadlineTime: RESOLVE_DL,
    tradingEndTime: TRADING_END,
    drawProposedBy: null,
    snappedAt: NOW - 30_000,
    ...overrides,
  }
}

/** Diff a single wager against an optional prior snapshot. */
function diffOne(prevSnapshot, wager, account, nowMs = NOW) {
  return diffWagers({
    snapshots: prevSnapshot ? { [wager.id]: prevSnapshot } : {},
    wagers: [wager],
    account,
    nowMs,
  })
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.keys(value)) deepFreeze(value[key])
  }
  return value
}

describe('diffWagers — first-sight rule', () => {
  it('emits zero entries and records a full snapshot for an unseen active wager', () => {
    const { entries, nextSnapshots } = diffOne(null, makeWager(), CREATOR)
    expect(entries).toEqual([])
    expect(nextSnapshots['42']).toEqual({
      id: '42',
      state: 'active',
      status: 'active',
      winner: null,
      paid: false,
      acceptanceDeadline: ACCEPT_DL,
      resolveDeadlineTime: RESOLVE_DL,
      tradingEndTime: TRADING_END,
      drawProposedBy: null,
      snappedAt: NOW,
    })
  })

  it('emits zero entries even for an unseen claimable win (no history re-announcement)', () => {
    const w = makeWager({ status: 'resolved', winner: CREATOR, paid: false })
    const { entries, nextSnapshots } = diffOne(null, w, CREATOR)
    expect(entries).toEqual([])
    expect(nextSnapshots['42'].state).toBe('resolved-claimable')
    expect(nextSnapshots['42'].winner).toBe(CREATOR_LOWER)
  })

  it('emits zero entries for an unseen expired wager', () => {
    const w = makeWager({ status: 'pending' })
    const { entries, nextSnapshots } = diffOne(null, w, CREATOR, ACCEPT_DL + 1)
    expect(entries).toEqual([])
    expect(nextSnapshots['42'].state).toBe('expired')
  })

  it('emits zero entries on first sight even when a counterparty draw proposal is attached', () => {
    const w = makeWager({ drawProposedBy: CREATOR_LOWER })
    const { entries, nextSnapshots } = diffOne(null, w, OPPONENT)
    expect(entries).toEqual([])
    expect(nextSnapshots['42'].drawProposedBy).toBe(CREATOR_LOWER)
  })
})

describe('diffWagers — accepted', () => {
  it("tells the creator their counterparty accepted (success, not actionable)", () => {
    const prev = makeSnapshot({ state: 'pending', status: 'pending' })
    const { entries } = diffOne(prev, makeWager(), CREATOR)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toEqual({
      id: '42:accepted',
      type: 'accepted',
      wagerId: '42',
      message: `${OPPONENT_SHORT} accepted 'Lakers in 6' — it's live`,
      severity: 'success',
      actionable: false,
      createdAt: NOW,
      read: false,
    })
  })

  it("tells the opponent 'You accepted' (info, not actionable)", () => {
    const prev = makeSnapshot({ state: 'pending', status: 'pending' })
    const { entries } = diffOne(prev, makeWager(), OPPONENT)
    expect(entries).toHaveLength(1)
    expect(entries[0].type).toBe('accepted')
    expect(entries[0].severity).toBe('info')
    expect(entries[0].actionable).toBe(false)
    expect(entries[0].message).toBe("You accepted 'Lakers in 6' — it's live")
  })

  it('maps pending → resolvable (acceptance landed late in a poll gap) to accepted too', () => {
    const prev = makeSnapshot({ state: 'pending', status: 'pending' })
    const { entries } = diffOne(prev, makeWager(), CREATOR, IN_WINDOW)
    expect(entries).toHaveLength(1)
    expect(entries[0].type).toBe('accepted')
  })

  it('matches the opponent case-insensitively for the self-perspective copy', () => {
    const prev = makeSnapshot({ state: 'pending', status: 'pending' })
    const { entries } = diffOne(prev, makeWager(), OPPONENT.toLowerCase())
    expect(entries[0].message).toBe("You accepted 'Lakers in 6' — it's live")
  })
})

describe('diffWagers — expired', () => {
  it('warns the creator with an actionable refund prompt naming their stake', () => {
    const prev = makeSnapshot({ state: 'pending', status: 'pending' })
    const w = makeWager({ status: 'pending' })
    const { entries } = diffOne(prev, w, CREATOR, ACCEPT_DL + 1)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      id: '42:expired',
      type: 'expired',
      severity: 'warning',
      actionable: true,
      message: "'Lakers in 6' expired without acceptance — reclaim your 10 USDC stake",
    })
  })

  it('gives the opponent a factual info entry (nothing for them to do)', () => {
    const prev = makeSnapshot({ state: 'pending', status: 'pending' })
    const w = makeWager({ status: 'pending' })
    const { entries } = diffOne(prev, w, OPPONENT, ACCEPT_DL + 1)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      type: 'expired',
      severity: 'info',
      actionable: false,
      message: "'Lakers in 6' expired before you accepted",
    })
  })
})

describe('diffWagers — resolvable / resolvable-waiting', () => {
  it("prompts a participant who may resolve (Either) with the window close time", () => {
    const prev = makeSnapshot()
    const { entries } = diffOne(prev, makeWager(), CREATOR, IN_WINDOW)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      id: '42:resolvable',
      type: 'resolvable',
      severity: 'warning',
      actionable: true,
      message: "'Lakers in 6' is ready to resolve — window closes in 5 hours",
    })
  })

  it('Either: the opponent gets the actionable resolve prompt too', () => {
    const prev = makeSnapshot()
    const { entries } = diffOne(prev, makeWager(), OPPONENT, IN_WINDOW)
    expect(entries[0].type).toBe('resolvable')
    expect(entries[0].actionable).toBe(true)
  })

  it('Creator-only resolution: the opponent gets the passive waiting copy', () => {
    const prev = makeSnapshot()
    const w = makeWager({ resolutionType: ResolutionType.Creator })
    const { entries } = diffOne(prev, w, OPPONENT, IN_WINDOW)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      id: '42:resolvable-waiting',
      type: 'resolvable-waiting',
      severity: 'info',
      actionable: false,
      message: "'Lakers in 6' has entered its resolution window",
    })
  })

  it.each([
    ['Polymarket', ResolutionType.Polymarket],
    ['ChainlinkDataFeed', ResolutionType.ChainlinkDataFeed],
    ['ChainlinkFunctions', ResolutionType.ChainlinkFunctions],
    ['UMA', ResolutionType.UMA],
  ])('oracle type %s: both participants get the oracle waiting copy', (_name, resolutionType) => {
    const w = makeWager({ resolutionType })
    for (const account of [CREATOR, OPPONENT]) {
      const { entries } = diffOne(makeSnapshot(), w, account, IN_WINDOW)
      expect(entries).toHaveLength(1)
      expect(entries[0]).toMatchObject({
        type: 'resolvable-waiting',
        severity: 'info',
        actionable: false,
        message: "'Lakers in 6' is awaiting oracle resolution",
      })
    }
  })
})

describe('diffWagers — resolution outcomes', () => {
  it('won-claimable: tells the winner to claim the combined stakes', () => {
    const prev = makeSnapshot({ state: 'resolvable' })
    const w = makeWager({ status: 'resolved', winner: CREATOR, paid: false })
    const { entries } = diffOne(prev, w, CREATOR, IN_WINDOW)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toEqual({
      id: '42:won-claimable',
      type: 'won-claimable',
      wagerId: '42',
      message: "You won 'Lakers in 6'! Claim 20 USDC",
      severity: 'success',
      actionable: true,
      createdAt: IN_WINDOW,
      read: false,
    })
  })

  it('won-claimable: sums asymmetric stakes and trims trailing zeros', () => {
    const prev = makeSnapshot({ state: 'resolvable' })
    const w = makeWager({
      status: 'resolved',
      winner: CREATOR,
      paid: false,
      creatorStake: '10.0',
      opponentStake: '5.50',
    })
    const { entries } = diffOne(prev, w, CREATOR, IN_WINDOW)
    expect(entries[0].message).toBe("You won 'Lakers in 6'! Claim 15.5 USDC")
  })

  it('lost: factual info naming the winner, no win/claim copy', () => {
    const prev = makeSnapshot({ state: 'resolvable' })
    const w = makeWager({ status: 'resolved', winner: CREATOR, paid: false })
    const { entries } = diffOne(prev, w, OPPONENT, IN_WINDOW)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      id: '42:lost',
      type: 'lost',
      severity: 'info',
      actionable: false,
      message: `'Lakers in 6' resolved — ${CREATOR_SHORT} won`,
    })
  })

  it('paid-out: receipt for the winner when paid flips false → true', () => {
    const prev = makeSnapshot({
      state: 'resolved-claimable',
      status: 'resolved',
      winner: CREATOR_LOWER,
      paid: false,
    })
    const w = makeWager({ status: 'resolved', winner: CREATOR, paid: true })
    const { entries, nextSnapshots } = diffOne(prev, w, CREATOR)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      id: '42:paid-out',
      type: 'paid-out',
      severity: 'success',
      actionable: false,
      message: "Winnings paid for 'Lakers in 6': 20 USDC",
    })
    expect(nextSnapshots['42'].state).toBe('resolved-won-paid')
    expect(nextSnapshots['42'].paid).toBe(true)
  })

  it('paid-out is winner-only: the loser sees nothing when paid flips', () => {
    const prev = makeSnapshot({
      state: 'resolved-lost',
      status: 'resolved',
      winner: CREATOR_LOWER,
      paid: false,
    })
    const w = makeWager({ status: 'resolved', winner: CREATOR, paid: true })
    const { entries } = diffOne(prev, w, OPPONENT)
    expect(entries).toEqual([])
  })

  it('draw-settled: both participants get the factual stakes-returned copy', () => {
    const w = makeWager({ status: 'draw' })
    for (const account of [CREATOR, OPPONENT]) {
      const { entries } = diffOne(makeSnapshot(), w, account)
      expect(entries).toHaveLength(1)
      expect(entries[0]).toMatchObject({
        id: '42:draw-settled',
        type: 'draw-settled',
        severity: 'info',
        actionable: false,
        message: "'Lakers in 6' settled as a draw — stakes returned",
      })
    }
  })
})

describe('diffWagers — refundable / cancelled / refunded', () => {
  it('refundable from resolvable: actionable warning for both participants', () => {
    const w = makeWager()
    for (const account of [CREATOR, OPPONENT]) {
      const { entries } = diffOne(makeSnapshot({ state: 'resolvable' }), w, account, RESOLVE_DL + 1)
      expect(entries).toHaveLength(1)
      expect(entries[0]).toMatchObject({
        id: '42:refundable',
        type: 'refundable',
        severity: 'warning',
        actionable: true,
        message: "'Lakers in 6' was not resolved in time — claim your refund",
      })
    }
  })

  it('refundable from active (whole window missed between polls)', () => {
    const { entries } = diffOne(makeSnapshot({ state: 'active' }), makeWager(), CREATOR, RESOLVE_DL + 1)
    expect(entries[0].type).toBe('refundable')
  })

  it('cancelled: factual info entry', () => {
    const prev = makeSnapshot({ state: 'pending', status: 'pending' })
    const w = makeWager({ status: 'cancelled' })
    const { entries } = diffOne(prev, w, CREATOR)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      id: '42:cancelled',
      type: 'cancelled',
      severity: 'info',
      actionable: false,
      message: "'Lakers in 6' was cancelled",
    })
  })

  it('refunded: stake-is-back info entry', () => {
    const prev = makeSnapshot({ state: 'refundable' })
    const w = makeWager({ status: 'refunded' })
    const { entries } = diffOne(prev, w, OPPONENT, RESOLVE_DL + 1)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      id: '42:refunded',
      type: 'refunded',
      severity: 'info',
      actionable: false,
      message: "'Lakers in 6' was refunded — your stake is back",
    })
  })
})

describe('diffWagers — state-changed fallback (never silent)', () => {
  it("maps a legacy v1 status ('challenged') to factual fallback copy", () => {
    const prev = makeSnapshot({ state: 'active' })
    const w = makeWager({ status: 'challenged' })
    const { entries, nextSnapshots } = diffOne(prev, w, CREATOR)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toEqual({
      id: '42:state-changed',
      type: 'state-changed',
      wagerId: '42',
      message: "'Lakers in 6' is now challenged",
      severity: 'info',
      actionable: false,
      createdAt: NOW,
      read: false,
    })
    expect(nextSnapshots['42'].state).toBe('other')
    expect(nextSnapshots['42'].status).toBe('challenged')
  })

  it('covers unmapped transitions between known states (expired → active)', () => {
    const prev = makeSnapshot({ state: 'expired', status: 'pending' })
    const { entries } = diffOne(prev, makeWager(), CREATOR)
    expect(entries).toHaveLength(1)
    expect(entries[0].type).toBe('state-changed')
    expect(entries[0].message).toBe("'Lakers in 6' is now active")
  })
})

describe('diffWagers — description handling', () => {
  it('labels encrypted wagers by id without attempting decryption', () => {
    const prev = makeSnapshot({ state: 'pending', status: 'pending' })
    const w = makeWager({ description: 'Encrypted Wager', isEncrypted: true })
    const { entries } = diffOne(prev, w, CREATOR)
    expect(entries[0].message).toBe(`${OPPONENT_SHORT} accepted 'Encrypted Wager #42' — it's live`)
  })

  it('falls back to "Wager #id" when the description is empty', () => {
    const prev = makeSnapshot({ state: 'pending', status: 'pending' })
    const w = makeWager({ description: '' })
    const { entries } = diffOne(prev, w, CREATOR)
    expect(entries[0].message).toBe(`${OPPONENT_SHORT} accepted 'Wager #42' — it's live`)
  })
})

describe('diffWagers — draw proposals (event-scan extras)', () => {
  it('draw-proposed: counterparty proposal yields an actionable provisional entry', () => {
    const prev = makeSnapshot()
    const w = makeWager({ drawProposedBy: CREATOR }) // checksummed on purpose
    const { entries, nextSnapshots } = diffOne(prev, w, OPPONENT)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toEqual({
      id: `42:drawProposed:${CREATOR_LOWER}`,
      type: 'draw-proposed',
      wagerId: '42',
      message: `${CREATOR_LOWER_SHORT} proposed settling 'Lakers in 6' as a draw — accept or decline`,
      severity: 'warning',
      actionable: true,
      createdAt: NOW,
      read: false,
    })
    expect(nextSnapshots['42'].drawProposedBy).toBe(CREATOR_LOWER)
  })

  it('never notifies the proposer about their own proposal (case-insensitive)', () => {
    const prev = makeSnapshot()
    const w = makeWager({ drawProposedBy: CREATOR_LOWER })
    const { entries, nextSnapshots } = diffOne(prev, w, CREATOR)
    expect(entries).toEqual([])
    expect(nextSnapshots['42'].drawProposedBy).toBe(CREATOR_LOWER)
  })

  it('emits a draw proposal alongside a simultaneous state transition', () => {
    const prev = makeSnapshot() // active
    const w = makeWager({ drawProposedBy: CREATOR_LOWER, resolutionType: ResolutionType.Creator })
    const { entries } = diffOne(prev, w, OPPONENT, IN_WINDOW)
    const types = entries.map((e) => e.type).sort()
    expect(types).toEqual(['draw-proposed', 'resolvable-waiting'])
  })

  it('draw-revoked: explicit null while non-terminal informs the counterparty', () => {
    const prev = makeSnapshot({ drawProposedBy: CREATOR_LOWER })
    const w = makeWager({ drawProposedBy: null })
    const { entries, nextSnapshots } = diffOne(prev, w, OPPONENT)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      id: '42:draw-revoked',
      type: 'draw-revoked',
      severity: 'info',
      actionable: false,
      message: `${CREATOR_LOWER_SHORT} withdrew their draw proposal on 'Lakers in 6'`,
    })
    expect(nextSnapshots['42'].drawProposedBy).toBe(null)
  })

  it('draw-revoked is suppressed for the proposer themself', () => {
    const prev = makeSnapshot({ drawProposedBy: CREATOR_LOWER })
    const w = makeWager({ drawProposedBy: null })
    const { entries, nextSnapshots } = diffOne(prev, w, CREATOR)
    expect(entries).toEqual([])
    expect(nextSnapshots['42'].drawProposedBy).toBe(null)
  })

  it('an undefined drawProposedBy carries the previous proposal forward (no scan info ≠ revoked)', () => {
    const prev = makeSnapshot({ drawProposedBy: CREATOR_LOWER })
    const w = makeWager() // no drawProposedBy key at all
    const { entries, nextSnapshots } = diffOne(prev, w, OPPONENT)
    expect(entries).toEqual([])
    expect(nextSnapshots['42'].drawProposedBy).toBe(CREATOR_LOWER)
  })

  it('terminal states clear the proposal WITHOUT a draw-revoked entry', () => {
    const prev = makeSnapshot({ drawProposedBy: CREATOR_LOWER })
    const w = makeWager({ status: 'resolved', winner: OPPONENT, paid: false })
    const { entries, nextSnapshots } = diffOne(prev, w, OPPONENT)
    expect(entries.map((e) => e.type)).toEqual(['won-claimable'])
    expect(nextSnapshots['42'].drawProposedBy).toBe(null)
  })

  it('a proposal arriving together with a terminal state is dropped, not announced', () => {
    const prev = makeSnapshot()
    const w = makeWager({ status: 'cancelled', drawProposedBy: CREATOR_LOWER })
    const { entries, nextSnapshots } = diffOne(prev, w, OPPONENT)
    expect(entries.map((e) => e.type)).toEqual(['cancelled'])
    expect(nextSnapshots['42'].drawProposedBy).toBe(null)
  })
})

describe('diffWagers — honest finality (constitution III / FR-011)', () => {
  // Every non-winner scenario in one batch: none of these may carry
  // "you won" or claim-your-winnings copy. ('claim your refund' is a refund,
  // and the lost entry's "{counterparty} won" is about the OTHER side.)
  function nonWinnerEntries() {
    const runs = [
      diffOne(makeSnapshot({ state: 'pending', status: 'pending' }), makeWager(), CREATOR),
      diffOne(makeSnapshot({ state: 'pending', status: 'pending' }), makeWager(), OPPONENT),
      diffOne(makeSnapshot({ state: 'pending', status: 'pending' }), makeWager({ status: 'pending' }), CREATOR, ACCEPT_DL + 1),
      diffOne(makeSnapshot({ state: 'pending', status: 'pending' }), makeWager({ status: 'pending' }), OPPONENT, ACCEPT_DL + 1),
      diffOne(makeSnapshot(), makeWager(), CREATOR, IN_WINDOW),
      diffOne(makeSnapshot(), makeWager({ resolutionType: ResolutionType.Polymarket }), CREATOR, IN_WINDOW),
      diffOne(makeSnapshot({ state: 'resolvable' }), makeWager({ status: 'resolved', winner: CREATOR }), OPPONENT),
      diffOne(makeSnapshot(), makeWager({ status: 'draw' }), CREATOR),
      diffOne(makeSnapshot({ state: 'resolvable' }), makeWager(), CREATOR, RESOLVE_DL + 1),
      diffOne(makeSnapshot({ state: 'pending', status: 'pending' }), makeWager({ status: 'cancelled' }), CREATOR),
      diffOne(makeSnapshot({ state: 'refundable' }), makeWager({ status: 'refunded' }), CREATOR, RESOLVE_DL + 1),
      diffOne(makeSnapshot(), makeWager({ status: 'challenged' }), CREATOR),
      diffOne(makeSnapshot(), makeWager({ drawProposedBy: CREATOR_LOWER }), OPPONENT),
      diffOne(makeSnapshot({ drawProposedBy: CREATOR_LOWER }), makeWager({ drawProposedBy: null }), OPPONENT),
    ]
    return runs.flatMap((r) => r.entries)
  }

  it('emits an entry for every non-winner scenario (sanity: never silent)', () => {
    expect(nonWinnerEntries().length).toBeGreaterThanOrEqual(14)
  })

  it("no non-winner entry ever says 'you won' or prompts to Claim winnings", () => {
    for (const entry of nonWinnerEntries()) {
      expect(entry.type).not.toBe('won-claimable')
      expect(entry.type).not.toBe('paid-out')
      expect(entry.message).not.toMatch(/you won/i)
      expect(entry.message).not.toMatch(/winnings/i)
      expect(entry.message).not.toMatch(/\bClaim\b/) // capital-C winnings claim
    }
  })

  it('draw-proposed copy reads as provisional, never as a settled draw', () => {
    const { entries } = diffOne(makeSnapshot(), makeWager({ drawProposedBy: CREATOR_LOWER }), OPPONENT)
    expect(entries[0].message).toContain('proposed settling')
    expect(entries[0].message).toContain('accept or decline')
    expect(entries[0].message).not.toMatch(/\bsettled\b/)
    expect(entries[0].message).not.toMatch(/stakes returned/)
  })
})

describe('diffWagers — idempotence, dedup ids, purity', () => {
  it('is idempotent: rediffing with the produced snapshots emits zero entries', () => {
    const prev = makeSnapshot({ state: 'pending', status: 'pending' })
    const w = makeWager({ drawProposedBy: CREATOR_LOWER })
    const first = diffWagers({ snapshots: { 42: prev }, wagers: [w], account: OPPONENT, nowMs: NOW })
    expect(first.entries.length).toBeGreaterThan(0)

    const second = diffWagers({
      snapshots: first.nextSnapshots,
      wagers: [w],
      account: OPPONENT,
      nowMs: NOW + 30_000,
    })
    expect(second.entries).toEqual([])
  })

  it('is deterministic: identical inputs produce identical results (incl. stable ids)', () => {
    const args = () => ({
      snapshots: { 42: makeSnapshot({ state: 'resolvable' }) },
      wagers: [makeWager({ status: 'resolved', winner: CREATOR, paid: false })],
      account: CREATOR,
      nowMs: NOW,
    })
    const a = diffWagers(args())
    const b = diffWagers(args())
    expect(a).toEqual(b)
    expect(a.entries[0].id).toBe('42:won-claimable')
  })

  it('never mutates its inputs (deep-frozen snapshots and wagers)', () => {
    const snapshots = deepFreeze({ 42: makeSnapshot({ state: 'pending', status: 'pending' }) })
    const wagers = deepFreeze([makeWager({ drawProposedBy: CREATOR_LOWER })])
    expect(() =>
      diffWagers({ snapshots, wagers, account: OPPONENT, nowMs: NOW })
    ).not.toThrow()
  })

  it('carries forward snapshots for wagers absent from this poll', () => {
    const stale = makeSnapshot({ id: '99', state: 'draw', status: 'draw' })
    const { nextSnapshots } = diffWagers({
      snapshots: { 99: stale },
      wagers: [makeWager()],
      account: CREATOR,
      nowMs: NOW,
    })
    expect(nextSnapshots['99']).toEqual(stale)
    expect(nextSnapshots['42']).toBeDefined()
  })

  it('stamps entries and snapshots with the caller-supplied clock only', () => {
    const at = NOW + 123_456
    const prev = makeSnapshot({ state: 'pending', status: 'pending' })
    const { entries, nextSnapshots } = diffOne(prev, makeWager(), CREATOR, at)
    expect(entries[0].createdAt).toBe(at)
    expect(entries[0].read).toBe(false)
    expect(nextSnapshots['42'].snappedAt).toBe(at)
  })

  it('diffs multiple wagers independently in one call', () => {
    const w1 = makeWager() // pending → active for creator
    const w2 = makeWager({ id: '7', status: 'draw', description: 'Coin flip' })
    const { entries, nextSnapshots } = diffWagers({
      snapshots: {
        42: makeSnapshot({ state: 'pending', status: 'pending' }),
        7: makeSnapshot({ id: '7' }),
      },
      wagers: [w1, w2],
      account: CREATOR,
      nowMs: NOW,
    })
    expect(entries.map((e) => e.id).sort()).toEqual(['42:accepted', '7:draw-settled'])
    expect(entries.find((e) => e.wagerId === '7').message).toBe(
      "'Coin flip' settled as a draw — stakes returned"
    )
    expect(Object.keys(nextSnapshots).sort()).toEqual(['42', '7'].sort())
  })
})
