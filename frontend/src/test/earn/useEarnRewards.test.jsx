/**
 * useEarnRewards claim tests (spec 050 US2) — rewards fetched across every
 * earn network and tagged with their chainId; claims go through
 * useEarnSend.sendOnChain (network switch managed for the member, passkey
 * sessions supported), encode the distributor call with CUMULATIVE amounts,
 * and report honestly on failure.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { Interface } from 'ethers'

const mockWallet = vi.hoisted(() => ({ current: {} }))
vi.mock('../../hooks/useWalletManagement', () => ({
  useWallet: () => mockWallet.current,
}))
vi.mock('../../hooks/useActivity', () => ({
  useActivity: () => null,
  useActivityOptional: () => null,
}))

const mockSend = vi.hoisted(() => ({ current: {} }))
vi.mock('../../hooks/useEarnSend', () => ({
  useEarnSend: () => mockSend.current,
  default: () => mockSend.current,
}))

const mockMerkl = vi.hoisted(() => ({ byChain: {} }))
vi.mock('../../lib/earn/merkl', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    fetchRewards: vi.fn(async (_address, chainId) => {
      const entry = mockMerkl.byChain[chainId]
      if (entry instanceof Error) throw entry
      return entry || []
    }),
  }
})

import { useEarnRewards } from '../../hooks/useEarnRewards'
import { MERKL_DISTRIBUTOR_ABI } from '../../abis/MerklDistributor'

const DISTRIBUTOR_IFACE = new Interface(MERKL_DISTRIBUTOR_ABI)
const ACCOUNT = '0x00000000000000000000000000000000000000ac'

const REWARD = {
  token: { address: '0x00000000000000000000000000000000000000d1', symbol: 'MORPHO', decimals: 18 },
  amount: 2_000_000_000_000_000_000n,
  claimed: 500_000_000_000_000_000n,
  claimable: 1_500_000_000_000_000_000n,
  pending: 0n,
  proofs: ['0x' + 'aa'.repeat(32)],
  fetchedAt: 1,
}

beforeEach(() => {
  mockMerkl.byChain = { 137: [REWARD], 1: [] }
  mockWallet.current = { address: ACCOUNT, isConnected: true, chainId: 63 }
  mockSend.current = {
    sendOnChain: vi.fn().mockResolvedValue({ route: 'userop', state: 'included', txHash: '0xtx' }),
    canTransactOn: () => true,
    cannotTransactReason: () => 'not available',
    isPasskey: false,
  }
  localStorage.clear()
})

describe('useEarnRewards (network-transparent claim rail)', () => {
  it('fetches every earn network and tags rewards with their chainId', async () => {
    const { result } = renderHook(() => useEarnRewards())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.rewards).toHaveLength(1)
    expect(result.current.rewards[0].chainId).toBe(137)
    expect(result.current.failedNetworks).toEqual([])
  })

  it('claims via sendOnChain for the reward network with the CUMULATIVE amount', async () => {
    const { result } = renderHook(() => useEarnRewards())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await act(() => result.current.claim(137))

    const { sendOnChain } = mockSend.current
    expect(sendOnChain).toHaveBeenCalledTimes(1)
    const [chainId, calls] = sendOnChain.mock.calls[0]
    expect(chainId).toBe(137)
    expect(calls).toHaveLength(1)
    const decoded = DISTRIBUTOR_IFACE.decodeFunctionData('claim', calls[0].data)
    expect(decoded[0][0].toLowerCase()).toBe(ACCOUNT) // users
    expect(decoded[1][0].toLowerCase()).toBe(REWARD.token.address) // tokens
    expect(decoded[2][0]).toBe(REWARD.amount) // cumulative, NOT the difference
    expect(result.current.claimState).toMatchObject({ status: 'confirmed', chainId: 137 })
    expect(result.current.claimState.txUrl).toContain('0xtx')
  })

  it('is unavailable only when EVERY network fails; partial failures are named', async () => {
    mockMerkl.byChain = { 137: [REWARD], 1: new Error('merkl down') }
    const { result } = renderHook(() => useEarnRewards())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.failedNetworks).toEqual(['Ethereum'])
    expect(result.current.rewards).toHaveLength(1)

    mockMerkl.byChain = { 137: new Error('down'), 1: new Error('down') }
    const { result: allFail } = renderHook(() => useEarnRewards())
    await waitFor(() => expect(allFail.current.status).toBe('unavailable'))
  })

  it('surfaces a failed submission outcome', async () => {
    mockSend.current.sendOnChain = vi
      .fn()
      .mockResolvedValue({ route: 'userop', state: 'failed', reason: 'reverted' })
    const { result } = renderHook(() => useEarnRewards())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await act(() => result.current.claim(137))
    expect(result.current.claimState.status).toBe('error')
  })
})
