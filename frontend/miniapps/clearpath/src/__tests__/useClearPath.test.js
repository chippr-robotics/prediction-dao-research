import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useClearPath } from '../useClearPath'
import { hostRef, resetHost } from './_host'
vi.mock('@fairwins/miniapp-sdk', () => ({ useMiniAppHost: () => hostRef.current }))

// Spec 030 (US3) — registerExternalDAO is a real on-chain write; it must keep the user aware via the app
// notification system: a persistent "confirm in your wallet" + "awaiting confirmation" toast, then a confirmed
// (with tx hash) / failed toast. Asserts that contract directly on the hook.

const REGISTRY = '0xb85dbc899472756470ef4033b9637ff8fa2fd23d' // lowercase → ethers.isAddress passes (no checksum)
const HASH = '0xabcdef0000000000000000000000000000000000000000000000000000001234'

// The write goes through `host.wallet.submit` now — there is no signer-bound contract to stub, and
// no rail branching in the app at all. What is asserted is the toast CONTRACT the member sees.
describe('useClearPath.registerExternalDAO notifications (spec 030 / US3)', () => {
  let toast

  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    toast = resetHost().toast.show
  })

  it('fires confirm → submitted (persistent) → confirmed (with tx hash)', async () => {
    const { result } = renderHook(() => useClearPath())
    expect(result.current.isSupported).toBe(true)
    await act(async () => {
      await result.current.registerExternalDAO({ dao: REGISTRY, framework: 0, label: 'Olympia' })
    })
    expect(hostRef.current.wallet.submit).toHaveBeenCalledWith(
      expect.objectContaining({ to: expect.any(String), data: expect.stringMatching(/^0x/), chainId: 63 }),
    )
    expect(toast).toHaveBeenCalledWith('Register DAO: confirm in your wallet…', 'info')
    expect(toast).toHaveBeenCalledWith('Register DAO submitted — awaiting confirmation…', 'info')
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('Registered Olympia. · tx 0xabcd…1234'), 'success')
  })

  it('reports a vault action as PROPOSED, never as registered', async () => {
    resetHost({ proposed: true })
    toast = hostRef.current.toast.show
    const { result } = renderHook(() => useClearPath())
    await act(async () => {
      await result.current.registerExternalDAO({ dao: REGISTRY, framework: 0, label: 'Olympia' })
    })
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/proposed — it needs the vault/i), 'info')
    expect(toast).not.toHaveBeenCalledWith(expect.stringContaining('Registered Olympia'), 'success')
  })

  it('surfaces a failure as an error toast and rethrows', async () => {
    resetHost({ wallet: { submit: vi.fn(async () => { throw new Error('boom') }) } })
    toast = hostRef.current.toast.show
    const { result } = renderHook(() => useClearPath())
    await act(async () => {
      await expect(
        result.current.registerExternalDAO({ dao: REGISTRY, framework: 0, label: 'X' })
      ).rejects.toThrow('boom')
    })
    expect(toast).toHaveBeenCalledWith('boom', 'error')
  })

  it('treats a confirmation timeout as a "may still confirm" warning (not a failure) and rethrows', async () => {
    // `SubmitResult.wait()` takes no timeout, so the APP imposes one — the host waits through the
    // member's read endpoint, a different endpoint from the one the wallet broadcast through, so a
    // wait that never resolves is a real possibility and would orphan the persistent toast.
    const timeoutErr = Object.assign(new Error('confirmation timed out'), { code: 'TIMEOUT' })
    resetHost({
      wallet: {
        submit: vi.fn(async () => {
          const r = { kind: 'sent', txHash: HASH, safeTxHash: null }
          Object.defineProperty(r, 'wait', { enumerable: false, value: () => Promise.reject(timeoutErr) })
          return Object.freeze(r)
        }),
      },
    })
    toast = hostRef.current.toast.show
    const { result } = renderHook(() => useClearPath())
    await act(async () => {
      await expect(
        result.current.registerExternalDAO({ dao: REGISTRY, framework: 0, label: 'Olympia' })
      ).rejects.toThrow('confirmation timed out')
    })
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('taking longer than expected'), 'warning')
    expect(toast).not.toHaveBeenCalledWith(expect.stringContaining('Registered'), 'success')
  })
})
