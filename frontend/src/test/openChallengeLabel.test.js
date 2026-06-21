import { describe, it, expect } from 'vitest'
import { isOpenChallengeMarket, getMarketDisplayTitle } from '../components/fairwins/wagerCardHelpers'
import { getMarketDescription } from '../components/fairwins/marketHelpers'

// Feature 024: an open challenge (no bound opponent, code-gated terms) must read as "Open Challenge"
// in the My Wagers views, not the generic "Private Bet" used for encrypted named-opponent wagers.

const ZERO = '0x0000000000000000000000000000000000000000'
const NAMED = '0x2222222222222222222222222222222222222222'

// An encrypted friend wager whose terms can't be shown → falls through to the stake/label fallback.
function encryptedWager(overrides = {}) {
  return {
    marketType: 'friend',
    description: 'Encrypted Wager',
    stakeAmount: '10',
    stakeTokenSymbol: 'USDC',
    ...overrides,
  }
}

describe('isOpenChallengeMarket', () => {
  it('is true for a zero-address opponent (unaccepted open challenge)', () => {
    expect(isOpenChallengeMarket({ opponent: ZERO })).toBe(true)
  })
  it('is false for a named opponent', () => {
    expect(isOpenChallengeMarket({ opponent: NAMED })).toBe(false)
  })
  it('is false when the opponent field is missing/null (avoid mislabeling other data paths)', () => {
    expect(isOpenChallengeMarket({})).toBe(false)
    expect(isOpenChallengeMarket({ opponent: null })).toBe(false)
    expect(isOpenChallengeMarket(null)).toBe(false)
  })
})

describe('open-challenge title labels', () => {
  it('getMarketDisplayTitle labels an unaccepted open challenge "Open Challenge - <stake>"', () => {
    expect(getMarketDisplayTitle(encryptedWager({ opponent: ZERO }))).toBe('Open Challenge - 10 USDC')
  })
  it('getMarketDisplayTitle keeps "Private Bet - <stake>" for an encrypted named-opponent wager', () => {
    expect(getMarketDisplayTitle(encryptedWager({ opponent: NAMED }))).toBe('Private Bet - 10 USDC')
  })
  it('getMarketDescription labels an open challenge "Open Challenge - <stake>"', () => {
    expect(getMarketDescription({ description: 'Encrypted Wager', opponent: ZERO, stakeAmount: '10', stakeTokenSymbol: 'USDC' }))
      .toBe('Open Challenge - 10 USDC')
  })
  it('getMarketDescription keeps "Private Bet" for an encrypted named-opponent wager', () => {
    expect(getMarketDescription({ description: 'Encrypted Wager', opponent: NAMED, stakeAmount: '10', stakeTokenSymbol: 'USDC' }))
      .toBe('Private Bet - 10 USDC')
  })
})
