import { describe, it, expect } from 'vitest'
import { aggregateMyItems } from '../myWagersAggregation.js'

describe('aggregateMyItems (spec 037, US2)', () => {
  it('unions wagers, challenges, and pools with a type indicator and status (FR-016)', () => {
    const items = aggregateMyItems({
      wagers: [{ id: 1, title: 'Rain?', status: 'active' }],
      createdChallenges: [{ wagerId: 7, description: 'Snow?', status: 'open' }],
      createdPools: [{ address: '0xpool', poolId: 3, state: 0, stateLabel: 'Joining open' }],
    })
    const byType = Object.fromEntries(items.map((i) => [i.type, i]))
    expect(items).toHaveLength(3)
    expect(byType.wager).toMatchObject({ id: '1', status: 'active', bucket: 'active', route: 'wager:1' })
    expect(byType.challenge).toMatchObject({ id: '7', title: 'Snow?', route: 'challenge:7' })
    expect(byType.pool).toMatchObject({ id: '0xpool', bucket: 'active', route: '/pools/0xpool' })
  })

  it('buckets terminal items into history and open ones into active (FR-017)', () => {
    const items = aggregateMyItems({
      wagers: [{ id: 1, status: 'resolved' }, { id: 2, status: 'active' }],
      createdPools: [
        { address: '0xa', state: 2, stateLabel: 'Resolved' },
        { address: '0xb', state: 0, stateLabel: 'Joining open' },
      ],
    })
    const bucket = (type, id) => items.find((i) => i.type === type && i.id === id).bucket
    expect(bucket('wager', '1')).toBe('history')
    expect(bucket('wager', '2')).toBe('active')
    expect(bucket('pool', '0xa')).toBe('history')
    expect(bucket('pool', '0xb')).toBe('active')
  })

  it('de-dups the same item across sources, preferring the non-device source (FR-024)', () => {
    const items = aggregateMyItems({
      createdChallenges: [{ wagerId: 9, description: 'On-chain copy', status: 'open' }],
      deviceChallenges: [{ wagerId: 9, description: 'Device copy', code: 'a b c d' }],
    })
    const challenges = items.filter((i) => i.type === 'challenge')
    expect(challenges).toHaveLength(1)
    expect(challenges[0].source).toBe('subgraph')
    expect(challenges[0].title).toBe('On-chain copy')
  })

  it('keeps device-only items that have no on-chain counterpart', () => {
    const items = aggregateMyItems({
      deviceChallenges: [{ code: 'a b c d', description: 'Unsubmitted draft' }],
    })
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ type: 'challenge', source: 'device', status: 'unsubmitted', bucket: 'active' })
  })

  it('is safe when a type is empty or sources are absent (FR-019)', () => {
    expect(aggregateMyItems({ wagers: [{ id: 1, status: 'active' }] })).toHaveLength(1)
    expect(aggregateMyItems({})).toEqual([])
    expect(aggregateMyItems()).toEqual([])
  })
})
