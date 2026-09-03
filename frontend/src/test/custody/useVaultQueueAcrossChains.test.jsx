// Spec 102 (T003, D5) — the queue read on EVERY network a vault lives on. Each chain resolves to
// exactly one of four states, rows exist only for `read`, and one chain's failure never touches
// another's result. The lib readers and the RPC layer are faked; the per-chain state machine,
// enrichment, isolation, tagging, ordering and the single-chain refresh are the code under test.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const VAULT = '0x1111111111111111111111111111111111111111'
const ME = '0x9999999999999999999999999999999999999999'
const OTHER = '0x8888888888888888888888888888888888888888'
const HUB = '0x7777777777777777777777777777777777777777'

let walletCtx = { address: ME, chainId: 137, provider: { tag: 'wallet' } }
vi.mock('../../hooks', () => ({ useWallet: () => walletCtx }))
vi.mock('../../utils/blockchainService', () => ({ getProvider: (id) => ({ tag: `rpc-${id}` }) }))

// Per-chain hub config: address + deploy block; absent ⇒ not-configured.
let hubConfig = {}
vi.mock('../../config/contracts', () => ({
  getContractAddressForChain: (name, chainId) => (name === 'safeProposalHub' ? hubConfig[chainId]?.address : undefined),
  getDeploymentBlockForChain: (name, chainId) => (name === 'safeProposalHub' ? hubConfig[chainId]?.block || 0 : 0),
}))

// Per-chain Safe facts, or an Error to make the chain unreadable.
let safeState = {}
// Per-chain proposals from the hub (already verified) + completeness.
let hubProposals = {}
const readVerifiedProposals = vi.fn()
const readExecutionOutcomes = vi.fn()
vi.mock('../../lib/custody/proposalHub', () => ({ readVerifiedProposals: (...a) => readVerifiedProposals(...a) }))
vi.mock('../../lib/custody/vaultProposalReads', () => ({ readExecutionOutcomes: (...a) => readExecutionOutcomes(...a) }))

const chainOf = (provider) => (provider.tag === 'wallet' ? Number(walletCtx.chainId) : Number(provider.tag.replace('rpc-', '')))

vi.mock('ethers', async (importOriginal) => {
  const actual = await importOriginal()
  class FakeContract {
    constructor(address, abi, provider) {
      this.chainId = chainOf(provider)
      this.address = address
      this.filters = { ExecutionSuccess: () => ({}), ExecutionFailure: () => ({}) }
    }
    #facts() {
      const s = safeState[this.chainId]
      if (s instanceof Error) throw s
      if (!s) throw new Error(`no safe on ${this.chainId}`)
      return s
    }
    async getOwners() {
      // 'hang' models an endpoint that never answers (ethers retrying network detection forever).
      if (safeState[this.chainId] === 'hang') return new Promise(() => {})
      return this.#facts().owners
    }
    async getThreshold() {
      if (safeState[this.chainId] === 'hang') return new Promise(() => {})
      return BigInt(this.#facts().threshold)
    }
    async nonce() {
      if (safeState[this.chainId] === 'hang') return new Promise(() => {})
      return BigInt(this.#facts().nonce ?? 0)
    }
    async approvedHashes(owner, hash) {
      const approved = this.#facts().approved?.[hash] || []
      return approved.some((a) => a.toLowerCase() === owner.toLowerCase()) ? 1n : 0n
    }
  }
  return { ...actual, Contract: FakeContract }
})

import { useVaultQueueAcrossChains, QUEUE_READ_TIMEOUT_MS } from '../../hooks/useVaultQueueAcrossChains'

const instance = (chainId, extra = {}) => ({ address: VAULT, chainId, isSafe: true, ...extra })
const group = (chainIds) => ({ key: VAULT.toLowerCase(), address: VAULT, instances: chainIds.map((c) => instance(c)) })
const proposal = (hash, nonce, blockNumber) => ({ safeTxHash: hash, nonce, blockNumber, cancelled: false, safeTx: {} })

beforeEach(() => {
  vi.clearAllMocks()
  walletCtx = { address: ME, chainId: 137, provider: { tag: 'wallet' } }
  hubConfig = { 137: { address: HUB, block: 100 }, 10: { address: HUB, block: 100 }, 8453: { address: HUB, block: 100 } }
  safeState = {
    137: { owners: [ME, OTHER], threshold: 2, nonce: 5, approved: { '0xp1': [ME] } },
    10: { owners: [OTHER], threshold: 1, nonce: 0, approved: {} },
  }
  hubProposals = {
    137: { proposals: [proposal('0xp1', 5, 900), proposal('0xold', 4, 800)], complete: true },
    10: { proposals: [proposal('0xo1', 0, 950)], complete: true },
  }
  readVerifiedProposals.mockImplementation(async ({ chainId }) => hubProposals[chainId] || { proposals: [], complete: true })
  readExecutionOutcomes.mockImplementation(async () => ({ executed: new Set(), failed: new Set(), complete: true }))
})

describe('useVaultQueueAcrossChains', () => {
  it('reads every instance through a provider for ITS chain and tags each row with its chain, newest first', async () => {
    const { result } = renderHook(() => useVaultQueueAcrossChains(group([137, 10])))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await waitFor(() => expect(Object.keys(result.current.byChain)).toHaveLength(2))

    expect(result.current.byChain[137].state).toBe('read')
    expect(result.current.byChain[10].state).toBe('read')
    // Wallet is on 137 → its provider; Optimism → the chain's own read provider.
    expect(readVerifiedProposals).toHaveBeenCalledWith(expect.objectContaining({ chainId: 137, provider: { tag: 'wallet' }, fromBlock: 100 }))
    expect(readVerifiedProposals).toHaveBeenCalledWith(expect.objectContaining({ chainId: 10, provider: { tag: 'rpc-10' } }))

    // Queued rows only (the nonce-4 proposal on 137 is superseded), sorted by blockNumber desc.
    expect(result.current.rows.map((r) => [r.safeTxHash, r.chainId])).toEqual([
      ['0xo1', 10],
      ['0xp1', 137],
    ])
    expect(result.current.pending).toBe(2)
    expect(result.current.missing).toEqual([])
    expect(result.current.partial).toBe(false)
    // Enrichment mirrors useVaultProposals: approvals, threshold, status.
    const p1 = result.current.rows.find((r) => r.safeTxHash === '0xp1')
    expect(p1).toMatchObject({ approvals: 1, threshold: 2, status: 'pending', approvers: [ME] })
  })

  it('reports ownership PER chain', async () => {
    const { result } = renderHook(() => useVaultQueueAcrossChains(group([137, 10])))
    await waitFor(() => expect(result.current.byChain[10]?.state).toBe('read'))
    expect(result.current.byChain[137].owner).toBe(true)
    expect(result.current.byChain[10].owner).toBe(false) // view-only on Optimism
  })

  it('resolves the four states and never renders a count for a chain that was not read', async () => {
    hubConfig = { 137: { address: HUB, block: 100 }, 10: { address: HUB, block: 100 } } // 8453 has no hub; 999 unknown
    safeState[10] = new Error('RPC down')
    const { result } = renderHook(() => useVaultQueueAcrossChains(group([137, 10, 8453, 999])))
    await waitFor(() => expect(result.current.byChain[10]?.state).toBe('unreadable'))
    await waitFor(() => expect(result.current.byChain[137]?.state).toBe('read'))

    expect(result.current.byChain[10].error).toMatch(/RPC down/)
    expect(result.current.byChain[10].proposals).toEqual([])
    expect(result.current.byChain[8453].state).toBe('not-configured')
    expect(result.current.byChain[999].state).toBe('not-supported')
    // Isolation: Polygon's rows are intact and carry no trace of the other chains.
    expect(result.current.rows.map((r) => r.chainId)).toEqual([137])
    expect(result.current.pending).toBe(1)
    expect(result.current.missing.sort()).toEqual([10, 8453, 999].sort())
    expect(result.current.partial).toBe(true)
  })

  it('treats a hub with an address but no recorded deploy block as not-configured (never a genesis scan)', async () => {
    hubConfig = { 137: { address: HUB, block: 0 } }
    const { result } = renderHook(() => useVaultQueueAcrossChains(group([137])))
    await waitFor(() => expect(result.current.byChain[137]?.state).toBe('not-configured'))
    expect(readVerifiedProposals).not.toHaveBeenCalled()
  })

  it('marks a read chain partial while its backfill is incomplete', async () => {
    hubProposals[137].complete = false
    const { result } = renderHook(() => useVaultQueueAcrossChains(group([137])))
    await waitFor(() => expect(result.current.byChain[137]?.state).toBe('read'))
    expect(result.current.byChain[137].partial).toBe(true)
    expect(result.current.partial).toBe(true)
    expect(result.current.missing).toEqual([]) // read, just not all of it yet
  })

  it('refresh(chainId) re-reads ONE chain and leaves the others untouched', async () => {
    const { result } = renderHook(() => useVaultQueueAcrossChains(group([137, 10])))
    await waitFor(() => expect(result.current.byChain[10]?.state).toBe('read'))
    readVerifiedProposals.mockClear()

    hubProposals[10] = { proposals: [proposal('0xo1', 0, 950), proposal('0xo2', 0, 990)], complete: true }
    await act(async () => {
      await result.current.refresh(10)
    })
    expect(readVerifiedProposals).toHaveBeenCalledTimes(1)
    expect(readVerifiedProposals).toHaveBeenCalledWith(expect.objectContaining({ chainId: 10 }))
    expect(result.current.byChain[10].proposals).toHaveLength(2)
    expect(result.current.byChain[137].proposals).toHaveLength(2) // untouched
    expect(result.current.rows[0]).toMatchObject({ safeTxHash: '0xo2', chainId: 10 })
  })

  it('a failed retry on one chain never disturbs another chain that read fine', async () => {
    const { result } = renderHook(() => useVaultQueueAcrossChains(group([137, 10])))
    await waitFor(() => expect(result.current.byChain[10]?.state).toBe('read'))
    safeState[10] = new Error('RPC down')
    await act(async () => {
      await result.current.refresh(10)
    })
    expect(result.current.byChain[10].state).toBe('unreadable')
    expect(result.current.byChain[137].state).toBe('read')
    expect(result.current.rows.map((r) => r.chainId)).toEqual([137])
  })

  it('a chain that never answers resolves to unreadable at the read ceiling, never "reading…" forever', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      safeState[10] = 'hang'
      const { result } = renderHook(() => useVaultQueueAcrossChains(group([137, 10])))
      await waitFor(() => expect(result.current.byChain[137]?.state).toBe('read'))
      expect(result.current.byChain[10]?.state).toBe('loading')
      await act(async () => {
        await vi.advanceTimersByTimeAsync(QUEUE_READ_TIMEOUT_MS + 50)
      })
      await waitFor(() => expect(result.current.byChain[10]?.state).toBe('unreadable'))
      expect(result.current.byChain[10].error).toMatch(/did not answer/)
      // The chain that answered is untouched, and the total is honest about the missing one.
      expect(result.current.byChain[137].state).toBe('read')
      expect(result.current.missing).toEqual([10])
    } finally {
      vi.useRealTimers()
    }
  })

  it('skips non-Safe / unreachable instances and reads nothing for an empty group', async () => {
    const g = { key: VAULT.toLowerCase(), instances: [instance(137), { address: VAULT, chainId: 10, isSafe: undefined, reachable: false }] }
    const { result } = renderHook(() => useVaultQueueAcrossChains(g))
    await waitFor(() => expect(result.current.byChain[137]?.state).toBe('read'))
    expect(result.current.byChain[10]).toBeUndefined()

    const empty = renderHook(() => useVaultQueueAcrossChains(null))
    expect(empty.result.current.byChain).toEqual({})
    expect(empty.result.current.rows).toEqual([])
    expect(empty.result.current.loading).toBe(false)
  })
})
