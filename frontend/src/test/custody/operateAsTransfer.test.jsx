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
