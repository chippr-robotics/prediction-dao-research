import { describe, it, expect } from 'vitest'
import { getFeeOverrides } from '../utils/feeOverrides'

const GWEI = 1_000_000_000n
const MIN_PRIORITY = 30n * GWEI

function mockProvider(chainId, feeData) {
  return {
    getNetwork: async () => ({ chainId: BigInt(chainId) }),
    getFeeData: async () => feeData,
  }
}

describe('getFeeOverrides', () => {
  it('returns empty object for non-Polygon chains (wallet defaults)', async () => {
    const provider = mockProvider(1, {
      maxFeePerGas: 50n * GWEI,
      maxPriorityFeePerGas: 0n,
    })
    expect(await getFeeOverrides(provider)).toEqual({})
  })

  it('applies a priority-fee floor on Polygon Amoy when the RPC reports ~0', async () => {
    const provider = mockProvider(80002, {
      maxFeePerGas: 100n * GWEI,
      maxPriorityFeePerGas: 0n,
    })
    const { maxFeePerGas, maxPriorityFeePerGas } = await getFeeOverrides(provider)
    expect(maxPriorityFeePerGas).toBe(MIN_PRIORITY)
    // maxFee carries the priority bump on top of the node's maxFee.
    expect(maxFeePerGas).toBe(100n * GWEI + MIN_PRIORITY)
    expect(maxFeePerGas >= maxPriorityFeePerGas).toBe(true)
  })

  it('keeps the node-suggested priority fee when it already exceeds the floor', async () => {
    const provider = mockProvider(137, {
      maxFeePerGas: 200n * GWEI,
      maxPriorityFeePerGas: 50n * GWEI,
    })
    const { maxFeePerGas, maxPriorityFeePerGas } = await getFeeOverrides(provider)
    expect(maxPriorityFeePerGas).toBe(50n * GWEI)
    // No bump needed, so maxFee is left as the node's suggestion.
    expect(maxFeePerGas).toBe(200n * GWEI)
  })

  it('falls back to empty object when fee estimation throws', async () => {
    const provider = {
      getNetwork: async () => ({ chainId: 80002n }),
      getFeeData: async () => { throw new Error('rpc down') },
    }
    expect(await getFeeOverrides(provider)).toEqual({})
  })

  it('returns empty object when provider lacks the required methods', async () => {
    expect(await getFeeOverrides(null)).toEqual({})
    expect(await getFeeOverrides({})).toEqual({})
  })
})
