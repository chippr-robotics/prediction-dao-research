import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Spec 032 US2 — restore(): read pointer (free) → fetch → decrypt → apply. No pointer = "nothing to restore";
// corrupt/undecryptable = "no usable backup"; fetch failure = honest error — all leave local data untouched.

const h = vi.hoisted(() => ({ wallet: {}, showNotification: vi.fn(), uploadJson: vi.fn(), fetchByCid: vi.fn(), readPointer: vi.fn(), writePointer: vi.fn(), available: true }))
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
import { deriveKeyFromSignature, encryptBundle } from '../../lib/backup/backupCrypto'
import { loadAddressBook } from '../../lib/addressBook/addressBookStore'

const ACCT = '0xAbC0000000000000000000000000000000000001'
const SIG = '0xsig-fixed'
const signer = { signMessage: vi.fn() }
const ADDR = '0x2222222222222222222222222222222222222222'

function bundleEnvelope() {
  const bundle = {
    schema: 'fairwins-data-backup', version: 1, createdAt: 1, wallet: ACCT.toLowerCase(),
    objects: { addressBook: { schemaVersion: 1, contacts: [{ id: 'c1', nickname: 'Restored', addresses: [{ address: ADDR, chainId: 137, notes: '', addedAt: 1 }], createdAt: 1, updatedAt: 1 }], updatedAt: 1 }, preferences: { defaultSlippage: 2.0 } },
  }
  return encryptBundle(deriveKeyFromSignature(SIG), bundle)
}

beforeEach(() => {
  localStorage.clear()
  signer.signMessage.mockReset().mockResolvedValue(SIG)
  h.wallet = { account: ACCT, signer, chainId: 137, isConnected: true, switchNetwork: vi.fn() }
  h.showNotification.mockReset()
  h.readPointer.mockReset().mockResolvedValue('')
  h.fetchByCid.mockReset()
  h.available = true
})

describe('useDataBackup.restore', () => {
  it('reads the pointer, fetches, decrypts, and merges into local data', async () => {
    h.readPointer.mockResolvedValue('bafytest')
    h.fetchByCid.mockResolvedValue(bundleEnvelope())
    const { result } = renderHook(() => useDataBackup())
    let res
    await act(async () => { res = await result.current.restore('merge') })
    expect(res.restored).toBe(true)
    const book = loadAddressBook(ACCT)
    expect(book.contacts[0].addresses[0].address.toLowerCase()).toBe(ADDR)
    expect(book.contacts[0].addresses[0].chainId).toBe(137)
  })

  it('reports "nothing to restore" when no pointer exists (local untouched)', async () => {
    h.readPointer.mockResolvedValue('')
    const { result } = renderHook(() => useDataBackup())
    let res
    await act(async () => { res = await result.current.restore('merge') })
    expect(res).toEqual(expect.objectContaining({ restored: false, reason: 'none' }))
    expect(h.fetchByCid).not.toHaveBeenCalled()
    expect(loadAddressBook(ACCT).contacts).toHaveLength(0)
  })

  it('treats a corrupt/undecryptable backup as "no usable backup" (local untouched)', async () => {
    h.readPointer.mockResolvedValue('bafytest')
    h.fetchByCid.mockResolvedValue({ format: 'fairwins-data-backup', version: 1, alg: 'chacha20poly1305', nonce: 'deadbeef', ciphertext: 'cafe' })
    const { result } = renderHook(() => useDataBackup())
    let res
    await act(async () => { res = await result.current.restore('merge') })
    expect(res.restored).toBe(false)
    expect(res.reason).toBe('unusable')
    expect(loadAddressBook(ACCT).contacts).toHaveLength(0) // not overwritten with garbage
  })

  it('a wrong wallet (different signature) cannot decrypt — no usable backup', async () => {
    h.readPointer.mockResolvedValue('bafytest')
    h.fetchByCid.mockResolvedValue(bundleEnvelope())
    signer.signMessage.mockResolvedValue('0xWRONG-sig') // different key
    const { result } = renderHook(() => useDataBackup())
    let res
    await act(async () => { res = await result.current.restore('merge') })
    expect(res.restored).toBe(false)
    expect(res.reason).toBe('unusable')
  })

  it('distinguishes an inconclusive pointer read (RPC unreachable) from "no backup"', async () => {
    h.readPointer.mockResolvedValue(null) // read could not be completed
    const { result } = renderHook(() => useDataBackup())
    let res
    await act(async () => { res = await result.current.restore('merge') })
    expect(res.restored).toBe(false)
    expect(res.reason).toBe('unreachable')
    expect(h.fetchByCid).not.toHaveBeenCalled()
    expect(loadAddressBook(ACCT).contacts).toHaveLength(0)
  })

  it('honest error when the backup cannot be fetched (local untouched)', async () => {
    h.readPointer.mockResolvedValue('bafytest')
    h.fetchByCid.mockRejectedValue(new Error('gateway down'))
    const { result } = renderHook(() => useDataBackup())
    let res
    await act(async () => { res = await result.current.restore('merge') })
    expect(res.restored).toBe(false)
    expect(res.reason).toBe('fetch-failed')
    expect(loadAddressBook(ACCT).contacts).toHaveLength(0)
  })
})
