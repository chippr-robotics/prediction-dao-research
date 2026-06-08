import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// Regression guard (spec 008): site stats must be read from the wallet's
// connected chain. Resolver returns undefined (no registry on this chain) so
// no network call happens; a unique chainId avoids the module-level per-chain
// cache so fetchFromRpc actually runs.
const { resolver, web3 } = vi.hoisted(() => ({
  resolver: vi.fn(() => undefined),
  web3: { chainId: 424242, provider: {}, switchNetwork: () => {}, account: '0x1', isConnected: true },
}))

vi.mock('../config/contracts', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, getContractAddressForChain: resolver }
})
vi.mock('../hooks/useWeb3', () => ({ useWeb3: () => web3 }))

import { useSiteStats } from '../hooks/useSiteStats'

describe('useSiteStats — chain-aware resolution', () => {
  beforeEach(() => resolver.mockClear())

  it('resolves wagerRegistry for the connected chainId (not the build chain)', async () => {
    renderHook(() => useSiteStats())
    await waitFor(() =>
      expect(resolver).toHaveBeenCalledWith('wagerRegistry', 424242)
    )
  })
})
