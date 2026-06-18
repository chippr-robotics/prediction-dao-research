import { describe, it, expect } from 'vitest'
import { deriveTransfers, DIRECTION } from '../../data/reports/transferDerivation'
import { WAGERS, EVENTS, V1_EVENTS_WAGER, USER, OTHER, REGISTRY, TOKEN } from '../fixtures/wagers'

const derive = (id) =>
  deriveTransfers({ wager: WAGERS[id], events: EVENTS[id], userAddress: USER, registryAddress: REGISTRY })

describe('deriveTransfers (FR-003/FR-006, research D2)', () => {
  it('emits creator deposit + winner payout for a resolved wager the user created and won', () => {
    const items = derive(1)
    expect(items).toHaveLength(2)
    const [dep, pay] = items
    expect(dep).toMatchObject({
      direction: DIRECTION.DEPOSIT, fromAddress: USER, toAddress: REGISTRY, amountRaw: '100000000', txHash: '0xa1',
    })
    expect(pay).toMatchObject({
      direction: DIRECTION.PAYOUT, fromAddress: REGISTRY, toAddress: USER, amountRaw: '200000000', txHash: '0xa3',
    })
  })

  it('emits only the opponent deposit (not the creator\'s) when the user accepted', () => {
    const items = derive(2)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      direction: DIRECTION.DEPOSIT, fromAddress: USER, toAddress: REGISTRY, amountRaw: '50000000', txHash: '0xb2',
    })
  })

  it('emits deposit + refund for a refunded wager', () => {
    const items = derive(3)
    expect(items.map((i) => i.direction)).toEqual([DIRECTION.DEPOSIT, DIRECTION.REFUND])
    expect(items[1]).toMatchObject({ fromAddress: REGISTRY, toAddress: USER, txHash: '0xc2' })
  })

  it('handles legacy v1 FriendGroupMarketFactory events (Mordor path)', () => {
    const items = deriveTransfers({
      wager: { id: '7', stakeTokenAddress: TOKEN },
      events: V1_EVENTS_WAGER,
      userAddress: USER,
      registryAddress: REGISTRY,
    })
    expect(items.map((i) => i.direction)).toEqual([DIRECTION.DEPOSIT, DIRECTION.REFUND])
    expect(items[0]).toMatchObject({ amountRaw: '40000000', txHash: '0xd1', fromAddress: USER })
    expect(items[1]).toMatchObject({ amountRaw: '40000000', txHash: '0xd2', toAddress: USER })
  })

  it('excludes wagers/events where the user is not a party', () => {
    const items = deriveTransfers({
      wager: { id: '9', stakeTokenAddress: WAGERS[1].stakeTokenAddress },
      events: [{ name: 'MarketCreatedPending', transactionHash: '0xz', blockNumber: 1, args: { creator: OTHER, stakePerParticipant: '1', stakeToken: WAGERS[1].stakeTokenAddress } }],
      userAddress: USER,
      registryAddress: REGISTRY,
    })
    expect(items).toHaveLength(0)
  })
})
