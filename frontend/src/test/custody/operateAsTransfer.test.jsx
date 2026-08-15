// Spec 043 (US3) — operating as a vault turns a Pay & Transfer send into a threshold-gated vault proposal
// (FR-022) rather than an immediate transfer. Exercises the real useTransfer send() with the wallet + active
// account mocked, verifying it routes through submit() and returns a proposed result.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const submit = vi.fn()
let activeAccount = { isVault: true, canActAsVault: true, submit }

vi.mock('../../hooks/useWalletManagement', () => ({
  useWallet: () => ({
    address: '0xAaAa000000000000000000000000000000000001',
    chainId: 63,
    signer: {},
    provider: {},
    loginMethod: 'eoa',
    sendCalls: vi.fn(),
  }),
}))
vi.mock('../../hooks/useActiveAccount', () => ({ useActiveAccount: () => activeAccount }))
vi.mock('../../hooks/useChainTokens', () => ({
  useChainTokens: () => ({
    native: 'ETC',
    nativeName: 'Ethereum Classic',
    nativeDecimals: 18,
    stable: null,
    stableName: null,
    stableDecimals: 6,
    stableAddress: null,
  }),
}))

import { useTransfer, TRANSFER_KIND } from '../../hooks/useTransfer'

beforeEach(() => {
  submit.mockReset()
  activeAccount = { isVault: true, canActAsVault: true, submit }
})

describe('useTransfer while operating as a vault', () => {
  it('creates a vault proposal for a native transfer instead of sending', async () => {
    submit.mockResolvedValue({ kind: 'proposed', safeTxHash: '0xhash' })
    const { result } = renderHook(() => useTransfer())
    let out
    await act(async () => {
      out = await result.current.send({
        kind: TRANSFER_KIND.NATIVE,
        to: '0xbbbb000000000000000000000000000000000002',
        amount: '1.5',
      })
    })
    expect(submit).toHaveBeenCalledTimes(1)
    const payload = submit.mock.calls[0][0]
    expect(payload.to.toLowerCase()).toBe('0xbbbb000000000000000000000000000000000002')
    expect(payload.value).toBe(1500000000000000000n) // 1.5e18
    expect(out.proposed).toBe(true)
    expect(out.safeTxHash).toBe('0xhash')
  })

  it('refuses when connected to the wrong network', async () => {
    activeAccount = { isVault: true, canActAsVault: false, submit }
    const { result } = renderHook(() => useTransfer())
    await expect(
      result.current.send({ kind: TRANSFER_KIND.NATIVE, to: '0xbbbb000000000000000000000000000000000002', amount: '1' }),
    ).rejects.toThrow(/network/i)
    expect(submit).not.toHaveBeenCalled()
  })
})

// Spec 062 — operating as a recovered legacy account must SIGN with that account's unlocked key (routed
// through submit(), which uses the in-memory legacySigner), never fall through to the connected wallet.
// Guards the security-review finding that selecting "Recovered" silently signed with the connected signer.
describe('useTransfer while operating as a recovered legacy account', () => {
  beforeEach(() => {
    submit.mockReset()
    activeAccount = { isLegacy: true, canActAsLegacy: true, submit }
  })

  it('sends a native transfer through the legacy signer (submit), not the connected wallet', async () => {
    submit.mockResolvedValue({ kind: 'sent', txHash: '0xdeadbeef' })
    const { result } = renderHook(() => useTransfer())
    let out
    await act(async () => {
      out = await result.current.send({
        kind: TRANSFER_KIND.NATIVE,
        to: '0xbbbb000000000000000000000000000000000002',
        amount: '2',
      })
    })
    expect(submit).toHaveBeenCalledTimes(1)
    const payload = submit.mock.calls[0][0]
    expect(payload.to.toLowerCase()).toBe('0xbbbb000000000000000000000000000000000002')
    expect(payload.value).toBe(2000000000000000000n) // 2e18
    expect(payload.data).toBe('0x')
    expect(out.sent).toBe(true)
    expect(out.route).toBe('legacy')
    expect(out.txHash).toBe('0xdeadbeef')
  })

  it('routes a locked recovered account through submit — the ceremony is deferred, never pre-gated (spec 088)', async () => {
    // No pre-unlock gate anymore: submit() itself obtains the acting signer on demand (the
    // global ceremony host), so the transfer ROUTES rather than refusing up front.
    activeAccount = { isLegacy: true, canActAsLegacy: true, submit }
    submit.mockResolvedValueOnce({ kind: 'sent', txHash: '0xfeed' })
    const { result } = renderHook(() => useTransfer())
    const out = await result.current.send({ kind: TRANSFER_KIND.NATIVE, to: '0xbbbb000000000000000000000000000000000002', amount: '1' })
    expect(submit).toHaveBeenCalledTimes(1)
    expect(out.route).toBe('legacy')
  })

  it('routes a hardware acting account through submit, never the connected signer (spec 088)', async () => {
    activeAccount = { isHardware: true, canActAsHardware: true, submit }
    submit.mockResolvedValueOnce({ kind: 'sent', txHash: '0xfeed' })
    const { result } = renderHook(() => useTransfer())
    const out = await result.current.send({ kind: TRANSFER_KIND.NATIVE, to: '0xbbbb000000000000000000000000000000000002', amount: '1' })
    expect(submit).toHaveBeenCalledTimes(1)
    expect(out.route).toBe('hardware')
  })
})
