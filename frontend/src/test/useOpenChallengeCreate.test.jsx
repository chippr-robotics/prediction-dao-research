import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const REGISTRY = '0x2222222222222222222222222222222222222222'
const TOKEN = '0x1111111111111111111111111111111111111111'
const ACCOUNT = '0x3333333333333333333333333333333333333333'

const h = vi.hoisted(() => ({
  allowance: 0n,
  balance: 100_000_000n,
  calls: [],
  sendCalls: vi.fn(async () => ({ txHash: '0xpasskeytx' })),
  signer: { provider: { getNetwork: () => Promise.resolve({ chainId: 63n }) } },
  provider: {
    getNetwork: () => Promise.resolve({ chainId: 63n }),
    getTransactionReceipt: vi.fn(async () => ({ status: 1, hash: '0xpasskeytx', logs: [] })),
  },
  loginMethod: 'injected',
}))

vi.mock('../hooks/useWeb3', () => ({
  useWeb3: () => ({
    signer: h.signer,
    provider: h.provider,
    chainId: 63,
    address: ACCOUNT,
    account: ACCOUNT,
    sendCalls: h.sendCalls,
    loginMethod: h.loginMethod,
  }),
}))

vi.mock('../config/contracts', () => ({
  getContractAddressForChain: (name) => (name === 'wagerRegistry' ? REGISTRY : TOKEN),
  getContractAddress: (name) => (name === 'wagerRegistry' ? REGISTRY : TOKEN),
}))

vi.mock('../utils/claimCode/wordlist.js', () => ({
  generateCode: () => 'river tiger kite zoo',
  normalizeCode: (v) => v,
}))
vi.mock('../utils/claimCode/deriveFromCode.js', () => ({
  deriveFromCode: () => ({ claimAddress: '0x4444444444444444444444444444444444444444', symKey: new Uint8Array(32) }),
}))
vi.mock('../utils/crypto/envelopeEncryption.js', () => ({
  encryptEnvelopeCode: () => ({ sealed: true }),
}))
vi.mock('../utils/ipfsService', () => ({
  uploadEncryptedEnvelope: () => Promise.resolve({ cid: 'cid' }),
  buildEncryptedIpfsReference: () => 'ipfs://cid',
}))
vi.mock('../utils/legalDocs', () => ({
  getCurrentDocument: () => null,
}))

vi.mock('ethers', async () => {
  const real = await vi.importActual('ethers')
  function FakeContract(address) {
    if (address === REGISTRY) {
      const createOpenWager = () => {
        h.calls.push('create')
        return Promise.resolve({ wait: () => Promise.resolve({ status: 1, hash: '0xcreate', logs: [] }) })
      }
      createOpenWager.staticCall = () => Promise.resolve()
      return {
        interface: { encodeFunctionData: vi.fn(() => '0xcreatecalldata'), parseLog: () => null },
        createOpenWager,
      }
    }
    return {
      decimals: () => Promise.resolve(6),
      balanceOf: () => Promise.resolve(h.balance),
      allowance: () => Promise.resolve(h.allowance),
      approve: () => {
        h.calls.push('approve')
        return Promise.resolve({ wait: () => Promise.resolve({ status: 1 }) })
      },
      interface: { encodeFunctionData: vi.fn(() => '0xapprovecalldata') },
    }
  }
  return {
    ...real,
    ethers: {
      ...real.ethers,
      Contract: FakeContract,
    },
  }
})

import { useOpenChallengeCreate } from '../hooks/useOpenChallengeCreate'

describe('useOpenChallengeCreate', () => {
  beforeEach(() => {
    h.allowance = 0n
    h.balance = 100_000_000n
    h.calls.length = 0
    h.signer = { provider: { getNetwork: () => Promise.resolve({ chainId: 63n }) } }
    h.sendCalls.mockReset().mockResolvedValue({ txHash: '0xpasskeytx' })
    h.provider.getTransactionReceipt.mockReset().mockResolvedValue({ status: 1, hash: '0xpasskeytx', logs: [] })
    h.loginMethod = 'injected'
  })

  it('keeps classic signer behavior for create (approve then create)', async () => {
    const { result } = renderHook(() => useOpenChallengeCreate())
    let out
    await act(async () => {
      out = await result.current.createOpenChallenge({ stake: '10', acceptDeadline: 1000, resolveDeadline: 2000 })
    })
    expect(out.txHash).toBe('0xcreate')
    expect(h.calls).toEqual(['approve', 'create'])
    expect(h.sendCalls).not.toHaveBeenCalled()
  })

  it('isolates passkey sessions onto sendCalls even when a signer object exists', async () => {
    h.loginMethod = 'passkey'
    const { result } = renderHook(() => useOpenChallengeCreate())
    let out
    await act(async () => {
      out = await result.current.createOpenChallenge({ stake: '10', acceptDeadline: 1000, resolveDeadline: 2000 })
    })
    expect(out.txHash).toBe('0xpasskeytx')
    expect(h.sendCalls).toHaveBeenCalledTimes(1)
    expect(h.sendCalls.mock.calls[0][0]).toHaveLength(2) // approve + create
    expect(h.calls).toEqual([])
  })

  it('uses the real on-chain hash for an included passkey UserOp', async () => {
    h.loginMethod = 'passkey'
    h.sendCalls.mockResolvedValue({ state: 'included', txHash: '0xrealtxhash', userOpHash: '0xuop' })
    h.provider.getTransactionReceipt.mockResolvedValue({ status: 1, hash: '0xrealtxhash', logs: [] })
    const { result } = renderHook(() => useOpenChallengeCreate())
    let out
    await act(async () => {
      out = await result.current.createOpenChallenge({ stake: '10', acceptDeadline: 1000, resolveDeadline: 2000 })
    })
    expect(out.txHash).toBe('0xrealtxhash')
    // Only the real tx hash is ever used to reconcile — never the userOpHash.
    expect(h.provider.getTransactionReceipt).toHaveBeenCalledWith('0xrealtxhash')
    expect(h.provider.getTransactionReceipt).not.toHaveBeenCalledWith('0xuop')
  })

  it('does NOT present a stalled passkey UserOp as a created challenge (no phantom code, no userOpHash poll)', async () => {
    h.loginMethod = 'passkey'
    // A sponsored UserOp that was submitted but never landed on-chain: no txHash, only a userOpHash.
    h.sendCalls.mockResolvedValue({ state: 'stalled', userOpHash: '0xuop', lastKnown: { state: 'pending' } })
    const { result } = renderHook(() => useOpenChallengeCreate())
    await expect(
      result.current.createOpenChallenge({ stake: '10', acceptDeadline: 1000, resolveDeadline: 2000 })
    ).rejects.toThrow(/hasn.t confirmed on-chain/i)
    // The userOpHash must never be polled as if it were a transaction hash.
    expect(h.provider.getTransactionReceipt).not.toHaveBeenCalled()
  })

  it('surfaces the revert reason for a failed passkey UserOp', async () => {
    h.loginMethod = 'passkey'
    h.sendCalls.mockResolvedValue({ state: 'failed', reason: 'user operation reverted', userOpHash: '0xuop' })
    const { result } = renderHook(() => useOpenChallengeCreate())
    await expect(
      result.current.createOpenChallenge({ stake: '10', acceptDeadline: 1000, resolveDeadline: 2000 })
    ).rejects.toThrow(/reverted/i)
    expect(h.provider.getTransactionReceipt).not.toHaveBeenCalled()
  })
})
