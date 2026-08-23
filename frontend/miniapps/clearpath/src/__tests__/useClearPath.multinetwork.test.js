import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useClearPath } from '../useClearPath'
import { hostRef, resetHost } from './_host'
vi.mock('@fairwins/miniapp-sdk', () => ({ useMiniAppHost: () => hostRef.current }))

// Spec 042 — ClearPath availability is capability-driven (NOT registry-gated). On Ethereum mainnet (1) there is
// no ExternalDAORegistry, yet the module is available and a member tracks a DAO device-local.

const ACCT = '0xMember0000000000000000000000000000000009'

// Isolate the tracked-list behavior from the curated known-DAO seeds (ENS/Uniswap) on mainnet.
vi.mock('../config/knownDaos', () => ({ knownDaosForChain: () => [] }))
// No on-chain registry anywhere in this suite — keeps the network-agnostic aggregate scan (every clearpath
// chain) from making a real registry contract read against a live RPC.

describe('useClearPath on a registry-less network (spec 042)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    // Ethereum mainnet: in the cohort, no ExternalDAORegistry, no curated DAOs in this suite.
    resetHost({ chainId: 1 })
  })

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

/*
 * `hasRegistryFor` is the prop `RegisterExternalDao` decides everything on: whether the surface
 * says "Register an external DAO" or "Track a DAO", whether it writes on chain or to the device,
 * and whether a target chain the wallet is not on demands a switch first. Every consumer's own
 * test stubs it as `(chainId) => boolean`, so the hook handing out a `(host, chainId)` function
 * was invisible to all of them — it returned `false` for every chain, and the surface reported no
 * registry on a chain that has one while `trackDAO` sent a registration anyway.
 *
 * This asserts the ARITY CONTRACT from the hook's side, which is the side that was wrong.
 */
describe('useClearPath#hasRegistryFor is callable the way its consumers call it', () => {
  beforeEach(() => {
    window.localStorage.clear()
    resetHost({ chainId: 63 })
  })

  it('answers true for a chain that carries a registry, given only the chain id', () => {
    const { result } = renderHook(() => useClearPath())
    expect(result.current.hasRegistryFor(63)).toBe(true)
  })

  it('answers false for a chain that does not, and for one nothing knows about', () => {
    const { result } = renderHook(() => useClearPath())
    expect(result.current.hasRegistryFor(1)).toBe(false)
    expect(result.current.hasRegistryFor(999999)).toBe(false)
  })

  /*
   * Deliberately NOT asserted: `hasRegistryFor(undefined)`. The host resolves a missing chainId
   * against the CONNECTED chain, so on Mordor that answers `true` — correctly. Writing it down as
   * `false` here would encode a wish about the host rather than its contract.
   */
})
