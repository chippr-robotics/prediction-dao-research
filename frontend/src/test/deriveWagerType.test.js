import { describe, it, expect } from 'vitest'
import { deriveWagerType, WAGER_DEFAULTS } from '../constants/wagerDefaults'

/**
 * deriveWagerType reconstructs the wager subtype + opponent odds from the
 * asymmetric on-chain stakes, since v2 WagerRegistry stores no marketType field.
 * Mirrors the creation formula in useFriendMarketCreation:
 *   creatorStake = opponentStake * (odds - 100) / 100
 */
describe('deriveWagerType', () => {
  it('treats equal stakes as an even-money 1v1', () => {
    const { type, oddsMultiplier } = deriveWagerType(10n, 10n)
    expect(type).toBe('oneVsOne')
    expect(oddsMultiplier).toBe(WAGER_DEFAULTS.ODDS_MULTIPLIER) // 200 = 2x = even
  })

  it('detects a 3x bookmaker (creator stakes 2x the opponent)', () => {
    // odds = 300 → creatorStake = opponentStake * (300-100)/100 = 2 * opponent
    const { type, oddsMultiplier } = deriveWagerType(20n, 10n)
    expect(type).toBe('bookmaker')
    expect(oddsMultiplier).toBe(300)
  })

  it('detects a 5x bookmaker', () => {
    // odds = 500 → creatorStake = 4 * opponent
    const { type, oddsMultiplier } = deriveWagerType(40n, 10n)
    expect(type).toBe('bookmaker')
    expect(oddsMultiplier).toBe(500)
  })

  it('handles the inverse (creator is the favorite, opponent stakes more)', () => {
    // creatorStake < opponentStake → still asymmetric → bookmaker
    const { type, oddsMultiplier } = deriveWagerType(5n, 10n)
    expect(type).toBe('bookmaker')
    expect(oddsMultiplier).toBe(150) // (5+10)/10 * 100
  })

  it('works with large wei BigInts (USDC 6dp)', () => {
    const opponent = 10_000_000n // 10 USDC
    const creator = 20_000_000n // 20 USDC → 3x
    const { type, oddsMultiplier } = deriveWagerType(creator, opponent)
    expect(type).toBe('bookmaker')
    expect(oddsMultiplier).toBe(300)
  })

  it('accepts string and number stake inputs', () => {
    expect(deriveWagerType('20', '10')).toEqual({ type: 'bookmaker', oddsMultiplier: 300 })
    expect(deriveWagerType(10, 10)).toEqual({
      type: 'oneVsOne',
      oddsMultiplier: WAGER_DEFAULTS.ODDS_MULTIPLIER,
    })
  })

  it('falls back to even-money 1v1 for zero / unparsable opponent stake', () => {
    expect(deriveWagerType(10n, 0n)).toEqual({
      type: 'oneVsOne',
      oddsMultiplier: WAGER_DEFAULTS.ODDS_MULTIPLIER,
    })
    expect(deriveWagerType('oops', 'nope')).toEqual({
      type: 'oneVsOne',
      oddsMultiplier: WAGER_DEFAULTS.ODDS_MULTIPLIER,
    })
  })
})
