import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// Regression guard (spec 008): membership/role details must be read from the
// wallet's connected chain. The address used to be build-bound while the
// provider was the wallet's — a chain mismatch that could read a membership on
// the wrong network. Resolver returns undefined → emptyDetails, no network call.
const { resolver, web3 } = vi.hoisted(() => ({
  resolver: vi.fn(() => undefined),
  web3: { chainId: 80002, provider: { ok: true }, switchNetwork: () => {}, account: '0xabc', isConnected: true },
}))

vi.mock('../config/contracts', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, getContractAddressForChain: resolver }
})
vi.mock('../hooks/useWeb3', () => ({ useWeb3: () => web3 }))
vi.mock('wagmi', () => ({
  useAccount: () => ({ address: '0x0000000000000000000000000000000000000abc', isConnected: true }),
}))

import { useRoleDetails } from '../hooks/useRoleDetails'

describe('useRoleDetails — chain-aware resolution', () => {
  beforeEach(() => resolver.mockClear())

  it('resolves membershipManager for the connected chainId', async () => {
    renderHook(() => useRoleDetails())
    await waitFor(() =>
      expect(resolver).toHaveBeenCalledWith('membershipManager', 80002)
    )
  })
})
