import { describe, it, expect } from 'vitest'
import { computeDeadlineWarnings } from '../data/notifications/deadlineWarnings'
import { ResolutionType } from '../constants/wagerDefaults'

/**
 * deadlineWarnings.js turns approaching deadlines into 'warn-acceptance' /
 * 'warn-resolution' feed entries, throttled to one per wager per window per
 * UTC day (specs/012-wager-notifications/contracts/notification-types.md,
 * deadline-warnings section).
 *
 * These tests pin:
 *   - the 24 h threshold boundaries (exactly 24 h ⇒ warn; 24 h + 1 ms ⇒ no;
 *     0 / negative remaining ⇒ never — passed deadlines are the state
 *     transition's job)
 *   - UTC day-bucket anti-spam (second poll same day skips; next UTC day
 *     re-warns with a new dayBucket in the entry id)
 *   - creator vs opponent acceptance copy + actionability
 *   - resolution recipient gating via canResolve (oracle / third-party
 *     resolution types warn nobody)
 *   - entry id shape `<wagerId>:warn:<window>:<dayBucket>`
 *   - purity: inputs never mutated; warnRecords returned untouched (same
 *     reference) when nothing is emitted
 */

// Mixed-case on purpose: every address comparison must lowercase both sides.
const CREATOR = '0xAaAA000000000000000000000000000000000001'
const OPPONENT = '0xBbBB000000000000000000000000000000000002'
const STRANGER = '0xDdDD000000000000000000000000000000000004'

const HOUR = 3_600_000
const DAY = 24 * HOUR

// 2026-06-10T22:00:00Z — late in the UTC day so a few hours later lands in
// the next UTC day bucket (anti-spam rollover tests).
const NOW = Date.UTC(2026, 5, 10, 22, 0, 0)
const TODAY = '2026-06-10'
const TOMORROW = '2026-06-11'

function makeWager(overrides = {}) {
  return {
    id: '42',
    creator: CREATOR,
    opponent: OPPONENT,
    arbitrator: null,
    status: 'active',
    winner: null,
    paid: false,
    acceptanceDeadline: NOW + 7 * DAY,
    tradingEndTime: NOW + 7 * DAY,
    resolveDeadlineTime: NOW + 14 * DAY,
    resolutionType: ResolutionType.Either,
    creatorStake: '10.0',
    opponentStake: '10.0',
    stakeTokenSymbol: 'USDC',
    description: 'Lakers in 6',
    ...overrides,
  }
}

/** A wager in canonical state `pending` whose acceptance deadline can be set. */
function pendingWager(acceptanceDeadline, overrides = {}) {
  return makeWager({ status: 'pending', acceptanceDeadline, ...overrides })
}

/** A wager in canonical state `resolvable` whose resolve deadline can be set. */
function resolvableWager(resolveDeadlineTime, overrides = {}) {
  return makeWager({
    status: 'active',
    tradingEndTime: NOW - HOUR,
    resolveDeadlineTime,
    ...overrides,
  })
}

function compute({ wagers, warnRecords = {}, account = OPPONENT, nowMs = NOW }) {
  return computeDeadlineWarnings({ wagers, warnRecords, account, nowMs })
}

describe('computeDeadlineWarnings', () => {
  describe('acceptance window threshold boundaries', () => {
    it('warns when exactly 24h remain (boundary is inclusive)', () => {
      const { entries } = compute({ wagers: [pendingWager(NOW + DAY)] })
      expect(entries).toHaveLength(1)
      expect(entries[0].type).toBe('warn-acceptance')
    })

    it('does not warn when just over 24h remain', () => {
      const { entries } = compute({ wagers: [pendingWager(NOW + DAY + 1)] })
      expect(entries).toHaveLength(0)
    })

    it('does not warn at the deadline itself (zero remaining)', () => {
      const { entries } = compute({ wagers: [pendingWager(NOW)] })
      expect(entries).toHaveLength(0)
    })

    it('never warns for a passed deadline (state transition covers it)', () => {
      const { entries } = compute({ wagers: [pendingWager(NOW - 1)] })
      expect(entries).toHaveLength(0)
    })
  })

  describe('resolution window threshold boundaries', () => {
    it('warns a resolver when exactly 24h remain in the resolution window', () => {
      const { entries } = compute({
        wagers: [resolvableWager(NOW + DAY)],
        account: CREATOR,
      })
      expect(entries).toHaveLength(1)
      expect(entries[0].type).toBe('warn-resolution')
    })

    it('does not warn when just over 24h remain', () => {
      const { entries } = compute({
        wagers: [resolvableWager(NOW + DAY + 1)],
        account: CREATOR,
      })
      expect(entries).toHaveLength(0)
    })

    it('does not warn at the resolve deadline itself (zero remaining)', () => {
      const { entries } = compute({
        wagers: [resolvableWager(NOW)],
        account: CREATOR,
      })
      expect(entries).toHaveLength(0)
    })

    it('never warns once the window has closed (refundable, not resolvable)', () => {
      const { entries } = compute({
        wagers: [resolvableWager(NOW - 1)],
        account: CREATOR,
      })
      expect(entries).toHaveLength(0)
    })
  })

  describe('UTC day-bucket anti-spam', () => {
    it('skips a wager already warned earlier the same UTC day', () => {
      const warnRecords = { 42: { acceptance: NOW } }
      const { entries, nextWarnRecords } = compute({
        wagers: [pendingWager(NOW + DAY)],
        warnRecords,
        nowMs: NOW + HOUR, // 23:00Z, same UTC day, still inside the window
      })
      expect(entries).toHaveLength(0)
      expect(nextWarnRecords).toBe(warnRecords)
    })

    it('warns again on the next UTC day with a new dayBucket in the id', () => {
      const warnRecords = { 42: { acceptance: NOW } } // warned 2026-06-10
      const nextPoll = NOW + 3 * HOUR // 2026-06-11T01:00Z
      const { entries, nextWarnRecords } = compute({
        wagers: [pendingWager(NOW + DAY)],
        warnRecords,
        nowMs: nextPoll,
      })
      expect(entries).toHaveLength(1)
      expect(entries[0].id).toBe(`42:warn:acceptance:${TOMORROW}`)
      expect(nextWarnRecords[42].acceptance).toBe(nextPoll)
    })

    it('tracks windows independently: an acceptance record does not block a resolution warning', () => {
      const warnRecords = { 42: { acceptance: NOW } }
      const { entries, nextWarnRecords } = compute({
        wagers: [resolvableWager(NOW + 12 * HOUR)],
        warnRecords,
        account: CREATOR,
      })
      expect(entries).toHaveLength(1)
      expect(entries[0].type).toBe('warn-resolution')
      expect(nextWarnRecords[42]).toEqual({ acceptance: NOW, resolution: NOW })
    })
  })

  describe('acceptance recipient variants (catalog copy + actionability)', () => {
    it('creator gets a non-actionable "if not accepted" warning', () => {
      const { entries } = compute({
        wagers: [pendingWager(NOW + 23 * HOUR)],
        account: CREATOR,
      })
      expect(entries).toHaveLength(1)
      expect(entries[0].actionable).toBe(false)
      expect(entries[0].message).toBe("'Lakers in 6' expires in 23h if not accepted")
    })

    it('opponent gets an actionable "accept before it\'s gone" warning', () => {
      const { entries } = compute({
        wagers: [pendingWager(NOW + 23 * HOUR)],
        account: OPPONENT,
      })
      expect(entries).toHaveLength(1)
      expect(entries[0].actionable).toBe(true)
      expect(entries[0].message).toBe("'Lakers in 6' expires in 23h — accept before it's gone")
    })

    it('compares addresses case-insensitively (lowercased account still matches)', () => {
      const { entries } = compute({
        wagers: [pendingWager(NOW + 23 * HOUR)],
        account: OPPONENT.toLowerCase(),
      })
      expect(entries).toHaveLength(1)
      expect(entries[0].actionable).toBe(true)
    })

    it('warns nobody who is not a participant', () => {
      const { entries } = compute({
        wagers: [pendingWager(NOW + 23 * HOUR)],
        account: STRANGER,
      })
      expect(entries).toHaveLength(0)
    })

    it('formats sub-hour remaining time in minutes', () => {
      const { entries } = compute({
        wagers: [pendingWager(NOW + 45 * 60_000)],
        account: OPPONENT,
      })
      expect(entries[0].message).toContain('in 45m')
    })
  })

  describe('resolution recipient gating via canResolve', () => {
    const inWindow = NOW + 23 * HOUR

    it('Creator type: warns the creator, not the opponent', () => {
      const wagers = [resolvableWager(inWindow, { resolutionType: ResolutionType.Creator })]
      expect(compute({ wagers, account: CREATOR }).entries).toHaveLength(1)
      expect(compute({ wagers, account: OPPONENT }).entries).toHaveLength(0)
    })

    it('Opponent type: warns the opponent, not the creator', () => {
      const wagers = [resolvableWager(inWindow, { resolutionType: ResolutionType.Opponent })]
      expect(compute({ wagers, account: OPPONENT }).entries).toHaveLength(1)
      expect(compute({ wagers, account: CREATOR }).entries).toHaveLength(0)
    })

    it('Either type: warns both participants', () => {
      const wagers = [resolvableWager(inWindow, { resolutionType: ResolutionType.Either })]
      expect(compute({ wagers, account: CREATOR }).entries).toHaveLength(1)
      expect(compute({ wagers, account: OPPONENT }).entries).toHaveLength(1)
    })

    it('ThirdParty type: warns neither participant (arbitrator resolves)', () => {
      const wagers = [resolvableWager(inWindow, { resolutionType: ResolutionType.ThirdParty })]
      expect(compute({ wagers, account: CREATOR }).entries).toHaveLength(0)
      expect(compute({ wagers, account: OPPONENT }).entries).toHaveLength(0)
    })

    it('oracle types: warns neither participant (oracle auto-resolves)', () => {
      for (const resolutionType of [
        ResolutionType.Polymarket,
        ResolutionType.ChainlinkDataFeed,
        ResolutionType.ChainlinkFunctions,
        ResolutionType.UMA,
      ]) {
        const wagers = [resolvableWager(inWindow, { resolutionType })]
        expect(compute({ wagers, account: CREATOR }).entries).toHaveLength(0)
        expect(compute({ wagers, account: OPPONENT }).entries).toHaveLength(0)
      }
    })

    it('uses the catalog template for resolution warnings', () => {
      const { entries } = compute({
        wagers: [resolvableWager(inWindow)],
        account: CREATOR,
      })
      expect(entries[0].message).toBe("Resolution window for 'Lakers in 6' closes in 23h")
      expect(entries[0].actionable).toBe(true)
    })
  })

  describe('entry shape', () => {
    it('produces the full ActivityEntry shape with the warn id scheme', () => {
      const { entries } = compute({ wagers: [pendingWager(NOW + 23 * HOUR)] })
      expect(entries[0]).toEqual({
        id: `42:warn:acceptance:${TODAY}`,
        type: 'warn-acceptance',
        wagerId: '42',
        message: "'Lakers in 6' expires in 23h — accept before it's gone",
        severity: 'warning',
        actionable: true,
        createdAt: NOW,
        read: false,
      })
    })

    it('falls back to "Wager #id" when the description is empty', () => {
      const { entries } = compute({
        wagers: [pendingWager(NOW + 23 * HOUR, { description: '' })],
      })
      expect(entries[0].message).toContain("'Wager #42'")
    })
  })

  describe('purity and record handling', () => {
    it('returns warnRecords by reference when nothing is emitted', () => {
      const warnRecords = { 7: { acceptance: NOW - 2 * DAY } }
      const { entries, nextWarnRecords } = compute({
        wagers: [makeWager()], // active, nothing within 24h
        warnRecords,
      })
      expect(entries).toHaveLength(0)
      expect(nextWarnRecords).toBe(warnRecords)
    })

    it('does not mutate the input warnRecords when emitting', () => {
      const warnRecords = { 42: { resolution: NOW - 2 * DAY } }
      const frozen = JSON.parse(JSON.stringify(warnRecords))
      const { entries, nextWarnRecords } = compute({
        wagers: [pendingWager(NOW + 23 * HOUR)],
        warnRecords,
      })
      expect(entries).toHaveLength(1)
      expect(warnRecords).toEqual(frozen)
      expect(nextWarnRecords).not.toBe(warnRecords)
      expect(nextWarnRecords[42]).toEqual({ resolution: NOW - 2 * DAY, acceptance: NOW })
    })

    it('records only emitted warnings (skipped wagers leave no record)', () => {
      const { nextWarnRecords } = compute({
        wagers: [pendingWager(NOW + 2 * DAY), pendingWager(NOW + 23 * HOUR, { id: '43' })],
        warnRecords: {},
      })
      expect(Object.keys(nextWarnRecords)).toEqual(['43'])
      expect(nextWarnRecords[43]).toEqual({ acceptance: NOW })
    })

    it('handles a missing account and empty wager list safely', () => {
      const warnRecords = {}
      expect(
        computeDeadlineWarnings({ wagers: [pendingWager(NOW + HOUR)], warnRecords, account: null, nowMs: NOW })
      ).toEqual({ entries: [], nextWarnRecords: warnRecords })
      expect(
        computeDeadlineWarnings({ wagers: [], warnRecords, account: OPPONENT, nowMs: NOW })
      ).toEqual({ entries: [], nextWarnRecords: warnRecords })
    })
  })
})
