import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Regression guard for the open-challenge take flow: accepting escrows the taker's matching stake, so
// the hook MUST approve the registry to pull the stake BEFORE calling acceptOpenWager. Skipping the
// approval is what produced "ERC20: transfer amount exceeds allowance" when taking a challenge.

const TOKEN = '0x1111111111111111111111111111111111111111'
const REGISTRY = '0x2222222222222222222222222222222222222222'
const ACCOUNT = '0x3333333333333333333333333333333333333333'
const STAKE = 10_000_000n // 10 USDC (6 decimals)

const { state, calls } = vi.hoisted(() => ({
  state: { allowance: 0n, balance: 100_000_000n },
  calls: [],
}))

vi.mock('../hooks/useWeb3', () => ({
  useWeb3: () => ({
    account: ACCOUNT,
    chainId: 63,
    provider: { isFakeProvider: true },
    signer: {
      getAddress: () => Promise.resolve(ACCOUNT),
      provider: { getNetwork: () => Promise.resolve({ chainId: 63n }) },
    },
  }),
}))

vi.mock('../config/contracts', () => ({
  getContractAddressForChain: (name) => (name === 'wagerRegistry' ? REGISTRY : ''),
  getContractAddress: (name) => (name === 'wagerRegistry' ? REGISTRY : ''),
}))

vi.mock('../utils/claimCode/wordlist.js', () => ({ isValidCode: () => true }))
vi.mock('../utils/claimCode/deriveFromCode.js', () => ({
  deriveFromCode: () => ({ claimAddress: '0xclaim', symKey: new Uint8Array(32) }),
  signOpenAccept: () => Promise.resolve('0xsignature'),
}))
// discover-only deps — not exercised by accept(), but imported at module top.
vi.mock('../utils/ipfsService', () => ({ fetchEncryptedEnvelope: vi.fn(), parseEncryptedIpfsReference: vi.fn() }))
vi.mock('../utils/crypto/envelopeEncryption.js', () => ({ decryptEnvelopeCode: vi.fn(), isCodeEnvelope: vi.fn() }))

vi.mock('ethers', async () => {
  const real = await vi.importActual('ethers')
  function FakeContract(address) {
    if (address === REGISTRY) {
      const acceptOpenWager = (..._a) => {
        calls.push('accept')
        return Promise.resolve({ wait: () => Promise.resolve({ status: 1, hash: '0xtxhash' }) })
      }
      acceptOpenWager.staticCall = () => Promise.resolve()
      return {
        getWager: () => Promise.resolve({ token: TOKEN, opponentStake: STAKE }),
        acceptOpenWager,
      }
    }
    // token contract
    return {
      decimals: () => Promise.resolve(6),
      symbol: () => Promise.resolve('USDC'),
      balanceOf: () => Promise.resolve(state.balance),
      allowance: () => Promise.resolve(state.allowance),
      approve: (..._a) => {
        calls.push('approve')
        return Promise.resolve({ wait: () => Promise.resolve({ status: 1 }) })
      },
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

import { useOpenChallengeAccept } from '../hooks/useOpenChallengeAccept'

describe('useOpenChallengeAccept.accept (funding flow)', () => {
  beforeEach(() => {
    calls.length = 0
    state.allowance = 0n
    state.balance = 100_000_000n
  })

  it('approves the registry BEFORE sending acceptOpenWager when allowance is short', async () => {
    const { result } = renderHook(() => useOpenChallengeAccept())
    const steps = []
    let res
    await act(async () => {
      res = await result.current.accept('river tiger kite zoo', 4n, (p) => steps.push(p.step))
    })
    expect(res.txHash).toBe('0xtxhash')
    // The order matters — approval must precede acceptance.
    expect(calls).toEqual(['approve', 'accept'])
    // Steps are surfaced for the UI checklist.
    expect(steps).toEqual(expect.arrayContaining(['check', 'approve', 'sign', 'accept']))
  })

  it('skips approval when the existing allowance already covers the stake', async () => {
    state.allowance = STAKE
    const { result } = renderHook(() => useOpenChallengeAccept())
    await act(async () => {
      await result.current.accept('river tiger kite zoo', 4n)
    })
    expect(calls).toEqual(['accept'])
  })

  it('throws a friendly error (and never sends) when the balance is short', async () => {
    state.balance = 1n
    const { result } = renderHook(() => useOpenChallengeAccept())
    await expect(
      act(async () => {
        await result.current.accept('river tiger kite zoo', 4n)
      })
    ).rejects.toThrow(/Insufficient USDC balance/i)
    expect(calls).toEqual([])
  })
})
