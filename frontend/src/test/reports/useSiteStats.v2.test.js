/**
 * Spec 017 / FR-018: useSiteStats aggregates the v2 Wager schema — unique
 * accounts from creator/opponent (no User entity), pot from per-side stakes.
 */
import { describe, it, expect } from 'vitest'
import { aggregateWagerStats } from '../../hooks/useSiteStats'

const A = '0x1111111111111111111111111111111111111111'
const B = '0x2222222222222222222222222222222222222222'
const C = '0x3333333333333333333333333333333333333333'
const ZERO = '0x0000000000000000000000000000000000000000'

describe('aggregateWagerStats (v2)', () => {
  it('counts statuses, sums staked pot, and derives unique accounts', () => {
    const stats = aggregateWagerStats([
      // active: both stakes escrowed (A + B)
      { status: 'active', creator: A, opponent: B, creatorStake: '1000000', opponentStake: '2000000' },
      // resolved: both stakes (A + C)
      { status: 'resolved', creator: A, opponent: C, creatorStake: '5000000', opponentStake: '5000000' },
      // open: only creator staked, opponent still zero → not counted as account, opponent stake excluded
      { status: 'open', creator: B, opponent: ZERO, creatorStake: '3000000', opponentStake: '9000000' },
    ])

    expect(stats.totalWagers).toBe(3)
    expect(stats.activeWagers).toBe(1)
    expect(stats.wagersResolved).toBe(1)
    // unique accounts: A, B, C (zero opponent excluded)
    expect(stats.activeAccounts).toBe(3)
    // pot (USDC 6dp): active 1+2 + resolved 5+5 + open 3 (creator only) = 16
    expect(stats.valueWageredUsd).toBe(16)
  })

  it('is resilient to malformed stake values', () => {
    const stats = aggregateWagerStats([
      { status: 'active', creator: A, opponent: B, creatorStake: 'not-a-number', opponentStake: '1000000' },
    ])
    expect(stats.totalWagers).toBe(1)
    expect(stats.activeAccounts).toBe(2)
  })
})
