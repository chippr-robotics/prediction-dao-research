import { describe, it, expect, vi } from 'vitest'
import { chainNow } from '../../hooks/useFundingPools'

/*
 * Deadline decisions are enforced by the contract against block.timestamp, so the UI judges them by
 * the chain's clock, not the device's (a wrong device clock must never offer a poke the contract
 * would revert). The device clock is only the fallback for a runner that cannot answer.
 */
describe('chainNow', () => {
  it('reads the latest block timestamp through the contract runner', async () => {
    const getBlock = vi.fn(async () => ({ timestamp: 1_800_000_000n }))
    expect(await chainNow({ runner: { provider: { getBlock } } })).toBe(1_800_000_000)
    expect(getBlock).toHaveBeenCalledWith('latest')
  })

  it('accepts a bare provider as the runner', async () => {
    expect(await chainNow({ runner: { getBlock: async () => ({ timestamp: 42 }) } })).toBe(42)
  })

  it('falls back to the device clock when the runner cannot answer', async () => {
    const before = Math.floor(Date.now() / 1000)
    expect(await chainNow({ runner: {} })).toBeGreaterThanOrEqual(before)
    expect(await chainNow({ runner: { provider: { getBlock: async () => { throw new Error('down') } } } })).toBeGreaterThanOrEqual(before)
    expect(await chainNow({ runner: { provider: { getBlock: async () => null } } })).toBeGreaterThanOrEqual(before)
    expect(await chainNow(null)).toBeGreaterThanOrEqual(before)
  })
})
