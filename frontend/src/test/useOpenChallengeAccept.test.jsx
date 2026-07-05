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
  state: { allowance: 0n, balance: 100_000_000n, wagerId: 0n, throwLookup: false, metadataUri: '', acceptArgs: null },
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
      const acceptOpenWager = (...a) => {
        calls.push('accept')
        state.acceptArgs = a
        return Promise.resolve({ wait: () => Promise.resolve({ status: 1, hash: '0xtxhash' }) })
      }
      acceptOpenWager.staticCall = () => Promise.resolve()
      return {
        openWagerIdForClaim: () => state.throwLookup
          ? Promise.reject(new Error('rpc down'))
          : Promise.resolve(state.wagerId),
        getWager: () => Promise.resolve({
          token: TOKEN, opponentStake: STAKE, creatorStake: STAKE, creator: '0xCreator',
          metadataUri: state.metadataUri,
          // Oracle linkage fields (spec 041) — already part of the on-chain struct.
          resolutionType: 4n, polymarketConditionId: '0xc0ffee', creatorIsYes: true,
        }),
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
    state.acceptArgs = null
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

  it('routes the send through the gasless seam, threading the claim-code proof to acceptOpenWager', async () => {
    // With no relayer configured (VITE_RELAYER_URL unset in tests) useGaslessWrite self-submits, so
    // acceptOpenWager(wagerId, claimCodeSig) must still receive the code-derived signature verbatim —
    // the same proof the relay path would carry in its intent params (rebound to taker=signer on-chain).
    const { result } = renderHook(() => useOpenChallengeAccept())
    await act(async () => {
      await result.current.accept('river tiger kite zoo', 4n)
    })
    expect(state.acceptArgs).toEqual([4n, '0xsignature'])
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

// Spec 037, T004: structured, non-throwing lookup(code) used by the unified phrase lookup.
describe('useOpenChallengeAccept.lookup (structured outcome)', () => {
  beforeEach(() => { calls.length = 0; state.wagerId = 0n; state.throwLookup = false })

  it('returns not-found when the code maps to no open challenge (wagerId 0)', async () => {
    state.wagerId = 0n
    const { result } = renderHook(() => useOpenChallengeAccept())
    let res
    await act(async () => { res = await result.current.lookup('river tiger kite zoo') })
    expect(res.status).toBe('not-found')
    expect(res.reason).toBe('no-match')
    // A read-only lookup never signs or sends.
    expect(calls).toEqual([])
  })

  it('returns matched with the wager payload when the code resolves', async () => {
    state.wagerId = 4n
    const { result } = renderHook(() => useOpenChallengeAccept())
    let res
    await act(async () => { res = await result.current.lookup('river tiger kite zoo') })
    expect(res.status).toBe('matched')
    expect(res.payload.wagerId).toBe(4n)
    expect(res.payload.wager.creator).toBe('0xCreator')
    expect(calls).toEqual([])
  })

  it('returns errored (not not-found) when the on-chain read fails — so the UI can say "couldn\'t check"', async () => {
    state.throwLookup = true
    const { result } = renderHook(() => useOpenChallengeAccept())
    let res
    await act(async () => { res = await result.current.lookup('river tiger kite zoo') })
    expect(res.status).toBe('errored')
    expect(res.error).toBeInstanceOf(Error)
  })
})

// Spec 041: the lookup payload must carry the on-chain oracle linkage untouched, and a
// sealed terms bundle with an `oracle` block must reach the caller — the claimant view
// (TakeChallengePanel) renders the bet from exactly these fields. Accept is unchanged.
describe('useOpenChallengeAccept.lookup (oracle open challenges, spec 041)', () => {
  beforeEach(() => { calls.length = 0; state.wagerId = 7n; state.throwLookup = false; state.metadataUri = 'ipfs-enc://cid' })

  it('passes through resolutionType/polymarketConditionId/creatorIsYes and the sealed oracle block', async () => {
    const { parseEncryptedIpfsReference, fetchEncryptedEnvelope } = await import('../utils/ipfsService')
    const { decryptEnvelopeCode, isCodeEnvelope } = await import('../utils/crypto/envelopeEncryption.js')
    parseEncryptedIpfsReference.mockReturnValue({ isIpfs: true, cid: 'cid' })
    fetchEncryptedEnvelope.mockResolvedValue({ sealed: true })
    isCodeEnvelope.mockReturnValue(true)
    decryptEnvelopeCode.mockReturnValue({
      description: 'Will ETH flip BTC? — creator takes Yes · settled automatically by Polymarket',
      oracle: { source: 'polymarket', conditionId: '0xc0ffee', question: 'Will ETH flip BTC?', outcomes: ['Yes', 'No'], creatorSide: 0 },
    })

    const { result } = renderHook(() => useOpenChallengeAccept())
    let res
    await act(async () => { res = await result.current.lookup('river tiger kite zoo') })

    expect(res.status).toBe('matched')
    const { wager, terms, termsUnavailable } = res.payload
    expect(termsUnavailable).toBe(false)
    expect(wager.resolutionType).toBe(4n)
    expect(wager.polymarketConditionId).toBe('0xc0ffee')
    expect(wager.creatorIsYes).toBe(true)
    expect(terms.oracle).toMatchObject({ source: 'polymarket', conditionId: '0xc0ffee', outcomes: ['Yes', 'No'] })
    // Read-only — no approval/acceptance sent by a lookup.
    expect(calls).toEqual([])
  })
})
