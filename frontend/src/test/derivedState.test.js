import { describe, it, expect } from 'vitest'
import { deriveState, canResolve, deriveActionNeeded } from '../data/notifications/derivedState'
import { ResolutionType } from '../constants/wagerDefaults'

/**
 * derivedState.js projects a normalized wager (toWagerShape output) +
 * viewer account + caller-supplied clock into the CanonicalState and
 * ActionNeeded tables of specs/012-wager-notifications/data-model.md.
 *
 * These tests pin every boundary in that table:
 *   - now === acceptanceDeadline  → still 'pending'   (≤)
 *   - now === tradingEndTime      → 'resolvable'      (active requires <)
 *   - now === resolveDeadlineTime → still 'resolvable' (≤)
 *   - winner comparison is case-insensitive
 *   - paid flips claimable → won-paid
 *   - resolutionType actor rules for canResolve / 'resolve'
 *   - respondDraw excludes the proposer themself
 *   - null/missing account never yields an action
 */

// Mixed-case on purpose: every address comparison must lowercase both sides.
const CREATOR = '0xAaAA000000000000000000000000000000000001'
const OPPONENT = '0xBbBB000000000000000000000000000000000002'
const ARBITRATOR = '0xCcCC000000000000000000000000000000000003'
const STRANGER = '0xDdDD000000000000000000000000000000000004'

// Fixed clock anchors (ms). Pure modules never read Date.now().
const NOW = 1_765_000_000_000
const ACCEPT_DL = NOW + 60_000
const TRADING_END = NOW + 3_600_000
const RESOLVE_DL = TRADING_END + 48 * 3_600_000

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

describe('deriveState', () => {
  describe('pending / expired (acceptanceDeadline boundary)', () => {
    it('is pending while now is before the acceptance deadline', () => {
      const w = makeWager({ status: 'pending' })
      expect(deriveState(w, OPPONENT, ACCEPT_DL - 1)).toBe('pending')
    })

    it('is still pending exactly AT the acceptance deadline (now ≤ deadline)', () => {
      const w = makeWager({ status: 'pending' })
      expect(deriveState(w, OPPONENT, ACCEPT_DL)).toBe('pending')
    })

    it('is expired one ms after the acceptance deadline', () => {
      const w = makeWager({ status: 'pending' })
      expect(deriveState(w, OPPONENT, ACCEPT_DL + 1)).toBe('expired')
    })
  })

  describe('active / resolvable / refundable (trading + resolve boundaries)', () => {
    it('is active while now is before tradingEndTime', () => {
      expect(deriveState(makeWager(), CREATOR, TRADING_END - 1)).toBe('active')
    })

    it('is resolvable exactly AT tradingEndTime (active requires now < tradingEndTime)', () => {
      expect(deriveState(makeWager(), CREATOR, TRADING_END)).toBe('resolvable')
    })

    it('is resolvable strictly inside the resolution window', () => {
      expect(deriveState(makeWager(), CREATOR, TRADING_END + 1)).toBe('resolvable')
    })

    it('is still resolvable exactly AT resolveDeadlineTime (now ≤ deadline)', () => {
      expect(deriveState(makeWager(), CREATOR, RESOLVE_DL)).toBe('resolvable')
    })

    it('is refundable one ms after resolveDeadlineTime', () => {
      expect(deriveState(makeWager(), CREATOR, RESOLVE_DL + 1)).toBe('refundable')
    })
  })

  describe('resolved (winner / paid matrix)', () => {
    it('is resolved-claimable when account is the winner and not yet paid', () => {
      const w = makeWager({ status: 'resolved', winner: CREATOR, paid: false })
      expect(deriveState(w, CREATOR, NOW)).toBe('resolved-claimable')
    })

    it('matches the winner case-insensitively (checksummed winner vs lowercase account)', () => {
      const w = makeWager({ status: 'resolved', winner: CREATOR, paid: false })
      expect(deriveState(w, CREATOR.toLowerCase(), NOW)).toBe('resolved-claimable')
    })

    it('matches the winner case-insensitively (lowercase winner vs checksummed account)', () => {
      const w = makeWager({ status: 'resolved', winner: OPPONENT.toLowerCase(), paid: false })
      expect(deriveState(w, OPPONENT, NOW)).toBe('resolved-claimable')
    })

    it('is resolved-won-paid when account is the winner and paid is true', () => {
      const w = makeWager({ status: 'resolved', winner: CREATOR, paid: true })
      expect(deriveState(w, CREATOR, NOW)).toBe('resolved-won-paid')
    })

    it('is resolved-lost when the winner is the counterparty', () => {
      const w = makeWager({ status: 'resolved', winner: CREATOR, paid: false })
      expect(deriveState(w, OPPONENT, NOW)).toBe('resolved-lost')
    })

    it('is resolved-lost (never claimable) when account is null', () => {
      const w = makeWager({ status: 'resolved', winner: CREATOR, paid: false })
      expect(deriveState(w, null, NOW)).toBe('resolved-lost')
    })

    it('is resolved-lost when the winner is null (no one to claim)', () => {
      const w = makeWager({ status: 'resolved', winner: null, paid: false })
      expect(deriveState(w, CREATOR, NOW)).toBe('resolved-lost')
    })
  })

  describe('raw terminal statuses', () => {
    it("maps status 'draw' to 'draw'", () => {
      expect(deriveState(makeWager({ status: 'draw' }), CREATOR, NOW)).toBe('draw')
    })

    it("maps status 'cancelled' to 'cancelled'", () => {
      expect(deriveState(makeWager({ status: 'cancelled' }), CREATOR, NOW)).toBe('cancelled')
    })

    it("maps status 'refunded' to 'refunded'", () => {
      expect(deriveState(makeWager({ status: 'refunded' }), CREATOR, NOW)).toBe('refunded')
    })
  })

  describe("unknown / legacy statuses → 'other'", () => {
    it.each(['pending_acceptance', 'challenged', 'oracle_timed_out', 'disputed', 'unknown', ''])(
      "maps legacy/unknown status '%s' to 'other'",
      (status) => {
        expect(deriveState(makeWager({ status }), CREATOR, NOW)).toBe('other')
      }
    )

    it("maps a missing status to 'other'", () => {
      expect(deriveState(makeWager({ status: undefined }), CREATOR, NOW)).toBe('other')
    })
  })

  describe('account-independence of time-derived states', () => {
    it('derives pending/expired/active/resolvable identically with a null account', () => {
      const pending = makeWager({ status: 'pending' })
      expect(deriveState(pending, null, ACCEPT_DL)).toBe('pending')
      expect(deriveState(pending, null, ACCEPT_DL + 1)).toBe('expired')
      expect(deriveState(makeWager(), null, TRADING_END - 1)).toBe('active')
      expect(deriveState(makeWager(), null, TRADING_END)).toBe('resolvable')
      expect(deriveState(makeWager(), null, RESOLVE_DL + 1)).toBe('refundable')
    })
  })
})

describe('canResolve', () => {
  it('Either (0): creator may resolve', () => {
    const w = makeWager({ resolutionType: ResolutionType.Either })
    expect(canResolve(w, CREATOR)).toBe(true)
  })

  it('Either (0): opponent may resolve', () => {
    const w = makeWager({ resolutionType: ResolutionType.Either })
    expect(canResolve(w, OPPONENT)).toBe(true)
  })

  it('Either (0): a stranger may not resolve', () => {
    const w = makeWager({ resolutionType: ResolutionType.Either })
    expect(canResolve(w, STRANGER)).toBe(false)
  })

  it('compares addresses case-insensitively', () => {
    const w = makeWager({ resolutionType: ResolutionType.Either })
    expect(canResolve(w, CREATOR.toLowerCase())).toBe(true)
    expect(canResolve(w, OPPONENT.toUpperCase().replace('0X', '0x'))).toBe(true)
  })

  it('Creator (1): only the creator may resolve', () => {
    const w = makeWager({ resolutionType: ResolutionType.Creator })
    expect(canResolve(w, CREATOR)).toBe(true)
    expect(canResolve(w, OPPONENT)).toBe(false)
  })

  it('Opponent (2): only the opponent may resolve', () => {
    const w = makeWager({ resolutionType: ResolutionType.Opponent })
    expect(canResolve(w, OPPONENT)).toBe(true)
    expect(canResolve(w, CREATOR)).toBe(false)
  })

  it('ThirdParty (3): no participant may resolve, not even the arbitrator via this path', () => {
    const w = makeWager({ resolutionType: ResolutionType.ThirdParty, arbitrator: ARBITRATOR })
    expect(canResolve(w, CREATOR)).toBe(false)
    expect(canResolve(w, OPPONENT)).toBe(false)
    expect(canResolve(w, ARBITRATOR)).toBe(false)
  })

  it.each([
    ['Polymarket', ResolutionType.Polymarket],
    ['ChainlinkDataFeed', ResolutionType.ChainlinkDataFeed],
    ['ChainlinkFunctions', ResolutionType.ChainlinkFunctions],
    ['UMA', ResolutionType.UMA],
  ])('oracle type %s: participants cannot resolve', (_name, resolutionType) => {
    const w = makeWager({ resolutionType })
    expect(canResolve(w, CREATOR)).toBe(false)
    expect(canResolve(w, OPPONENT)).toBe(false)
  })

  it('returns false for a null/missing account', () => {
    const w = makeWager({ resolutionType: ResolutionType.Either })
    expect(canResolve(w, null)).toBe(false)
    expect(canResolve(w, undefined)).toBe(false)
    expect(canResolve(w, '')).toBe(false)
  })
})

describe('deriveActionNeeded', () => {
  describe('accept', () => {
    it("returns 'accept' for the opponent while pending", () => {
      const w = makeWager({ status: 'pending' })
      expect(deriveActionNeeded(w, OPPONENT, NOW, null)).toBe('accept')
    })

    it("returns 'accept' exactly AT the acceptance deadline (still pending)", () => {
      const w = makeWager({ status: 'pending' })
      expect(deriveActionNeeded(w, OPPONENT, ACCEPT_DL, null)).toBe('accept')
    })

    it('matches the opponent case-insensitively', () => {
      const w = makeWager({ status: 'pending' })
      expect(deriveActionNeeded(w, OPPONENT.toLowerCase(), NOW, null)).toBe('accept')
    })

    it('returns null for the creator while pending (nothing for them to accept)', () => {
      const w = makeWager({ status: 'pending' })
      expect(deriveActionNeeded(w, CREATOR, NOW, null)).toBe(null)
    })

    it('returns null for a stranger while pending', () => {
      const w = makeWager({ status: 'pending' })
      expect(deriveActionNeeded(w, STRANGER, NOW, null)).toBe(null)
    })
  })

  describe('resolve (resolvable state × resolutionType actor rules)', () => {
    const inWindow = TRADING_END + 1

    it("Either: both creator and opponent get 'resolve'", () => {
      const w = makeWager({ resolutionType: ResolutionType.Either })
      expect(deriveActionNeeded(w, CREATOR, inWindow, null)).toBe('resolve')
      expect(deriveActionNeeded(w, OPPONENT, inWindow, null)).toBe('resolve')
    })

    it("Creator: only the creator gets 'resolve'", () => {
      const w = makeWager({ resolutionType: ResolutionType.Creator })
      expect(deriveActionNeeded(w, CREATOR, inWindow, null)).toBe('resolve')
      expect(deriveActionNeeded(w, OPPONENT, inWindow, null)).toBe(null)
    })

    it("Opponent: only the opponent gets 'resolve'", () => {
      const w = makeWager({ resolutionType: ResolutionType.Opponent })
      expect(deriveActionNeeded(w, OPPONENT, inWindow, null)).toBe('resolve')
      expect(deriveActionNeeded(w, CREATOR, inWindow, null)).toBe(null)
    })

    it('ThirdParty: neither participant gets an action in the resolution window', () => {
      const w = makeWager({ resolutionType: ResolutionType.ThirdParty, arbitrator: ARBITRATOR })
      expect(deriveActionNeeded(w, CREATOR, inWindow, null)).toBe(null)
      expect(deriveActionNeeded(w, OPPONENT, inWindow, null)).toBe(null)
    })

    it.each([
      ['Polymarket', ResolutionType.Polymarket],
      ['ChainlinkDataFeed', ResolutionType.ChainlinkDataFeed],
      ['ChainlinkFunctions', ResolutionType.ChainlinkFunctions],
      ['UMA', ResolutionType.UMA],
    ])('oracle type %s: no participant action in the resolution window', (_name, resolutionType) => {
      const w = makeWager({ resolutionType })
      expect(deriveActionNeeded(w, CREATOR, inWindow, null)).toBe(null)
      expect(deriveActionNeeded(w, OPPONENT, inWindow, null)).toBe(null)
    })

    it("fires exactly AT tradingEndTime (the window opens inclusively)", () => {
      const w = makeWager({ resolutionType: ResolutionType.Either })
      expect(deriveActionNeeded(w, CREATOR, TRADING_END, null)).toBe('resolve')
    })

    it("still fires exactly AT resolveDeadlineTime (the window closes inclusively)", () => {
      const w = makeWager({ resolutionType: ResolutionType.Either })
      expect(deriveActionNeeded(w, CREATOR, RESOLVE_DL, null)).toBe('resolve')
    })

    it('does NOT fire while still active (before the window opens)', () => {
      const w = makeWager({ resolutionType: ResolutionType.Either })
      expect(deriveActionNeeded(w, CREATOR, TRADING_END - 1, null)).toBe(null)
    })
  })

  describe('claim', () => {
    it("returns 'claim' when the account won and has not been paid", () => {
      const w = makeWager({ status: 'resolved', winner: CREATOR, paid: false })
      expect(deriveActionNeeded(w, CREATOR, NOW, null)).toBe('claim')
    })

    it('matches the winner case-insensitively', () => {
      const w = makeWager({ status: 'resolved', winner: CREATOR.toLowerCase(), paid: false })
      expect(deriveActionNeeded(w, CREATOR, NOW, null)).toBe('claim')
    })

    it('returns null once paid (resolved-won-paid)', () => {
      const w = makeWager({ status: 'resolved', winner: CREATOR, paid: true })
      expect(deriveActionNeeded(w, CREATOR, NOW, null)).toBe(null)
    })

    it('returns null for the loser', () => {
      const w = makeWager({ status: 'resolved', winner: CREATOR, paid: false })
      expect(deriveActionNeeded(w, OPPONENT, NOW, null)).toBe(null)
    })
  })

  describe('refund', () => {
    it("expired: creator gets 'refund' (only the creator escrowed pre-acceptance)", () => {
      const w = makeWager({ status: 'pending' })
      expect(deriveActionNeeded(w, CREATOR, ACCEPT_DL + 1, null)).toBe('refund')
    })

    it('expired: opponent gets nothing (they never escrowed)', () => {
      const w = makeWager({ status: 'pending' })
      expect(deriveActionNeeded(w, OPPONENT, ACCEPT_DL + 1, null)).toBe(null)
    })

    it("refundable: creator gets 'refund'", () => {
      const w = makeWager()
      expect(deriveActionNeeded(w, CREATOR, RESOLVE_DL + 1, null)).toBe('refund')
    })

    it("refundable: opponent gets 'refund' (either participant)", () => {
      const w = makeWager()
      expect(deriveActionNeeded(w, OPPONENT, RESOLVE_DL + 1, null)).toBe('refund')
    })

    it('refundable: a stranger gets nothing', () => {
      const w = makeWager()
      expect(deriveActionNeeded(w, STRANGER, RESOLVE_DL + 1, null)).toBe(null)
    })
  })

  describe('respondDraw', () => {
    it("fires when the counterparty proposed a draw and the wager is active", () => {
      const w = makeWager()
      expect(deriveActionNeeded(w, OPPONENT, TRADING_END - 1, CREATOR)).toBe('respondDraw')
    })

    it('fires in the resolvable state too', () => {
      // Creator-only resolution so the opponent has no competing 'resolve'.
      const w = makeWager({ resolutionType: ResolutionType.Creator })
      expect(deriveActionNeeded(w, OPPONENT, TRADING_END + 1, CREATOR)).toBe('respondDraw')
    })

    it('never asks the proposer to respond to their own proposal', () => {
      const w = makeWager()
      expect(deriveActionNeeded(w, CREATOR, TRADING_END - 1, CREATOR)).toBe(null)
    })

    it('excludes self-proposals case-insensitively', () => {
      const w = makeWager()
      expect(deriveActionNeeded(w, CREATOR.toLowerCase(), TRADING_END - 1, CREATOR)).toBe(null)
    })

    it('does not fire outside active/resolvable (pending)', () => {
      const w = makeWager({ status: 'pending' })
      // Opponent would otherwise see 'accept'; the stale proposal must not override states.
      expect(deriveActionNeeded(w, OPPONENT, NOW, CREATOR)).toBe('accept')
    })

    it('does not fire outside active/resolvable (refundable falls back to refund)', () => {
      const w = makeWager()
      expect(deriveActionNeeded(w, OPPONENT, RESOLVE_DL + 1, CREATOR)).toBe('refund')
    })

    it('treats an omitted drawProposedBy argument as no proposal', () => {
      // In-window with Either-resolution: 'resolve' applies, respondDraw must not.
      const w = makeWager({ resolutionType: ResolutionType.Either })
      expect(deriveActionNeeded(w, CREATOR, TRADING_END + 1)).toBe('resolve')
    })
  })

  describe('priority (claim > respondDraw > resolve > refund > accept)', () => {
    it("respondDraw beats resolve when both apply", () => {
      // Either-resolution, in window, counterparty proposed a draw:
      // account could resolve, but must respond to the draw first.
      const w = makeWager({ resolutionType: ResolutionType.Either })
      expect(deriveActionNeeded(w, OPPONENT, TRADING_END + 1, CREATOR)).toBe('respondDraw')
    })

    it('claim beats a lingering draw proposal (terminal state wins)', () => {
      const w = makeWager({ status: 'resolved', winner: OPPONENT, paid: false })
      expect(deriveActionNeeded(w, OPPONENT, NOW, CREATOR)).toBe('claim')
    })
  })

  describe('null / missing account', () => {
    it('returns null for every state when account is null', () => {
      expect(deriveActionNeeded(makeWager({ status: 'pending' }), null, NOW, null)).toBe(null)
      expect(deriveActionNeeded(makeWager({ status: 'pending' }), null, ACCEPT_DL + 1, null)).toBe(null)
      expect(deriveActionNeeded(makeWager(), null, TRADING_END + 1, null)).toBe(null)
      expect(deriveActionNeeded(makeWager(), null, RESOLVE_DL + 1, null)).toBe(null)
      expect(
        deriveActionNeeded(makeWager({ status: 'resolved', winner: CREATOR, paid: false }), null, NOW, null)
      ).toBe(null)
      expect(deriveActionNeeded(makeWager(), null, TRADING_END - 1, CREATOR)).toBe(null)
    })

    it('returns null for undefined account', () => {
      expect(deriveActionNeeded(makeWager({ status: 'pending' }), undefined, NOW, null)).toBe(null)
    })

    it('terminal/other states produce no action for participants either', () => {
      expect(deriveActionNeeded(makeWager({ status: 'draw' }), CREATOR, NOW, null)).toBe(null)
      expect(deriveActionNeeded(makeWager({ status: 'cancelled' }), CREATOR, NOW, null)).toBe(null)
      expect(deriveActionNeeded(makeWager({ status: 'refunded' }), CREATOR, NOW, null)).toBe(null)
      expect(deriveActionNeeded(makeWager({ status: 'challenged' }), CREATOR, NOW, null)).toBe(null)
    })
  })
})
