import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Mock the wallet so the hook is scoped to a controllable address.
let currentAddress = '0x1111111111111111111111111111111111111111'
vi.mock('../../hooks/useWalletManagement', () => ({
  useWallet: () => ({ address: currentAddress }),
}))

import { useAddressBook } from '../../hooks/useAddressBook'

const ADDR = '0x2222222222222222222222222222222222222222'

describe('useAddressBook', () => {
  beforeEach(() => {
    localStorage.clear()
    currentAddress = '0x1111111111111111111111111111111111111111'
  })

  it('adds a contact and persists it across remount (FR-006)', () => {
    const { result, unmount } = renderHook(() => useAddressBook())
    act(() => {
      result.current.addContact({ nickname: 'Alex', addresses: [{ address: ADDR, chainId: 137 }] })
    })
    expect(result.current.contacts).toHaveLength(1)
    unmount()

    const { result: result2 } = renderHook(() => useAddressBook())
    expect(result2.current.contacts).toHaveLength(1)
    expect(result2.current.contacts[0].nickname).toBe('Alex')
  })

  it('isolates books per wallet (FR-009)', () => {
    const { result, rerender } = renderHook(() => useAddressBook())
    act(() => {
      result.current.addContact({ nickname: 'Alex', addresses: [{ address: ADDR, chainId: 137 }] })
    })
    expect(result.current.contacts).toHaveLength(1)

    // Switch wallet → different (empty) book.
    currentAddress = '0x3333333333333333333333333333333333333333'
    rerender()
    expect(result.current.contacts).toHaveLength(0)
  })

  it('finds saved addresses and searches', () => {
    const { result } = renderHook(() => useAddressBook())
    act(() => {
      result.current.addContact({ nickname: 'Alex', addresses: [{ address: ADDR, chainId: 137 }] })
    })
    expect(result.current.findByAddress(ADDR, 137)).not.toBeNull()
    expect(result.current.search('ale')).toHaveLength(1)
  })
})
