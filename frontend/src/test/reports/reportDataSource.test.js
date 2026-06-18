import { describe, it, expect } from 'vitest'
import { resolveEscrow } from '../../data/reports/reportDataSource'
import { WAGER_REGISTRY_ABI } from '../../abis/WagerRegistry'

// Regression: the deployment registers the escrow as `wagerRegistry`, NOT
// `friendGroupMarketFactory`. Asking for the factory key produced
// "FriendGroupMarketFactory address not configured" on every live network.
// resolveEscrow must resolve the configured wagerRegistry across all chains and
// throw a clear error only when nothing is configured.

describe('resolveEscrow (address-config bug fix)', () => {
  for (const chainId of [137, 80002, 63, 1337]) {
    it(`resolves the v2 WagerRegistry on chain ${chainId} with the v2 ABI + events`, () => {
      const e = resolveEscrow(chainId)
      expect(e.address).toMatch(/^0x[0-9a-fA-F]{40}$/)
      expect(e.abi).toBe(WAGER_REGISTRY_ABI)
      expect(e.valueEvents).toEqual(
        expect.arrayContaining(['WagerCreated', 'WagerAccepted', 'PayoutClaimed', 'WagerRefunded']),
      )
    })
  }

  it('throws a clear error when no escrow is configured for the chain', () => {
    expect(() => resolveEscrow(999999)).toThrow(/no wager escrow contract is configured/i)
  })
})
