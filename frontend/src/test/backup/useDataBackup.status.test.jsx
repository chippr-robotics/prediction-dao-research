import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

/*
 * Spec 032 — the STATUS read, which has three answers and used to report two.
 *
 * `readPointer` returns "" when the wallet genuinely has no pointer and `null` when the read could
 * not be completed, and the restore path has always honoured that. The status did not: `!!null` is
 * `false`, so an unreachable canonical RPC rendered as "no backup". That is not a cosmetic
 * inaccuracy — the two states have different remedies. A member told they have no backup pays gas
 * to create one they may already have, or concludes there is nothing worth restoring.
 */
const h = vi.hoisted(() => ({
  wallet: {}, showNotification: vi.fn(), uploadJson: vi.fn(), fetchByCid: vi.fn(),
  readPointer: vi.fn(), writePointer: vi.fn(), available: true,
}))
vi.mock('../../hooks/useWalletManagement', () => ({ useWallet: () => h.wallet }))
vi.mock('../../hooks/useUI', () => ({ useNotification: () => ({ showNotification: h.showNotification }) }))
vi.mock('../../utils/ipfsService', () => ({ uploadJson: (...a) => h.uploadJson(...a), fetchByCid: (...a) => h.fetchByCid(...a) }))
vi.mock('../../lib/backup/backupRegistry', () => ({
  isBackupAvailable: () => h.available,
  readPointer: (...a) => h.readPointer(...a),
  writePointer: (...a) => h.writePointer(...a),
  CANONICAL_CHAIN_ID: 137,
}))

import { useDataBackup } from '../../hooks/useDataBackup'

const ACCT = '0xAbC0000000000000000000000000000000000001'

beforeEach(() => {
  localStorage.clear()
  h.wallet = { account: ACCT, signer: { signMessage: vi.fn() }, chainId: 137, isConnected: true }
  h.showNotification.mockReset()
  h.readPointer.mockReset()
  h.available = true
})

describe('useDataBackup — the pointer read has three states', () => {
  it('a pointer that exists reads as "yes"', async () => {
    h.readPointer.mockResolvedValue('bafyfakecid')
    const { result } = renderHook(() => useDataBackup())
    await waitFor(() => expect(result.current.remoteState).toBe('yes'))
    expect(result.current.hasRemote).toBe(true)
  })

  it('an empty pointer reads as "none" — a real, known absence', async () => {
    h.readPointer.mockResolvedValue('')
    const { result } = renderHook(() => useDataBackup())
    await waitFor(() => expect(result.current.remoteState).toBe('none'))
    expect(result.current.hasRemote).toBe(false)
  })

  it('an INCOMPLETE read reads as "unknown", never as "none"', async () => {
    // `null` is readPointer's own signal that it could not settle the question.
    h.readPointer.mockResolvedValue(null)
    const { result } = renderHook(() => useDataBackup())
    await waitFor(() => expect(result.current.remoteState).toBe('unknown'))
    // `hasRemote` stays the POSITIVE case only, so no consumer can read 'unknown' as 'none'.
    expect(result.current.hasRemote).toBe(false)
  })

  it('a thrown read is "unknown" too — a rejection settles nothing either', async () => {
    h.readPointer.mockRejectedValue(new Error('network down'))
    const { result } = renderHook(() => useDataBackup())
    await waitFor(() => expect(result.current.remoteState).toBe('unknown'))
  })

  it('refreshStatus applies the same three-way mapping', async () => {
    h.readPointer.mockResolvedValue('')
    const { result } = renderHook(() => useDataBackup())
    await waitFor(() => expect(result.current.remoteState).toBe('none'))

    h.readPointer.mockResolvedValue(null)
    await result.current.refreshStatus()
    await waitFor(() => expect(result.current.remoteState).toBe('unknown'))
  })
})
