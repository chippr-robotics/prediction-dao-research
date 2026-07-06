import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useClearPath } from '../useClearPath'

// Spec 042 — ClearPath availability is capability-driven (NOT registry-gated). On Ethereum mainnet (1) there is
// no ExternalDAORegistry, yet the module is available and a member tracks a DAO device-local.

const ACCT = '0xMember0000000000000000000000000000000009'

vi.mock('../../../hooks/useUI', () => ({ useNotification: () => ({ showNotification: vi.fn() }) }))
vi.mock('../../../hooks/useWalletManagement', () => ({
  useWallet: () => ({ account: ACCT, signer: {}, provider: {}, chainId: 1, isConnected: true }),
}))
// Isolate the tracked-list behavior from the curated known-DAO seeds (ENS/Uniswap) on mainnet.
vi.mock('../../../config/clearpath/knownDaos', () => ({ knownDaosForChain: () => [] }))

describe('useClearPath on a registry-less network (spec 042)', () => {
  beforeEach(() => window.localStorage.clear())

  it('is supported on Ethereum mainnet despite having no on-chain registry', () => {
    const { result } = renderHook(() => useClearPath())
    expect(result.current.isSupported).toBe(true)
    expect(result.current.hasRegistry).toBe(false)
  })

  it('trackDAO writes device-local and listExternalDAOs returns it (network-scoped)', async () => {
    const { result } = renderHook(() => useClearPath())
    await act(async () => {
      await result.current.trackDAO({ address: '0xENS000000000000000000000000000000000001', framework: 0, label: 'ENS' })
    })
    const list = await result.current.listExternalDAOs()
    expect(list).toHaveLength(1)
    expect(list[0].label).toBe('ENS')
    expect(list[0].source).toBe('local')
  })

  it('defaults the read route to public and persists a wallet-managed override', () => {
    const { result } = renderHook(() => useClearPath())
    expect(result.current.readRoute).toBe('public')
    act(() => result.current.setReadRoute('wallet'))
    expect(result.current.readRoute).toBe('wallet')
    expect(window.localStorage.getItem('clearpath.readRoute.v1')).toBe('wallet')
  })
})
