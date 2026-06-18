import { describe, it, expect, vi } from 'vitest'
import { enrichTransfers } from '../../data/reports/receiptEnrichment'
import { deriveTransfers } from '../../data/reports/transferDerivation'
import { WAGERS, EVENTS, USER, REGISTRY, BLOCKS, makeFixtureDataSource } from '../fixtures/wagers'

const reader = makeFixtureDataSource()

const enrichWager = (id) =>
  enrichTransfers(
    deriveTransfers({ wager: WAGERS[id], events: EVENTS[id], userAddress: USER, registryAddress: REGISTRY }),
    { reader, userAddress: USER, nativeSymbol: 'MATIC' },
  )

describe('enrichTransfers (FR-004/FR-005/FR-006)', () => {
  it('resolves the exact transfer timestamp from the block', async () => {
    const [dep, pay] = await enrichWager(1)
    expect(dep.timestamp).toBe(BLOCKS[100] * 1000)
    expect(pay.timestamp).toBe(BLOCKS[200] * 1000)
  })

  it('attributes the gas fee when the user sent the transaction', async () => {
    const [dep] = await enrichWager(1) // 0xa1 sent by USER, 120000 * 30 gwei
    expect(dep.feeNative).toBeCloseTo((120000 * 30e9) / 1e18, 12)
    expect(dep.feeNativeSymbol).toBe('MATIC')
    expect(dep.feeUnavailableReason).toBeNull()
  })

  it('records NO fee (with a reason) when the user did not send the transaction', async () => {
    const items = await enrichWager(3) // refund 0xc2 sent by OTHER
    const refund = items.find((i) => i.direction === 'refund')
    expect(refund.feeNative).toBeNull()
    expect(refund.feeUnavailableReason).toMatch(/not sent by you/i)
  })

  it('keeps the full transaction hash from the log', async () => {
    const [dep] = await enrichWager(2)
    expect(dep.txHash).toBe('0xb2')
  })

  it('memoizes block + receipt lookups within a call', async () => {
    const spyReader = {
      getBlock: vi.fn(makeFixtureDataSource().getBlock),
      getTransactionReceipt: vi.fn(makeFixtureDataSource().getTransactionReceipt),
    }
    const pre = deriveTransfers({ wager: WAGERS[1], events: EVENTS[1], userAddress: USER, registryAddress: REGISTRY })
    // duplicate the items to force repeat lookups of the same block/tx
    await enrichTransfers([...pre, ...pre], { reader: spyReader, userAddress: USER })
    // 2 distinct blocks/txs despite 4 items
    expect(spyReader.getBlock).toHaveBeenCalledTimes(2)
    expect(spyReader.getTransactionReceipt).toHaveBeenCalledTimes(2)
  })
})
