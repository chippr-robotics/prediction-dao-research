/**
 * Extended tests for useBlockchainEvents — targeting 85% coverage.
 * Covers useContractEvents (multi-event), cleanup paths, and error handling.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useContractEvents } from '../hooks/useBlockchainEvents'

// Mock the useUI hooks directly
const mockShowNotification = vi.fn()
const mockAnnounce = vi.fn()

vi.mock('../hooks/useUI', () => ({
  useNotification: vi.fn(() => ({
    showNotification: mockShowNotification
  })),
  useAnnouncement: vi.fn(() => ({
    announce: mockAnnounce
  }))
}))

// Mock the useWeb3 hook
vi.mock('../hooks/useWeb3', () => ({
  useEthers: vi.fn(() => ({
    provider: {
      getBlockNumber: vi.fn().mockResolvedValue(12345)
    }
  }))
}))

describe('useContractEvents (multi-event hook)', () => {
  let mockContract

  beforeEach(() => {
    vi.clearAllMocks()
    mockContract = {
      filters: {
        Transfer: vi.fn(() => ({ name: 'Transfer' })),
        Approval: vi.fn(() => ({ name: 'Approval' })),
        Mint: vi.fn(() => ({ name: 'Mint' })),
      },
      on: vi.fn(),
      off: vi.fn(),
    }
  })

  it('sets up listeners for all provided events', () => {
    const events = [
      { name: 'Transfer', handler: vi.fn() },
      { name: 'Approval', handler: vi.fn() },
    ]

    renderHook(() => useContractEvents(mockContract, events))

    expect(mockContract.filters.Transfer).toHaveBeenCalled()
    expect(mockContract.filters.Approval).toHaveBeenCalled()
    expect(mockContract.on).toHaveBeenCalledTimes(2)
  })

  it('does not set up listeners when contract is null', () => {
    renderHook(() => useContractEvents(null, [{ name: 'Transfer', handler: vi.fn() }]))
    expect(mockContract.on).not.toHaveBeenCalled()
  })

  it('does not set up listeners when events array is empty', () => {
    renderHook(() => useContractEvents(mockContract, []))
    expect(mockContract.on).not.toHaveBeenCalled()
  })

  it('calls handler and shows notification when event fires', async () => {
    const handler = vi.fn()
    let transferHandler

    mockContract.on = vi.fn((filter, cb) => {
      if (filter.name === 'Transfer') transferHandler = cb
    })

    renderHook(() => useContractEvents(mockContract, [
      { name: 'Transfer', handler, notify: true },
    ]))

    if (transferHandler) {
      transferHandler('0xfrom', '0xto', 100, {})
    }

    await waitFor(() => {
      expect(handler).toHaveBeenCalledWith('0xfrom', '0xto', 100, {})
      expect(mockShowNotification).toHaveBeenCalledWith('Transfer event detected', 'info', 3000)
      expect(mockAnnounce).toHaveBeenCalledWith('Transfer event detected')
    })
  })

  it('uses custom message for notification when provided', async () => {
    let transferHandler

    mockContract.on = vi.fn((filter, cb) => {
      if (filter.name === 'Transfer') transferHandler = cb
    })

    renderHook(() => useContractEvents(mockContract, [
      { name: 'Transfer', handler: vi.fn(), notify: true, message: 'Token transferred!' },
    ]))

    if (transferHandler) {
      transferHandler('0xfrom', '0xto', 100, {})
    }

    await waitFor(() => {
      expect(mockShowNotification).toHaveBeenCalledWith('Token transferred!', 'info', 3000)
      expect(mockAnnounce).toHaveBeenCalledWith('Token transferred!')
    })
  })

  it('does not show notification when notify is false', async () => {
    const handler = vi.fn()
    let transferHandler

    mockContract.on = vi.fn((filter, cb) => {
      if (filter.name === 'Transfer') transferHandler = cb
    })

    renderHook(() => useContractEvents(mockContract, [
      { name: 'Transfer', handler, notify: false },
    ]))

    if (transferHandler) {
      transferHandler('0xfrom', '0xto', 100, {})
    }

    await waitFor(() => {
      expect(handler).toHaveBeenCalled()
    })
    expect(mockShowNotification).not.toHaveBeenCalled()
  })

  it('cleans up all listeners on unmount', () => {
    const events = [
      { name: 'Transfer', handler: vi.fn() },
      { name: 'Approval', handler: vi.fn() },
    ]

    const { unmount } = renderHook(() => useContractEvents(mockContract, events))

    unmount()

    expect(mockContract.off).toHaveBeenCalledTimes(2)
  })

  it('handles non-existent event filter gracefully', () => {
    mockContract.filters = {
      Transfer: vi.fn(() => ({})),
      // Approval does not exist
    }

    const events = [
      { name: 'Transfer', handler: vi.fn() },
      { name: 'Approval', handler: vi.fn() },
    ]

    const { result } = renderHook(() => useContractEvents(mockContract, events))
    expect(result.error).toBeUndefined()
    // Only Transfer should have been set up
    expect(mockContract.on).toHaveBeenCalledTimes(1)
  })

  it('handles contract.filters[name] that is not a function', () => {
    mockContract.filters = { Transfer: 'not-a-function' }

    const { result } = renderHook(() => useContractEvents(mockContract, [
      { name: 'Transfer', handler: vi.fn() },
    ]))
    expect(result.error).toBeUndefined()
  })
})
