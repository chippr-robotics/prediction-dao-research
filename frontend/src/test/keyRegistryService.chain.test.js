import { describe, it, expect, vi, beforeEach } from 'vitest'

// Spec 008: key lookups must resolve the KeyRegistry on the chain the provider
// talks to. Resolver returns undefined (no registry on this chain) so the
// contract throws "not configured" and lookupPublicKey returns null — but only
// after querying the resolver with the provider's chain id.
const { resolver } = vi.hoisted(() => ({ resolver: vi.fn(() => undefined) }))
vi.mock('../config/contracts', () => ({
  getContractAddress: vi.fn(() => undefined),
  getContractAddressForChain: resolver,
}))

import { lookupPublicKey } from '../utils/keyRegistryService'

describe('keyRegistryService — chain-aware resolution', () => {
  beforeEach(() => resolver.mockClear())

  it("resolves keyRegistry for the provider's chain", async () => {
    const provider = { getNetwork: async () => ({ chainId: 80002n }) }
    const result = await lookupPublicKey('0x0000000000000000000000000000000000000abc', provider)
    expect(resolver).toHaveBeenCalledWith('keyRegistry', 80002)
    expect(result).toBeNull()
  })
})
