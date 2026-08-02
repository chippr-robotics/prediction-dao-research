import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useClearPath } from '../useClearPath'

// Spec 030 (US3) — registerExternalDAO is a real on-chain write; it must keep the user aware via the app
// notification system: a persistent "confirm in your wallet" + "awaiting confirmation" toast, then a confirmed
// (with tx hash) / failed toast. Asserts that contract directly on the hook.

const REGISTRY = '0xb85dbc899472756470ef4033b9637ff8fa2fd23d' // lowercase → ethers.isAddress passes (no checksum)
const HASH = '0xabcdef0000000000000000000000000000000000000000000000000000001234'

const h = vi.hoisted(() => ({ showNotification: vi.fn(), registerExternalDAO: vi.fn() }))

vi.mock('../../../hooks/useUI', () => ({ useNotification: () => ({ showNotification: h.showNotification }) }))
vi.mock('../../../hooks/useWalletManagement', () => ({
  useWallet: () => ({ account: '0xacc', signer: {}, provider: {}, chainId: 63, isConnected: true }),
}))
vi.mock('../../../config/contracts', () => ({ getContractAddressForChain: () => REGISTRY }))
// Keep ethers.isAddress real; stub only Contract so the write goes to our fake. Contract is invoked with `new`,
// so the mock implementation must be a real (constructable) function, not an arrow.
vi.mock('ethers', async (importOriginal) => {
  const actual = await importOriginal()
  function FakeContract() {
    return { registerExternalDAO: (...a) => h.registerExternalDAO(...a) }
  }
  return { ...actual, ethers: { ...actual.ethers, Contract: vi.fn(FakeContract) } }
})

describe('useClearPath.registerExternalDAO notifications (spec 030 / US3)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fires confirm → submitted (persistent) → confirmed (with tx hash)', async () => {
    h.registerExternalDAO.mockResolvedValue({ hash: HASH, wait: vi.fn().mockResolvedValue({}) })
    const { result } = renderHook(() => useClearPath())
    expect(result.current.isSupported).toBe(true)
    await act(async () => {
      await result.current.registerExternalDAO({ dao: REGISTRY, framework: 0, label: 'Olympia' })
    })
    expect(h.showNotification).toHaveBeenCalledWith('Register DAO: confirm in your wallet…', 'info', 0)
    expect(h.showNotification).toHaveBeenCalledWith('Register DAO submitted — awaiting confirmation…', 'info', 0)
    expect(h.showNotification).toHaveBeenCalledWith(expect.stringContaining('Registered Olympia. · tx 0xabcd…1234'), 'success')
  })

  it('surfaces a failure as an error toast and rethrows', async () => {
    h.registerExternalDAO.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useClearPath())
    await act(async () => {
      await expect(
        result.current.registerExternalDAO({ dao: REGISTRY, framework: 0, label: 'X' })
      ).rejects.toThrow('boom')
    })
    expect(h.showNotification).toHaveBeenCalledWith('boom', 'error')
  })

  it('treats a confirmation timeout as a "may still confirm" warning (not a failure) and rethrows', async () => {
    const timeoutErr = Object.assign(new Error('wait for transaction timeout'), { code: 'TIMEOUT' })
    h.registerExternalDAO.mockResolvedValue({ hash: HASH, wait: vi.fn().mockRejectedValue(timeoutErr) })
    const { result } = renderHook(() => useClearPath())
    await act(async () => {
      await expect(
        result.current.registerExternalDAO({ dao: REGISTRY, framework: 0, label: 'Olympia' })
      ).rejects.toThrow('wait for transaction timeout')
    })
    expect(h.showNotification).toHaveBeenCalledWith(expect.stringContaining('taking longer than expected'), 'warning', 0)
    expect(h.showNotification).not.toHaveBeenCalledWith(expect.stringContaining('Registered'), 'success')
  })
})
