/**
 * Spec 093 — useAdminTx carries the monolith runTx contract unchanged:
 * resolves `true` on success and `false` on ANY failure (including a rejected
 * wallet prompt), never `undefined`, never a rejection — the spec-067 bulk
 * sequences observe that boolean to stop after a refusal.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const m = vi.hoisted(() => ({ signer: {}, notify: vi.fn() }))

vi.mock('../../hooks/useWeb3', () => ({ useWeb3: () => ({ signer: m.signer }) }))
vi.mock('../../hooks/useUI', () => ({ useNotification: () => ({ showNotification: m.notify }) }))

import { useAdminTx } from '../../components/admin/useAdminTx'

beforeEach(() => {
  m.signer = {}
  m.notify.mockClear()
})

describe('useAdminTx', () => {
  it('resolves true on success, waits the tx, notifies, and calls onSuccess', async () => {
    const onSuccess = vi.fn()
    const { result } = renderHook(() => useAdminTx({ onSuccess }))
    const wait = vi.fn().mockResolvedValue({})

    let outcome
    await act(async () => {
      outcome = await result.current.runTx(async () => ({ wait }), 'done!')
    })

    expect(outcome).toBe(true)
    expect(wait).toHaveBeenCalled()
    expect(onSuccess).toHaveBeenCalled()
    expect(m.notify).toHaveBeenCalledWith('done!', 'success')
    expect(result.current.pendingTx).toBe(false)
  })

  it('resolves false — not a rejection — when the wallet prompt is refused', async () => {
    const { result } = renderHook(() => useAdminTx())
    vi.spyOn(console, 'error').mockImplementation(() => {})

    let outcome
    await act(async () => {
      outcome = await result.current.runTx(async () => {
        throw Object.assign(new Error('denied'), { shortMessage: 'User rejected' })
      }, 'never')
    })

    expect(outcome).toBe(false)
    expect(m.notify).toHaveBeenCalledWith('User rejected', 'error')
    expect(result.current.pendingTx).toBe(false)
  })

  it('refuses without a signer and says so', async () => {
    m.signer = null
    const { result } = renderHook(() => useAdminTx())

    let outcome
    await act(async () => {
      outcome = await result.current.runTx(async () => ({ wait: vi.fn() }), 'x')
    })

    expect(outcome).toBe(false)
    expect(m.notify).toHaveBeenCalledWith('Connect your wallet first', 'error')
  })
})
