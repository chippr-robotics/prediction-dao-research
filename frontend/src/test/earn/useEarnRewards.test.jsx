/**
 * useEarnRewards claim tests (spec 050 US2) — the claim goes through
 * sendCalls (so passkey sessions work), encodes the distributor call with
 * CUMULATIVE amounts, reports honestly on failure, and never silently
 * no-ops when the session has no write rail.
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

const mockMerkl = vi.hoisted(() => ({ rewards: [] }))
vi.mock('../../lib/earn/merkl', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, fetchRewards: vi.fn(async () => mockMerkl.rewards) }
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
  mockMerkl.rewards = [REWARD]
  mockWallet.current = {
    address: ACCOUNT,
    isConnected: true,
    chainId: 137,
    sendCalls: vi.fn().mockResolvedValue({ route: 'userop', state: 'included', txHash: '0xtx' }),
  }
  localStorage.clear()
})

describe('useEarnRewards claim (sendCalls rail)', () => {
  it('claims via one distributor call with the CUMULATIVE amount', async () => {
    const { result } = renderHook(() => useEarnRewards())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await act(() => result.current.claim())

    const sendCalls = mockWallet.current.sendCalls
    expect(sendCalls).toHaveBeenCalledTimes(1)
    const [calls] = sendCalls.mock.calls[0]
    expect(calls).toHaveLength(1)
    const decoded = DISTRIBUTOR_IFACE.decodeFunctionData('claim', calls[0].data)
    expect(decoded[0][0].toLowerCase()).toBe(ACCOUNT) // users
    expect(decoded[1][0].toLowerCase()).toBe(REWARD.token.address) // tokens
    expect(decoded[2][0]).toBe(REWARD.amount) // cumulative, NOT the difference
    expect(result.current.claimState.status).toBe('confirmed')
    expect(result.current.claimState.txUrl).toContain('0xtx')
  })

  it('reports an honest error when the session has no write rail', async () => {
    mockWallet.current = { ...mockWallet.current, sendCalls: undefined }
    const { result } = renderHook(() => useEarnRewards())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await act(() => result.current.claim())
    expect(result.current.claimState.status).toBe('error')
    expect(result.current.claimState.error).toMatch(/cannot send transactions/i)
  })

  it('surfaces a failed submission outcome', async () => {
    mockWallet.current.sendCalls = vi
      .fn()
      .mockResolvedValue({ route: 'userop', state: 'failed', reason: 'reverted' })
    const { result } = renderHook(() => useEarnRewards())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await act(() => result.current.claim())
    expect(result.current.claimState.status).toBe('error')
  })
})
