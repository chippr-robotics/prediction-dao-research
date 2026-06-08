import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// Regression guard (spec 008): tier prices/limits must be read from the wallet's
// connected chain, not the build-time default. We make the resolver return
// undefined (no MembershipManager on this chain) so no network calls happen and
// we can assert it was queried with the connected chainId.
const { resolver, web3 } = vi.hoisted(() => ({
  resolver: vi.fn(() => undefined),
  // identity-stable useWeb3() return (see frontend-test-gotchas)
  web3: { chainId: 80002, provider: {}, switchNetwork: () => {}, account: '0x1', isConnected: true },
}))

vi.mock('../config/contracts', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, getContractAddressForChain: resolver }
})
vi.mock('../hooks/useWeb3', () => ({ useWeb3: () => web3 }))

import { useTierPrices } from '../hooks/useTierPrices'

describe('useTierPrices — chain-aware resolution', () => {
  beforeEach(() => resolver.mockClear())

  it('resolves membershipManager for the connected chainId (not the build chain)', async () => {
    renderHook(() => useTierPrices())
    await waitFor(() =>
      expect(resolver).toHaveBeenCalledWith('membershipManager', 80002)
    )
  })
})
