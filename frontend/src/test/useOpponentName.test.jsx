import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { WalletContext } from '../contexts'

const findByAddress = vi.fn()
const ensState = { ensName: null, isLoading: false }

vi.mock('../lib/addressBook/addressBookStore', () => ({
  loadAddressBook: () => ({ contacts: [] }),
  findByAddress: (...args) => findByAddress(...args),
}))
vi.mock('../hooks/useEnsResolution', () => ({
  useEnsReverseLookup: () => ensState,
}))

import { useOpponentName } from '../hooks/useOpponentName'
import { deriveAddressName } from '../lib/naming/addressName'

const ME = '0x9999999999999999999999999999999999999999'
const ADDR = '0x1111111111111111111111111111111111111111'

const wrapper = ({ children }) => (
  <WalletContext.Provider value={{ address: ME, chainId: 1 }}>{children}</WalletContext.Provider>
)

describe('useOpponentName', () => {
  beforeEach(() => {
    findByAddress.mockReset()
    ensState.ensName = null
    ensState.isLoading = false
  })

  it('prefers the address-book nickname', () => {
    findByAddress.mockReturnValue({ contact: { nickname: 'Alice' } })
    ensState.ensName = 'alice.eth'
    const { result } = renderHook(() => useOpponentName(ADDR), { wrapper })
    expect(result.current.displayName).toBe('Alice')
    expect(result.current.source).toBe('addressBook')
  })

  it('falls back to ENS when no address-book entry exists', () => {
    findByAddress.mockReturnValue(undefined)
    ensState.ensName = 'bob.eth'
    const { result } = renderHook(() => useOpponentName(ADDR), { wrapper })
    expect(result.current.displayName).toBe('bob.eth')
    expect(result.current.source).toBe('ens')
  })

  it('falls back to a deterministic generated name when neither exists', () => {
    findByAddress.mockReturnValue(undefined)
    const { result } = renderHook(() => useOpponentName(ADDR), { wrapper })
    expect(result.current.displayName).toBe(deriveAddressName(ADDR).label)
    expect(result.current.source).toBe('generated')
  })

  it('never returns a raw hex address as the display name', () => {
    findByAddress.mockReturnValue(undefined)
    const { result } = renderHook(() => useOpponentName(ADDR), { wrapper })
    expect(result.current.displayName).not.toMatch(/^0x[0-9a-fA-F]{40}$/)
  })

  it('works without a wallet provider (degrades to generated)', () => {
    findByAddress.mockReturnValue(undefined)
    const { result } = renderHook(() => useOpponentName(ADDR))
    expect(result.current.displayName).toBe(deriveAddressName(ADDR).label)
  })

  it('handles a missing/invalid address without throwing', () => {
    findByAddress.mockReturnValue(undefined)
    const { result } = renderHook(() => useOpponentName(undefined), { wrapper })
    expect(result.current.displayName).toBe('—')
  })
})
