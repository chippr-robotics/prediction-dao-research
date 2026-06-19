import { describe, it, expect } from 'vitest'
import { computeSummary } from '../../lib/account/computeSummary'

const ME = '0xMe'
const OPP = '0xOpponent'

// helper transfer
const tx = (wagerId, direction, usd) => ({ wagerId, direction, usdValue: usd })

describe('computeSummary (spec 020 — clarifications 1–3)', () => {
  it('returns neutral values for an empty account', () => {
    const s = computeSummary({ wagers: [], transfers: [], address: ME })
    expect(s.netPnlUsd).toBe(0)
    expect(s.winRate).toBeNull()
    expect(s.totalWageredUsd).toBe(0)
    expect(s.activeWagers).toBe(0)
    expect(s.atStakeUsd).toBe(0)
  })

  it('win rate = wins / (wins + losses); draws & refunds excluded', () => {
    const wagers = [
      { id: '1', status: 'resolved', winner: ME, creator: ME, opponent: OPP },
      { id: '2', status: 'resolved', winner: OPP, creator: ME, opponent: OPP },
      { id: '3', status: 'resolved', winner: ME, creator: ME, opponent: OPP },
      { id: '4', status: 'drawn', winner: null, creator: ME, opponent: OPP },
      { id: '5', status: 'refunded', winner: null, creator: ME, opponent: OPP },
    ]
    const s = computeSummary({ wagers, transfers: [], address: ME })
    expect(s.wins).toBe(2)
    expect(s.losses).toBe(1)
    expect(s.winRate).toBeCloseTo(2 / 3)
  })

  it('win rate is null when there are no decided wagers', () => {
    const wagers = [
      { id: '1', status: 'active', creator: ME, opponent: OPP },
      { id: '2', status: 'drawn', winner: null, creator: ME, opponent: OPP },
    ]
    const s = computeSummary({ wagers, transfers: [], address: ME })
    expect(s.winRate).toBeNull()
  })

  it('active wagers counts open/active/draw_proposed only', () => {
    const wagers = [
      { id: '1', status: 'open', creator: ME },
      { id: '2', status: 'active', creator: ME },
      { id: '3', status: 'draw_proposed', creator: ME },
      { id: '4', status: 'resolved', winner: ME, creator: ME },
    ]
    const s = computeSummary({ wagers, transfers: [], address: ME })
    expect(s.activeWagers).toBe(3)
  })

  it('total wagered = sum of own deposit transfers; realized P&L excludes active stakes', () => {
    const wagers = [
      { id: '1', status: 'resolved', winner: ME, creator: ME, opponent: OPP }, // settled, won
      { id: '2', status: 'active', creator: ME, opponent: OPP }, // active, at stake
    ]
    const transfers = [
      tx('1', 'deposit', 100),
      tx('1', 'payout', 190),
      tx('2', 'deposit', 50), // active → at stake, not realized
    ]
    const s = computeSummary({ wagers, transfers, address: ME })
    expect(s.totalWageredUsd).toBe(150) // both deposits
    expect(s.atStakeUsd).toBe(50) // active deposit only
    expect(s.netPnlUsd).toBe(90) // 190 payout - 100 deposit, settled only
  })

  it('refund on a settled wager contributes to realized P&L', () => {
    const wagers = [{ id: '1', status: 'refunded', creator: ME, opponent: OPP }]
    const transfers = [tx('1', 'deposit', 100), tx('1', 'refund', 100)]
    const s = computeSummary({ wagers, transfers, address: ME })
    expect(s.netPnlUsd).toBe(0)
  })

  it('passes through wallet balance', () => {
    const s = computeSummary({ wagers: [], transfers: [], address: ME, walletBalanceUsd: 42 })
    expect(s.walletBalanceUsd).toBe(42)
  })
})
