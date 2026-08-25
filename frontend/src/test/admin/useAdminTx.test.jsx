/**
 * Spec 093 — useAdminTx carries the monolith runTx contract unchanged:
 * resolves `true` on success and `false` on ANY failure (including a rejected
 * wallet prompt), never `undefined`, never a rejection — the spec-067 bulk
 * sequences observe that boolean to stop after a refusal.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { ethers } from 'ethers'

const m = vi.hoisted(() => ({ signer: {}, notify: vi.fn() }))

vi.mock('../../hooks/useWeb3', () => ({ useWeb3: () => ({ signer: m.signer }) }))
vi.mock('../../hooks/useUI', () => ({ useNotification: () => ({ showNotification: m.notify }) }))

import { useAdminTx } from '../../components/admin/useAdminTx'

const EXPECTED = `0x${'bb'.repeat(32)}`
const ACTUAL = `0x${'cc'.repeat(32)}`

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

  it('names a custom error the wallet left as raw `error.data` (#1267)', async () => {
    // A write through an injected wallet arrives with the revert bytes on `error.data` and
    // nothing on `.revert`, so `shortMessage` is the useless "unknown custom error" even though
    // the caller's own ABI names the fragment. The ABI travels with the CALL, not the hook: one
    // `runTx` is shared by apps that write to different contracts.
    const abi = ['error StaleProposal(bytes32 expected, bytes32 actual)']
    const data = new ethers.Interface(abi).encodeErrorResult('StaleProposal', [EXPECTED, ACTUAL])
    const { result } = renderHook(() => useAdminTx())
    vi.spyOn(console, 'error').mockImplementation(() => {})

    let outcome
    await act(async () => {
      outcome = await result.current.runTx(
        async () => {
          throw Object.assign(new Error('execution reverted (unknown custom error)'), {
            shortMessage: 'execution reverted (unknown custom error)',
            data,
          })
        },
        'never',
        { errorAbi: abi },
      )
    })

    expect(outcome).toBe(false)
    expect(m.notify).toHaveBeenCalledWith(
      'Refused on-chain: StaleProposal(0xbbbbbbbb…bbbbbbbb, 0xcccccccc…cccccccc)',
      'error',
    )
  })

  it('keeps the message a caller already wrote, and the one ethers decoded', async () => {
    // Two things must survive the decoding above. A caller that turned the failure into a
    // sentence (MiniAppReviewTab's "the vendor replaced this package") owns the wording, and a
    // revert ethers itself decoded already reads well — rewriting either would be a regression
    // in every admin surface, so neither carries raw bytes and neither is touched.
    const abi = ['error StaleProposal(bytes32 expected, bytes32 actual)']
    const { result } = renderHook(() => useAdminTx())
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await act(async () => {
      await result.current.runTx(
        async () => {
          throw Object.assign(new Error('The vendor replaced this package.'), {
            shortMessage: 'The vendor replaced this package.',
          })
        },
        'never',
        { errorAbi: abi },
      )
    })
    expect(m.notify).toHaveBeenCalledWith('The vendor replaced this package.', 'error')

    await act(async () => {
      await result.current.runTx(
        async () => {
          throw Object.assign(new Error('execution reverted'), {
            shortMessage: 'execution reverted: StaleProposal',
            revert: { name: 'StaleProposal', args: [EXPECTED, ACTUAL] },
          })
        },
        'never',
        { errorAbi: abi },
      )
    })
    expect(m.notify).toHaveBeenCalledWith('execution reverted: StaleProposal', 'error')
  })

  it('is unchanged for a caller that supplies no ABI', async () => {
    const abiLessData = '0xdeadbeef'
    const { result } = renderHook(() => useAdminTx())
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await act(async () => {
      await result.current.runTx(async () => {
        throw Object.assign(new Error('execution reverted (unknown custom error)'), {
          shortMessage: 'execution reverted (unknown custom error)',
          data: abiLessData,
        })
      }, 'never')
    })

    expect(m.notify).toHaveBeenCalledWith('execution reverted (unknown custom error)', 'error')
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
