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
// No on-chain registry anywhere in this suite — keeps the network-agnostic aggregate scan (every clearpath
// chain) from making a real registry contract read against a live RPC.
vi.mock('../../../config/contracts', () => ({ getContractAddressForChain: () => null }))

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

describe('useClearPath network-agnostic listing (network-agnostic follow-up to spec 042)', () => {
  beforeEach(() => window.localStorage.clear())

  it('exposes every clearpath-capable chain, not just the connected one', () => {
    const { result } = renderHook(() => useClearPath())
    expect(result.current.chainIds.length).toBeGreaterThan(1)
    expect(result.current.chainIds).toContain(1) // the connected chain is always included
  })

  it('tracking a DAO on a network the wallet is NOT connected to needs no network switch (registry-less), and the aggregate list tags it with its own chain', async () => {
    const { result } = renderHook(() => useClearPath())
    await act(async () => {
      await result.current.trackDAO({ address: '0xUNI000000000000000000000000000000000001', framework: 1, label: 'Uniswap', chainId: 137 })
    })
    const list = await result.current.listExternalDAOs()
    const uni = list.find((d) => d.label === 'Uniswap')
    expect(uni).toBeDefined()
    expect(uni.chainId).toBe(137)
    expect(uni.source).toBe('local')
  })

  it('scopes tracked DAOs strictly per chain — a DAO tracked on chain 137 never leaks into chain 1s scope', async () => {
    const { result } = renderHook(() => useClearPath())
    await act(async () => {
      await result.current.trackDAO({ address: '0xUNI000000000000000000000000000000000001', framework: 1, label: 'Uniswap', chainId: 137 })
    })
    const list = await result.current.listExternalDAOs()
    const onMainnet = list.filter((d) => d.chainId === 1)
    expect(onMainnet.find((d) => d.label === 'Uniswap')).toBeUndefined()
  })
})
