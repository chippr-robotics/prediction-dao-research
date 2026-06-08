import { describe, it, expect, vi, beforeEach } from 'vitest'

// Spec 008: the advisory sanctions screen must read the SanctionsGuard on the
// chain its provider talks to, not the build-time chain. Resolver returns
// undefined (no guard on this chain) so the screen is fail-closed and no real
// contract call happens.
const { resolver } = vi.hoisted(() => ({ resolver: vi.fn(() => undefined) }))
vi.mock('../config/contracts', () => ({
  getContractAddress: vi.fn(() => undefined),
  getContractAddressForChain: resolver,
}))

import { screenAddress } from '../utils/sanctionsScreen.js'

describe('sanctionsScreen — chain-aware resolution', () => {
  beforeEach(() => resolver.mockClear())

  it("resolves sanctionsGuard for the provider's chain", async () => {
    const provider = { getNetwork: async () => ({ chainId: 137n }) }
    const res = await screenAddress('0x0000000000000000000000000000000000000abc', provider)
    expect(resolver).toHaveBeenCalledWith('sanctionsGuard', 137)
    // no guard on this chain -> fail-closed (can't screen)
    expect(res).toEqual({ allowed: false, available: false })
  })
})
